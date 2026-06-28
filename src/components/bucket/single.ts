import * as pulumi from '@pulumi/pulumi';
import * as gcp from '@pulumi/gcp';
import { CloudInfraMeta } from '../../core/meta';
import { CloudInfraOutput } from '../../core/output';
import { CloudInfraLogger } from '../../core/logging';
import { ValidationError } from '../../core/errors';
import {
  CloudInfraBucketConfig,
  CloudInfraBucketArgs,
  CloudInfraBucketBulkArgs,
  buildBucketArgs,
} from './common';
import { CloudInfraComponent, resolveMeta } from '../../core/component';

/** Pulumi type token for the single-bucket component. */
export const BUCKET_TYPE = 'cloud-infra:bucket:Bucket';
/** Pulumi type token for the bulk-bucket component (array arity). */
export const BUCKET_BULK_TYPE = 'cloud-infra:bucket:BulkBucket';

/**
 * Google Cloud Storage bucket component — accepts a SINGLE name (`string`) or a
 * SET of names (`string[]`) through one merged class (Wave 3 W3-C).
 *
 * Automatically derives the bucket location from {@link CloudInfraMeta}. Supports
 * predefined dual-regions and custom placement dual-regions out of the box.
 * Applies sane defaults (versioning enabled, UBLA on, public access
 * prevention, etc.) but lets callers override any Pulumi field via the
 * `config` object.
 *
 * Behaviour is selected by the *arity* of the resolved name:
 *
 * - **`string` (single)** → today's single-bucket behaviour: the component node
 *   uses the `cloud-infra:bucket:Bucket` type token + `meta.getName()` label;
 *   ONE child `gcp.storage.Bucket` is created with the single generated name; the
 *   no-arg accessors (`getBucket()` / `getName()` / `getUrl()`) operate on it.
 * - **`string[]` (bulk)** → today's bulk behaviour: the `cloud-infra:bucket:BulkBucket`
 *   type token + the sorted-input-keys label (`Object.keys(names).sort().join('-')`);
 *   one child bucket per input name (with per-item `custom` overrides);
 *   `getBuckets()` is keyed by INPUT name and the by-name accessors are used.
 *
 * The generated child names, component-node URNs, `getBuckets()` keys and the
 * resolved Pulumi args are byte-identical to the pre-merge single / bulk
 * components for the respective arity (Frozen Contract / zero-resource-change).
 *
 * @example Simple regional bucket (single)
 * ```ts
 * const bucket = new CloudInfraBucket("assets", { domain: "au" });
 * export const bucketName = bucket.getName();
 * ```
 *
 * @example Dual-region bucket with overrides (single)
 * ```ts
 * const bucket = new CloudInfraBucket("logs", {
 *   domain: "us",
 *   location: ["us-central1", "us-east1"],
 *   forceDestroy: true,
 * });
 * ```
 *
 * @example Bulk set with a per-item override
 * ```ts
 * const buckets = new CloudInfraBucket(["assets", "logs"], {
 *   domain: "au",
 *   custom: { logs: { forceDestroy: true } },
 * });
 * const logs = buckets.getBucket("logs");
 * ```
 */
export class CloudInfraBucket extends CloudInfraComponent {
  private readonly meta: CloudInfraMeta;
  /** All bucket resources keyed by *input* name (single stores one entry). */
  private readonly buckets: Record<string, gcp.storage.Bucket> = {};
  /** `true` when constructed with a `string[]` (bulk arity). */
  private readonly isBulk: boolean;
  /** The single input name (single arity only); `undefined` for bulk. */
  private readonly singleInputName?: string;

  /**
   * Name-first construction with a SINGLE name (v2 DX, preferred). Naming
   * metadata (`domain` / `location` / `prefix` / `naming`) and the bucket config
   * are folded into a single args object; the name is resolved into a
   * `CloudInfraMeta` internally with byte-identical naming (Frozen Contract F1).
   */
  constructor(
    name: string,
    args?: CloudInfraBucketArgs,
    opts?: pulumi.ComponentResourceOptions
  );
  /**
   * Name-first construction with a SET of names (v2 DX). Produces today's
   * `CloudInfraBulkBucket` behaviour: one bucket per input name plus per-item
   * `custom` overrides.
   */
  constructor(
    names: string[],
    args?: CloudInfraBucketBulkArgs,
    opts?: pulumi.ComponentResourceOptions
  );
  /**
   * @deprecated Meta-first construction. Prefer the name-first overloads
   * `new CloudInfraBucket(name | names, args, opts)`. Retained for backward
   * compatibility; produces identical resources. A `meta` whose `name` is an
   * array selects the bulk arity (and accepts a `custom` block on `config`).
   */
  constructor(
    meta: CloudInfraMeta,
    cloudInfraConfig?: CloudInfraBucketConfig & {
      custom?: Record<string, CloudInfraBucketConfig>;
    },
    opts?: pulumi.ComponentResourceOptions
  );
  constructor(
    nameOrNamesOrMeta: string | string[] | CloudInfraMeta,
    argsOrConfig:
      | CloudInfraBucketArgs
      | CloudInfraBucketBulkArgs
      | (CloudInfraBucketConfig & {
          custom?: Record<string, CloudInfraBucketConfig>;
        }) = {},
    opts?: pulumi.ComponentResourceOptions
  ) {
    // Resolve the (name|names|meta, args) pair into a CloudInfraMeta + the
    // component config (naming fields stripped for the name-first paths). The
    // naming-field strip is byte-identical across single and array inputs.
    let meta: CloudInfraMeta;
    let cloudInfraConfig: CloudInfraBucketConfig & {
      custom?: Record<string, CloudInfraBucketConfig>;
    };
    if (Array.isArray(nameOrNamesOrMeta)) {
      const { domain, location, prefix, naming, omitPrefix, omitLocation, preview, ...rest } =
        argsOrConfig as CloudInfraBucketBulkArgs;
      meta = resolveMeta(nameOrNamesOrMeta, {
        domain,
        location,
        prefix,
        naming,
        omitPrefix,
        omitLocation,
        preview,
      });
      cloudInfraConfig = rest;
    } else if (nameOrNamesOrMeta instanceof CloudInfraMeta) {
      meta = nameOrNamesOrMeta;
      cloudInfraConfig = argsOrConfig as CloudInfraBucketConfig & {
        custom?: Record<string, CloudInfraBucketConfig>;
      };
    } else {
      const { domain, location, prefix, naming, omitPrefix, omitLocation, preview, ...rest } =
        argsOrConfig as CloudInfraBucketArgs;
      meta = resolveMeta(nameOrNamesOrMeta, {
        domain,
        location,
        prefix,
        naming,
        omitPrefix,
        omitLocation,
        preview,
      });
      cloudInfraConfig = rest;
    }

    // Arity is decided by the resolved input name, NOT by the surface overload:
    // a meta-first caller with an array name selects bulk just as the array
    // name-first overload does.
    const inputName = meta.getInputName();
    const bulk = Array.isArray(inputName);

    // Component node identity differs by arity to preserve the exact pre-merge
    // URNs:
    //   • single → `cloud-infra:bucket:Bucket` + `meta.getName()`
    //   • bulk   → `cloud-infra:bucket:BulkBucket` + sorted-input-keys label
    const names = meta.getNames();
    const typeToken = bulk ? BUCKET_BULK_TYPE : BUCKET_TYPE;
    const componentLabel = bulk
      ? Object.keys(names).sort().join('-')
      : meta.getName();

    super(
      typeToken,
      componentLabel,
      componentLabel,
      { domain: meta.getDomain() },
      opts
    );

    CloudInfraLogger.info(
      bulk
        ? 'Initializing bulk bucket component'
        : 'Initializing bucket component',
      {
        component: 'bucket',
        operation: 'constructor',
      }
    );

    this.meta = meta;
    this.isBulk = bulk;

    if (bulk) {
      // ---- Bulk arity: one bucket per input name, per-item `custom` merge ----
      const { custom = {}, ...commonConfig } = cloudInfraConfig as {
        custom?: Record<string, CloudInfraBucketConfig>;
      } & CloudInfraBucketConfig;

      for (const key of Object.keys(names)) {
        const generatedName = names[key];
        const perBucketConfig = custom?.[key] || {};
        const rawConfig = { ...commonConfig, ...perBucketConfig };

        const bucketArgs = buildBucketArgs(meta, rawConfig);

        // gcp.storage.Bucket supports `labels`. Each bucket keeps its exact
        // generated name (F1) and was created FLAT in v1, so childOpts() gives
        // each its own root-alias for in-place migration.
        this.buckets[key] = new gcp.storage.Bucket(
          generatedName,
          this.withLabels(bucketArgs),
          this.childOpts()
        );
      }

      this.registerOutputs({ buckets: this.buckets });
    } else {
      // ---- Single arity: exactly one bucket, no `custom` block ----
      this.singleInputName = inputName;

      const rawConfig = cloudInfraConfig as CloudInfraBucketConfig;
      const bucketArgs = buildBucketArgs(meta, rawConfig);

      // gcp.storage.Bucket supports `labels` → merge org labels into its args.
      // v1 created it FLAT (stack root), so childOpts() aliases it back to root.
      this.buckets[inputName] = new gcp.storage.Bucket(
        componentLabel,
        this.withLabels(bucketArgs),
        this.childOpts()
      );

      this.registerOutputs({ bucket: this.buckets[inputName] });
    }
  }

  /**
   * Underlying Pulumi bucket resource.
   *
   * - **Single arity** — call with no argument: returns the one bucket.
   * - **Bulk arity** — pass the *input* name: returns that bucket or `undefined`.
   */
  public getBucket(): gcp.storage.Bucket;
  public getBucket(name: string): gcp.storage.Bucket | undefined;
  public getBucket(name?: string): gcp.storage.Bucket | undefined {
    if (name === undefined) {
      return this.requireSingle('getBucket');
    }
    return this.buckets[name];
  }

  /** All bucket resources keyed by *input* name (bulk + single). */
  public getBuckets(): Record<string, gcp.storage.Bucket> {
    return this.buckets;
  }

  /**
   * Resolved bucket name (`pulumi.Output<string>`).
   *
   * - **Single arity** — call with no argument.
   * - **Bulk arity** — pass the *input* name (returns `undefined` if unknown).
   */
  public getName(): pulumi.Output<string>;
  public getName(name: string): pulumi.Output<string> | undefined;
  public getName(name?: string): pulumi.Output<string> | undefined {
    if (name === undefined) {
      return this.requireSingle('getName').name.apply((n: string) => n);
    }
    const bucket = this.buckets[name];
    return bucket ? bucket.name : undefined;
  }

  /**
   * Fully-qualified bucket URL (`gs://...`).
   *
   * - **Single arity** — call with no argument.
   * - **Bulk arity** — pass the *input* name (returns `undefined` if unknown).
   */
  public getUrl(): pulumi.Output<string>;
  public getUrl(name: string): pulumi.Output<string> | undefined;
  public getUrl(name?: string): pulumi.Output<string> | undefined {
    if (name === undefined) {
      return this.requireSingle('getUrl').url.apply((u: string) => u);
    }
    const bucket = this.buckets[name];
    return bucket ? bucket.url : undefined;
  }

  /** Registers this bucket (or every bulk bucket) with the output manager. */
  public exportOutputs(manager: CloudInfraOutput): void {
    if (this.isBulk) {
      for (const [inputName, bucket] of Object.entries(this.buckets)) {
        manager.record('gcp:storage:Bucket', inputName, this.meta, bucket);
      }
      return;
    }
    const grouping = this.singleInputName as string;
    manager.record(
      'gcp:storage:Bucket',
      grouping,
      this.meta,
      this.requireSingle('exportOutputs')
    );
  }

  /**
   * Returns the lone bucket for single arity, or throws a clear error if a
   * no-arg single accessor is used on a bulk instance.
   */
  private requireSingle(op: string): gcp.storage.Bucket {
    if (this.isBulk) {
      throw new ValidationError(
        `CloudInfraBucket.${op}() with no name is only valid for a single (string) bucket. This is a bulk (array) instance — pass an input name, or use getBuckets().`,
        'bucket',
        op
      );
    }
    return this.buckets[this.singleInputName as string];
  }
}

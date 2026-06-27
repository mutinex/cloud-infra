import * as pulumi from '@pulumi/pulumi';
import * as gcp from '@pulumi/gcp';
import { CloudInfraMeta } from '../../core/meta';
import { CloudInfraOutput } from '../../core/output';
import { CloudInfraLogger } from '../../core/logging';
import { ConfigurationError } from '../../core/errors';
import {
  tryGetDualRegionLocation,
  GcpDualRegions,
} from '../../core/meta/locations';
import { CloudInfraBucketConfig } from './common';
import {
  CloudInfraComponent,
  resolveMeta,
  type NamingArgs,
} from '../../core/component';

/** Pulumi type token for the bulk-bucket component. */
export const BULK_BUCKET_TYPE = 'cloud-infra:bucket:BulkBucket';

/**
 * Name-first construction args for `CloudInfraBulkBucket` (v2 DX, DX2 bulk).
 *
 * Folds the naming metadata ({@link NamingArgs}: `domain` / `location` /
 * `prefix` / `naming`) together with the common bucket config
 * ({@link CloudInfraBucketConfig}) and the per-item `custom` overrides into a
 * single args object, so a bulk bucket can be built as
 * `new CloudInfraBulkBucket(["assets", "logs"], { domain: "au", custom: { logs: { forceDestroy: true } } })`.
 *
 * The naming fields are resolved into a `CloudInfraMeta` via the
 * `resolveMeta(names, ...)` overload (identical `getNames()` output, Frozen
 * Contract F1); the remaining fields (common config + `custom`) are passed
 * straight through to the EXACT existing bulk construction.
 */
export type CloudInfraBulkBucketArgs = NamingArgs &
  CloudInfraBucketConfig & {
    custom?: Record<string, CloudInfraBucketConfig>;
  };

/**
 * Creates a *set* of Storage buckets derived from a single
 * {@link CloudInfraMeta.getNames | meta names map}. Common configuration can be
 * supplied once and refined per bucket via the `custom` block, mirroring the
 * pattern used by other bulk components.
 *
 * Bucket location logic and sensible defaults are identical to the single
 * component because they share the same factory helper.
 */
export class CloudInfraBulkBucket extends CloudInfraComponent {
  private readonly meta: CloudInfraMeta;
  private readonly buckets: Record<string, gcp.storage.Bucket> = {};

  /**
   * Name-first construction (v2 DX, preferred). The multi-name array plus the
   * naming metadata (`domain` / `location` / `prefix` / `naming`), common bucket
   * config and per-item `custom` overrides are folded into a single args object;
   * the names are resolved into a `CloudInfraMeta` internally with byte-identical
   * naming (Frozen Contract F1).
   */
  constructor(
    names: string[],
    args?: CloudInfraBulkBucketArgs,
    opts?: pulumi.ComponentResourceOptions
  );
  /**
   * @deprecated Meta-first construction. Prefer the name-first overload
   * `new CloudInfraBulkBucket(names, args, opts)`. Retained for backward
   * compatibility; produces identical resources.
   */
  constructor(
    meta: CloudInfraMeta,
    cloudInfraConfig?: Record<string, unknown>,
    opts?: pulumi.ComponentResourceOptions
  );
  constructor(
    namesOrMeta: string[] | CloudInfraMeta,
    argsOrConfig: CloudInfraBulkBucketArgs | Record<string, unknown> = {},
    opts?: pulumi.ComponentResourceOptions
  ) {
    // Normalize both overloads to a (meta, config) pair. For the name-first
    // path, split the naming metadata out of the args; everything else (common
    // config + per-item `custom`) is the bulk config passed straight through.
    let meta: CloudInfraMeta;
    let cloudInfraConfig: Record<string, unknown>;
    if (Array.isArray(namesOrMeta)) {
      const { domain, location, prefix, naming, ...rest } =
        argsOrConfig as CloudInfraBulkBucketArgs;
      meta = resolveMeta(namesOrMeta, { domain, location, prefix, naming });
      cloudInfraConfig = rest;
    } else {
      meta = namesOrMeta;
      cloudInfraConfig = argsOrConfig as Record<string, unknown>;
    }

    const names = meta.getNames();

    // Bulk components have no single resource name; use a STABLE component
    // label derived from the sorted input keys so the component node URN is
    // deterministic. Child buckets keep their own byte-identical generated
    // names (F1) and alias back to root individually.
    const componentLabel = Object.keys(names).sort().join('-');

    super(
      BULK_BUCKET_TYPE,
      componentLabel,
      componentLabel,
      { domain: meta.getDomain() },
      opts
    );

    CloudInfraLogger.info('Initializing bulk bucket component', {
      component: 'bucket',
      operation: 'constructor',
    });

    this.meta = meta;
    // names computed above (shared with super()).

    // Per-bucket custom blocks
    const { custom = {}, ...commonConfig } = cloudInfraConfig as {
      custom?: Record<string, CloudInfraBucketConfig>;
    } & CloudInfraBucketConfig;

    for (const inputName of Object.keys(names)) {
      const generatedName = names[inputName];

      const perBucketConfig = custom?.[inputName] || {};
      const rawConfig = { ...commonConfig, ...perBucketConfig };

      // Determine location and custom placement config first
      let location: string;
      let customPlacementConfig:
        | pulumi.Input<gcp.types.input.storage.BucketCustomPlacementConfig>
        | undefined;

      const regionsList = meta.getMultiRegion();

      if (regionsList.length === 2) {
        const sorted = [...regionsList].sort();

        const allowedSet = new Set(
          (GcpDualRegions as readonly (readonly [string, string])[]).map(p =>
            [...p].sort().join(',')
          )
        );

        const isAllowedPair = allowedSet.has(sorted.join(','));

        if (!isAllowedPair) {
          throw new ConfigurationError(
            `CloudInfraBucket only supports predefined dual-region pairs. Provided: '${regionsList.join(', ')}'.`,
            'bucket',
            'constructor'
          );
        }

        const predefinedCode = tryGetDualRegionLocation(sorted);
        if (predefinedCode) {
          // Predefined dual-region code (nam4, eur4, etc.).
          location = predefinedCode;
          customPlacementConfig = undefined;
        } else {
          // Custom placement dual-region (e.g., AU).
          location = meta.getLocation();
          customPlacementConfig = { dataLocations: sorted };
        }
      } else if (regionsList.length === 1) {
        // Single or multi-region path
        location = meta.getLocation();
      } else {
        throw new ConfigurationError(
          `CloudInfraBucket supports only single-region or valid dual-region locations. Provided ${regionsList.length} regions`,
          'bucket',
          'constructor'
        );
      }

      // Build bucket args with meta-managed fields
      const locCode = /^[a-z0-9]+$/.test(location)
        ? location.toUpperCase()
        : location;

      const bucketArgs: gcp.storage.BucketArgs = {
        ...rawConfig,
        project: rawConfig.project ?? meta.getGcpProject(),
        location: locCode,
      };

      if (customPlacementConfig) {
        bucketArgs.customPlacementConfig = customPlacementConfig;
      }

      // Apply sensible defaults
      if (bucketArgs.versioning === undefined) {
        bucketArgs.versioning = { enabled: true };
      } else if (typeof bucketArgs.versioning === 'boolean') {
        bucketArgs.versioning = { enabled: bucketArgs.versioning };
      } else if (pulumi.Output.isInstance(bucketArgs.versioning)) {
        bucketArgs.versioning = pulumi
          .output(bucketArgs.versioning)
          .apply(v => {
            if (typeof v === 'boolean') {
              return { enabled: v };
            }
            return v as gcp.types.input.storage.BucketVersioning;
          });
      }
      if (bucketArgs.storageClass === undefined) {
        bucketArgs.storageClass = 'STANDARD';
      }
      if (bucketArgs.uniformBucketLevelAccess === undefined) {
        bucketArgs.uniformBucketLevelAccess = true;
      }
      if (bucketArgs.forceDestroy === undefined) {
        bucketArgs.forceDestroy = false;
      }
      if (bucketArgs.publicAccessPrevention === undefined) {
        bucketArgs.publicAccessPrevention = 'enforced';
      }

      // gcp.storage.Bucket supports `labels` → merge org labels into its args.
      // Each bucket keeps its exact generated name (F1) and was created FLAT in
      // v1, so childOpts() gives each its own root-alias for in-place migration.
      const bucket = new gcp.storage.Bucket(
        generatedName,
        this.withLabels(bucketArgs),
        this.childOpts()
      );
      this.buckets[inputName] = bucket;
    }

    this.registerOutputs({
      buckets: this.buckets,
    });
  }

  /** All bucket resources keyed by *input* name. */
  public getBuckets(): Record<string, gcp.storage.Bucket> {
    return this.buckets;
  }

  /** Retrieve one bucket by its *input* name or `undefined`. */
  public getBucket(name: string): gcp.storage.Bucket | undefined {
    return this.buckets[name];
  }

  /** Convenient accessor for a bucket's name. */
  public getName(name: string): pulumi.Output<string> | undefined {
    const bucket = this.buckets[name];
    return bucket ? bucket.name : undefined;
  }

  /** Bucket URL (`gs://`), if the bucket exists. */
  public getUrl(name: string): pulumi.Output<string> | undefined {
    const bucket = this.buckets[name];
    return bucket ? bucket.url : undefined;
  }

  /** Exports every bucket to the provided output manager. */
  public exportOutputs(manager: CloudInfraOutput): void {
    for (const [inputName, bucket] of Object.entries(this.buckets)) {
      manager.record(
        'gcp:storage:Bucket',
        inputName, // Grouping by logical input name for bulk Bucket
        this.meta,
        bucket
      );
    }
  }
}

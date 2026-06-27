import * as pulumi from '@pulumi/pulumi';
import * as gcp from '@pulumi/gcp';
import { CloudInfraMeta } from '../../core/meta';
import { CloudInfraOutput } from '../../core/output';
import { CloudInfraLogger } from '../../core/logging';
import { ValidationError, ConfigurationError } from '../../core/errors';
import {
  tryGetDualRegionLocation,
  GcpDualRegions,
} from '../../core/meta/locations';
import { CloudInfraBucketConfig, CloudInfraBucketArgs } from './common';
import { CloudInfraComponent, resolveMeta } from '../../core/component';

/** Pulumi type token for the single-bucket component. */
export const BUCKET_TYPE = 'cloud-infra:bucket:Bucket';

/**
 * Single Google Cloud Storage bucket component.
 *
 * Automatically derives the bucket location from {@link CloudInfraMeta}. Supports
 * predefined dual-regions and custom placement dual-regions out of the box.
 * Applies sane defaults (versioning enabled, UBLA on, public access
 * prevention, etc.) but lets callers override any Pulumi field via the
 * `config` object.
 *
 * @example Simple regional bucket
 * ```ts
 * const meta = new CloudInfraMeta({ name: "assets", domain: "au" });
 * const bucket = new CloudInfraBucket(meta);
 * export const bucketName = bucket.getName();
 * ```
 *
 * @example Dual-region bucket with overrides
 * ```ts
 * const meta = new CloudInfraMeta({
 *   name: "logs",
 *   domain: "us",
 *   location: ["us-central1", "us-east1"],
 * });
 * const bucket = new CloudInfraBucket(meta, { forceDestroy: true });
 * ```
 *
 * @example Name-first (v2 DX, preferred)
 * ```ts
 * const bucket = new CloudInfraBucket("assets", { domain: "au" });
 * const logs = new CloudInfraBucket("logs", {
 *   domain: "us",
 *   location: ["us-central1", "us-east1"],
 *   forceDestroy: true,
 * });
 * ```
 */
export class CloudInfraBucket extends CloudInfraComponent {
  private readonly meta: CloudInfraMeta;
  private readonly bucket: gcp.storage.Bucket;
  /** Validated single input name (array inputs are invalid for single bucket). */
  private readonly inputName: string;

  /**
   * Name-first construction (v2 DX, preferred). Naming metadata
   * (`domain` / `location` / `prefix` / `naming`) and the bucket config are
   * folded into a single args object; the name is resolved into a
   * `CloudInfraMeta` internally with byte-identical naming (Frozen Contract F1).
   */
  constructor(
    name: string,
    args?: CloudInfraBucketArgs,
    opts?: pulumi.ComponentResourceOptions
  );
  /**
   * @deprecated Meta-first construction. Prefer the name-first overload
   * `new CloudInfraBucket(name, args, opts)`. Retained for backward
   * compatibility; produces identical resources.
   */
  constructor(
    meta: CloudInfraMeta,
    cloudInfraConfig?: CloudInfraBucketConfig,
    opts?: pulumi.ComponentResourceOptions
  );
  constructor(
    nameOrMeta: string | CloudInfraMeta,
    argsOrConfig: CloudInfraBucketArgs | CloudInfraBucketConfig = {},
    opts?: pulumi.ComponentResourceOptions
  ) {
    // Normalize both overloads to a (meta, config) pair. For the name-first
    // path, split the naming metadata out of the args; everything else is the
    // bucket config passed straight through.
    let meta: CloudInfraMeta;
    let cloudInfraConfig: CloudInfraBucketConfig;
    if (typeof nameOrMeta === 'string') {
      const { domain, location, prefix, naming, ...config } =
        argsOrConfig as CloudInfraBucketArgs;
      meta = resolveMeta(nameOrMeta, { domain, location, prefix, naming });
      cloudInfraConfig = config;
    } else {
      meta = nameOrMeta;
      cloudInfraConfig = argsOrConfig as CloudInfraBucketConfig;
    }

    const componentName = meta.getName();

    super(
      BUCKET_TYPE,
      componentName,
      componentName,
      { domain: meta.getDomain() },
      opts
    );

    CloudInfraLogger.info('Initializing bucket component', {
      component: 'bucket',
      operation: 'constructor',
    });

    this.meta = meta;
    const rawConfig = cloudInfraConfig;

    // componentName computed above (shared with super()).

    // Ensure the component is used with a *single* name – for arrays the caller
    // should switch to `CloudInfraBulkBucket`.
    const candidateInputName = meta.getInputName();
    if (Array.isArray(candidateInputName)) {
      throw new ValidationError(
        'CloudInfraBucket expects `meta.name` to be a single string. Use CloudInfraBulkBucket for array inputs.',
        'bucket',
        'constructor'
      );
    }
    this.inputName = candidateInputName;

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

        CloudInfraLogger.debug('Using predefined dual-region location', {
          component: 'bucket',
          operation: 'constructor',
          meta: { location: predefinedCode, regions: sorted },
        });
      } else {
        // Custom placement dual-region (e.g., AU).
        location = meta.getLocation();
        customPlacementConfig = { dataLocations: sorted };

        CloudInfraLogger.debug('Using custom placement dual-region', {
          component: 'bucket',
          operation: 'constructor',
          meta: { location, regions: sorted },
        });
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
      bucketArgs.versioning = pulumi.output(bucketArgs.versioning).apply(v => {
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
    // v1 created it FLAT (stack root), so childOpts() aliases it back to root.
    this.bucket = new gcp.storage.Bucket(
      componentName,
      this.withLabels(bucketArgs),
      this.childOpts()
    );

    this.registerOutputs({
      bucket: this.bucket,
    });
  }

  /** Underlying Pulumi bucket resource. */
  public getBucket(): gcp.storage.Bucket {
    return this.bucket;
  }

  /** Resolved bucket name (`pulumi.Output<string>`). */
  public getName(): pulumi.Output<string> {
    return this.bucket.name.apply((n: string) => n);
  }

  /** Fully-qualified bucket URL (`gs://...`). */
  public getUrl(): pulumi.Output<string> {
    return this.bucket.url.apply((u: string) => u);
  }

  /** Registers this bucket with the provided {@link CloudInfraOutput} manager. */
  public exportOutputs(manager: CloudInfraOutput): void {
    const grouping = this.inputName;
    manager.record('gcp:storage:Bucket', grouping, this.meta, this.bucket);
  }
}

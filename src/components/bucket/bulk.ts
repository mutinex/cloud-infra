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

/**
 * Creates a *set* of Storage buckets derived from a single
 * {@link CloudInfraMeta.getNames | meta names map}. Common configuration can be
 * supplied once and refined per bucket via the `custom` block, mirroring the
 * pattern used by other bulk components.
 *
 * Bucket location logic and sensible defaults are identical to the single
 * component because they share the same factory helper.
 */
export class CloudInfraBulkBucket {
  private readonly meta: CloudInfraMeta;
  private readonly buckets: Record<string, gcp.storage.Bucket> = {};

  constructor(
    meta: CloudInfraMeta,
    cloudInfraConfig: Record<string, unknown> = {}
  ) {
    CloudInfraLogger.info('Initializing bulk bucket component', {
      component: 'bucket',
      operation: 'constructor',
    });

    this.meta = meta;
    const names = meta.getNames();

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

      const bucket = new gcp.storage.Bucket(generatedName, bucketArgs);
      this.buckets[inputName] = bucket;
    }
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

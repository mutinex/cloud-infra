import * as pulumi from '@pulumi/pulumi';
import * as gcp from '@pulumi/gcp';
import type { CloudInfraMeta } from '../../core/meta';
import { ConfigurationError } from '../../core/errors';
import {
  tryGetDualRegionLocation,
  GcpDualRegions,
} from '../../core/meta/locations';
import type { NamingArgs } from '../../core/component';

/**
 * **Bucket shared types** used by both the single and bulk bucket components.
 *
 * @packageDocumentation
 */

/**
 * User-facing configuration accepted by `CloudInfraBucket` and
 * `CloudInfraBulkBucket` – a superset of Pulumi's `BucketArgs` plus optional
 * CloudInfra-specific extras.
 */
export type CloudInfraBucketConfig = Omit<
  gcp.storage.BucketArgs,
  'project' | 'location'
> & {
  project?: pulumi.Input<string>;
  // location is always derived from meta, never user-provided
  // name is optional - if not provided, Pulumi auto-generates with random suffix
};

/**
 * Name-first construction args for `CloudInfraBucket` (v2 DX).
 *
 * Folds the naming metadata ({@link NamingArgs}: `domain` / `location` /
 * `prefix` / `naming`) together with the Pulumi bucket config
 * ({@link CloudInfraBucketConfig}) into a single args object, so a bucket can be
 * built as `new CloudInfraBucket("assets", { domain: "au", forceDestroy: true })`.
 *
 * The naming fields are resolved into a `CloudInfraMeta` internally (identical
 * `generateName` output, Frozen Contract F1); the remaining fields are passed
 * straight through as the bucket config.
 */
export type CloudInfraBucketArgs = NamingArgs & CloudInfraBucketConfig;

/**
 * Resolve the merged-class name-first args for `CloudInfraBucket` accepting a
 * `string[]` (bulk arity). Identical to {@link CloudInfraBucketArgs} but with the
 * per-item `custom` overrides block, so the merged class can be built as
 * `new CloudInfraBucket(["assets", "logs"], { domain: "au", custom: { logs: { forceDestroy: true } } })`.
 */
export type CloudInfraBucketBulkArgs = NamingArgs &
  CloudInfraBucketConfig & {
    custom?: Record<string, CloudInfraBucketConfig>;
  };

/**
 * Build the fully-resolved `gcp.storage.BucketArgs` for a single bucket from the
 * caller's raw config + the meta-derived location/dual-region placement and the
 * CloudInfra default floor.
 *
 * This is the ~90% block that was previously copy-pasted byte-for-byte between
 * the single and bulk bucket components. Both single and bulk arities now share
 * this ONE implementation, so the resolved bucket args are byte-identical for
 * every path (Frozen Contract / zero-resource-change).
 *
 * NB: this returns the args BEFORE `withLabels` is applied; the caller is
 * responsible for merging the org labels (`gcp.storage.Bucket` supports labels).
 */
export function buildBucketArgs(
  meta: CloudInfraMeta,
  rawConfig: CloudInfraBucketConfig
): gcp.storage.BucketArgs {
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

  return bucketArgs;
}

import * as pulumi from '@pulumi/pulumi';
import * as gcp from '@pulumi/gcp';

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

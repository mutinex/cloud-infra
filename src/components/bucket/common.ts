import * as pulumi from '@pulumi/pulumi';
import * as gcp from '@pulumi/gcp';
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

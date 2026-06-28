import * as pulumi from '@pulumi/pulumi';
import { CloudInfraMeta } from '../../core/meta';
import { CloudInfraBucket, BUCKET_BULK_TYPE } from './single';
import {
  CloudInfraBucketConfig,
  CloudInfraBucketBulkArgs,
} from './common';
import type { NamingArgs } from '../../core/component';

/**
 * Pulumi type token for the bulk-bucket component.
 *
 * @deprecated Re-exported from the merged {@link CloudInfraBucket} module. The
 * bulk arity now lives in `single.ts` as `BUCKET_BULK_TYPE`; this alias is kept
 * so existing imports keep resolving to the byte-identical token.
 */
export const BULK_BUCKET_TYPE = BUCKET_BULK_TYPE;

/**
 * Name-first construction args for `CloudInfraBulkBucket`.
 *
 * @deprecated Alias of the merged class's array-arity args. Prefer
 * `new CloudInfraBucket(["a", "b"], { ... })`.
 */
export type CloudInfraBulkBucketArgs = CloudInfraBucketBulkArgs;

/**
 * @deprecated Thin alias of {@link CloudInfraBucket}. The single and bulk bucket
 * components were merged into one `CloudInfraBucket` (Wave 3 W3-C) that accepts a
 * `string` (single) OR a `string[]` (bulk). `CloudInfraBulkBucket` simply forwards
 * to the merged class with the array arity, so existing
 * `new CloudInfraBulkBucket([...], config, opts)` (and the meta-first form)
 * keep working and produce the byte-identical component URN, child generated
 * names, `getBuckets()` keys and resources they did before the merge.
 *
 * Prefer `new CloudInfraBucket(["assets", "logs"], { domain: "au", custom: {...} })`.
 */
export class CloudInfraBulkBucket extends CloudInfraBucket {
  /**
   * @deprecated Prefer `new CloudInfraBucket(names, args, opts)`.
   */
  constructor(
    names: string[],
    args?: CloudInfraBulkBucketArgs,
    opts?: pulumi.ComponentResourceOptions
  );
  /**
   * @deprecated Meta-first bulk construction. Prefer
   * `new CloudInfraBucket(names, args, opts)`.
   */
  constructor(
    meta: CloudInfraMeta,
    cloudInfraConfig?: CloudInfraBucketConfig & {
      custom?: Record<string, CloudInfraBucketConfig>;
    },
    opts?: pulumi.ComponentResourceOptions
  );
  constructor(
    namesOrMeta: string[] | CloudInfraMeta,
    argsOrConfig:
      | CloudInfraBulkBucketArgs
      | (CloudInfraBucketConfig & {
          custom?: Record<string, CloudInfraBucketConfig>;
        }) = {},
    opts?: pulumi.ComponentResourceOptions
  ) {
    // Forward straight to the merged class. Both arms (array name-first /
    // meta-first-with-array) select the merged class's BULK arity, which
    // reproduces the exact pre-merge bulk URN/label, child names and keys.
    // Cast keeps the deprecated meta-first-with-`custom` form callable.
    super(
      namesOrMeta as string[],
      argsOrConfig as NamingArgs &
        CloudInfraBucketConfig & {
          custom?: Record<string, CloudInfraBucketConfig>;
        },
      opts
    );
  }
}

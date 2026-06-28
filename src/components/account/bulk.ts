import * as pulumi from '@pulumi/pulumi';
import * as gcp from '@pulumi/gcp';
import { CloudInfraMeta } from '../../core/meta';
import {
  CloudInfraAccount,
  CloudInfraAccountBulkArgs,
  ACCOUNT_BULK_TYPE,
} from './single';
import { CloudInfraAccountConfig } from './common';
import type { NamingArgs } from '../../core/component';

/**
 * Pulumi type token for the bulk service-account component.
 *
 * @deprecated The bulk arity now lives in the merged {@link CloudInfraAccount}
 * module as `ACCOUNT_BULK_TYPE`; this alias keeps existing imports resolving to
 * the byte-identical token.
 */
export const BULK_ACCOUNT_TYPE = ACCOUNT_BULK_TYPE;

/**
 * Name-first construction args for `CloudInfraBulkAccount`.
 *
 * @deprecated Alias of the merged class's array-arity args. Prefer
 * `new CloudInfraAccount(["a", "b"], { ... })`.
 */
export type CloudInfraBulkAccountArgs = CloudInfraAccountBulkArgs;

/**
 * @deprecated Thin alias of {@link CloudInfraAccount}. The single and bulk
 * service-account components were merged into one `CloudInfraAccount` (Wave 3
 * W3-C) that accepts a `string` (single) OR a `string[]` (bulk).
 * `CloudInfraBulkAccount` simply forwards to the merged class with the array
 * arity, so existing `new CloudInfraBulkAccount([...], config, opts)` (and the
 * meta-first form) keep working and produce the byte-identical component URN,
 * child generated names (== `accountId` == SA email identity), `getAccounts()`
 * keys and resources they did before the merge.
 *
 * Prefer `new CloudInfraAccount(["primary", "global"], { description: "...", custom: {...} })`.
 */
export class CloudInfraBulkAccount extends CloudInfraAccount {
  /**
   * @deprecated Prefer `new CloudInfraAccount(names, args, opts)`.
   */
  constructor(
    names: string[],
    args?: CloudInfraBulkAccountArgs,
    opts?: pulumi.ComponentResourceOptions
  );
  /**
   * @deprecated Meta-first bulk construction. Prefer
   * `new CloudInfraAccount(names, args, opts)`.
   */
  constructor(
    meta: CloudInfraMeta,
    config?: CloudInfraAccountConfig & {
      custom?: Record<string, CloudInfraAccountConfig>;
    },
    opts?: pulumi.ComponentResourceOptions
  );
  constructor(
    namesOrMeta: string[] | CloudInfraMeta,
    argsOrConfig:
      | CloudInfraBulkAccountArgs
      | (CloudInfraAccountConfig & {
          custom?: Record<string, CloudInfraAccountConfig>;
        }) = {},
    opts?: pulumi.ComponentResourceOptions
  ) {
    // Forward straight to the merged class. Both arms (array name-first /
    // meta-first-with-array) select the merged class's BULK arity, which
    // reproduces the exact pre-merge bulk URN/label, child names and keys.
    super(
      namesOrMeta as string[],
      argsOrConfig as NamingArgs &
        CloudInfraAccountConfig & {
          custom?: Record<string, CloudInfraAccountConfig>;
        },
      opts
    );
  }

  /**
   * Any additional IAM members created for each account, keyed by input name.
   *
   * Narrows the merged class's union return to the record shape this alias has
   * always exposed (byte-compatible with the pre-merge `CloudInfraBulkAccount`).
   */
  public override getIamMembers(): Record<
    string,
    gcp.serviceaccount.IAMMember[]
  > {
    return super.getIamMembers() as Record<
      string,
      gcp.serviceaccount.IAMMember[]
    >;
  }
}

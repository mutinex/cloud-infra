import * as pulumi from '@pulumi/pulumi';
import * as gcp from '@pulumi/gcp';
import { CloudInfraMeta } from '../../core/meta';
import { CloudInfraOutput } from '../../core/output';
import { CloudInfraLogger } from '../../core/logging';
import { CloudInfraAccountIamMemberIdentity } from './index';
import {
  createGcpServiceAccount,
  CloudInfraAccountPulumiConfig,
  CloudInfraAccountConfig,
  CloudInfraAccountBase,
} from './common';
import { resolveMeta, type NamingArgs } from '../../core/component';

/**
 * Manages a *set* of Google Cloud Service-Accounts whose names are derived from
 * a base {@link CloudInfraMeta} instance. Compared to {@link CloudInfraAccount}, this
 * component is optimised for situations where multiple service accounts need
 * to be created with mostly identical configuration.
 *
 * Each input name provided by `meta.getNames()` becomes a standalone
 * `gcp.serviceaccount.Account` resource. Common configuration can be supplied
 * once and overridden on a per-account basis via the `custom` block.
 *
 * @example Create regional and global service accounts with shared settings
 * ```ts
 * const accounts = new CloudInfraBulkAccount(meta, {
 *   description: "Shared configuration applies to all accounts",
 *   custom: {
 *     // override the global account only
 *     global: { description: "Different description" },
 *   },
 * });
 *
 * export const allEmails = Object.values(accounts.getAccounts()).map(
 *   (sa) => sa.email,
 * );
 * ```
 *
 * @example Access a single account by name
 * ```ts
 * const apiSa = accounts.getAccount("primary");
 * ```
 */
/** Pulumi type token for the bulk service-account component. */
export const BULK_ACCOUNT_TYPE = 'cloud-infra:account:CloudInfraBulkAccount';

/**
 * Name-first construction args for `CloudInfraBulkAccount` (v2 DX, DX2 bulk).
 *
 * Folds the naming metadata ({@link NamingArgs}: `domain` / `location` /
 * `prefix` / `naming`) together with the common account config
 * ({@link CloudInfraAccountConfig}) and the per-item `custom` overrides into a
 * single args object, so a bulk account set can be built as
 * `new CloudInfraBulkAccount(["primary", "global"], { description: "...", custom: { global: { description: "..." } } })`.
 *
 * The naming fields are resolved into a `CloudInfraMeta` via the
 * `resolveMeta(names, ...)` overload (identical `getNames()` output, Frozen
 * Contract F1); the remaining fields (common config + `custom`) are passed
 * straight through to the EXACT existing bulk construction.
 */
export type CloudInfraBulkAccountArgs = NamingArgs &
  CloudInfraAccountConfig & {
    custom?: Record<string, CloudInfraAccountConfig>;
  };

export class CloudInfraBulkAccount extends CloudInfraAccountBase {
  private meta: CloudInfraMeta;
  private accounts: Record<string, gcp.serviceaccount.Account> = {};
  private configs: Record<string, CloudInfraAccountPulumiConfig> = {};
  private iamMembers: Record<string, gcp.serviceaccount.IAMMember[]> = {};

  /**
   * Name-first construction (v2 DX, preferred). The multi-name array plus the
   * naming metadata (`domain` / `location` / `prefix` / `naming`), common
   * account config and per-item `custom` overrides are folded into a single args
   * object; the names are resolved into a `CloudInfraMeta` internally with
   * byte-identical naming (Frozen Contract F1).
   */
  constructor(
    names: string[],
    args?: CloudInfraBulkAccountArgs,
    opts?: pulumi.ComponentResourceOptions
  );
  /**
   * @deprecated Meta-first construction. Prefer the name-first overload
   * `new CloudInfraBulkAccount(names, args, opts)`. Retained for backward
   * compatibility; produces identical resources.
   * @param meta - Provides the list of account names and naming conventions.
   * @param config - Common and per-account overrides. See README for the
   *                        full schema.
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
    argsOrConfig: CloudInfraBulkAccountArgs | (CloudInfraAccountConfig & {
      custom?: Record<string, CloudInfraAccountConfig>;
    }) = {},
    opts?: pulumi.ComponentResourceOptions
  ) {
    // Normalize both overloads to a (meta, config) pair. For the name-first
    // path, split the naming metadata out of the args; everything else (common
    // config + per-item `custom`) is the bulk config passed straight through.
    let meta: CloudInfraMeta;
    let config:
      | (CloudInfraAccountConfig & {
          custom?: Record<string, CloudInfraAccountConfig>;
        })
      | undefined;
    if (Array.isArray(namesOrMeta)) {
      const { domain, location, prefix, naming, ...rest } =
        argsOrConfig as CloudInfraBulkAccountArgs;
      meta = resolveMeta(namesOrMeta, { domain, location, prefix, naming });
      config = rest;
    } else {
      meta = namesOrMeta;
      config = argsOrConfig as CloudInfraAccountConfig & {
        custom?: Record<string, CloudInfraAccountConfig>;
      };
    }

    // BulkAccount wraps MANY service accounts, so there is no single primary
    // generated name to use as the component node label. Use a STABLE label
    // derived from the (order-preserving) input names. Each child SA below
    // keeps its OWN exact generated name as its first arg (F1) — the component
    // node label has no effect on child URNs (children alias back to root).
    const inputNames = meta.getInputName();
    const componentLabel = (
      Array.isArray(inputNames) ? inputNames.join('-') : inputNames
    ).concat('-accounts');

    super(
      BULK_ACCOUNT_TYPE,
      componentLabel,
      componentLabel,
      { domain: meta.getDomain() },
      opts
    );

    CloudInfraLogger.info('Initializing bulk service account component', {
      component: 'account',
      operation: 'constructor',
    });

    this.meta = meta;

    const names = meta.getNames();

    // Per-account custom blocks
    const { custom = {}, ...commonConfig } = config || {};

    for (const inputName of Object.keys(names)) {
      const generatedName = names[inputName];

      // Extract per-account configuration (Pulumi args + optional extras)
      const perAccountRaw = custom[inputName] || {};

      // Merge common + per-account Pulumi arguments (per-account takes precedence)
      const rawConfig = { ...commonConfig, ...perAccountRaw };

      // Each SA moves UNDER this component but was created FLAT at the stack
      // root in v1 → childOpts() gives each its own per-item alias back to its
      // old root-level URN for a non-destructive migration.
      // `gcp.serviceaccount.Account` has NO `labels` field → args are NOT passed
      // through withLabels (injecting labels would hard-error).
      const { account, parsedConfig } = createGcpServiceAccount({
        meta,
        rawConfig,
        inputName,
        pulumiResourceName: generatedName,
        opts: this.childOpts(),
      });

      this.accounts[inputName] = account;
      this.configs[inputName] = parsedConfig;

      this.addAccount(inputName, account);
    }

    this.registerOutputs({
      serviceAccounts: this.accounts,
    });
  }

  /**
   * All Service-Account resources keyed by *input* name.
   * @deprecated Use `serviceAccounts` property instead for direct access
   */
  public getAccounts(): Record<string, gcp.serviceaccount.Account> {
    return this.accounts;
  }

  /**
   * Returns a single Service-Account by its *input* name or `undefined`.
   * @deprecated Use `serviceAccounts[name]` for direct access, or `emails[name]`, `ids[name]`, etc. for specific properties
   */
  public getAccount(name: string): gcp.serviceaccount.Account | undefined {
    return this.accounts[name];
  }

  /**
   * Exports every account under its input name so they show up in stack
   * outputs.
   */
  public exportOutputs(manager: CloudInfraOutput): void {
    for (const [inputName, account] of Object.entries(this.accounts)) {
      manager.record(
        'gcp:serviceaccount:Account',
        inputName,
        this.meta,
        account
      );
    }
  }

  /**
   * Returns IAM identities for every managed account.
   * @deprecated Use `members` property for IAM member strings, or `emails` for email outputs
   */
  public asIamMemberIdentities(): CloudInfraAccountIamMemberIdentity[] {
    return Object.entries(this.accounts).map(([inputName, account]) => ({
      urnName: this.meta.getNames()[inputName],
      email: account.email,
    }));
  }

  /** Any additional IAM members created for each account. */
  public getIamMembers(): Record<string, gcp.serviceaccount.IAMMember[]> {
    return this.iamMembers;
  }
}

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
export class CloudInfraBulkAccount extends CloudInfraAccountBase {
  private meta: CloudInfraMeta;
  private accounts: Record<string, gcp.serviceaccount.Account> = {};
  private configs: Record<string, CloudInfraAccountPulumiConfig> = {};
  private iamMembers: Record<string, gcp.serviceaccount.IAMMember[]> = {};

  /**
   * @param meta - Provides the list of account names and naming conventions.
   * @param config - Common and per-account overrides. See README for the
   *                        full schema.
   */
  constructor(
    meta: CloudInfraMeta,
    config?: CloudInfraAccountConfig & {
      custom?: Record<string, CloudInfraAccountConfig>;
    }
  ) {
    super();

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

      const { account, parsedConfig } = createGcpServiceAccount({
        meta,
        rawConfig,
        inputName,
        pulumiResourceName: generatedName,
      });

      this.accounts[inputName] = account;
      this.configs[inputName] = parsedConfig;

      this.addAccount(inputName, account);
    }
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

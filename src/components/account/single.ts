import * as pulumi from '@pulumi/pulumi';
import * as gcp from '@pulumi/gcp';
import { CloudInfraMeta } from '../../core/meta';
import { CloudInfraOutput } from '../../core/output';
import { ValidationError } from '../../core/errors';
import { CloudInfraLogger } from '../../core/logging';
import {
  createGcpServiceAccount,
  CloudInfraAccountConfig,
  CloudInfraAccountBase,
} from './common';
import { splitMetaArgs, type NamingArgs } from '../../core/component';

/**
 * A lightweight wrapper around a single Google Cloud Service-Account that
 * enforces CloudInfra naming conventions and provides a clean, typed API for
 * Pulumi programs.
 *
 * The component purposely avoids extending `pulumi.ComponentResource` – the
 * underlying {@link gcp.serviceaccount.Account} already represents the full
 * lifecycle of the GCP resource and attaching another resource boundary on top
 * would make stack outputs harder to navigate.
 *
 * @example Basic usage
 * ```ts
 * import { CloudInfraMeta } from "@mutinex/cloud-infra/meta";
 * import { CloudInfraAccount } from "@mutinex/cloud-infra/components/account";
 *
 * const meta = new CloudInfraMeta({ name: "application", gcpProject: "my-gcp-project" });
 *
 * // Will create a Service-Account with ID "application" and the same display
 * // name/description.
 * const sa = new CloudInfraAccount(meta);
 *
 * export const serviceAccountEmail = sa.getEmail();
 * ```
 *
 * @example Override Pulumi arguments
 * ```ts
 * const sa = new CloudInfraAccount(meta, {
 *   description: "Service account for the CMSS application",
 *   disabled: true,
 * });
 * ```
 *
 * @see {@link CloudInfraBulkAccount} for creating multiple accounts at once.
 */
export interface CloudInfraAccountIamMemberIdentity {
  /** The Pulumi URN-friendly name (matches `CloudInfraMeta.getName()`). */
  urnName: string;
  /** Resolved email address of the Service-Account. */
  email: pulumi.Output<string>;
}

/** Pulumi type token for the single service-account component. */
export const ACCOUNT_TYPE = 'cloud-infra:account:CloudInfraAccount';

/**
 * Name-first construction args for `CloudInfraAccount` (v2 DX).
 *
 * Folds the naming metadata ({@link NamingArgs}: `domain` / `location` /
 * `prefix` / `naming`) together with the account config
 * ({@link CloudInfraAccountConfig}) into a single args object, so an account can
 * be built as `new CloudInfraAccount("application", { domain: "au" })`. The
 * naming fields are resolved into a `CloudInfraMeta` internally (identical
 * `generateName` output, Frozen Contract F1); the remaining fields are passed
 * straight through as the account config.
 */
export type CloudInfraAccountArgs = NamingArgs & CloudInfraAccountConfig;

export class CloudInfraAccount extends CloudInfraAccountBase {
  private meta: CloudInfraMeta;
  public readonly serviceAccount: gcp.serviceaccount.Account;
  /** The validated single input name for this account (array inputs are invalid). */
  private readonly inputName: string;
  private iamMembers: gcp.serviceaccount.IAMMember[] = [];

  /**
   * Name-first construction (v2 DX, preferred). Naming metadata
   * (`domain` / `location` / `prefix` / `naming`) and the account config are
   * folded into a single args object; the name is resolved into a
   * `CloudInfraMeta` internally with byte-identical naming (Frozen Contract F1).
   */
  constructor(
    name: string,
    args?: CloudInfraAccountArgs,
    opts?: pulumi.ComponentResourceOptions
  );
  /**
   * @deprecated Meta-first construction. Prefer the name-first overload
   * `new CloudInfraAccount(name, args, opts)`. Retained for backward
   * compatibility; produces identical resources.
   * @param meta - CloudInfra meta information for naming/tagging.
   * @param config - Configuration that is passed through to the underlying Pulumi resource.
   */
  constructor(
    meta: CloudInfraMeta,
    config?: CloudInfraAccountConfig,
    opts?: pulumi.ComponentResourceOptions
  );
  constructor(
    nameOrMeta: string | CloudInfraMeta,
    argsOrConfig: CloudInfraAccountArgs | CloudInfraAccountConfig = {},
    opts?: pulumi.ComponentResourceOptions
  ) {
    // Normalize both overloads to a (meta, config) pair. For the name-first
    // path, split the naming metadata out of the args; everything else is the
    // account config passed straight through.
    const { meta, config } = splitMetaArgs<CloudInfraAccountConfig>(
      nameOrMeta,
      argsOrConfig
    );

    const componentName = meta.getName();

    // Register the component node. Children parent under `this`. The generated
    // NAME (used as the SA `accountId` → email identity) is unchanged (F1).
    super(
      ACCOUNT_TYPE,
      componentName,
      componentName,
      { domain: meta.getDomain() },
      opts
    );

    CloudInfraLogger.info('Initializing single service account component', {
      component: 'account',
      operation: 'constructor',
    });

    this.meta = meta;

    // Narrow the potentially union-typed value to a guaranteed string. An
    // array would indicate that the caller mistakenly used `CloudInfraAccount`
    // instead of `CloudInfraBulkAccount`, so we fail early with a clear message.
    const candidateInputName = meta.getInputName();
    if (Array.isArray(candidateInputName)) {
      throw new ValidationError(
        'CloudInfraAccount expects `meta.name` to be a single string. Use CloudInfraBulkAccount for array inputs.',
        'account',
        'constructor'
      );
    }
    this.inputName = candidateInputName;

    // The SA moves UNDER this component (URN gains the component parent path).
    // It was created FLAT at the stack root in v1, so childOpts() aliases it
    // back to its old root-level URN for a non-destructive (update-in-place)
    // migration. `gcp.serviceaccount.Account` has NO `labels` field → args are
    // NOT passed through withLabels (injecting labels would hard-error).
    const { account } = createGcpServiceAccount({
      meta: meta,
      rawConfig: config || {},
      inputName: this.inputName,
      pulumiResourceName: componentName,
      opts: this.childOpts(),
    });
    this.serviceAccount = account;

    this.addAccount(this.inputName, account);

    // IAM configuration removed as requested

    this.registerOutputs({
      serviceAccount: this.serviceAccount,
    });
  }

  /**
   * Returns the underlying Pulumi `gcp.serviceaccount.Account` resource.
   * @deprecated Use `serviceAccounts[name]` instead for direct access
   */
  public getServiceAccount(): gcp.serviceaccount.Account {
    return this.serviceAccount;
  }

  /**
   * GCP resource ID ( `{project}/{name}` ).
   * @deprecated Use `ids[name]` instead for direct access
   */
  public getId(): pulumi.Output<string> {
    return this.serviceAccount.id;
  }

  /**
   * Full email address of the Service-Account.
   * @deprecated Use `emails[name]` instead for direct access
   */
  public getEmail(): pulumi.Output<string> {
    return this.serviceAccount.email;
  }

  /**
   * Short name (`projects/-/serviceAccounts/{name}`) of the account.
   * @deprecated Use `names[name]` instead for direct access
   */
  public getName(): pulumi.Output<string> {
    return this.serviceAccount.name;
  }

  /**
   * Helper that exposes the account in a format suitable for IAM bindings.
   * @deprecated Use `members[name]` for the IAM member string, or `emails[name]` for email
   */
  public asIamMemberIdentity(): CloudInfraAccountIamMemberIdentity {
    return {
      urnName: this.meta.getName(),
      email: this.serviceAccount.email,
    };
  }

  /**
   * Registers this component's outputs with the given {@link CloudInfraOutput}
   * manager so they show up in `pulumi stack output`.
   */
  public exportOutputs(manager: CloudInfraOutput): void {
    // `inputName` is guaranteed to be a string thanks to constructor check.
    const grouping = this.inputName;
    manager.record(
      'gcp:serviceaccount:Account',
      grouping,
      this.meta,
      this.serviceAccount
    );
  }

  /** Any additional IAM member resources that were created. */
  public getIamMembers(): gcp.serviceaccount.IAMMember[] {
    return this.iamMembers;
  }
}

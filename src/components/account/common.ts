import * as pulumi from '@pulumi/pulumi';
import * as gcp from '@pulumi/gcp';
import { z } from 'zod';
import { CloudInfraMeta, gcpServiceAccountNameSchema } from '../../core/meta';
import { ValidationError, ResourceError } from '../../core/errors';
import { CloudInfraLogger } from '../../core/logging';

/**
 * Shared helpers, configuration types and validation schemas for CloudInfra
 * Service-Account components.
 *
 * The symbols in this module are consumed by both {@link CloudInfraAccount}
 * (single account) and {@link CloudInfraBulkAccount} (multiple accounts).  They
 * take care of translating high-level, CloudInfra-specific configuration into the
 * low-level {@link gcp.serviceaccount.AccountArgs} structure that the underlying
 * Pulumi GCP provider expects.
 *
 * No resources are created here – `createGcpServiceAccount` merely encapsulates
 * creation logic so that the two components can call it in a consistent way.
 *
 * @packageDocumentation
 */

/**
 * Interface defining the consistent structure for account membership properties
 * that both CloudInfraAccount and CloudInfraBulkAccount must implement.
 */
export interface ICloudInfraAccountMembership {
  readonly emails: Record<string, pulumi.Output<string>>;
  readonly ids: Record<string, pulumi.Output<string>>;
  readonly names: Record<string, pulumi.Output<string>>;
  readonly members: Record<string, pulumi.Output<string>>;
  readonly serviceAccounts: Record<string, gcp.serviceaccount.Account>;
}

/**
 * Base class that provides the common account membership properties
 * implementation to eliminate duplication between account classes.
 */
export abstract class CloudInfraAccountBase
  implements ICloudInfraAccountMembership
{
  readonly emails: Record<string, pulumi.Output<string>> = {};
  readonly ids: Record<string, pulumi.Output<string>> = {};
  readonly names: Record<string, pulumi.Output<string>> = {};
  readonly members: Record<string, pulumi.Output<string>> = {};
  readonly serviceAccounts: Record<string, gcp.serviceaccount.Account> = {};

  protected addAccount(
    inputName: string,
    account: gcp.serviceaccount.Account
  ): void {
    this.serviceAccounts[inputName] = account;
    this.emails[inputName] = account.email;
    this.ids[inputName] = account.id;
    this.names[inputName] = account.name;
    this.members[inputName] = account.member;
  }
}

/**
 * Configuration for Account component.
 * CRITICAL: Omit ALL meta-managed fields to avoid conflicts.
 */
export type CloudInfraAccountConfig = Omit<
  gcp.serviceaccount.AccountArgs,
  'accountId' | 'project'
> & {
  // Add back as optional ONLY if user override makes sense
  project?: pulumi.Input<string>; // Optional: user can override meta's project
};

/**
 * Internal representation of the configuration that is guaranteed to be valid
 * for direct use with the Pulumi GCP provider.
 */
export type CloudInfraAccountPulumiConfig = gcp.serviceaccount.AccountArgs;

/**
 * Parameters expected by {@link createGcpServiceAccount}.
 */
export interface CreateCloudInfraAccountParams {
  /** CloudInfra meta instance that holds naming and tagging helpers. */
  meta: CloudInfraMeta;
  /** Raw user-supplied configuration. */
  rawConfig: CloudInfraAccountConfig;
  /**
   * Input name supplied by the caller. This value is validated and, upon
   * success, becomes the GCP Service-Account *ID*.
   */
  inputName: string;
  /** Name used for the Pulumi resource URN – must be unique in the stack. */
  pulumiResourceName: string;
}

/**
 * Factory helper that instantiates a GCP Service-Account with CloudInfra naming
 * conventions and robust validation.
 *
 * @param params - {@link CreateCloudInfraAccountParams}
 * @returns The created Pulumi resource together with the validated
 *          configuration.
 * @throws ZodError if the supplied *inputName* does not conform to GCP naming
 *         requirements.
 */
export function createGcpServiceAccount(
  params: CreateCloudInfraAccountParams
): {
  /** The Service-Account Pulumi resource. */
  account: gcp.serviceaccount.Account;
  /** The validated configuration used to create the resource. */
  parsedConfig: CloudInfraAccountPulumiConfig;
} {
  const { meta, rawConfig, inputName, pulumiResourceName } = params;

  CloudInfraLogger.info('Creating GCP service account', {
    component: 'account',
    operation: 'createGcpServiceAccount',
  });

  // Skip validation if naming rules are overridden
  if (!meta.shouldOverrideNamingRules()) {
    try {
      gcpServiceAccountNameSchema.parse(inputName);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const issue = error.errors[0];
        throw new ValidationError(
          `Invalid input name '${inputName}' provided for Service Account: ${issue.message}. This name is used as the GCP Service Account ID and must comply with its naming standards. (path: ${issue.path.join('.')}) - Use 'overrideNamingRules: true' in CloudInfraMeta to bypass this validation.`,
          'account',
          'createGcpServiceAccount'
        );
      }
      throw new ResourceError(
        `Failed to validate service account name '${inputName}': ${error}`,
        'account',
        'createGcpServiceAccount'
      );
    }
  }

  // Build args - defaults applied ONLY for meta-managed fields
  const accountArgs: gcp.serviceaccount.AccountArgs = {
    ...(rawConfig || {}), // User config first (spread at beginning)
    accountId: pulumiResourceName,
    displayName: rawConfig?.displayName ?? pulumiResourceName,
    description: rawConfig?.description ?? pulumiResourceName,
    project: rawConfig?.project ?? meta.getGcpProject(), // ALWAYS use meta fallback
  };

  const account = new gcp.serviceaccount.Account(
    pulumiResourceName,
    accountArgs
  );

  const parsedConfig: CloudInfraAccountPulumiConfig = accountArgs;
  return { account, parsedConfig };
}

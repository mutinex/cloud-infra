/**
 * Simple, centralized configuration for cloud infrastructure library.
 *
 * NOTE on the former `Config` singleton: it had an `init()` that was never
 * called anywhere, so the mutable singleton always returned `defaultConfig`.
 * It has been replaced with plain exported constants at their EXACT former
 * default values. Two of these are part of the FROZEN naming contract and MUST
 * NOT change:
 *   - `accessMatrixConfig.maxResourceNameLength = 100` — access-matrix IAM-name
 *     truncation (Frozen Contract F3).
 *   - `resourceNamingConfig.certificateMaxLength = 32` — certificatemap name
 *     sanitisation length.
 *
 * `gcpConfig` and `referenceConfig` read the LIVE `pulumi.Config` and are kept
 * as lazy getters (they must not be inlined).
 */

import * as pulumi from '@pulumi/pulumi';

/**
 * Access-matrix tuning constants. Inlined from the former `Config` singleton's
 * `defaultConfig.accessMatrix` at byte-identical values.
 *
 * `maxResourceNameLength` is FROZEN at 100 (Frozen Contract F3 — IAM resource
 * name truncation in `access-matrix/core/policy-rule-processor.ts`).
 */
export const accessMatrixConfig = {
  /** FROZEN (F3): IAM resource-name truncation length. */
  maxResourceNameLength: 100,
  enableDetailedLogging: true,
  maxPrincipalsThreshold: 100,
  defaultOperationTimeout: 30000,
} as const;

/**
 * Resource-naming length constants. Inlined from the former `Config`
 * singleton's `defaultConfig.resourceNaming` at byte-identical values.
 *
 * `certificateMaxLength` is the only one read at runtime today (certificatemap
 * name sanitisation); the others are retained at their exact former defaults.
 */
export const resourceNamingConfig = {
  maxLength: 63,
  /** certificatemap `sanitizeResourceName` truncation length. */
  certificateMaxLength: 32,
  folderMaxLength: 30,
  projectIdMaxLength: 30,
} as const;

export const gcpConfig = {
  get organizationId() {
    try {
      const cfg = new pulumi.Config('cloudInfra');
      return cfg.require('organizationId');
    } catch (error) {
      throw new Error(`Missing required GCP configuration: 'organizationId'

To fix this error, add the following to your Pulumi configuration:
  pulumi config set cloudInfra:organizationId "your-org-id-here"

This configuration is required by:
  - CloudInfraFolder
  - CloudInfraTag
  - Project components

Original error: ${error instanceof Error ? error.message : String(error)}`);
    }
  },
  get organization() {
    return `organizations/${this.organizationId}`;
  },
  get billingAccountId() {
    try {
      const cfg = new pulumi.Config('cloudInfra');
      return cfg.require('billingAccountId');
    } catch (error) {
      throw new Error(`Missing required GCP configuration: 'billingAccountId'

To fix this error, add the following to your Pulumi configuration:
  pulumi config set cloudInfra:billingAccountId "your-billing-account-id-here"

This configuration is required by:
  - Project components (organization/project/*)

Original error: ${error instanceof Error ? error.message : String(error)}`);
    }
  },
  get organizationName() {
    try {
      const cfg = new pulumi.Config('cloudInfra');
      return cfg.require('organizationName');
    } catch (error) {
      throw new Error(`Missing required GCP configuration: 'organizationName'

To fix this error, add the following to your Pulumi configuration:
  pulumi config set cloudInfra:organizationName "your-organization-name-here"

Original error: ${error instanceof Error ? error.message : String(error)}`);
    }
  },
};

export const referenceConfig = {
  get defaultOutputKey() {
    try {
      const cfg = new pulumi.Config('cloudInfra');
      return cfg.require('defaultOutputKey');
    } catch (error) {
      throw new Error(`Missing required configuration: 'defaultOutputKey'

To fix this error, add the following to your Pulumi configuration:
  pulumi config set cloudInfra:defaultOutputKey "your-output-key-here"

Original error: ${error instanceof Error ? error.message : String(error)}`);
    }
  },
};

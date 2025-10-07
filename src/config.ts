/**
 * Simple, centralized configuration for cloud infrastructure library
 */

import * as pulumi from '@pulumi/pulumi';

export interface CloudInfraConfig {
  gcp?: {
    organizationId: string;
    billingAccountId: string;
    organizationName: string;
  };
  accessMatrix: {
    maxResourceNameLength: number;
    enableDetailedLogging: boolean;
    maxPrincipalsThreshold: number;
    defaultOperationTimeout: number;
  };
  resourceNaming: {
    maxLength: number;
    certificateMaxLength: number;
    folderMaxLength: number;
    projectIdMaxLength: number;
  };
  reference?: {
    defaultOutputKey: string;
  };
}

const defaultConfig: CloudInfraConfig = {
  accessMatrix: {
    maxResourceNameLength: 100,
    enableDetailedLogging: true,
    maxPrincipalsThreshold: 100,
    defaultOperationTimeout: 30000,
  },
  resourceNaming: {
    maxLength: 63,
    certificateMaxLength: 32,
    folderMaxLength: 30,
    projectIdMaxLength: 30,
  },
};

export class Config {
  private static config: CloudInfraConfig = defaultConfig;

  static init(externalConfig: Partial<CloudInfraConfig>): void {
    this.config = {
      ...(externalConfig.gcp && { gcp: externalConfig.gcp }),
      accessMatrix: {
        ...defaultConfig.accessMatrix,
        ...externalConfig.accessMatrix,
      },
      resourceNaming: {
        ...defaultConfig.resourceNaming,
        ...externalConfig.resourceNaming,
      },
      ...(externalConfig.reference && { reference: externalConfig.reference }),
    };
  }

  static get(): CloudInfraConfig {
    return this.config;
  }
}

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

export const accessMatrixConfig = {
  get maxResourceNameLength() {
    return Config.get().accessMatrix.maxResourceNameLength;
  },
  get enableDetailedLogging() {
    return Config.get().accessMatrix.enableDetailedLogging;
  },
  get maxPrincipalsThreshold() {
    return Config.get().accessMatrix.maxPrincipalsThreshold;
  },
  get defaultOperationTimeout() {
    return Config.get().accessMatrix.defaultOperationTimeout;
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

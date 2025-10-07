import * as pulumi from '@pulumi/pulumi';
import * as gcp from '@pulumi/gcp';

// Core dependencies - ALWAYS required
import { CloudInfraMeta } from '../../core/meta';
import { CloudInfraLogger } from '../../core/logging';
import { CloudInfraOutput } from '../../core/output';

// Error handling
import { ValidationError } from '../../core/errors';

// Helpers
import { deriveRegion } from '../../core/helpers';

/**
 * Cloud SQL **instance** component.
 *
 * Wraps `gcp.sql.DatabaseInstance` and automatically:
 *   • fills `region` from {@link CloudInfraMeta} if omitted
 *   • assigns the CloudInfra-generated name when `name` is not provided
 *
 * No databases or users are created – those are handled by
 * {@link CloudInfraDatabase} and {@link CloudInfraDatabaseUser} respectively.
 *
 * @packageDocumentation
 */

/**
 * Configuration for DatabaseInstance component.
 * CRITICAL: Omit ALL meta-managed fields to avoid conflicts.
 */
export type CloudInfraDatabaseInstanceConfig = Omit<
  gcp.sql.DatabaseInstanceArgs,
  'name' | 'project' | 'region'
> & {
  // Add back as optional ONLY if user override makes sense
  project?: pulumi.Input<string>; // Optional: user can override meta's project
  region?: pulumi.Input<string>; // Optional: user can override meta's region
};

/**
 * Component that manages a single Cloud SQL instance.
 *
 * @example Create a minimal Postgres 15 instance
 * ```ts
 * const meta = new CloudInfraMeta({ name: "sql", domain: "au" });
 * const instance = new CloudInfraDatabaseInstance(meta, {
 *   databaseVersion: "POSTGRES_15",
 *   settings: { tier: "db-f1-micro" },
 * });
 * ```
 */
export class CloudInfraDatabaseInstance {
  private readonly meta: CloudInfraMeta;
  private readonly instance: gcp.sql.DatabaseInstance;

  constructor(meta: CloudInfraMeta, config: CloudInfraDatabaseInstanceConfig) {
    CloudInfraLogger.info('Initializing database-instance component', {
      component: 'database-instance',
      operation: 'constructor',
    });

    this.meta = meta;
    const resourceName = meta.getName();

    const inputName = meta.getInputName();
    if (Array.isArray(inputName)) {
      throw new ValidationError(
        'CloudInfraDatabaseInstance expects a single name. Use separate instances for multiple.',
        'database-instance',
        'constructor'
      );
    }

    const instanceArgs: gcp.sql.DatabaseInstanceArgs = {
      ...config,
      name: resourceName,
      project: config.project ?? meta.getGcpProject(),
      region: config.region ?? deriveRegion(meta),
    };

    this.instance = new gcp.sql.DatabaseInstance(resourceName, instanceArgs);
  }

  /** Underlying Cloud SQL instance resource. */
  public getInstance(): gcp.sql.DatabaseInstance {
    return this.instance;
  }

  /** Instance name. */
  public getName(): pulumi.Output<string> {
    return this.instance.name;
  }

  /** Region where the instance runs. */
  public getRegion(): pulumi.Output<string> {
    const inst = this.instance as pulumi.CustomResource & {
      region: pulumi.Output<string>;
    };
    return inst.region;
  }

  /** Export to `CloudInfraOutput`. */
  public exportOutputs(manager: CloudInfraOutput): void {
    const inputName = this.meta.getInputName();
    const grouping = Array.isArray(inputName) ? inputName[0] : inputName;

    manager.record(
      'gcp:sql:DatabaseInstance',
      grouping,
      this.meta,
      this.instance
    );
  }
}

export const CloudInfraDatabaseInstanceComponent = CloudInfraDatabaseInstance;

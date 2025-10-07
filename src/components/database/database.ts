import * as pulumi from '@pulumi/pulumi';
import * as gcp from '@pulumi/gcp';

// Core dependencies - ALWAYS required
import { CloudInfraMeta } from '../../core/meta';
import { CloudInfraLogger } from '../../core/logging';
import { CloudInfraOutput } from '../../core/output';

// Error handling
import { ValidationError } from '../../core/errors';

/**
 * Cloud SQL **database** component.
 *
 * Wraps `gcp.sql.Database` and applies a CloudInfra-compliant name. Requires the
 * caller to specify the *instance* ID; this component does **not** provision an
 * instance automatically.
 *
 * @packageDocumentation
 */

/**
 * Configuration for Database component.
 * CRITICAL: Omit ALL meta-managed fields to avoid conflicts.
 */
export type CloudInfraDatabaseConfig = Omit<
  gcp.sql.DatabaseArgs,
  'name' | 'project'
> & {
  // Add back as optional ONLY if user override makes sense
  project?: pulumi.Input<string>; // Optional: user can override meta's project
};

/**
 * Component representing a single database inside an existing Cloud SQL instance.
 */
export class CloudInfraDatabase {
  private readonly meta: CloudInfraMeta;
  private readonly database: gcp.sql.Database;

  constructor(meta: CloudInfraMeta, config: CloudInfraDatabaseConfig) {
    // ALWAYS log initialization first
    CloudInfraLogger.info('Initializing database component', {
      component: 'database',
      operation: 'constructor',
    });

    this.meta = meta;
    const resourceName = meta.getName();

    // Validate single name input
    const inputName = meta.getInputName();
    if (Array.isArray(inputName)) {
      throw new ValidationError(
        'CloudInfraDatabase expects a single name.',
        'database',
        'constructor'
      );
    }

    // Validate critical fields with typed errors
    if (!config.instance) {
      throw new ValidationError(
        "'instance' must be provided when creating a CloudInfraDatabase — it should reference an existing Cloud SQL instance.",
        'database',
        'constructor'
      );
    }

    // Build args - defaults applied ONLY for meta-managed fields
    const databaseArgs: gcp.sql.DatabaseArgs = {
      ...config, // User config first (spread at beginning)
      name: resourceName,
      project: config.project ?? meta.getGcpProject(), // ALWAYS use meta fallback
    };

    // Create the resource - one line, no ceremony
    this.database = new gcp.sql.Database(resourceName, databaseArgs);
  }

  /** Underlying database resource. */
  public getDatabase(): gcp.sql.Database {
    return this.database;
  }

  /** Database name (SQL identifier). */
  public getName(): pulumi.Output<string> {
    return this.database.name;
  }

  /** Export database details to `CloudInfraOutput`. */
  public exportOutputs(manager: CloudInfraOutput): void {
    const inputName = this.meta.getInputName();
    const grouping = Array.isArray(inputName) ? inputName[0] : inputName;

    manager.record('gcp:sql:Database', grouping, this.meta, this.database);
  }
}

export const CloudInfraDatabaseComponent = CloudInfraDatabase;

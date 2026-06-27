import * as pulumi from '@pulumi/pulumi';
import * as gcp from '@pulumi/gcp';

// Core dependencies - ALWAYS required
import { CloudInfraMeta } from '../../core/meta';
import { CloudInfraLogger } from '../../core/logging';
import { CloudInfraOutput } from '../../core/output';

// Error handling
import { ValidationError } from '../../core/errors';
import {
  CloudInfraComponent,
  resolveMeta,
  type NamingArgs,
} from '../../core/component';

/** Pulumi type token for the Cloud SQL database component. */
export const DATABASE_TYPE = 'cloud-infra:database:Database';

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
 * Name-first construction args for `CloudInfraDatabase` (v2 DX).
 *
 * Folds the naming metadata ({@link NamingArgs}: `domain` / `location` /
 * `prefix` / `naming`) together with the database config
 * ({@link CloudInfraDatabaseConfig}) into a single args object. The naming
 * fields are resolved into a `CloudInfraMeta` internally (identical
 * `generateName` output, Frozen Contract F1); the remaining fields are passed
 * straight through as the database config.
 */
export type CloudInfraDatabaseArgs = NamingArgs & CloudInfraDatabaseConfig;

/**
 * Component representing a single database inside an existing Cloud SQL instance.
 */
export class CloudInfraDatabase extends CloudInfraComponent {
  private readonly meta: CloudInfraMeta;
  private readonly database: gcp.sql.Database;

  /**
   * Name-first construction (v2 DX, preferred). Naming metadata
   * (`domain` / `location` / `prefix` / `naming`) and the database config are
   * folded into a single args object; the name is resolved into a
   * `CloudInfraMeta` internally with byte-identical naming (Frozen Contract F1).
   */
  constructor(
    name: string,
    args: CloudInfraDatabaseArgs,
    opts?: pulumi.ComponentResourceOptions
  );
  /**
   * @deprecated Meta-first construction. Prefer the name-first overload
   * `new CloudInfraDatabase(name, args, opts)`. Retained for backward
   * compatibility; produces identical resources.
   */
  constructor(
    meta: CloudInfraMeta,
    config: CloudInfraDatabaseConfig,
    opts?: pulumi.ComponentResourceOptions
  );
  constructor(
    nameOrMeta: string | CloudInfraMeta,
    argsOrConfig: CloudInfraDatabaseArgs | CloudInfraDatabaseConfig,
    opts?: pulumi.ComponentResourceOptions
  ) {
    // Normalize both overloads to a (meta, config) pair. For the name-first
    // path, split the naming metadata out of the args; everything else is the
    // database config passed straight through.
    let meta: CloudInfraMeta;
    let config: CloudInfraDatabaseConfig;
    if (typeof nameOrMeta === 'string') {
      const { domain, location, prefix, naming, ...rest } =
        argsOrConfig as CloudInfraDatabaseArgs;
      meta = resolveMeta(nameOrMeta, { domain, location, prefix, naming });
      config = rest;
    } else {
      meta = nameOrMeta;
      config = argsOrConfig as CloudInfraDatabaseConfig;
    }

    const resourceName = meta.getName();

    super(
      DATABASE_TYPE,
      resourceName,
      resourceName,
      { domain: meta.getDomain() },
      opts
    );

    // ALWAYS log initialization first
    CloudInfraLogger.info('Initializing database component', {
      component: 'database',
      operation: 'constructor',
    });

    this.meta = meta;

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

    // gcp.sql.Database has NO `labels` field → OMIT label stamping (args are
    // NOT passed through withLabels). v1 created it FLAT → childOpts() aliases
    // it back to root.
    this.database = new gcp.sql.Database(
      resourceName,
      databaseArgs,
      this.childOpts()
    );

    this.registerOutputs({
      database: this.database,
    });
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

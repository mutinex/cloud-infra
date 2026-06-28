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
import {
  CloudInfraComponent,
  splitMetaArgs,
  type NamingArgs,
} from '../../core/component';

/** Pulumi type token for the Cloud SQL instance component. */
export const DATABASE_INSTANCE_TYPE = 'cloud-infra:database:DatabaseInstance';

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
 * Name-first construction args for `CloudInfraDatabaseInstance` (v2 DX).
 *
 * Folds the naming metadata ({@link NamingArgs}: `domain` / `location` /
 * `prefix` / `naming`) together with the instance config
 * ({@link CloudInfraDatabaseInstanceConfig}) into a single args object. The
 * naming fields are resolved into a `CloudInfraMeta` internally (identical
 * `generateName` output, Frozen Contract F1); the remaining fields are passed
 * straight through as the instance config.
 */
export type CloudInfraDatabaseInstanceArgs = NamingArgs &
  CloudInfraDatabaseInstanceConfig;

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
export class CloudInfraDatabaseInstance extends CloudInfraComponent {
  private readonly meta: CloudInfraMeta;
  private readonly instance: gcp.sql.DatabaseInstance;

  /**
   * Name-first construction (v2 DX, preferred). Naming metadata
   * (`domain` / `location` / `prefix` / `naming`) and the instance config are
   * folded into a single args object; the name is resolved into a
   * `CloudInfraMeta` internally with byte-identical naming (Frozen Contract F1).
   */
  constructor(
    name: string,
    args: CloudInfraDatabaseInstanceArgs,
    opts?: pulumi.ComponentResourceOptions
  );
  /**
   * @deprecated Meta-first construction. Prefer the name-first overload
   * `new CloudInfraDatabaseInstance(name, args, opts)`. Retained for backward
   * compatibility; produces identical resources.
   */
  constructor(
    meta: CloudInfraMeta,
    config: CloudInfraDatabaseInstanceConfig,
    opts?: pulumi.ComponentResourceOptions
  );
  constructor(
    nameOrMeta: string | CloudInfraMeta,
    argsOrConfig:
      | CloudInfraDatabaseInstanceArgs
      | CloudInfraDatabaseInstanceConfig,
    opts?: pulumi.ComponentResourceOptions
  ) {
    // Normalize both overloads to a (meta, config) pair. For the name-first
    // path, split the naming metadata out of the args; everything else is the
    // instance config passed straight through.
    const { meta, config } = splitMetaArgs<CloudInfraDatabaseInstanceConfig>(
      nameOrMeta,
      argsOrConfig
    );

    const resourceName = meta.getName();

    super(
      DATABASE_INSTANCE_TYPE,
      resourceName,
      resourceName,
      { domain: meta.getDomain() },
      opts
    );

    CloudInfraLogger.info('Initializing database-instance component', {
      component: 'database-instance',
      operation: 'constructor',
    });

    this.meta = meta;

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

    // gcp.sql.DatabaseInstance has NO top-level `labels` (only nested
    // `settings.userLabels`), so we OMIT label stamping (args are NOT passed
    // through withLabels) — injecting top-level labels would be a deploy
    // hard-error. v1 created the instance FLAT → childOpts() aliases it back to
    // the stack root.
    this.instance = new gcp.sql.DatabaseInstance(
      resourceName,
      instanceArgs,
      this.childOpts()
    );

    this.registerOutputs({
      instance: this.instance,
    });
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

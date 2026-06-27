/**
 * Cloud SQL **user** component.
 *
 * Creates a `gcp.sql.User` bound to an existing Cloud SQL instance. Passwords
 * are automatically declared as secret outputs so they are encrypted in state
 * files.
 *
 * @packageDocumentation
 */
import * as pulumi from '@pulumi/pulumi';
import * as gcp from '@pulumi/gcp';

// Core dependencies - ALWAYS required
import { CloudInfraMeta } from '../../core/meta';
import { CloudInfraLogger } from '../../core/logging';
import { CloudInfraOutput } from '../../core/output';

// Error handling
import { ValidationError } from '../../core/errors';
import { CloudInfraComponent } from '../../core/component';

/** Pulumi type token for the Cloud SQL user component. */
export const DATABASE_USER_TYPE = 'cloud-infra:database:DatabaseUser';

/**
 * Configuration for DatabaseUser component.
 */
export type CloudInfraDatabaseUserConfig = Omit<
  gcp.sql.UserArgs,
  'name' | 'project'
> & {
  // Add back as optional ONLY if user override makes sense
  project?: pulumi.Input<string>; // Optional: user can override meta's project
};

/**
 * Component that manages a single database user (standard or IAM).
 */
export class CloudInfraDatabaseUser extends CloudInfraComponent {
  private readonly meta: CloudInfraMeta;
  private readonly user: gcp.sql.User;

  constructor(
    meta: CloudInfraMeta,
    config: CloudInfraDatabaseUserConfig,
    opts?: pulumi.ComponentResourceOptions
  ) {
    const resourceName = meta.getName();

    super(
      DATABASE_USER_TYPE,
      resourceName,
      resourceName,
      { domain: meta.getDomain() },
      opts
    );

    CloudInfraLogger.info('Initializing database-user component', {
      component: 'database-user',
      operation: 'constructor',
    });

    this.meta = meta;

    const inputName = meta.getInputName();
    if (Array.isArray(inputName)) {
      throw new ValidationError(
        'CloudInfraDatabaseUser expects a single name.',
        'database-user',
        'constructor'
      );
    }

    if (!config.instance) {
      throw new ValidationError(
        "'instance' must be provided when creating a CloudInfraDatabaseUser — it should reference an existing Cloud SQL instance.",
        'database-user',
        'constructor'
      );
    }

    const userArgs: gcp.sql.UserArgs = {
      ...config,
      name: resourceName,
      project: config.project ?? meta.getGcpProject(),
    };

    // gcp.sql.User has NO `labels` field → OMIT label stamping and use PLAIN
    // opts (NOT childOpts). v1 created it FLAT → alias back to root. Keep the
    // existing `additionalSecretOutputs` so passwords stay secret in state.
    this.user = new gcp.sql.User(resourceName, userArgs, {
      parent: this,
      aliases: [{ parent: pulumi.rootStackResource }],
      // Make sure password values remain secret in state files.
      additionalSecretOutputs: ['password'],
    });

    this.registerOutputs({
      user: this.user,
    });
  }

  /** Underlying user resource. */
  public getUser(): gcp.sql.User {
    return this.user;
  }

  /** Username. */
  public getName(): pulumi.Output<string> {
    return this.user.name;
  }

  /** Export user details to `CloudInfraOutput`. */
  public exportOutputs(manager: CloudInfraOutput): void {
    const inputName = this.meta.getInputName();
    const grouping = Array.isArray(inputName) ? inputName[0] : inputName;

    manager.record('gcp:sql:User', grouping, this.meta, this.user);
  }
}

export const CloudInfraDatabaseUserComponent = CloudInfraDatabaseUser;

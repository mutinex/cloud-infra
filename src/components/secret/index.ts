import * as pulumi from '@pulumi/pulumi';
import * as gcp from '@pulumi/gcp';
import { CloudInfraMeta } from '../../core/meta';
import { CloudInfraLogger } from '../../core/logging';
import { CloudInfraOutput } from '../../core/output';

import { ValidationError } from '../../core/errors';

// Helpers - import as needed
import { deriveRegion } from '../../core/helpers';
import {
  CloudInfraComponent,
  resolveMeta,
  type NamingArgs,
} from '../../core/component';

/** Pulumi type token for the Secret Manager secret+version component. */
export const SECRET_VERSION_TYPE = 'cloud-infra:secret:SecretVersion';

/**
 * Configuration for SecretVersion component.
 */
export type CloudInfraSecretVersionConfig = {
  // Version fields (common to both global and regional)
  secretData: pulumi.Input<string>; // Required field
  // Add back as optional ONLY if user override makes sense
  project?: pulumi.Input<string>; // Optional: user can override meta's project
  // Secret configuration for the underlying Secret resource
  secret?: {
    // Global secret fields
    replication?: gcp.types.input.secretmanager.SecretReplication;
    labels?: pulumi.Input<{ [key: string]: pulumi.Input<string> }>;
    // Add back as optional ONLY if user override makes sense
    project?: pulumi.Input<string>; // Optional: user can override meta's project
    location?: pulumi.Input<string>; // Optional: user can override meta's location (regional only)
  };
};

/**
 * Name-first construction args for `CloudInfraSecretVersion` (v2 DX).
 *
 * Folds the naming metadata ({@link NamingArgs}: `domain` / `location` /
 * `prefix` / `naming`) together with the secret-version config
 * ({@link CloudInfraSecretVersionConfig}) into a single args object. The naming
 * fields are resolved into a `CloudInfraMeta` internally (identical
 * `generateName` output, Frozen Contract F1); the remaining fields are passed
 * straight through as the config.
 */
export type CloudInfraSecretVersionArgs = NamingArgs &
  CloudInfraSecretVersionConfig;

/*********************************************************************************************
 * The main CloudInfraSecretVersion component
 ********************************************************************************************/

/**
 * Secret Manager **Secret + Version** component.
 *
 * Depending on the underlying {@link CloudInfraMeta} location this component
 *  • creates a *regional* `gcp.secretmanager.RegionalSecret` and version, or
 *  • a *global* `gcp.secretmanager.Secret` replicated across all regions
 *    returned by `meta.getMultiRegion()` (pre-populated user-managed
 *    replication).
 *
 * Callers pass the payload through `secretData` (or `secretDataSecret`) and may
 * customise the Secret resource through the `secret` extras block. All other
 * fields accepted by Pulumi's version args remain available.
 *
 * @packageDocumentation
 */
export class CloudInfraSecretVersion extends CloudInfraComponent {
  private readonly meta: CloudInfraMeta;
  private readonly secret:
    | gcp.secretmanager.Secret
    | gcp.secretmanager.RegionalSecret;
  private readonly version:
    | gcp.secretmanager.SecretVersion
    | gcp.secretmanager.RegionalSecretVersion;

  /**
   * Name-first construction (v2 DX, preferred). Naming metadata
   * (`domain` / `location` / `prefix` / `naming`) and the secret-version config
   * are folded into a single args object; the name is resolved into a
   * `CloudInfraMeta` internally with byte-identical naming (Frozen Contract F1).
   */
  constructor(
    name: string,
    args: CloudInfraSecretVersionArgs,
    opts?: pulumi.ComponentResourceOptions
  );
  /**
   * @deprecated Meta-first construction. Prefer the name-first overload
   * `new CloudInfraSecretVersion(name, args, opts)`. Retained for backward
   * compatibility; produces identical resources.
   */
  constructor(
    meta: CloudInfraMeta,
    config: CloudInfraSecretVersionConfig,
    opts?: pulumi.ComponentResourceOptions
  );
  constructor(
    nameOrMeta: string | CloudInfraMeta,
    argsOrConfig: CloudInfraSecretVersionArgs | CloudInfraSecretVersionConfig,
    opts?: pulumi.ComponentResourceOptions
  ) {
    // Normalize both overloads to a (meta, config) pair. For the name-first
    // path, split the naming metadata out of the args; everything else is the
    // secret-version config passed straight through.
    let meta: CloudInfraMeta;
    let config: CloudInfraSecretVersionConfig;
    if (typeof nameOrMeta === 'string') {
      const { domain, location, prefix, naming, ...rest } =
        argsOrConfig as CloudInfraSecretVersionArgs;
      meta = resolveMeta(nameOrMeta, { domain, location, prefix, naming });
      config = rest;
    } else {
      meta = nameOrMeta;
      config = argsOrConfig as CloudInfraSecretVersionConfig;
    }

    const resourceName = meta.getName();

    super(
      SECRET_VERSION_TYPE,
      resourceName,
      resourceName,
      { domain: meta.getDomain() },
      opts
    );

    // ALWAYS log initialization first
    CloudInfraLogger.info('Initializing secret-version component', {
      component: 'secret-version',
      operation: 'constructor',
    });

    this.meta = meta;

    // resourceName computed above (shared with super()).

    // Validate input name is single string
    const candidateInputName = meta.getInputName();
    if (Array.isArray(candidateInputName)) {
      throw new ValidationError(
        'Component expects a single name',
        'secret-version',
        'constructor'
      );
    }

    if (!config.secretData) {
      throw new ValidationError(
        'secretData is required',
        'secret-version',
        'constructor'
      );
    }

    // Determine whether we should create a global or regional secret
    const regionsList = meta.getMultiRegion();
    const isGlobal = regionsList.length >= 2;

    // Extract secret config and version config
    const secretConfig = config.secret || {};

    // Create the Secret resource first
    if (isGlobal) {
      const secretArgs: gcp.secretmanager.SecretArgs = {
        ...secretConfig,
        secretId: resourceName,
        project: secretConfig.project ?? config.project ?? meta.getGcpProject(),
        replication: secretConfig.replication ?? {
          userManaged: {
            replicas: regionsList.map((location: string) => ({ location })),
          },
        },
      };

      // Secret supports `labels` → merge org labels into its args. v1 created
      // it FLAT (stack root), so childOpts() aliases it back to root for
      // in-place migration.
      this.secret = new gcp.secretmanager.Secret(
        resourceName,
        this.withLabels(secretArgs),
        this.childOpts()
      );
    } else {
      const secretArgs: gcp.secretmanager.RegionalSecretArgs = {
        ...secretConfig,
        secretId: resourceName,
        project: secretConfig.project ?? config.project ?? meta.getGcpProject(),
        location: secretConfig.location ?? deriveRegion(meta),
      };

      // RegionalSecret supports `labels` → merge org labels into its args. v1
      // created it FLAT (stack root), so childOpts() aliases it back to root.
      this.secret = new gcp.secretmanager.RegionalSecret(
        resourceName,
        this.withLabels(secretArgs),
        this.childOpts()
      );
    }

    // Create the SecretVersion resource
    const baseVersionConfig = {
      secret: this.secret.id,
      secretData: config.secretData,
    };

    // SecretVersion / RegionalSecretVersion have NO `labels` field → args pass
    // through unchanged (no withLabels). They were v1-PARENTED to the Secret, so
    // nestedChildOpts keeps `parent: this.secret` with NO explicit alias —
    // parent-alias inheritance reconstructs the old URN once the parent Secret
    // is aliased to root (proven on the NEG, §9/§9c).
    if (isGlobal) {
      this.version = new gcp.secretmanager.SecretVersion(
        resourceName,
        baseVersionConfig as gcp.secretmanager.SecretVersionArgs,
        this.nestedChildOpts(this.secret)
      );
    } else {
      this.version = new gcp.secretmanager.RegionalSecretVersion(
        resourceName,
        baseVersionConfig as gcp.secretmanager.RegionalSecretVersionArgs,
        this.nestedChildOpts(this.secret)
      );
    }

    this.registerOutputs({
      secret: this.secret,
      version: this.version,
    });
  }

  /**
   * Returns the Secret/RegionalSecret resource.
   */
  public getSecret():
    | gcp.secretmanager.Secret
    | gcp.secretmanager.RegionalSecret {
    return this.secret;
  }

  /**
   * Returns the SecretVersion/RegionalSecretVersion resource.
   */
  public getVersion():
    | gcp.secretmanager.SecretVersion
    | gcp.secretmanager.RegionalSecretVersion {
    return this.version;
  }

  /**
   * Internal resource ID suitable for IAM bindings.
   */
  public getId(): pulumi.Output<string> {
    return this.version.id;
  }

  /**
   * Logical secret name.
   */
  public getName(): pulumi.Output<string> {
    return this.secret.name;
  }

  /**
   * Record secret & version outputs for downstream stacks.
   */
  public exportOutputs(manager: CloudInfraOutput): void {
    const inputName = this.meta.getInputName();
    const grouping = Array.isArray(inputName) ? inputName[0] : inputName;

    const regionsList = this.meta.getMultiRegion();
    const isGlobal = regionsList.length >= 2;

    if (isGlobal) {
      manager.record(
        'gcp:secretmanager:Secret',
        grouping,
        this.meta,
        this.secret as gcp.secretmanager.Secret
      );
      manager.record(
        'gcp:secretmanager:SecretVersion',
        grouping,
        this.meta,
        this.version as gcp.secretmanager.SecretVersion
      );
    } else {
      manager.record(
        'gcp:secretmanager:RegionalSecret',
        grouping,
        this.meta,
        this.secret as gcp.secretmanager.RegionalSecret
      );
      manager.record(
        'gcp:secretmanager:RegionalSecretVersion',
        grouping,
        this.meta,
        this.version as gcp.secretmanager.RegionalSecretVersion
      );
    }
  }
}

export const CloudInfraSecretVersionComponent = CloudInfraSecretVersion;

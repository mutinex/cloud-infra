/**
 * CloudInfra Organization – Workload Identity Pools (WIP)
 * ----------------------------------------------------
 * This module provides two thin wrappers around Google Cloud IAM Workload
 * Identity Pools and Providers:
 *
 * • `CloudInfraWIP` – creates or imports a **Workload Identity Pool** inside the
 *   target project and registers it with `CloudInfraOutput`.
 * • `CloudInfraWIPProvider` – provisions an **OIDC provider** under an existing
 *   pool (or one just created by `CloudInfraWIP`) and exposes helper utilities
 *   such as `getPrincipalSet` for GitHub Actions.
 *
 * All naming, project-resolution and output grouping follow the conventions of
 * {@link CloudInfraMeta}. Pool/Provider IDs are derived from `meta.getName()` so
 * they stay consistent across stacks.
 *
 * @packageDocumentation
 */

import * as pulumi from '@pulumi/pulumi';
import * as gcp from '@pulumi/gcp';
import { z } from 'zod';

import { CloudInfraMeta } from '../../core/meta';
import { CloudInfraOutput } from '../../core/output';
import { withDefaults } from '../../core/helpers';
import { CloudInfraLogger } from '../../core/logging';
import { ValidationError } from '../../core/errors';
import { gcpConfig } from '../../config';
import {
  CloudInfraComponent,
  resolveMeta,
  type NamingArgs,
} from '../../core/component';

/** Pulumi type token for the Workload Identity Pool component. */
export const WIP_TYPE = 'cloud-infra:wip:CloudInfraWIP';

/** Pulumi type token for the Workload Identity Pool Provider component. */
export const WIP_PROVIDER_TYPE = 'cloud-infra:wip:CloudInfraWIPProvider';

export type CloudInfraWIPConfig = Omit<
  gcp.iam.WorkloadIdentityPoolArgs,
  'project' | 'workloadIdentityPoolId'
> & {
  project?: pulumi.Input<string>;
};

/**
 * Name-first construction args for `CloudInfraWIP` (v2 DX).
 *
 * Folds the naming metadata ({@link NamingArgs}: `domain` / `location` /
 * `prefix` / `naming`) together with the pool config
 * ({@link CloudInfraWIPConfig}) into a single args object. The naming fields are
 * resolved into a `CloudInfraMeta` internally (identical `generateName` output,
 * Frozen Contract F1); the remaining fields are passed straight through.
 */
export type CloudInfraWIPArgs = NamingArgs & CloudInfraWIPConfig;

export class CloudInfraWIP extends CloudInfraComponent {
  private readonly meta: CloudInfraMeta;
  private readonly pool: gcp.iam.WorkloadIdentityPool;
  private readonly inputName: string;

  /**
   * Name-first construction (v2 DX, preferred). Naming metadata
   * (`domain` / `location` / `prefix` / `naming`) and the pool config are folded
   * into a single args object; the name is resolved into a `CloudInfraMeta`
   * internally with byte-identical naming (Frozen Contract F1).
   */
  constructor(
    name: string,
    args?: CloudInfraWIPArgs,
    opts?: pulumi.ComponentResourceOptions
  );
  /**
   * @deprecated Meta-first construction. Prefer the name-first overload
   * `new CloudInfraWIP(name, args, opts)`. Retained for backward compatibility;
   * produces identical resources.
   */
  constructor(
    meta: CloudInfraMeta,
    cloudInfraConfig?: CloudInfraWIPConfig,
    opts?: pulumi.ComponentResourceOptions
  );
  constructor(
    nameOrMeta: string | CloudInfraMeta,
    argsOrConfig: CloudInfraWIPArgs | CloudInfraWIPConfig = {},
    opts?: pulumi.ComponentResourceOptions
  ) {
    // Normalize both overloads to a (meta, config) pair. For the name-first
    // path, split the naming metadata out of the args; everything else is the
    // pool config passed straight through.
    let meta: CloudInfraMeta;
    let cloudInfraConfig: CloudInfraWIPConfig;
    if (typeof nameOrMeta === 'string') {
      const { domain, location, prefix, naming, ...rest } =
        argsOrConfig as CloudInfraWIPArgs;
      meta = resolveMeta(nameOrMeta, { domain, location, prefix, naming });
      cloudInfraConfig = rest;
    } else {
      meta = nameOrMeta;
      cloudInfraConfig = argsOrConfig as CloudInfraWIPConfig;
    }

    const resourceNameForSuper = meta.getName();
    super(
      WIP_TYPE,
      resourceNameForSuper,
      resourceNameForSuper,
      { domain: meta.getDomain() },
      opts
    );

    CloudInfraLogger.info('Initializing WIP component', {
      component: 'wip',
      operation: 'constructor',
    });

    this.meta = meta;

    const candidateInputName = meta.getInputName();
    if (Array.isArray(candidateInputName)) {
      throw new ValidationError(
        'CloudInfraWIP expects `meta.name` to be a single string.',
        'wip',
        'constructor'
      );
    }
    this.inputName = candidateInputName;

    const overrides = cloudInfraConfig;

    const resourceName = meta.getName();

    const baseArgs: gcp.iam.WorkloadIdentityPoolArgs = {
      project: meta.getGcpProject(),
      workloadIdentityPoolId: resourceName,
      displayName: `${resourceName} Pool`,
    };

    const poolArgs = withDefaults(baseArgs, overrides);

    // v1: root-level (no parent) → childOpts() aliases back to root for
    // IN-PLACE migration. gcp.iam.WorkloadIdentityPool has NO labels → args are
    // NOT passed through withLabels.
    this.pool = new gcp.iam.WorkloadIdentityPool(
      resourceName,
      poolArgs,
      this.childOpts()
    );

    this.registerOutputs({
      pool: this.pool,
    });
  }

  public getPool(): gcp.iam.WorkloadIdentityPool {
    return this.pool;
  }

  public getId(): pulumi.Output<string> {
    return this.pool.id;
  }

  public getName(): pulumi.Output<string> {
    return this.pool.name;
  }

  public exportOutputs(manager: CloudInfraOutput): void {
    const grouping = this.inputName;
    manager.record(
      'gcp:iam:WorkloadIdentityPool',
      grouping,
      this.meta,
      this.pool
    );
  }
}

export const CloudInfraWIPComponent = CloudInfraWIP;

const CloudInfraWIPProviderExtrasSchema = z
  .object({
    // Either supply a CloudInfraWIP instance OR an explicit Workload Identity Pool ID
    pool: z.instanceof(CloudInfraWIP).optional(),
    workloadIdentityPoolId: z
      .union([
        z.string(),
        z.custom<pulumi.Output<string>>(val => pulumi.Output.isInstance(val)),
      ])
      .optional(),
  })
  .passthrough()
  .refine(data => data.pool || data.workloadIdentityPoolId, {
    message: "Either 'pool' or 'workloadIdentityPoolId' must be provided.",
  });

export type CloudInfraWIPProviderConfig = Omit<
  gcp.iam.WorkloadIdentityPoolProviderArgs,
  'project' | 'workloadIdentityPoolId' | 'workloadIdentityPoolProviderId'
> & {
  project?: pulumi.Input<string>;
  pool?: CloudInfraWIP;
  workloadIdentityPoolId?: pulumi.Input<string>;
};

/**
 * Name-first construction args for `CloudInfraWIPProvider` (v2 DX).
 *
 * Folds the naming metadata ({@link NamingArgs}: `domain` / `location` /
 * `prefix` / `naming`) together with the provider config
 * ({@link CloudInfraWIPProviderConfig}) into a single args object. The naming
 * fields are resolved into a `CloudInfraMeta` internally (identical
 * `generateName` output, Frozen Contract F1); the remaining fields (including
 * `pool` / `workloadIdentityPoolId`) are passed straight through.
 */
export type CloudInfraWIPProviderArgs = NamingArgs &
  CloudInfraWIPProviderConfig;

export class CloudInfraWIPProvider extends CloudInfraComponent {
  private readonly meta: CloudInfraMeta;
  private readonly provider: gcp.iam.WorkloadIdentityPoolProvider;
  private readonly poolName: pulumi.Output<string>;
  private readonly inputName: string;

  /**
   * Name-first construction (v2 DX, preferred). Naming metadata
   * (`domain` / `location` / `prefix` / `naming`) and the provider config are
   * folded into a single args object; the name is resolved into a
   * `CloudInfraMeta` internally with byte-identical naming (Frozen Contract F1).
   */
  constructor(
    name: string,
    args: CloudInfraWIPProviderArgs,
    opts?: pulumi.ComponentResourceOptions
  );
  /**
   * @deprecated Meta-first construction. Prefer the name-first overload
   * `new CloudInfraWIPProvider(name, args, opts)`. Retained for backward
   * compatibility; produces identical resources.
   */
  constructor(
    meta: CloudInfraMeta,
    cloudInfraConfig: CloudInfraWIPProviderConfig,
    opts?: pulumi.ComponentResourceOptions
  );
  constructor(
    nameOrMeta: string | CloudInfraMeta,
    argsOrConfig: CloudInfraWIPProviderArgs | CloudInfraWIPProviderConfig,
    opts?: pulumi.ComponentResourceOptions
  ) {
    // Normalize both overloads to a (meta, config) pair. For the name-first
    // path, split the naming metadata out of the args; everything else is the
    // provider config passed straight through.
    let meta: CloudInfraMeta;
    let cloudInfraConfig: CloudInfraWIPProviderConfig;
    if (typeof nameOrMeta === 'string') {
      const { domain, location, prefix, naming, ...rest } =
        argsOrConfig as CloudInfraWIPProviderArgs;
      meta = resolveMeta(nameOrMeta, { domain, location, prefix, naming });
      cloudInfraConfig = rest;
    } else {
      meta = nameOrMeta;
      cloudInfraConfig = argsOrConfig as CloudInfraWIPProviderConfig;
    }

    const resourceNameForSuper = meta.getName();
    super(
      WIP_PROVIDER_TYPE,
      resourceNameForSuper,
      resourceNameForSuper,
      { domain: meta.getDomain() },
      opts
    );

    CloudInfraLogger.info('Initializing WIP provider component', {
      component: 'wip-provider',
      operation: 'constructor',
    });

    this.meta = meta;

    const candidateInputName = meta.getInputName();
    if (Array.isArray(candidateInputName)) {
      throw new ValidationError(
        'CloudInfraWIPProvider expects `meta.name` to be a single string.',
        'wip-provider',
        'constructor'
      );
    }
    this.inputName = candidateInputName;

    const parsed = CloudInfraWIPProviderExtrasSchema.parse(cloudInfraConfig);

    const { pool, workloadIdentityPoolId, ...providerOverrides } = parsed;

    const resourceName = meta.getName();

    const rawPoolId: pulumi.Input<string> = pool
      ? pool.getPool().workloadIdentityPoolId
      : (workloadIdentityPoolId as pulumi.Input<string>);

    // If the caller passed the full resource name, extract the final segment.
    const resolvedPoolId: pulumi.Input<string> = pulumi
      .output(rawPoolId)
      .apply(poolId => {
        if (typeof poolId !== 'string') {
          return poolId;
        }
        return poolId.split('/').pop() as string;
      });

    const baseArgs: gcp.iam.WorkloadIdentityPoolProviderArgs = {
      project: meta.getGcpProject(),
      workloadIdentityPoolId: resolvedPoolId,
      workloadIdentityPoolProviderId: resourceName,
      displayName: resourceName,
      oidc: {
        issuerUri: 'https://token.actions.githubusercontent.com',
      },
      attributeMapping: {
        'google.subject': 'assertion.sub',
      },
    };

    const providerArgs = withDefaults(
      baseArgs,
      providerOverrides as Partial<gcp.iam.WorkloadIdentityPoolProviderArgs>
    );

    // v1: root-level (no parent) → childOpts() aliases back to root for
    // IN-PLACE migration. gcp.iam.WorkloadIdentityPoolProvider has NO labels →
    // args are NOT passed through withLabels.
    this.provider = new gcp.iam.WorkloadIdentityPoolProvider(
      resourceName,
      providerArgs,
      this.childOpts()
    );

    // Derive poolName from provider.name to ensure it contains the numeric project number.
    this.poolName = this.provider.name.apply(providerName =>
      providerName.replace(/\/providers\/.*$/, '')
    );

    this.registerOutputs({
      provider: this.provider,
    });
  }

  public getProvider(): gcp.iam.WorkloadIdentityPoolProvider {
    return this.provider;
  }

  public getId(): pulumi.Output<string> {
    return this.provider.id;
  }

  public getName(): pulumi.Output<string> {
    return this.provider.name;
  }

  /**
   * Build a principalSet string for GitHub Actions based on repo and optional env.
   */
  public getPrincipalSet(
    repo: pulumi.Input<string>,
    environment?: pulumi.Input<string>
  ): pulumi.Output<string> {
    const organizationName = gcpConfig.organizationName;
    const principal = pulumi
      .all([this.poolName, repo, environment])
      .apply(([poolName, repoName, environmentName]) => {
        if (environmentName) {
          return `principalSet://iam.googleapis.com/${poolName}/attribute.service/${organizationName}/${repoName}/${environmentName}`;
        }
        return `principalSet://iam.googleapis.com/${poolName}/attribute.repository/${organizationName}/${repoName}`;
      });

    // Provide a deterministic string identifier when inputs are plain strings.
    const repoIsStatic = typeof repo === 'string';
    const envIsStatic =
      environment === undefined || typeof environment === 'string';

    if (repoIsStatic && envIsStatic) {
      const hint = environment
        ? `${repo as string}-${environment as string}`
        : (repo as string);
      // Add metadata hint for debugging
      Object.assign(principal, { __identifierHint: hint });
    }

    return principal;
  }

  public exportOutputs(manager: CloudInfraOutput): void {
    const grouping = this.inputName;
    manager.record(
      'gcp:iam:WorkloadIdentityPoolProvider',
      grouping,
      this.meta,
      this.provider
    );
  }
}

export const CloudInfraWIPProviderComponent = CloudInfraWIPProvider;

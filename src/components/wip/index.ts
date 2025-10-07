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

export type CloudInfraWIPConfig = Omit<
  gcp.iam.WorkloadIdentityPoolArgs,
  'project' | 'workloadIdentityPoolId'
> & {
  project?: pulumi.Input<string>;
};

export class CloudInfraWIP {
  private readonly meta: CloudInfraMeta;
  private readonly pool: gcp.iam.WorkloadIdentityPool;
  private readonly inputName: string;

  constructor(
    meta: CloudInfraMeta,
    cloudInfraConfig: CloudInfraWIPConfig = {}
  ) {
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

    this.pool = new gcp.iam.WorkloadIdentityPool(resourceName, poolArgs);
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

export class CloudInfraWIPProvider {
  private readonly meta: CloudInfraMeta;
  private readonly provider: gcp.iam.WorkloadIdentityPoolProvider;
  private readonly poolName: pulumi.Output<string>;
  private readonly inputName: string;

  constructor(
    meta: CloudInfraMeta,
    cloudInfraConfig: CloudInfraWIPProviderConfig
  ) {
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

    this.provider = new gcp.iam.WorkloadIdentityPoolProvider(
      resourceName,
      providerArgs
    );

    // Derive poolName from provider.name to ensure it contains the numeric project number.
    this.poolName = this.provider.name.apply(providerName =>
      providerName.replace(/\/providers\/.*$/, '')
    );
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

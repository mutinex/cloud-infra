/**
 * **`@mutinex/cloud-infra/components/backendservice`** – GCP Backend Service helper.
 *
 * Provides the {@link CloudInfraBackendService} class which creates a global
 * `gcp.compute.BackendService` (domain `gl`) or a regional
 * `gcp.compute.RegionBackendService` (all other domains). Optionally spins up a
 * global HTTP health-check and attaches it to the service.
 *
 * The component follows `CloudInfraMeta` naming conventions and records outputs
 * via {@link CloudInfraOutput}. No additional resources are introduced unless a
 * health-check is requested.
 */
import * as pulumi from '@pulumi/pulumi';
import * as gcp from '@pulumi/gcp';
import { z } from 'zod';

import { CloudInfraMeta } from '../../core/meta';
import { CloudInfraOutput } from '../../core/output';
import { withDefaults, deriveRegion, omit } from '../../core/helpers';
import { CloudInfraLogger } from '../../core/logging';
import { ValidationError } from '../../core/errors';

const HealthCheckSchema = z
  .object({
    requestPath: z.string().default('/'),
    port: z.number().int().min(1).max(65535).optional(),
  })
  .passthrough();

/**
 * Additional CloudInfra-specific extras accepted by the backend-service component.
 * Currently only a strongly-typed `healthCheck` block is supported but the
 * schema is kept extensible for forward compatibility.
 */
export const CloudInfraBackendServiceExtrasSchema = z
  .object({
    healthCheck: HealthCheckSchema.optional(),
  })
  .passthrough();

export type CloudInfraBackendServiceExtras = z.infer<
  typeof CloudInfraBackendServiceExtrasSchema
>;

export type CloudInfraBackendServiceGlobalConfig = Omit<
  gcp.compute.BackendServiceArgs,
  'project' | 'name'
> & {
  project?: pulumi.Input<string>;
};

export type CloudInfraBackendServiceRegionalConfig = Omit<
  gcp.compute.RegionBackendServiceArgs,
  'project' | 'name' | 'region'
> & {
  project?: pulumi.Input<string>;
  region?: pulumi.Input<string>;
};

/**
 * High-level, user-facing configuration object accepted by the constructor.
 * Combines Pulumi args for both global and regional backend-services with the
 * CloudInfra-specific extras defined above.
 */
export type CloudInfraBackendServiceConfig =
  CloudInfraBackendServiceGlobalConfig &
    CloudInfraBackendServiceRegionalConfig &
    Partial<CloudInfraBackendServiceExtras>;

/**
 * Component that encapsulates a GCP Backend Service (global or regional). The
 * decision is made based on {@link CloudInfraMeta.getDomain} – domain `"gl"`
 * yields a global service, all others become regional.
 *
 * @example Global backend with health-check
 * ```ts
 * const meta = new CloudInfraMeta({ name: "api", domain: "gl" });
 * const svc  = new CloudInfraBackendService(meta, {
 *   backends: [{ group: neg.id }],
 *   healthCheck: { requestPath: "/health", port: 8080 },
 * });
 * ```
 *
 * @example Regional backend
 * ```ts
 * const meta = new CloudInfraMeta({ name: "web", domain: "au" });
 * const svc  = new CloudInfraBackendService(meta, {
 *   region: "australia-southeast1",
 *   backends: [{ group: neg.id }],
 * });
 * ```
 */
export class CloudInfraBackendService {
  private readonly meta: CloudInfraMeta;
  private readonly backendService:
    | gcp.compute.BackendService
    | gcp.compute.RegionBackendService;
  private readonly healthCheck?: gcp.compute.HealthCheck;
  private readonly isGlobal: boolean;
  /** Validated input name ensured to be a single string. */
  private readonly inputName: string;

  constructor(
    meta: CloudInfraMeta,
    cloudInfraConfig: CloudInfraBackendServiceConfig = {}
  ) {
    CloudInfraLogger.info('Initializing backend service component', {
      component: 'backend-service',
      operation: 'constructor',
    });

    this.meta = meta;

    const domain = meta.getDomain();
    this.isGlobal = domain === 'gl';

    const parsedExtras =
      CloudInfraBackendServiceExtrasSchema.parse(cloudInfraConfig);
    const { healthCheck: healthCheckConfig } = parsedExtras;

    const bsRawConfig = omit(
      cloudInfraConfig as Record<string, unknown>,
      ['healthCheck'] as const
    );

    const resourceName = meta.getName();

    // Ensure single-name usage; suggest bulk variant otherwise
    const candidateInputName = meta.getInputName();
    if (Array.isArray(candidateInputName)) {
      throw new ValidationError(
        'CloudInfraBackendService expects `meta.name` to be a single string. Use CloudInfraBulk... component when providing an array.',
        'backend-service',
        'constructor'
      );
    }
    this.inputName = candidateInputName;

    // Create health check if configured
    let createdHealthCheck: gcp.compute.HealthCheck | undefined;
    if (healthCheckConfig && Object.keys(healthCheckConfig).length > 0) {
      CloudInfraLogger.info('Creating health check for backend service', {
        component: 'backend-service',
        operation: 'constructor',
      });

      const {
        requestPath: requestPathInput,
        port: portInput,
        ...rest
      } = healthCheckConfig;
      const port = portInput ?? 80;
      const requestPath = requestPathInput ?? '/';

      const baseArgs: gcp.compute.HealthCheckArgs = {
        httpHealthCheck: { requestPath, port },
      };

      const hcArgs = withDefaults<gcp.compute.HealthCheckArgs>(
        baseArgs,
        rest as Partial<gcp.compute.HealthCheckArgs>
      );

      createdHealthCheck = new gcp.compute.HealthCheck(resourceName, hcArgs);

      const bsConfigTyped = bsRawConfig as Record<string, unknown>;
      if (!bsConfigTyped.healthChecks) {
        bsConfigTyped.healthChecks = [createdHealthCheck.id];
      }
    }

    // Create backend service directly inline
    if (this.isGlobal) {
      const bsArgs = withDefaults<gcp.compute.BackendServiceArgs>(
        {
          project: meta.getGcpProject(),
          protocol: 'HTTP',
          loadBalancingScheme: 'EXTERNAL_MANAGED',
        },
        bsRawConfig as Partial<gcp.compute.BackendServiceArgs>
      );

      this.backendService = new gcp.compute.BackendService(
        resourceName,
        bsArgs
      );
    } else {
      const bsArgs = withDefaults<gcp.compute.RegionBackendServiceArgs>(
        {
          project: meta.getGcpProject(),
          protocol: 'HTTP',
          loadBalancingScheme: 'EXTERNAL_MANAGED',
          region: deriveRegion(meta),
        },
        bsRawConfig as Partial<gcp.compute.RegionBackendServiceArgs>
      );

      this.backendService = new gcp.compute.RegionBackendService(
        resourceName,
        bsArgs
      );
    }

    this.healthCheck = createdHealthCheck;
  }

  /** Returns the underlying GCP Backend-Service resource. */
  public getBackendService():
    | gcp.compute.BackendService
    | gcp.compute.RegionBackendService {
    return this.backendService;
  }

  /** Fully-qualified resource ID (`projects/.../backendServices/<name>`). */
  public getId(): pulumi.Output<string> {
    return this.backendService.id.apply((id: string) => id);
  }

  /** Resource name (`<prefix>-<name>-<suffix>`) adhering to naming rules. */
  public getName(): pulumi.Output<string> {
    return this.backendService.name.apply((n: string) => n);
  }

  /**
   * Registers the backend-service (and optional health-check) with the given
   * {@link CloudInfraOutput} manager so they appear in `pulumi stack output` and
   * can be referenced by downstream stacks.
   */
  public exportOutputs(manager: CloudInfraOutput): void {
    const grouping = this.inputName;
    const outputResources = this.healthCheck
      ? [this.backendService.id, this.backendService.name, this.healthCheck.id]
      : [this.backendService.id, this.backendService.name];
    pulumi.all(outputResources).apply(() => {
      if (this.isGlobal) {
        manager.record(
          'gcp:compute:BackendService',
          grouping,
          this.meta,
          this.backendService as gcp.compute.BackendService
        );
      } else {
        manager.record(
          'gcp:compute:RegionBackendService',
          grouping,
          this.meta,
          this.backendService as gcp.compute.RegionBackendService
        );
      }
      if (this.healthCheck) {
        manager.record(
          'gcp:compute:HealthCheck',
          grouping,
          this.meta,
          this.healthCheck
        );
      }
    });
  }
}

export const CloudInfraBackendServiceComponent = CloudInfraBackendService;

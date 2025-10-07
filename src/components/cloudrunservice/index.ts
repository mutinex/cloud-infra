import * as pulumi from '@pulumi/pulumi';
import * as gcp from '@pulumi/gcp';

import { CloudInfraMeta } from '../../core/meta';
import { CloudInfraOutput } from '../../core/output';
import { deriveRegion } from '../../core/helpers';
import { CloudInfraLogger } from '../../core/logging';

/**
 * Configuration for CloudRun service component.
 * Omits project, name, and location (managed by meta).
 */
export type CloudInfraCloudRunServiceConfig = Omit<
  gcp.cloudrunv2.ServiceArgs,
  'project' | 'name' | 'location'
> & {
  location?: pulumi.Input<string>;
  project?: pulumi.Input<string>;
};

/**
 * **Cloud Run Service** component.
 *
 * Creates a `gcp.cloudrunv2.Service` and an accompanying regional
 * `gcp.compute.RegionNetworkEndpointGroup` that points at the service – handy
 * when the service needs to be attached to an external HTTP(S) Load Balancer.
 *
 * The region is resolved from {@link CloudInfraMeta}. If the caller specifies
 * `config.location` it takes precedence. Resource names follow standard
 * CloudInfra naming conventions.
 *
 * @example Regional service
 * ```ts
 * const meta = new CloudInfraMeta({ name: "api", domain: "au" });
 * const svc  = new CloudInfraCloudRunService(meta, {
 *   template: {
 *     containers: [{ image: "gcr.io/my-prj/api:latest" }],
 *   },
 * });
 * ```
 */
export class CloudInfraCloudRunService {
  private readonly meta: CloudInfraMeta;
  public readonly service: gcp.cloudrunv2.Service;
  public readonly networkEndpointGroup: gcp.compute.RegionNetworkEndpointGroup;

  constructor(meta: CloudInfraMeta, config: CloudInfraCloudRunServiceConfig) {
    CloudInfraLogger.info('Initializing Cloud Run service component', {
      component: 'cloudrunservice',
      operation: 'constructor',
    });

    this.meta = meta;
    const resourceName = meta.getName();

    // Build service args - location defaults to region from meta if not provided
    const serviceArgs: gcp.cloudrunv2.ServiceArgs = {
      ...config,
      name: resourceName,
      project: config.project ?? meta.getGcpProject(),
      location: config.location ?? deriveRegion(meta),
    };

    // Create the Cloud Run service
    this.service = new gcp.cloudrunv2.Service(resourceName, serviceArgs);

    // Create the Network Endpoint Group for load balancer integration
    this.networkEndpointGroup = new gcp.compute.RegionNetworkEndpointGroup(
      resourceName,
      {
        project: config.project ?? this.meta.getGcpProject(),
        region: serviceArgs.location,
        networkEndpointType: 'SERVERLESS',
        cloudRun: {
          service: this.service.name,
        },
      },
      { parent: this.service }
    );
  }

  /** Underlying Cloud Run service resource. */
  public getService(): gcp.cloudrunv2.Service {
    return this.service;
  }

  /** Resolved service name. */
  public getName(): pulumi.Output<string> {
    return this.service.name;
  }

  /** Fully qualified service URI (https). */
  public getUri(): pulumi.Output<string> {
    return this.service.uri;
  }

  /** Location (region) where the service is deployed. */
  public getLocation(): pulumi.Output<string> {
    return this.service.location;
  }

  /** Region alias – kept for symmetry. */
  public getRegion(): pulumi.Output<string> {
    return this.service.location;
  }

  /** Network Endpoint Group created for load-balancer integration. */
  public getNetworkEndpointGroup(): gcp.compute.RegionNetworkEndpointGroup {
    return this.networkEndpointGroup;
  }

  /** Export outputs via `CloudInfraOutput`. */
  public exportOutputs(manager: CloudInfraOutput): void {
    const inputName = this.meta.getInputName();
    const grouping = Array.isArray(inputName) ? inputName[0] : inputName;

    manager.record('gcp:cloudrunv2:Service', grouping, this.meta, this.service);
  }
}

export const CloudInfraCloudRunServiceComponent = CloudInfraCloudRunService;

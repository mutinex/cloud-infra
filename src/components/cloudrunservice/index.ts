import * as pulumi from '@pulumi/pulumi';
import * as gcp from '@pulumi/gcp';

import { CloudInfraMeta } from '../../core/meta';
import { CloudInfraOutput } from '../../core/output';
import { deriveRegion } from '../../core/helpers';
import { CloudInfraLogger } from '../../core/logging';
import { CloudInfraComponent } from '../../core/component';

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

/** Pulumi type token for the Cloud Run service component. */
export const CLOUD_RUN_SERVICE_TYPE =
  'cloud-infra:cloudrunservice:CloudRunService';

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
 * This component is now a {@link pulumi.ComponentResource} (via
 * {@link CloudInfraComponent}): the Service and the NEG are created as
 * *children* of the component so they appear under one logical node, and org
 * labels are stamped uniformly on BOTH children via the base `childOpts()`
 * transformation (closing the v1 bug where the NEG silently missed labels). The
 * children carry `aliases` so an existing v1 deployment migrates IN-PLACE (no
 * destroy/recreate) — the generated NAME is kept byte-identical (Frozen
 * Contract F1) and only the URN parent path changes.
 *
 * The public surface is UNCHANGED from v1: same `constructor(meta, config)`
 * signature and the same getters, so existing consumers compile and run
 * unmodified.
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
export class CloudInfraCloudRunService extends CloudInfraComponent {
  private readonly meta: CloudInfraMeta;
  public readonly service: gcp.cloudrunv2.Service;
  public readonly networkEndpointGroup: gcp.compute.RegionNetworkEndpointGroup;

  constructor(
    meta: CloudInfraMeta,
    config: CloudInfraCloudRunServiceConfig,
    opts?: pulumi.ComponentResourceOptions
  ) {
    const resourceName = meta.getName();

    // Register the component node. Children parent under `this` and inherit the
    // label-stamping transformation. `domain` drives the `domain` label only;
    // the generated NAME below is unchanged (F1).
    super(
      CLOUD_RUN_SERVICE_TYPE,
      resourceName,
      resourceName,
      { domain: meta.getDomain() },
      opts
    );

    CloudInfraLogger.info('Initializing Cloud Run service component', {
      component: 'cloudrunservice',
      operation: 'constructor',
    });

    this.meta = meta;

    // Build service args - location defaults to region from meta if not provided
    const serviceArgs: gcp.cloudrunv2.ServiceArgs = {
      ...config,
      name: resourceName,
      project: config.project ?? meta.getGcpProject(),
      location: config.location ?? deriveRegion(meta),
    };

    /*
     * ─────────────────────────────────────────────────────────────────────────
     *  ALIAS STRATEGY (non-destructive v1 → component migration)
     * ─────────────────────────────────────────────────────────────────────────
     *  v1 created these resources FLAT:
     *    - Service: NO parent (sits at the stack root).
     *    - NEG:     parent = the Service.
     *
     *  They now move UNDER this component, which prefixes their URNs with the
     *  component type token. To keep them the SAME resources (update-in-place,
     *  not destroy+recreate) we alias the Service back to its old root-level URN
     *  via `{ parent: pulumi.rootStackResource }` (the type-correct equivalent of
     *  `noParent` in this pinned Pulumi version).
     *
     *  The NEG keeps `parent: this.service`. We FIRST try it WITHOUT an explicit
     *  NEG alias to learn whether Pulumi reconstructs the NEG's old URN via
     *  parent-alias inheritance (a child's effective alias set combines its own
     *  aliases with its parent's). If a preview shows the NEG would REPLACE, an
     *  explicit URN/parent alias is added.
     * ─────────────────────────────────────────────────────────────────────────
     */

    // Create the Cloud Run service as a child (labels stamped via childOpts).
    this.service = new gcp.cloudrunv2.Service(
      resourceName,
      serviceArgs,
      this.childOpts({
        aliases: [{ parent: pulumi.rootStackResource }],
      })
    );

    // Create the Network Endpoint Group for load balancer integration, as a
    // child of THIS component but still parented to the Service (matches v1).
    // No explicit NEG alias yet — relying on parent-alias inheritance.
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
      this.childOpts({ parent: this.service })
    );

    this.registerOutputs({
      service: this.service,
      networkEndpointGroup: this.networkEndpointGroup,
    });
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

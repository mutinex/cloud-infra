import * as pulumi from '@pulumi/pulumi';
import * as gcp from '@pulumi/gcp';

import { CloudInfraMeta } from '../../core/meta';
import { CloudInfraOutput } from '../../core/output';
import { deriveRegion } from '../../core/helpers';
import { CloudInfraLogger } from '../../core/logging';
import {
  CloudInfraComponent,
  resolveMeta,
  type NamingArgs,
} from '../../core/component';

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
 * Name-first construction args for `CloudInfraCloudRunService` (v2 DX).
 *
 * Folds the naming metadata ({@link NamingArgs}: `domain` / `location` /
 * `prefix` / `naming`) together with the service config
 * ({@link CloudInfraCloudRunServiceConfig}) into a single args object, so a
 * service can be built as
 * `new CloudInfraCloudRunService("api", { domain: "au", template: {...} })`.
 *
 * The naming fields are resolved into a `CloudInfraMeta` internally (identical
 * `generateName` output, Frozen Contract F1); the remaining fields are passed
 * straight through as the service config — both the Service and its NEG derive
 * their names/opts from the meta + config exactly as the meta-first path.
 *
 * `location` is intentionally `Omit`ted from the config arm (mirroring the
 * bucket proof, which Omits `project`/`location`): on the name-first surface the
 * single {@link NamingArgs.location} drives BOTH the generated name AND the
 * Service deployment region (via `deriveRegion(meta)`), so there is no separate,
 * ambiguous `config.location`. Meta-first callers keep the legacy
 * `config.location` override on {@link CloudInfraCloudRunServiceConfig}.
 */
export type CloudInfraCloudRunServiceArgs = NamingArgs &
  Omit<CloudInfraCloudRunServiceConfig, 'location'>;

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
 * *children* of the component so they appear under one logical node. Org labels
 * are merged into the label-supporting Service's args via `withLabels()`; the
 * serverless NEG has no `labels` field so it is left unlabelled (no longer the
 * v1 silent-miss bug — labels are now an explicit per-child opt-in). The Service
 * uses `childOpts()` (root-alias) and the NEG `nestedChildOpts(service)`, so an
 * existing v1 deployment migrates IN-PLACE (no destroy/recreate) — the generated
 * NAME is kept byte-identical (Frozen
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

  /**
   * Name-first construction (v2 DX, preferred). Naming metadata
   * (`domain` / `location` / `prefix` / `naming`) and the service config are
   * folded into a single args object; the name is resolved into a
   * `CloudInfraMeta` internally with byte-identical naming (Frozen Contract F1).
   * The Service + NEG child names, parents, aliases, labels and opts are
   * derived exactly as the meta-first path.
   */
  constructor(
    name: string,
    args: CloudInfraCloudRunServiceArgs,
    opts?: pulumi.ComponentResourceOptions
  );
  /**
   * @deprecated Meta-first construction. Prefer the name-first overload
   * `new CloudInfraCloudRunService(name, args, opts)`. Retained for backward
   * compatibility; produces identical resources.
   */
  constructor(
    meta: CloudInfraMeta,
    config: CloudInfraCloudRunServiceConfig,
    opts?: pulumi.ComponentResourceOptions
  );
  constructor(
    nameOrMeta: string | CloudInfraMeta,
    argsOrConfig: CloudInfraCloudRunServiceArgs | CloudInfraCloudRunServiceConfig,
    opts?: pulumi.ComponentResourceOptions
  ) {
    // Normalize both overloads to a (meta, config) pair. For the name-first
    // path, split the naming metadata out of the args; everything else is the
    // service config passed straight through (consumed UNCHANGED below by both
    // the Service and the NEG).
    let meta: CloudInfraMeta;
    let config: CloudInfraCloudRunServiceConfig;
    if (typeof nameOrMeta === 'string') {
      const { domain, location, prefix, naming, ...rest } =
        argsOrConfig as CloudInfraCloudRunServiceArgs;
      meta = resolveMeta(nameOrMeta, { domain, location, prefix, naming });
      config = rest;
    } else {
      meta = nameOrMeta;
      config = argsOrConfig as CloudInfraCloudRunServiceConfig;
    }

    const resourceName = meta.getName();

    // Register the component node. Children parent under `this`; the
    // label-supporting Service gets the org labels merged into its args via
    // `withLabels()`. `domain` drives the `domain` label only; the generated
    // NAME below is unchanged (F1).
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
     *  not destroy+recreate) the Service uses `childOpts()`, which aliases it
     *  back to its old root-level URN (`{ parent: pulumi.rootStackResource }`,
     *  the type-correct equivalent of `noParent` in this pinned Pulumi version).
     *
     *  The NEG keeps `parent: this.service` via `nestedChildOpts(this.service)`
     *  with NO explicit alias — Pulumi reconstructs the NEG's old URN via
     *  parent-alias inheritance (a child's effective alias set combines its own
     *  aliases with its parent's). §9's real preview confirmed in-place.
     * ─────────────────────────────────────────────────────────────────────────
     */

    // Cloud Run Service supports `labels` → merge org labels into its args.
    // v1 created it FLAT (stack root), so childOpts() aliases it back to root.
    this.service = new gcp.cloudrunv2.Service(
      resourceName,
      this.withLabels(serviceArgs),
      this.childOpts()
    );

    // Serverless NEG has NO `labels` field → args pass through unchanged (no
    // withLabels). It was v1-PARENTED to the Service, so nestedChildOpts keeps
    // `parent: this.service` with NO explicit alias — parent-alias inheritance
    // reconstructs the old URN (proven in §9 real preview).
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
      this.nestedChildOpts(this.service)
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

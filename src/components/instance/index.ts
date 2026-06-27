import * as pulumi from '@pulumi/pulumi';
import * as gcp from '@pulumi/gcp';

import { CloudInfraMeta } from '../../core/meta';
import { CloudInfraOutput } from '../../core/output';
import { deriveRegion } from '../../core/helpers';
import { CloudInfraLogger } from '../../core/logging';
import { ValidationError } from '../../core/errors';
import { CloudInfraComponent } from '../../core/component';

/**
 * Configuration for Compute Instance component.
 * Omits project, name, and zone (managed by meta).
 */
export type CloudInfraComputeInstanceConfig = Omit<
  gcp.compute.InstanceArgs,
  'project' | 'name' | 'zone'
> & {
  zone?: pulumi.Input<string>;
  project?: pulumi.Input<string>;
};

/** Pulumi type token for the Compute Instance component. */
export const COMPUTE_INSTANCE_TYPE = 'cloud-infra:instance:ComputeInstance';

/**
 * **Compute Instance** component.
 *
 * Creates a `gcp.compute.Instance` with standardized naming and meta integration.
 * The zone is derived from the region resolved from {@link CloudInfraMeta}.
 * If the caller specifies `config.zone` it takes precedence.
 * Resource names follow standard CloudInfra naming conventions.
 *
 * @example Basic instance
 * ```ts
 * const meta = new CloudInfraMeta({ name: "web-server", domain: "au" });
 * const instance = new CloudInfraComputeInstance(meta, {
 *   machineType: "e2-micro",
 *   bootDisk: {
 *     initializeParams: {
 *       image: "debian-cloud/debian-11"
 *     }
 *   },
 *   networkInterfaces: [{
 *     network: "default"
 *   }]
 * });
 * ```
 */
export class CloudInfraComputeInstance extends CloudInfraComponent {
  private readonly meta: CloudInfraMeta;
  public readonly instance: gcp.compute.Instance;

  constructor(
    meta: CloudInfraMeta,
    config: CloudInfraComputeInstanceConfig,
    opts?: pulumi.ComponentResourceOptions
  ) {
    // Determine the zone to use - prefer explicit config.zone, then meta zone,
    // then default. This zonal-name logic (with the implicit `-a` zone default)
    // is preserved EXACTLY from v1 — it drives the generated NAME (F1), which
    // must stay byte-identical. Computed before `super()` because the resolved
    // name is the component's logical name and the child's name.
    let zone: pulumi.Input<string>;
    let resourceName: string;

    if (config.zone) {
      // Explicit zone provided in config
      zone = config.zone;
      resourceName =
        typeof config.zone === 'string'
          ? meta.getName(config.zone)
          : meta.getName();
    } else if (meta.isLocationZone()) {
      // Meta has a zone configured
      zone = meta.getZone();
      resourceName = meta.getName(zone);
    } else {
      // Fall back to region + default zone suffix
      const defaultZone = `${deriveRegion(meta)}-a`;
      zone = defaultZone;
      resourceName = meta.getName(defaultZone);
    }

    // Register the component node. The Instance child parents under `this` and
    // gets the org labels merged into its args via `withLabels()`.
    super(
      COMPUTE_INSTANCE_TYPE,
      resourceName,
      resourceName,
      { domain: meta.getDomain() },
      opts
    );

    CloudInfraLogger.info('Initializing Compute Instance component', {
      component: 'compute-instance',
      operation: 'constructor',
    });

    this.meta = meta;
    if (!config.machineType) {
      throw new ValidationError(
        'machineType is required for Compute Instance',
        'compute-instance',
        'constructor'
      );
    }

    if (!config.bootDisk) {
      throw new ValidationError(
        'bootDisk is required for Compute Instance',
        'compute-instance',
        'constructor'
      );
    }

    if (!config.networkInterfaces) {
      throw new ValidationError(
        'networkInterfaces is required for Compute Instance',
        'compute-instance',
        'constructor'
      );
    }

    const instanceArgs: gcp.compute.InstanceArgs = {
      ...config,
      name: resourceName,
      project: config.project ?? meta.getGcpProject(),
      zone,
    };

    // v1 created the Instance FLAT (stack root); childOpts() aliases it back to
    // its old root-level URN so it updates in place rather than being replaced.
    // gcp.compute.Instance supports `labels` → merge org labels into its args.
    this.instance = new gcp.compute.Instance(
      resourceName,
      this.withLabels(instanceArgs),
      this.childOpts()
    );

    this.registerOutputs({
      instance: this.instance,
    });
  }

  /** Underlying Compute Instance resource. */
  public getInstance(): gcp.compute.Instance {
    return this.instance;
  }

  /** Resolved instance name. */
  public getName(): pulumi.Output<string> {
    return this.instance.name;
  }

  /** Instance's internal IP address. */
  public getInternalIp(): pulumi.Output<string> {
    return this.instance.networkInterfaces.apply(
      interfaces => interfaces[0].networkIp
    );
  }

  /** Instance's external IP address (if any). */
  public getExternalIp(): pulumi.Output<string | undefined> {
    return this.instance.networkInterfaces.apply(
      interfaces => interfaces[0].accessConfigs?.[0]?.natIp
    );
  }

  /** Zone where the instance is deployed. */
  public getZone(): pulumi.Output<string> {
    return this.instance.zone;
  }

  /** Region where the instance is deployed. */
  public getRegion(): pulumi.Output<string> {
    return this.instance.zone.apply(zone =>
      zone.substring(0, zone.lastIndexOf('-'))
    );
  }

  /** Instance's machine type. */
  public getMachineType(): pulumi.Output<string> {
    return this.instance.machineType;
  }

  /** Instance's current status. */
  public getStatus(): pulumi.Output<string> {
    return this.instance.currentStatus;
  }

  /** Export outputs via `CloudInfraOutput`. */
  public exportOutputs(manager: CloudInfraOutput): void {
    const inputName = this.meta.getInputName();
    const grouping = Array.isArray(inputName) ? inputName[0] : inputName;

    manager.record('gcp:compute:Instance', grouping, this.meta, this.instance);
  }
}

export const CloudInfraComputeInstanceComponent = CloudInfraComputeInstance;

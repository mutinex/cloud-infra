import * as pulumi from '@pulumi/pulumi';
import * as gcp from '@pulumi/gcp';

import { CloudInfraMeta } from '../../core/meta';
import { CloudInfraOutput } from '../../core/output';
import { ValidationError } from '../../core/errors';
import { CloudInfraLogger } from '../../core/logging';

/**
 * @module
 * @description
 * This module provides a helper for creating a Google Cloud subnetwork
 * that adheres to CloudInfra naming conventions.
 */

/**
 * Creates a Google Cloud subnetwork with a name and region derived from
 * `CloudInfraMeta`.
 *
 * @example
 * ```typescript
 * const meta = new CloudInfraMeta({
 *   name: 'my-app',
 *   location: 'us-central1',
 * });
 *
 * const subnet = new CloudInfraSubnet(meta, {
 *   network: 'projects/my-project/global/networks/my-vpc',
 *   ipCidrRange: '10.0.0.0/24',
 * });
 * ```
 */
export class CloudInfraSubnet {
  private readonly meta: CloudInfraMeta;
  private readonly config: gcp.compute.SubnetworkArgs;
  private readonly subnet: gcp.compute.Subnetwork;
  private readonly inputName: string;
  private readonly resourceName: string;
  private readonly region: string;

  /**
   * Constructs a new `CloudInfraSubnet`.
   * @param meta The `CloudInfraMeta` instance to derive naming and region from.
   * @param config The configuration for the subnetwork, mirroring
   * `gcp.compute.SubnetworkArgs` but without the `region`.
   * @param opts Optional Pulumi resource options.
   */
  constructor(
    meta: CloudInfraMeta,
    config: gcp.compute.SubnetworkArgs,
    opts?: pulumi.ResourceOptions
  ) {
    CloudInfraLogger.info('Initializing subnet component', {
      component: 'network-subnet',
      operation: 'constructor',
    });

    this.meta = meta;
    this.config = config;
    this.region = meta.getRegion();

    const candidateInputName = meta.getInputName();
    if (Array.isArray(candidateInputName)) {
      throw new ValidationError(
        'CloudInfraSubnet expects `meta.name` to be a single string. Use a ' +
          'bulk helper to create multiple subnets.',
        'network-subnet',
        'constructor'
      );
    }
    this.inputName = candidateInputName;
    this.resourceName = meta.getName();

    this.subnet = this.createSubnet(this.config, opts);
  }

  private createSubnet(
    config: gcp.compute.SubnetworkArgs,
    opts?: pulumi.ResourceOptions
  ): gcp.compute.Subnetwork {
    const subnet = new gcp.compute.Subnetwork(
      this.resourceName,
      {
        region: this.region,
        ...config,
      },
      opts
    );

    return subnet;
  }

  /**
   * Returns the underlying `gcp.compute.Subnetwork` resource.
   * @returns The `gcp.compute.Subnetwork` resource.
   */
  public getSubnetwork(): gcp.compute.Subnetwork {
    return this.subnet;
  }

  /**
   * Returns the name of the subnetwork.
   * @returns A Pulumi `Output` with the name of the subnetwork.
   */
  public getName(): pulumi.Output<string> {
    return this.subnet.name;
  }

  /**
   * Returns the primary IP CIDR range of the subnetwork.
   * @returns A Pulumi `Output` with the IP CIDR range.
   */
  public getIpCidrRange(): pulumi.Output<string> {
    return this.subnet.ipCidrRange;
  }

  /**
   * Records the subnetwork in `CloudInfraOutput` for use in other stacks.
   * @param manager The `CloudInfraOutput` instance.
   */
  public exportOutputs(manager: CloudInfraOutput): void {
    const grouping = this.inputName;
    manager.record('gcp:compute:Subnetwork', grouping, this.meta, this.subnet);
  }
}

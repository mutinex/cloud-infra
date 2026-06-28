import * as pulumi from '@pulumi/pulumi';
import * as gcp from '@pulumi/gcp';

import { CloudInfraMeta } from '../../core/meta';
import { CloudInfraOutput } from '../../core/output';
import { ValidationError } from '../../core/errors';
import { CloudInfraLogger } from '../../core/logging';
import {
  CloudInfraComponent,
  splitMetaArgs,
  type NamingArgs,
} from '../../core/component';

/**
 * @module
 * @description
 * This module provides a helper for creating a Google Cloud subnetwork
 * that adheres to CloudInfra naming conventions.
 */

/** Pulumi type token for the Subnet component. */
export const SUBNET_TYPE = 'cloud-infra:network:CloudInfraSubnet';

/**
 * Name-first construction args for `CloudInfraSubnet` (v2 DX).
 *
 * Folds the naming metadata ({@link NamingArgs}: `domain` / `location` /
 * `prefix` / `naming`) together with the Pulumi subnetwork args
 * (`gcp.compute.SubnetworkArgs`) into a single args object. The naming fields
 * are resolved into a `CloudInfraMeta` internally (identical `generateName`
 * output, Frozen Contract F1); the remaining fields are passed straight through
 * as the subnetwork config exactly as the meta-first path.
 */
export type CloudInfraSubnetArgs = NamingArgs & gcp.compute.SubnetworkArgs;

/**
 * Creates a Google Cloud subnetwork with a name and region derived from
 * `CloudInfraMeta`.
 *
 * This component is now a {@link pulumi.ComponentResource} (via
 * {@link CloudInfraComponent}): the Subnetwork is created as a *child* of the
 * component so it appears under one logical node. The child carries an `alias`
 * back to its old root-level URN so an existing v1 deployment migrates
 * IN-PLACE (no destroy/recreate) — the generated NAME is kept byte-identical
 * (Frozen Contract F1) and only the URN parent path changes.
 *
 * NOTE: `gcp.compute.Subnetwork` has NO `labels` field, so the child's args are
 * NOT passed through `withLabels` (no labels injected); it uses `childOpts()`
 * for the parent + root-alias only.
 *
 * The public surface is UNCHANGED from v1: same `constructor(meta, config)`
 * signature and the same getters.
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
export class CloudInfraSubnet extends CloudInfraComponent {
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
  /**
   * Name-first construction (v2 DX, preferred). Naming metadata
   * (`domain` / `location` / `prefix` / `naming`) and the subnetwork config are
   * folded into a single args object; the name is resolved into a
   * `CloudInfraMeta` internally with byte-identical naming (Frozen Contract F1).
   * The Subnetwork child name, parent, alias and opts are derived exactly as the
   * meta-first path.
   */
  constructor(
    name: string,
    args: CloudInfraSubnetArgs,
    opts?: pulumi.ComponentResourceOptions
  );
  /**
   * @deprecated Meta-first construction. Prefer the name-first overload
   * `new CloudInfraSubnet(name, args, opts)`. Retained for backward
   * compatibility; produces identical resources.
   *
   * @param meta The `CloudInfraMeta` instance to derive naming and region from.
   * @param config The configuration for the subnetwork, mirroring
   * `gcp.compute.SubnetworkArgs` but without the `region`.
   * @param opts Optional Pulumi resource options.
   */
  constructor(
    meta: CloudInfraMeta,
    config: gcp.compute.SubnetworkArgs,
    opts?: pulumi.ComponentResourceOptions
  );
  constructor(
    nameOrMeta: string | CloudInfraMeta,
    argsOrConfig: CloudInfraSubnetArgs | gcp.compute.SubnetworkArgs,
    opts?: pulumi.ComponentResourceOptions
  ) {
    // Normalize both overloads to a (meta, config) pair. For the name-first
    // path, split the naming metadata out of the args; everything else is the
    // subnetwork config passed straight through (consumed UNCHANGED below by the
    // Subnetwork).
    const { meta, config } = splitMetaArgs<gcp.compute.SubnetworkArgs>(
      nameOrMeta,
      argsOrConfig
    );

    const resourceName = meta.getName();

    super(
      SUBNET_TYPE,
      resourceName,
      resourceName,
      { domain: meta.getDomain() },
      opts
    );

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
    this.resourceName = resourceName;

    this.subnet = this.createSubnet(this.config);

    this.registerOutputs({
      subnet: this.subnet,
    });
  }

  private createSubnet(
    config: gcp.compute.SubnetworkArgs
  ): gcp.compute.Subnetwork {
    /*
     * v1 created the Subnetwork at the stack root (it was passed the caller's
     * `opts`, which carried no explicit parent). It now moves UNDER this
     * component, so we alias it back to its old root-level URN via
     * `{ parent: pulumi.rootStackResource }` to keep it the SAME resource.
     *
     * `gcp.compute.Subnetwork` has NO `labels` field — childOpts() parents +
     * root-aliases, and args are NOT passed through withLabels.
     */
    const subnet = new gcp.compute.Subnetwork(
      this.resourceName,
      {
        region: this.region,
        ...config,
      },
      this.childOpts()
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

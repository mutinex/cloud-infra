/**
 * @module
 * @description
 * This module provides a helper for creating a Google Cloud NAT gateway,
 * which includes a Cloud Router and a Cloud NAT instance, that adheres to
 * CloudInfra naming conventions.
 */

import * as pulumi from '@pulumi/pulumi';
import * as gcp from '@pulumi/gcp';
import { z } from 'zod';

import { CloudInfraMeta } from '../../core/meta';
import { CloudInfraOutput } from '../../core/output';
import { assertSingleRegion } from '../../core/helpers';
import { PulumiInputStringSchema } from '../../core/types';
import { ValidationError } from '../../core/errors';
import { CloudInfraLogger } from '../../core/logging';

export const CloudInfraNatConfigSchema = z
  .object({
    sourceSubnetworkIpRangesToNat: z
      .string()
      .default('ALL_SUBNETWORKS_ALL_IP_RANGES'),
    natIpAllocateOption: z.string().default('AUTO_ONLY'),
    router: z
      .object({
        network: PulumiInputStringSchema,
      })
      .passthrough(),
  })
  .passthrough();

export interface CloudInfraNatConfig
  extends Omit<gcp.compute.RouterNatArgs, 'router'> {
  router: gcp.compute.RouterArgs;
}

/**
 * Creates a Google Cloud NAT gateway, which includes a Cloud Router and a
 * Cloud NAT instance, with a name and region derived from `CloudInfraMeta`.
 *
 * @example
 * ```typescript
 * const meta = new CloudInfraMeta({
 *   name: 'my-app',
 *   location: 'us-central1',
 * });
 *
 * const nat = new CloudInfraNat(meta, {
 *   router: {
 *     network: 'projects/my-project/global/networks/my-vpc',
 *   },
 * });
 * ```
 */
export class CloudInfraNat {
  private readonly meta: CloudInfraMeta;
  private readonly config: CloudInfraNatConfig;
  private readonly inputName: string;
  private readonly region: string;
  private readonly resourceName: string;
  private readonly router: gcp.compute.Router;
  private readonly routerNat: gcp.compute.RouterNat;
  private readonly defaultRoute: gcp.compute.Route;

  /**
   * Constructs a new `CloudInfraNat` gateway.
   * @param meta The `CloudInfraMeta` instance to derive naming and region from.
   * @param cloudInfraConfig The configuration for the NAT gateway.
   */
  constructor(meta: CloudInfraMeta, cloudInfraConfig: CloudInfraNatConfig) {
    CloudInfraLogger.info('Initializing NAT gateway component', {
      component: 'network-nat',
      operation: 'constructor',
    });

    this.meta = meta;
    this.region = assertSingleRegion(meta, 'CloudInfraNat');

    const candidate = meta.getInputName();
    if (Array.isArray(candidate)) {
      throw new ValidationError(
        'CloudInfraNat expects `meta.name` to be a single string. NAT does not support bulk operations.',
        'network-nat',
        'constructor'
      );
    }
    this.inputName = candidate;

    this.config = CloudInfraNatConfigSchema.parse(
      cloudInfraConfig
    ) as CloudInfraNatConfig;

    this.resourceName = meta.getName();

    this.router = this.createRouter(this.config);

    this.routerNat = this.createRouterNat(this.config, this.router);

    this.defaultRoute = this.createDefaultRoute(this.config);
  }

  private createRouter(config: CloudInfraNatConfig): gcp.compute.Router {
    const router = new gcp.compute.Router(this.resourceName, {
      region: this.region,
      ...config.router,
    });
    return router;
  }

  private createRouterNat(
    config: CloudInfraNatConfig,
    router: gcp.compute.Router
  ): gcp.compute.RouterNat {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { router: _, ...routerNatConfig } = config;

    const routerNat = new gcp.compute.RouterNat(this.resourceName, {
      region: this.region,
      router: router.name,
      ...routerNatConfig,
    });
    return routerNat;
  }

  private createDefaultRoute(config: CloudInfraNatConfig): gcp.compute.Route {
    const routeConfig: gcp.compute.RouteArgs = {
      project: config.router.project,
      destRange: '0.0.0.0/0',
      network: config.router.network,
      nextHopGateway: 'default-internet-gateway',
      priority: 1000,
    };

    const defaultRoute = new gcp.compute.Route(this.resourceName, routeConfig);
    return defaultRoute;
  }

  /**
   * Returns the underlying `gcp.compute.Router` resource.
   * @returns The `gcp.compute.Router` resource.
   */
  public getRouter(): gcp.compute.Router {
    return this.router;
  }

  /**
   * Returns the underlying `gcp.compute.RouterNat` resource.
   * @returns The `gcp.compute.RouterNat` resource.
   */
  public getRouterNat(): gcp.compute.RouterNat {
    return this.routerNat;
  }

  /**
   * Returns the name of the NAT gateway.
   * @returns A Pulumi `Output` with the name of the NAT gateway.
   */
  public getName(): pulumi.Output<string> {
    return this.routerNat.name;
  }

  /**
   * Returns the region of the NAT gateway.
   * @returns A Pulumi `Output` with the region of the NAT gateway.
   */
  public getRegion(): pulumi.Output<string> {
    return this.routerNat.region;
  }

  /**
   * Returns the name of the router associated with the NAT gateway.
   * @returns A Pulumi `Output` with the name of the router.
   */
  public getRouterName(): pulumi.Output<string> {
    return this.routerNat.router;
  }

  /**
   * Records the NAT gateway resources in `CloudInfraOutput` for use in other
   * stacks.
   * @param manager The `CloudInfraOutput` instance.
   */
  public exportOutputs(manager: CloudInfraOutput): void {
    manager.record(
      'gcp:compute:Router',
      this.inputName,
      this.meta,
      this.router
    );

    manager.record(
      'gcp:compute:RouterNat',
      this.inputName,
      this.meta,
      this.routerNat
    );

    manager.record(
      'gcp:compute:Route',
      this.inputName,
      this.meta,
      this.defaultRoute
    );
  }
}

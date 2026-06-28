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
import {
  CloudInfraComponent,
  splitMetaArgs,
  type NamingArgs,
  type ComponentConfig,
} from '../../core/component';

/** Pulumi type token for the NAT component. */
export const NAT_TYPE = 'cloud-infra:network:CloudInfraNat';

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
  extends ComponentConfig<Omit<gcp.compute.RouterNatArgs, 'router'>> {
  // The nested `router` is intentionally left as the RAW `gcp.compute.RouterArgs`
  // (NOT wrapped in ComponentConfig): `createRouter` derives the router's name
  // from `resourceName` and overwrites `region` from meta, so a caller-supplied
  // `router.name`/`router.region`/`router.project` is ignored. Tightening that
  // nested arm is a deliberate follow-up; the top-level surface is what this
  // task tightened.
  router: gcp.compute.RouterArgs;
}

/**
 * Name-first construction args for `CloudInfraNat` (v2 DX).
 *
 * Folds the naming metadata ({@link NamingArgs}: `domain` / `location` /
 * `prefix` / `naming`) together with the NAT config ({@link CloudInfraNatConfig})
 * into a single args object. The naming fields are resolved into a
 * `CloudInfraMeta` internally (identical `generateName` output, Frozen Contract
 * F1); the remaining fields are passed straight through as the config — the
 * Router, RouterNat and Route all derive their names/opts from the meta + config
 * exactly as the meta-first path.
 */
export type CloudInfraNatArgs = NamingArgs & CloudInfraNatConfig;

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
export class CloudInfraNat extends CloudInfraComponent {
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
   *
   * This component is now a {@link pulumi.ComponentResource} (via
   * {@link CloudInfraComponent}): the Router, RouterNat and Route are created
   * as *children* of the component. All three v1 resources sat at the stack
   * root (no explicit parent), so each carries an `alias` back to its old
   * root-level URN (`{ parent: pulumi.rootStackResource }`) for IN-PLACE
   * migration — generated NAMEs unchanged (F1).
   *
   * NOTE on labels: none of `gcp.compute.Router`, `gcp.compute.RouterNat`, or
   * `gcp.compute.Route` supports a `labels` field, so none of the children pass
   * their args through `withLabels` (no labels injected); each uses
   * `childOpts()` for the parent + root-alias only.
   *
   * @param meta The `CloudInfraMeta` instance to derive naming and region from.
   * @param cloudInfraConfig The configuration for the NAT gateway.
   * @param opts Optional Pulumi component resource options.
   */
  /**
   * Name-first construction (v2 DX, preferred). Naming metadata
   * (`domain` / `location` / `prefix` / `naming`) and the NAT config are folded
   * into a single args object; the name is resolved into a `CloudInfraMeta`
   * internally with byte-identical naming (Frozen Contract F1). The Router,
   * RouterNat and Route child names, parents, aliases and opts are derived
   * exactly as the meta-first path.
   */
  constructor(
    name: string,
    args: CloudInfraNatArgs,
    opts?: pulumi.ComponentResourceOptions
  );
  /**
   * @deprecated Meta-first construction. Prefer the name-first overload
   * `new CloudInfraNat(name, args, opts)`. Retained for backward compatibility;
   * produces identical resources.
   *
   * @param meta The `CloudInfraMeta` instance to derive naming and region from.
   * @param cloudInfraConfig The configuration for the NAT gateway.
   * @param opts Optional Pulumi component resource options.
   */
  constructor(
    meta: CloudInfraMeta,
    cloudInfraConfig: CloudInfraNatConfig,
    opts?: pulumi.ComponentResourceOptions
  );
  constructor(
    nameOrMeta: string | CloudInfraMeta,
    argsOrConfig: CloudInfraNatArgs | CloudInfraNatConfig,
    opts?: pulumi.ComponentResourceOptions
  ) {
    // Normalize both overloads to a (meta, config) pair. For the name-first
    // path, split the naming metadata out of the args; everything else is the
    // NAT config passed straight through (parsed + consumed UNCHANGED below by
    // the Router, RouterNat and Route).
    const { meta, config: cloudInfraConfig } = splitMetaArgs<CloudInfraNatConfig>(
      nameOrMeta,
      argsOrConfig
    );

    const resourceName = meta.getName();

    super(
      NAT_TYPE,
      resourceName,
      resourceName,
      { domain: meta.getDomain() },
      opts
    );

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

    this.resourceName = resourceName;

    this.router = this.createRouter(this.config);

    this.routerNat = this.createRouterNat(this.config, this.router);

    this.defaultRoute = this.createDefaultRoute(this.config);

    this.registerOutputs({
      router: this.router,
      routerNat: this.routerNat,
      defaultRoute: this.defaultRoute,
    });
  }

  private createRouter(config: CloudInfraNatConfig): gcp.compute.Router {
    // v1: root-level → childOpts() aliases back to root. Router has NO labels
    // → args are NOT passed through withLabels.
    const router = new gcp.compute.Router(
      this.resourceName,
      {
        region: this.region,
        ...config.router,
      },
      this.childOpts()
    );
    return router;
  }

  private createRouterNat(
    config: CloudInfraNatConfig,
    router: gcp.compute.Router
  ): gcp.compute.RouterNat {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { router: _, ...routerNatConfig } = config;

    // v1: root-level → childOpts() aliases back to root. RouterNat has NO
    // labels → args are NOT passed through withLabels.
    const routerNat = new gcp.compute.RouterNat(
      this.resourceName,
      {
        region: this.region,
        router: router.name,
        ...routerNatConfig,
      },
      this.childOpts()
    );
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

    // v1: root-level → childOpts() aliases back to root. Route has NO labels →
    // args are NOT passed through withLabels.
    const defaultRoute = new gcp.compute.Route(
      this.resourceName,
      routeConfig,
      this.childOpts()
    );
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

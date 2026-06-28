/**
 * @module
 * @description
 * This module provides a helper for creating a Google Cloud Private Service
 * Access (PSA) connection that adheres to CloudInfra naming conventions.
 */

import * as pulumi from '@pulumi/pulumi';
import * as gcp from '@pulumi/gcp';
import { z } from 'zod';

import { CloudInfraMeta } from '../../core/meta';
import { CloudInfraOutput } from '../../core/output';
import { PulumiInputStringSchema } from '../../core/types';
import { ValidationError } from '../../core/errors';
import { CloudInfraLogger } from '../../core/logging';
import {
  CloudInfraComponent,
  splitMetaArgs,
  type NamingArgs,
} from '../../core/component';

/** Pulumi type token for the PSA component. */
export const PSA_TYPE = 'cloud-infra:network:CloudInfraPSA';

export const CloudInfraPSAConfigSchema = z
  .object({
    network: PulumiInputStringSchema.optional(),
    reservedPeeringRanges: z
      .array(
        z.object({
          purpose: z.string(),
          addressType: z.string(),
          prefixLength: z.number(),
          network: PulumiInputStringSchema,
          address: z.string(),
          project: PulumiInputStringSchema.optional(),
        })
      )
      .optional(),
    service: z.string().default('servicenetworking.googleapis.com'),
  })
  .passthrough();

export interface CloudInfraPSAConfig
  extends Omit<gcp.servicenetworking.ConnectionArgs, 'reservedPeeringRanges'> {
  reservedPeeringRanges: gcp.compute.GlobalAddressArgs[];
}

export interface CloudInfraPSAInputConfig
  extends Omit<
    gcp.servicenetworking.ConnectionArgs,
    'reservedPeeringRanges' | 'service'
  > {
  reservedPeeringRanges: gcp.compute.GlobalAddressArgs[];
  service?: string;
}

/**
 * Name-first construction args for `CloudInfraPSA` (v2 DX).
 *
 * Folds the naming metadata ({@link NamingArgs}: `domain` / `location` /
 * `prefix` / `naming`) together with the PSA config
 * ({@link CloudInfraPSAInputConfig}) into a single args object. The naming
 * fields are resolved into a `CloudInfraMeta` internally (identical
 * `generateName` output, Frozen Contract F1); the remaining fields are passed
 * straight through as the config — the GlobalAddress, Connection and optional
 * Provider all derive their names/opts (incl. `dependsOn`/`provider` wiring)
 * from the meta + config exactly as the meta-first path.
 */
export type CloudInfraPSAArgs = NamingArgs & CloudInfraPSAInputConfig;

/**
 * Creates a Google Cloud Private Service Access (PSA) connection with a name
 * derived from `CloudInfraMeta`.
 *
 * This component simplifies the process of creating a global IP address range
 * and peering it with a Google service, such as Cloud SQL.
 *
 * @example
 * ```typescript
 * const meta = new CloudInfraMeta({
 *   name: 'my-app',
 *   location: 'global',
 * });
 *
 * const psa = new CloudInfraPSA(meta, {
 *   network: 'projects/my-project/global/networks/my-vpc',
 *   reservedPeeringRanges: [{
 *     purpose: 'VPC_PEERING',
 *     addressType: 'INTERNAL',
 *     prefixLength: 24,
 *     network: 'projects/my-project/global/networks/my-vpc',
 *   }],
 * });
 * ```
 */
export class CloudInfraPSA extends CloudInfraComponent {
  private readonly meta: CloudInfraMeta;
  private readonly config: CloudInfraPSAConfig;
  private readonly resourceName: string;
  private readonly inputName: string;
  private readonly range: gcp.compute.GlobalAddress;
  private readonly connection: gcp.servicenetworking.Connection;

  /**
   * Constructs a new `CloudInfraPSA` connection.
   *
   * This component is now a {@link pulumi.ComponentResource} (via
   * {@link CloudInfraComponent}): the GlobalAddress and Connection are created
   * as *children* of the component. Both v1 resources sat at the stack root, so
   * each child uses `childOpts()`, which aliases it back to its old root-level
   * URN for IN-PLACE migration — generated NAMEs unchanged (F1).
   *
   * NOTE on labels: the PSA peering-range `gcp.compute.GlobalAddress` was
   * created UNLABELLED in v1, and `gcp.servicenetworking.Connection` /
   * `gcp.Provider` have no `labels` field — so NONE of these children pass
   * their args through `withLabels` (no labels are injected).
   *
   * @param meta The `CloudInfraMeta` instance to derive naming from.
   * @param config The configuration for the PSA connection.
   * @param opts Optional Pulumi component resource options.
   */
  /**
   * Name-first construction (v2 DX, preferred). Naming metadata
   * (`domain` / `location` / `prefix` / `naming`) and the PSA config are folded
   * into a single args object; the name is resolved into a `CloudInfraMeta`
   * internally with byte-identical naming (Frozen Contract F1). The
   * GlobalAddress, Connection and optional Provider child names, parents,
   * aliases and opts are derived exactly as the meta-first path.
   */
  constructor(
    name: string,
    args: CloudInfraPSAArgs,
    opts?: pulumi.ComponentResourceOptions
  );
  /**
   * @deprecated Meta-first construction. Prefer the name-first overload
   * `new CloudInfraPSA(name, args, opts)`. Retained for backward compatibility;
   * produces identical resources.
   *
   * @param meta The `CloudInfraMeta` instance to derive naming from.
   * @param config The configuration for the PSA connection.
   * @param opts Optional Pulumi component resource options.
   */
  constructor(
    meta: CloudInfraMeta,
    config: CloudInfraPSAInputConfig,
    opts?: pulumi.ComponentResourceOptions
  );
  constructor(
    nameOrMeta: string | CloudInfraMeta,
    argsOrConfig: CloudInfraPSAArgs | CloudInfraPSAInputConfig,
    opts?: pulumi.ComponentResourceOptions
  ) {
    // Normalize both overloads to a (meta, config) pair. For the name-first
    // path, split the naming metadata out of the args; everything else is the
    // PSA config passed straight through (parsed + consumed UNCHANGED below by
    // the GlobalAddress, Connection and optional Provider).
    const { meta, config } = splitMetaArgs<CloudInfraPSAInputConfig>(
      nameOrMeta,
      argsOrConfig
    );

    const resourceName = meta.getName();

    super(
      PSA_TYPE,
      resourceName,
      resourceName,
      { domain: meta.getDomain() },
      opts
    );

    CloudInfraLogger.info('Initializing Private Service Access component', {
      component: 'network-psa',
      operation: 'constructor',
    });

    this.meta = meta;

    const candidateInputName = meta.getInputName();
    if (Array.isArray(candidateInputName)) {
      throw new ValidationError(
        'CloudInfraPSA expects `meta.name` to be a single string.',
        'network-psa',
        'constructor'
      );
    }
    this.inputName = candidateInputName;

    this.config = CloudInfraPSAConfigSchema.parse(
      config
    ) as CloudInfraPSAConfig;

    this.resourceName = resourceName;

    this.range = this.createGlobalAddress(this.config);

    this.connection = this.createConnection(this.config, this.range);

    this.registerOutputs({
      range: this.range,
      connection: this.connection,
    });
  }

  private createGlobalAddress(
    config: CloudInfraPSAConfig
  ): gcp.compute.GlobalAddress {
    // v1: root-level → childOpts() aliases back to root. NOTE: the GlobalAddress
    // TYPE supports `labels` (§9b), but the PSA peering range was created
    // UNLABELLED in v1 (it used plain opts, never went through the v1 label
    // transformation). To preserve labels-diff parity we keep it label-less
    // here (args NOT passed through withLabels). See report flag.
    const range = new gcp.compute.GlobalAddress(
      this.resourceName,
      {
        ...config.reservedPeeringRanges[0],
      },
      this.childOpts()
    );
    return range;
  }

  private createConnection(
    config: CloudInfraPSAConfig,
    range: gcp.compute.GlobalAddress
  ) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { reservedPeeringRanges, ...connectionConfig } = config;
    const projectFromRange = config.reservedPeeringRanges?.[0]?.project;

    // v1: root-level → childOpts() aliases back to root. Preserve dependsOn +
    // provider wiring exactly. Connection has NO labels → args are NOT passed
    // through withLabels.
    const resourceOptions: pulumi.CustomResourceOptions = this.childOpts({
      dependsOn: [range],
    });

    if (projectFromRange) {
      // Provider sat at the stack root in v1 (no explicit parent). childOpts()
      // gives it a root-alias to keep its URN identity. gcp.Provider has NO
      // labels → args are NOT passed through withLabels.
      const provider = new gcp.Provider(
        `${this.resourceName}-provider`,
        {
          project: projectFromRange,
        },
        this.childOpts()
      );
      resourceOptions.provider = provider;
    }

    const connection = new gcp.servicenetworking.Connection(
      this.resourceName,
      {
        reservedPeeringRanges: [range.name],
        ...connectionConfig,
      },
      resourceOptions
    );
    return connection;
  }

  /**
   * Returns the underlying `gcp.compute.GlobalAddress` resource for the
   * peering range.
   * @returns The `gcp.compute.GlobalAddress` resource.
   */
  public getGlobalAddress(): gcp.compute.GlobalAddress {
    return this.range;
  }

  /**
   * Returns the underlying `gcp.servicenetworking.Connection` resource.
   * @returns The `gcp.servicenetworking.Connection` resource.
   */
  public getConnection(): gcp.servicenetworking.Connection {
    return this.connection;
  }

  /**
   * Returns the ID of the service networking connection.
   * @returns A Pulumi `Output` with the ID of the connection.
   */
  public getId(): pulumi.Output<string> {
    return this.connection.id;
  }

  /**
   * Records the service networking connection in `CloudInfraOutput` for use in
   * other stacks.
   * @param manager The `CloudInfraOutput` instance.
   */
  public exportOutputs(manager: CloudInfraOutput): void {
    const grouping = this.inputName;
    manager.record(
      'gcp:servicenetworking:Connection',
      grouping,
      this.meta,
      this.connection
    );
  }
}

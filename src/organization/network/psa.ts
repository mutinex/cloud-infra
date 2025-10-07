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
export class CloudInfraPSA {
  private readonly meta: CloudInfraMeta;
  private readonly config: CloudInfraPSAConfig;
  private readonly resourceName: string;
  private readonly inputName: string;
  private readonly range: gcp.compute.GlobalAddress;
  private readonly connection: gcp.servicenetworking.Connection;

  /**
   * Constructs a new `CloudInfraPSA` connection.
   * @param meta The `CloudInfraMeta` instance to derive naming from.
   * @param config The configuration for the PSA connection.
   */
  constructor(meta: CloudInfraMeta, config: CloudInfraPSAInputConfig) {
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

    this.resourceName = meta.getName();

    this.range = this.createGlobalAddress(this.config);

    this.connection = this.createConnection(this.config, this.range);
  }

  private createGlobalAddress(
    config: CloudInfraPSAConfig
  ): gcp.compute.GlobalAddress {
    const range = new gcp.compute.GlobalAddress(this.resourceName, {
      ...config.reservedPeeringRanges[0],
    });
    return range;
  }

  private createConnection(
    config: CloudInfraPSAConfig,
    range: gcp.compute.GlobalAddress
  ) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { reservedPeeringRanges, ...connectionConfig } = config;
    const projectFromRange = config.reservedPeeringRanges?.[0]?.project;

    const resourceOptions: pulumi.ResourceOptions = {
      dependsOn: [range],
    };

    if (projectFromRange) {
      const provider = new gcp.Provider(`${this.resourceName}-provider`, {
        project: projectFromRange,
      });
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

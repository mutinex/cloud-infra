/**
 * @module
 * @description
 * This module provides a helper for creating a Google Cloud VPC Access
 * Connector that adheres to CloudInfra naming conventions.
 */

import * as pulumi from '@pulumi/pulumi';
import * as gcp from '@pulumi/gcp';
import { z } from 'zod';
import { CloudInfraMeta } from '../../core/meta';
import { CloudInfraOutput } from '../../core/output';
import { assertSingleRegion } from '../../core/helpers';
import { ValidationError } from '../../core/errors';
import { CloudInfraLogger } from '../../core/logging';

export const CloudInfraConnectorConfigSchema = z
  .object({
    machineType: z.string().default('e2-micro'),
    minInstances: z.number().default(2),
    maxInstances: z.number().default(3),
  })
  .passthrough();

/**
 * Creates a Google Cloud VPC Access Connector with a name and region derived
 * from `CloudInfraMeta`.
 *
 * @example
 * ```typescript
 * const meta = new CloudInfraMeta({
 *   name: 'my-app',
 *   location: 'us-central1',
 * });
 *
 * const connector = new CloudInfraConnector(meta, {
 *   subnet: {
 *     name: 'my-subnet',
 *     projectId: 'my-project',
 *   },
 * });
 * ```
 */
export class CloudInfraConnector {
  private readonly meta: CloudInfraMeta;
  private readonly config: gcp.vpcaccess.ConnectorArgs;
  private readonly connector: gcp.vpcaccess.Connector;
  private readonly inputName: string;
  private readonly resourceName: string;
  private readonly region: string;

  /**
   * Constructs a new `CloudInfraConnector`.
   * @param meta The `CloudInfraMeta` instance to derive naming and region from.
   * @param config The configuration for the connector, extending
   * `gcp.vpcaccess.ConnectorArgs`.
   * @param opts Optional Pulumi resource options.
   */
  constructor(
    meta: CloudInfraMeta,
    config: gcp.vpcaccess.ConnectorArgs,
    opts?: pulumi.CustomResourceOptions
  ) {
    CloudInfraLogger.info('Initializing VPC Access Connector component', {
      component: 'network-connector',
      operation: 'constructor',
    });

    this.meta = meta;
    this.region = assertSingleRegion(meta, 'CloudInfraConnector');

    this.config = CloudInfraConnectorConfigSchema.parse(
      config
    ) as gcp.vpcaccess.ConnectorArgs;

    const candidateInputName = meta.getInputName();
    if (Array.isArray(candidateInputName)) {
      throw new ValidationError(
        'CloudInfraConnector expects `meta.name` to be a single string. Use ' +
          'multiple connector instances for array inputs.',
        'network-connector',
        'constructor'
      );
    }
    this.inputName = candidateInputName;

    this.resourceName = meta.getName();

    this.connector = this.createGcpConnector(this.config, opts);
  }

  private createGcpConnector(
    config: gcp.vpcaccess.ConnectorArgs,
    opts?: pulumi.CustomResourceOptions
  ): gcp.vpcaccess.Connector {
    const connector = new gcp.vpcaccess.Connector(
      this.resourceName,
      {
        region: this.region,
        ...config,
      },
      opts
    );

    return connector;
  }

  /**
   * Returns the underlying `gcp.vpcaccess.Connector` resource.
   * @returns The `gcp.vpcaccess.Connector` resource.
   */
  public getConnector(): gcp.vpcaccess.Connector {
    return this.connector;
  }

  /**
   * Returns the IP CIDR range of the connector.
   * @returns A Pulumi `Output` with the IP CIDR range of the connector.
   */
  public getIpCidrRange(): pulumi.Output<string | undefined> {
    return this.connector.ipCidrRange;
  }

  /**
   * Returns the region of the connector.
   * @returns A Pulumi `Output` with the region of the connector.
   */
  public getRegion(): pulumi.Output<string> {
    return pulumi.output(this.connector.region);
  }

  /**
   * Records the connector in `CloudInfraOutput` for use in other stacks.
   * @param manager The `CloudInfraOutput` instance.
   */
  public exportOutputs(manager: CloudInfraOutput): void {
    manager.record(
      'gcp:vpcaccess:Connector',
      this.inputName,
      this.meta,
      this.connector
    );
  }
}

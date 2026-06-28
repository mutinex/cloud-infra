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
import {
  CloudInfraComponent,
  splitMetaArgs,
  type NamingArgs,
  type ComponentConfig,
} from '../../core/component';

/** Pulumi type token for the VPC Access Connector component. */
export const CONNECTOR_TYPE = 'cloud-infra:network:CloudInfraConnector';

export const CloudInfraConnectorConfigSchema = z
  .object({
    machineType: z.string().default('e2-micro'),
    minInstances: z.number().default(2),
    maxInstances: z.number().default(3),
  })
  .passthrough();

/**
 * User-facing config for `CloudInfraConnector`: the raw
 * `gcp.vpcaccess.ConnectorArgs` with the component-managed fields removed
 * (`name` → generated name, `region` → `meta.getRegion()`, etc.) via
 * {@link ComponentConfig}. TYPE-ONLY tightening — the Zod-defaulted parse and the
 * runtime spread (`{ region, ...config }`) and emitted resource are unchanged;
 * this only stops callers from passing meta-managed fields the component derives
 * itself.
 */
export type CloudInfraConnectorConfig =
  ComponentConfig<gcp.vpcaccess.ConnectorArgs>;

/**
 * Name-first construction args for `CloudInfraConnector` (v2 DX).
 *
 * Folds the naming metadata ({@link NamingArgs}: `domain` / `location` /
 * `prefix` / `naming`) together with the connector config
 * ({@link CloudInfraConnectorConfig}) into a single args object. The naming
 * fields are resolved into a `CloudInfraMeta` internally (identical
 * `generateName` output, Frozen Contract F1); the remaining fields are passed
 * straight through as the connector config exactly as the meta-first path.
 */
export type CloudInfraConnectorArgs = NamingArgs & CloudInfraConnectorConfig;

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
export class CloudInfraConnector extends CloudInfraComponent {
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
  /**
   * Name-first construction (v2 DX, preferred). Naming metadata
   * (`domain` / `location` / `prefix` / `naming`) and the connector config are
   * folded into a single args object; the name is resolved into a
   * `CloudInfraMeta` internally with byte-identical naming (Frozen Contract F1).
   * The Connector child name, parent, alias and preserved caller opts are
   * derived exactly as the meta-first path.
   */
  constructor(
    name: string,
    args: CloudInfraConnectorArgs,
    opts?: pulumi.ComponentResourceOptions
  );
  /**
   * @deprecated Meta-first construction. Prefer the name-first overload
   * `new CloudInfraConnector(name, args, opts)`. Retained for backward
   * compatibility; produces identical resources.
   *
   * @param meta The `CloudInfraMeta` instance to derive naming and region from.
   * @param config The configuration for the connector, extending
   * `gcp.vpcaccess.ConnectorArgs`.
   * @param opts Optional Pulumi resource options.
   */
  constructor(
    meta: CloudInfraMeta,
    config: CloudInfraConnectorConfig,
    opts?: pulumi.ComponentResourceOptions
  );
  constructor(
    nameOrMeta: string | CloudInfraMeta,
    argsOrConfig: CloudInfraConnectorArgs | CloudInfraConnectorConfig,
    opts?: pulumi.ComponentResourceOptions
  ) {
    // Normalize both overloads to a (meta, config) pair. For the name-first
    // path, split the naming metadata out of the args; everything else is the
    // connector config passed straight through (parsed + consumed UNCHANGED
    // below by the Connector). `opts` is forwarded unchanged.
    const { meta, config } = splitMetaArgs<CloudInfraConnectorConfig>(
      nameOrMeta,
      argsOrConfig
    );

    const resourceName = meta.getName();
    super(
      CONNECTOR_TYPE,
      resourceName,
      resourceName,
      { domain: meta.getDomain() },
      opts
    );

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

    this.registerOutputs({
      connector: this.connector,
    });
  }

  private createGcpConnector(
    config: gcp.vpcaccess.ConnectorArgs,
    opts?: pulumi.ComponentResourceOptions
  ): gcp.vpcaccess.Connector {
    // v1: root-level (no parent) → childOpts() aliases back to root for
    // IN-PLACE migration. gcp.vpcaccess.Connector has NO labels → args are NOT
    // passed through withLabels. PRESERVE any caller opts (e.g. dependsOn /
    // provider) by merging them in; the component parent + root-alias always
    // win (same precedence as v1).
    const connector = new gcp.vpcaccess.Connector(
      this.resourceName,
      {
        region: this.region,
        ...config,
      },
      {
        ...(opts ?? {}),
        ...this.childOpts(),
      }
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

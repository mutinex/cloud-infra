/**
 * @fileoverview CloudInfraAlb Component - Application Load Balancer Infrastructure
 *
 * This component provides a unified interface for creating and managing both global
 * and regional Application Load Balancers (ALBs) in Google Cloud Platform. It abstracts
 * the complexity of creating the various resources needed for a functional load balancer
 * including IP addresses, URL maps, target proxies, SSL certificates, and forwarding rules.
 *
 * The component automatically determines whether to create global or regional resources
 * based on the metadata domain configuration.
 *
 * @example
 * ```typescript
 * // Global ALB with HTTPS
 * const alb = new CloudInfraAlb(meta, {
 *   target: {
 *     sslCertificates: {
 *       certificate: "cert-content",
 *       privateKey: "key-content"
 *     },
 *     urlMap: {
 *       defaultService: backendService.id
 *     }
 *   },
 *   portRange: "443"
 * });
 *
 * // Regional ALB with existing proxy
 * const regionalAlb = new CloudInfraAlb(meta, {
 *   target: existingProxy.id,
 *   portRange: "80"
 * });
 * ```
 */

import * as pulumi from '@pulumi/pulumi';
import * as gcp from '@pulumi/gcp';
import { z } from 'zod';

import { CloudInfraMeta } from '../../core/meta';
import { CloudInfraOutput } from '../../core/output';
import { deriveRegion } from '../../core/helpers';
import { ValidationError, ResourceError } from '../../core/errors';
import { PulumiTypeDetector } from '../../core/pulumi-type-detector';
import { CloudInfraLogger } from '../../core/logging';

import { resolveGlobalAddress, resolveRegionalAddress } from './address';
import { resolveGlobalProxy, resolveRegionalProxy } from './proxy';
import { createForwardingRule } from './forwardingrule';
import { resolveGlobalUrlMap, resolveRegionalUrlMap } from './urlmap';
import {
  AlbConfig,
  GlobalAlbConfig,
  RegionAlbConfig,
  GlobalTargetProxyConfig,
  RegionalTargetProxyConfig,
} from './types';

/**
 * Zod schema for validating ALB configuration.
 * The configuration structure mirrors the forwarding rule configuration
 * with the target proxy configuration nested inside.
 */
export const CloudInfraAlbConfigSchema = z
  .object({
    ipAddress: z.any().optional(),
    loadBalancingScheme: z
      .enum(['EXTERNAL_MANAGED', 'INTERNAL_MANAGED'])
      .optional(),
    network: z.any().optional(),
    subnetwork: z.any().optional(),
    target: z.union([
      z.string(),
      z
        .object({
          sslCertificates: z.any().optional(),
          urlMap: z.any(),
        })
        .passthrough(),
    ]),
  })
  .passthrough();

export type CloudInfraAlbConfig = AlbConfig;

/**
 * CloudInfraAlb creates and manages Application Load Balancer infrastructure.
 *
 * This component automatically creates all necessary resources for a functional
 * load balancer based on the provided configuration. It supports both global
 * and regional load balancers, with the type determined by the metadata domain.
 *
 * Resources created (when not using references):
 * - IP Address (Global or Regional)
 * - URL Map (for routing rules)
 * - Target Proxy (HTTP or HTTPS)
 * - SSL Certificate (for HTTPS proxies)
 * - Forwarding Rule (the main load balancer resource)
 *
 * The component uses a pass-through configuration pattern, allowing all native
 * Pulumi arguments to be provided while applying sensible defaults based on
 * the metadata configuration.
 */
export class CloudInfraAlb {
  private readonly meta: CloudInfraMeta;
  private readonly config: CloudInfraAlbConfig;
  private readonly isGlobal: boolean;
  private readonly region?: string;
  private readonly inputName: string;

  // Global resources
  private globalForwardingRule?: gcp.compute.GlobalForwardingRule;
  private globalAddress?: gcp.compute.GlobalAddress;
  private globalUrlMap?: gcp.compute.URLMap;
  private globalProxy?:
    | gcp.compute.TargetHttpsProxy
    | gcp.compute.TargetHttpProxy;

  // Regional resources
  private regionalForwardingRule?: gcp.compute.ForwardingRule;
  private regionalAddress?: gcp.compute.Address;
  private regionalUrlMap?: gcp.compute.RegionUrlMap;
  private regionalProxy?:
    | gcp.compute.RegionTargetHttpsProxy
    | gcp.compute.RegionTargetHttpProxy;

  // Shared resources
  private certificate?:
    | gcp.compute.SSLCertificate
    | gcp.compute.RegionSslCertificate;

  /**
   * Creates a new CloudInfraAlb instance.
   *
   * @param meta - Metadata configuration for resource naming and location
   * @param config - ALB configuration including forwarding rule and target settings
   * @throws {ValidationError} If the configuration is invalid or name is an array
   * @throws {ResourceError} If resource creation fails
   */
  constructor(meta: CloudInfraMeta, config: CloudInfraAlbConfig) {
    try {
      CloudInfraLogger.info('Initializing ALB component', {
        component: 'alb',
        operation: 'constructor',
      });

      // Validate configuration
      CloudInfraAlbConfigSchema.parse(config);

      this.meta = meta;
      this.config = config;

      // Determine if this is a global or regional load balancer
      const domain = meta.getDomain();
      this.isGlobal = domain === 'gl';
      this.region = this.isGlobal ? undefined : deriveRegion(meta);

      // Validate single name requirement
      const candidateInputName = meta.getInputName();
      if (Array.isArray(candidateInputName)) {
        throw new ValidationError(
          'CloudInfraAlb expects a single name. Use separate Alb components per load balancer.',
          'alb',
          'constructor'
        );
      }
      this.inputName = candidateInputName;

      // Validate internal load balancer configuration
      this.validateInternalLoadBalancerConfig(config);

      // Validate certificate configuration
      this.validateCertificateConfig(config);

      // Create resources based on type
      const resourceName = meta.getName();
      if (this.isGlobal) {
        this.createGlobalResources(config as GlobalAlbConfig, resourceName);
      } else {
        this.createRegionalResources(config as RegionAlbConfig, resourceName);
      }
    } catch (err) {
      if (err instanceof z.ZodError) {
        throw new ValidationError(
          `Invalid ALB config: ${err.message}`,
          'alb',
          'constructor'
        );
      }
      throw new ResourceError(
        `Failed to create ALB ${meta.getName()}: ${err}`,
        'alb',
        'constructor'
      );
    }
  }

  /**
   * Validates internal load balancer configuration.
   * @private
   */
  private validateInternalLoadBalancerConfig(
    config: CloudInfraAlbConfig
  ): void {
    const isInternal = config.loadBalancingScheme === 'INTERNAL_MANAGED';

    if (isInternal) {
      // Internal load balancers require network and subnetwork
      if (!config.network) {
        throw new ValidationError(
          'Internal load balancers require a network configuration. Please provide the network parameter.',
          'alb',
          'validateInternalLoadBalancerConfig'
        );
      }

      if (!config.subnetwork) {
        throw new ValidationError(
          'Internal load balancers require a subnetwork configuration. Please provide the subnetwork parameter.',
          'alb',
          'validateInternalLoadBalancerConfig'
        );
      }
    } else {
      // For external load balancers:
      // - Global external LBs should not have network/subnetwork
      // - Regional external LBs can optionally have network (but not subnetwork for proxy-based LBs)
      if (this.isGlobal && (config.network || config.subnetwork)) {
        throw new ValidationError(
          'Global external load balancers should not specify network or subnetwork parameters.',
          'alb',
          'validateInternalLoadBalancerConfig'
        );
      }
      // Regional external proxy-based load balancers can have network but not subnetwork
      if (!this.isGlobal && config.subnetwork) {
        throw new ValidationError(
          'Regional external proxy-based load balancers should not specify subnetwork parameter. Only network parameter is allowed.',
          'alb',
          'validateInternalLoadBalancerConfig'
        );
      }
    }
  }

  /**
   * Validates certificate configuration.
   * Ensures certificateMap is only used with global external load balancers.
   * @private
   */
  private validateCertificateConfig(config: CloudInfraAlbConfig): void {
    // Check if target has certificateMap configuration
    if (
      config.target &&
      typeof config.target === 'object' &&
      'certificateMap' in config.target
    ) {
      const isExternal = config.loadBalancingScheme !== 'INTERNAL_MANAGED';

      // certificateMap is only supported for global external load balancers
      if (!this.isGlobal || !isExternal) {
        throw new ValidationError(
          'Certificate Manager certificate maps (certificateMap) are only supported for global external load balancers. ' +
            'For regional or internal load balancers, use sslCertificates or certificateManagerCertificates instead.',
          'alb',
          'validateCertificateConfig'
        );
      }
    }
  }

  /**
   * Creates global load balancer resources.
   * @private
   */
  private createGlobalResources(
    config: GlobalAlbConfig,
    resourceName: string
  ): void {
    // Create IP address - configure for internal/external based on load balancing scheme
    const isInternal = config.loadBalancingScheme === 'INTERNAL_MANAGED';
    const defaultAddressConfig = isInternal
      ? {
          project: this.meta.getGcpProject(),
          addressType: 'INTERNAL' as const,
          subnetwork: config.subnetwork,
        }
      : { project: this.meta.getGcpProject() };

    const addressInput = config.ipAddress || defaultAddressConfig;
    const { value: ipAddressValue, resource: createdAddress } =
      resolveGlobalAddress({
        input: addressInput,
        meta: this.meta,
        resourceName,
      });
    this.globalAddress = createdAddress;

    // Create or reference target proxy
    const targetProxyReference = this.resolveGlobalTarget(
      config.target,
      resourceName
    );

    // Create forwarding rule
    this.globalForwardingRule = this.createGlobalForwardingRule(
      config,
      targetProxyReference,
      ipAddressValue,
      resourceName
    );
  }

  /**
   * Creates regional load balancer resources.
   * @private
   */
  private createRegionalResources(
    config: RegionAlbConfig,
    resourceName: string
  ): void {
    if (!this.region) {
      throw new ValidationError(
        'Region is required for regional load balancers',
        'alb',
        'createRegionalResources'
      );
    }

    // Create IP address - configure for internal/external based on load balancing scheme
    const isInternal = config.loadBalancingScheme === 'INTERNAL_MANAGED';
    const defaultAddressConfig = isInternal
      ? {
          project: this.meta.getGcpProject(),
          addressType: 'INTERNAL' as const,
          subnetwork: config.subnetwork,
        }
      : { project: this.meta.getGcpProject() };

    const addressInput = config.ipAddress || defaultAddressConfig;
    const { value: ipAddressValue, resource: createdAddress } =
      resolveRegionalAddress({
        input: addressInput,
        meta: this.meta,
        resourceName,
        region: this.region,
      });
    this.regionalAddress = createdAddress as gcp.compute.Address | undefined;

    // Create or reference target proxy
    const targetProxyReference = this.resolveRegionalTarget(
      config.target,
      resourceName
    );

    // Create forwarding rule
    this.regionalForwardingRule = this.createRegionalForwardingRule(
      config,
      targetProxyReference,
      ipAddressValue,
      resourceName
    );
  }

  /**
   * Resolves the global target configuration, creating proxy and URL map if needed.
   * @private
   */
  private resolveGlobalTarget(
    target: pulumi.Input<string> | GlobalTargetProxyConfig,
    resourceName: string
  ): pulumi.Input<string> {
    // If target is a string reference, return it directly
    if (!PulumiTypeDetector.isConfigObject(target)) {
      return target as pulumi.Input<string>;
    }

    // Create new global proxy and URL map
    return this.createGlobalProxy(
      target as GlobalTargetProxyConfig,
      resourceName
    );
  }

  /**
   * Resolves the regional target configuration, creating proxy and URL map if needed.
   * @private
   */
  private resolveRegionalTarget(
    target: pulumi.Input<string> | RegionalTargetProxyConfig,
    resourceName: string
  ): pulumi.Input<string> {
    // If target is a string reference, return it directly
    if (!PulumiTypeDetector.isConfigObject(target)) {
      return target;
    }

    // Create new regional proxy and URL map
    return this.createRegionalProxy(
      target as RegionalTargetProxyConfig,
      resourceName
    );
  }

  /**
   * Creates a global proxy with its URL map.
   * @private
   */
  private createGlobalProxy(
    targetConfig: GlobalTargetProxyConfig,
    resourceName: string
  ): pulumi.Input<string> {
    // Resolve URL map
    const urlMapResult = resolveGlobalUrlMap({
      input: targetConfig.urlMap,
      meta: this.meta,
      resourceName,
    });

    if (urlMapResult.resource) {
      this.globalUrlMap = urlMapResult.resource as gcp.compute.URLMap;
    }

    // Create proxy
    const proxyResult = resolveGlobalProxy({
      input: targetConfig,
      meta: this.meta,
      resourceName,
      urlMap: urlMapResult.value,
    });

    this.globalProxy = proxyResult.proxy as
      | gcp.compute.TargetHttpsProxy
      | gcp.compute.TargetHttpProxy;
    this.certificate = proxyResult.certificate;

    return proxyResult.value;
  }

  /**
   * Creates a regional proxy with its URL map.
   * @private
   */
  private createRegionalProxy(
    targetConfig: RegionalTargetProxyConfig,
    resourceName: string
  ): pulumi.Input<string> {
    if (!this.region) {
      throw new ValidationError(
        'Region is required for regional proxy creation',
        'alb',
        'createRegionalProxy'
      );
    }

    // Get the load balancing scheme from the stored ALB configuration
    const loadBalancingScheme = (this.config as RegionAlbConfig)
      .loadBalancingScheme;

    // Resolve URL map
    const urlMapResult = resolveRegionalUrlMap({
      input: targetConfig.urlMap,
      meta: this.meta,
      resourceName,
      region: this.region,
      loadBalancingScheme,
    });

    if (urlMapResult.resource) {
      this.regionalUrlMap = urlMapResult.resource as gcp.compute.RegionUrlMap;
    }

    // Create proxy
    const proxyResult = resolveRegionalProxy({
      input: targetConfig,
      meta: this.meta,
      resourceName,
      urlMap: urlMapResult.value,
      region: this.region,
    });

    this.regionalProxy = proxyResult.proxy as
      | gcp.compute.RegionTargetHttpsProxy
      | gcp.compute.RegionTargetHttpProxy;
    this.certificate = proxyResult.certificate;

    return proxyResult.value;
  }

  /**
   * Creates a global forwarding rule resource with appropriate configuration.
   * @private
   */
  private createGlobalForwardingRule(
    config: GlobalAlbConfig,
    targetProxyReference: pulumi.Input<string>,
    ipAddressValue: pulumi.Input<string>,
    resourceName: string
  ): gcp.compute.GlobalForwardingRule {
    // Extract and prepare forwarding rule arguments
    const { target, ipAddress, ...forwardingRuleConfig } = config;

    // These are handled separately
    void target;
    void ipAddress;

    // Create global forwarding rule - pass config without target/ipAddress
    const { resource } = createForwardingRule({
      meta: this.meta,
      config: forwardingRuleConfig as Record<string, unknown>,
      ipAddress: ipAddressValue,
      target: targetProxyReference,
      resourceName,
      region: undefined, // Global resources don't have region
    });

    return resource as gcp.compute.GlobalForwardingRule;
  }

  /**
   * Creates a regional forwarding rule resource with appropriate configuration.
   * @private
   */
  private createRegionalForwardingRule(
    config: RegionAlbConfig,
    targetProxyReference: pulumi.Input<string>,
    ipAddressValue: pulumi.Input<string>,
    resourceName: string
  ): gcp.compute.ForwardingRule {
    // Extract and prepare forwarding rule arguments
    const { target, ipAddress, ...forwardingRuleConfig } = config;

    // These are handled separately, void to satisfy TypeScript
    void target;
    void ipAddress;

    // Create regional forwarding rule - pass config without target/ipAddress
    const { resource } = createForwardingRule({
      meta: this.meta,
      config: forwardingRuleConfig as Record<string, unknown>,
      ipAddress: ipAddressValue,
      target: targetProxyReference,
      resourceName,
      region: this.region,
    });

    return resource as gcp.compute.ForwardingRule;
  }

  /**
   * Gets the forwarding rule resource (global or regional).
   *
   * @returns The forwarding rule resource
   * @throws {ResourceError} If the forwarding rule was not initialized
   */
  public getForwardingRule():
    | gcp.compute.GlobalForwardingRule
    | gcp.compute.ForwardingRule {
    if (this.isGlobal) {
      if (!this.globalForwardingRule) {
        throw new ResourceError(
          'Global forwarding rule not initialized',
          'alb',
          'getForwardingRule'
        );
      }
      return this.globalForwardingRule;
    } else {
      if (!this.regionalForwardingRule) {
        throw new ResourceError(
          'Regional forwarding rule not initialized',
          'alb',
          'getForwardingRule'
        );
      }
      return this.regionalForwardingRule;
    }
  }

  /**
   * Gets the IP address assigned to the load balancer.
   *
   * @returns The IP address as a Pulumi output
   */
  public getIpAddress(): pulumi.Output<string> {
    const forwardingRule = this.getForwardingRule();
    return forwardingRule.ipAddress;
  }

  /**
   * Gets the address resource if one was created.
   *
   * @returns The address resource or undefined if using an existing address
   */
  public getAddressResource():
    | gcp.compute.GlobalAddress
    | gcp.compute.Address
    | undefined {
    return this.isGlobal ? this.globalAddress : this.regionalAddress;
  }

  /**
   * Gets the URL map resource if one was created.
   *
   * @returns The URL map resource or undefined if using an existing URL map
   */
  public getUrlMap():
    | gcp.compute.URLMap
    | gcp.compute.RegionUrlMap
    | undefined {
    return this.isGlobal ? this.globalUrlMap : this.regionalUrlMap;
  }

  /**
   * Gets the target proxy resource if one was created.
   *
   * @returns The proxy resource or undefined if using an existing proxy
   */
  public getProxy():
    | gcp.compute.TargetHttpsProxy
    | gcp.compute.TargetHttpProxy
    | gcp.compute.RegionTargetHttpsProxy
    | gcp.compute.RegionTargetHttpProxy
    | undefined {
    return this.isGlobal ? this.globalProxy : this.regionalProxy;
  }

  /**
   * Gets the SSL certificate resource if one was created.
   *
   * @returns The certificate resource or undefined if not using HTTPS
   */
  public getCertificate():
    | gcp.compute.SSLCertificate
    | gcp.compute.RegionSslCertificate
    | undefined {
    return this.certificate;
  }

  /**
   * Exports outputs to the CloudInfraOutput manager for cross-stack references.
   *
   * @param manager - The output manager to record resources to
   */
  public exportOutputs(manager: CloudInfraOutput): void {
    const grouping = this.inputName;

    if (this.isGlobal) {
      if (this.globalAddress) {
        manager.record(
          'gcp:compute:GlobalAddress',
          grouping,
          this.meta,
          this.globalAddress
        );
      }
    } else {
      if (this.regionalAddress) {
        manager.record(
          'gcp:compute:Address',
          grouping,
          this.meta,
          this.regionalAddress
        );
      }
    }
  }
}

export const CloudInfraAlbComponent = CloudInfraAlb;

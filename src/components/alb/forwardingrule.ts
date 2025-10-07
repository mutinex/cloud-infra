import * as gcp from '@pulumi/gcp';
import * as pulumi from '@pulumi/pulumi';
import { z } from 'zod';

import { CloudInfraMeta } from '../../core/meta';
import { ValidationError, ResourceError } from '../../core/errors';

/**
 * @fileoverview GCP compute forwarding rule management for Application Load Balancers.
 *
 * This module provides utilities for creating both global and regional forwarding
 * rules, which are essential components of Google Cloud Platform load balancers.
 * Forwarding rules direct incoming traffic to target proxies based on IP address
 * and port configurations.
 *
 * Key features:
 * - Support for both global and regional forwarding rules
 * - Unified interface for forwarding rule creation
 * - Consistent error handling and validation
 * - Flexible configuration with sensible defaults
 */

/**
 * Parameters for creating a global forwarding rule resource.
 */
interface CreateGlobalForwardingRuleParams {
  /** Metadata for the resource, including project and environment context */
  meta: CloudInfraMeta;
  /** Configuration for the global forwarding rule based on Pulumi's GCP provider */
  config: gcp.compute.GlobalForwardingRuleArgs;
  /** The IP address that the forwarding rule will serve */
  ipAddress: pulumi.Input<string>;
  /** The target proxy that will receive the traffic */
  target: pulumi.Input<string>;
  /** The name of the resource */
  resourceName: string;
}

/**
 * Parameters for creating a regional forwarding rule resource.
 */
interface CreateRegionalForwardingRuleParams {
  /** Metadata for the resource, including project and environment context */
  meta: CloudInfraMeta;
  /** Configuration for the regional forwarding rule based on Pulumi's GCP provider */
  config: gcp.compute.ForwardingRuleArgs;
  /** The IP address that the forwarding rule will serve */
  ipAddress: pulumi.Input<string>;
  /** The target proxy that will receive the traffic */
  target: pulumi.Input<string>;
  /** The name of the resource */
  resourceName: string;
  /** The GCP region where the forwarding rule will be created */
  region: string;
}

/**
 * Unified parameters for creating forwarding rules.
 * Supports both global and regional forwarding rule creation.
 */
export interface CreateForwardingRuleParams {
  /** The base configuration for the forwarding rule (without ipAddress and target) */
  config:
    | Omit<gcp.compute.GlobalForwardingRuleArgs, 'ipAddress' | 'target'>
    | Omit<gcp.compute.ForwardingRuleArgs, 'ipAddress' | 'target'>;
  /** Metadata for the resource */
  meta: CloudInfraMeta;
  /** The name of the resource */
  resourceName: string;
  /** The IP address for the forwarding rule */
  ipAddress: pulumi.Input<string>;
  /** The target proxy for the forwarding rule */
  target: pulumi.Input<string>;
  /** The GCP region (required for regional forwarding rules) */
  region?: string;
}

/**
 * Result of forwarding rule creation operations.
 */
export interface CreateForwardingRuleResult {
  /** The created resource */
  resource: gcp.compute.GlobalForwardingRule | gcp.compute.ForwardingRule;
}

/**
 * Wraps forwarding rule creation with consistent error handling.
 *
 * @param operation The operation description for error messages
 * @param resourceName The resource name for error context
 * @param createFn The function that creates the forwarding rule
 * @returns The result of the creation function
 * @throws {ValidationError} For Zod validation errors
 * @throws {ResourceError} For resource creation failures
 */
function withErrorHandling<T>(
  operation: string,
  resourceName: string,
  createFn: () => T
): T {
  try {
    return createFn();
  } catch (err) {
    if (err instanceof z.ZodError) {
      throw new ValidationError(`Invalid ${operation} config: ${err.message}`);
    }
    throw new ResourceError(
      `Failed to create ${operation} ${resourceName}: ${err}`
    );
  }
}

/**
 * Creates a new global forwarding rule in GCP.
 *
 * Global forwarding rules are used with global load balancers to route traffic
 * across multiple regions. They work in conjunction with global IP addresses
 * and target proxies.
 *
 * @param params The parameters for creating the global forwarding rule
 * @returns An object containing the created forwarding rule resource
 * @throws {ValidationError} For invalid configuration
 * @throws {ResourceError} For creation failures
 */
export function createGlobalForwardingRule(
  params: CreateGlobalForwardingRuleParams
): {
  forwardingRule: gcp.compute.GlobalForwardingRule;
} {
  return withErrorHandling(
    'global forwarding rule',
    params.resourceName,
    () => {
      const { config, ipAddress, target, resourceName, meta } = params;

      const forwardingRuleArgs: gcp.compute.GlobalForwardingRuleArgs = {
        ...config, // User config first
        portRange: config.portRange ?? '80',
        project: config.project ?? meta.getGcpProject(),
        ipAddress: ipAddress,
        target: target,
      };

      // Apply default loadBalancingScheme
      forwardingRuleArgs.loadBalancingScheme =
        config.loadBalancingScheme ?? 'EXTERNAL_MANAGED';

      const forwardingRule = new gcp.compute.GlobalForwardingRule(
        resourceName,
        forwardingRuleArgs
      );

      return { forwardingRule };
    }
  );
}

/**
 * Creates a new regional forwarding rule in GCP.
 *
 * Regional forwarding rules are used with regional load balancers that operate
 * within a single region. They work with regional IP addresses and target proxies.
 *
 * @param params The parameters for creating the regional forwarding rule
 * @returns An object containing the created forwarding rule resource
 * @throws {ValidationError} For invalid configuration
 * @throws {ResourceError} For creation failures
 */
export function createRegionalForwardingRule(
  params: CreateRegionalForwardingRuleParams
): {
  forwardingRule: gcp.compute.ForwardingRule;
} {
  return withErrorHandling(
    'regional forwarding rule',
    params.resourceName,
    () => {
      const { config, ipAddress, target, resourceName, region, meta } = params;

      const forwardingRuleArgs: gcp.compute.ForwardingRuleArgs = {
        ...config, // User config first
        portRange: config.portRange ?? '80',
        project: config.project ?? meta.getGcpProject(),
        region: region,
        ipAddress: ipAddress,
        target: target,
      };

      // Apply default loadBalancingScheme
      forwardingRuleArgs.loadBalancingScheme =
        config.loadBalancingScheme ?? 'EXTERNAL_MANAGED';

      const forwardingRule = new gcp.compute.ForwardingRule(
        resourceName,
        forwardingRuleArgs
      );

      return { forwardingRule };
    }
  );
}

/**
 * Creates either a global or regional forwarding rule based on the presence of region.
 *
 * This unified interface simplifies forwarding rule creation by automatically
 * determining whether to create a global or regional forwarding rule based on
 * the provided parameters. The ipAddress and target parameters are passed
 * separately from the config to ensure they are always provided.
 *
 * @param params The creation parameters
 * @returns The created forwarding rule resource
 */
export function createForwardingRule(
  params: CreateForwardingRuleParams
): CreateForwardingRuleResult {
  const { config, meta, resourceName, ipAddress, target, region } = params;

  if (region) {
    const forwardingRuleConfig: gcp.compute.ForwardingRuleArgs = {
      ...config,
      ipAddress,
      target,
    } as gcp.compute.ForwardingRuleArgs;

    const { forwardingRule } = createRegionalForwardingRule({
      meta,
      config: forwardingRuleConfig,
      ipAddress,
      target,
      resourceName,
      region,
    });
    return { resource: forwardingRule };
  } else {
    const forwardingRuleConfig: gcp.compute.GlobalForwardingRuleArgs = {
      ...config,
      ipAddress,
      target,
    } as gcp.compute.GlobalForwardingRuleArgs;

    const { forwardingRule } = createGlobalForwardingRule({
      meta,
      config: forwardingRuleConfig,
      ipAddress,
      target,
      resourceName,
    });
    return { resource: forwardingRule };
  }
}

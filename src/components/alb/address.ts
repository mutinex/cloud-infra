import * as gcp from '@pulumi/gcp';
import * as pulumi from '@pulumi/pulumi';
import { z } from 'zod';

import { CloudInfraMeta } from '../../core/meta';
import { ValidationError, ResourceError } from '../../core/errors';
import { PulumiTypeDetector } from '../../core/pulumi-type-detector';

/**
 * @fileoverview GCP compute address management for Application Load Balancers.
 *
 * This module provides utilities for creating and resolving both global and
 * regional IP addresses, which are essential for configuring load balancers
 * and other network services.
 *
 * Key features:
 * - Support for both global and regional addresses
 * - Unified interface for address creation and resolution
 * - Automatic handling of references vs. new resource creation
 * - Consistent error handling and validation
 */

/**
 * Parameters for creating a global address resource.
 */
interface CreateGlobalAddressParams {
  /** Metadata for the resource, including project and environment context */
  meta: CloudInfraMeta;
  /** Configuration for the global address based on Pulumi's GCP provider */
  config: gcp.compute.GlobalAddressArgs;
  /** The name of the resource */
  resourceName: string;
}

/**
 * Parameters for creating a regional address resource.
 */
interface CreateRegionalAddressParams {
  /** Metadata for the resource, including project and environment context */
  meta: CloudInfraMeta;
  /** Configuration for the regional address based on Pulumi's GCP provider */
  config: gcp.compute.AddressArgs;
  /** The name of the resource */
  resourceName: string;
  /** The GCP region where the address will be created */
  region: string;
}

/**
 * Unified parameters for resolving address resources.
 * Supports both references to existing addresses and configurations for new ones.
 */
export interface ResolveAddressParams {
  /** Input that can be either a reference string or address configuration */
  input?:
    | pulumi.Input<string>
    | gcp.compute.GlobalAddressArgs
    | gcp.compute.AddressArgs;
  /** Metadata for the resource */
  meta: CloudInfraMeta;
  /** The name of the resource */
  resourceName: string;
  /** The GCP region (required for regional addresses) */
  region?: string;
}

/**
 * Result of address resolution operations.
 */
export interface ResolveAddressResult {
  /** The resolved address value (reference or created resource address) */
  value: pulumi.Input<string>;
  /** The created resource, if a new one was created */
  resource?: gcp.compute.GlobalAddress | gcp.compute.Address;
}

/**
 * Wraps address creation with consistent error handling.
 *
 * @param operation The operation description for error messages
 * @param resourceName The resource name for error context
 * @param createFn The function that creates the address
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
 * Creates a new global IP address in GCP.
 *
 * Global addresses are used for global load balancers that can route traffic
 * across multiple regions.
 *
 * @param params The parameters for creating the global address
 * @returns An object containing the created address resource
 * @throws {ValidationError} For invalid configuration
 * @throws {ResourceError} For creation failures
 */
export function createGlobalAddress(params: CreateGlobalAddressParams): {
  address: gcp.compute.GlobalAddress;
} {
  return withErrorHandling('global address', params.resourceName, () => {
    const { config, resourceName, meta } = params;

    const addressArgs: gcp.compute.GlobalAddressArgs = {
      ...config, // User config first
      addressType: config.addressType ?? 'EXTERNAL',
      project: config.project ?? meta.getGcpProject(),
    };

    const address = new gcp.compute.GlobalAddress(resourceName, addressArgs);
    return { address };
  });
}

/**
 * Creates a new regional IP address in GCP.
 *
 * Regional addresses are used for regional load balancers that operate
 * within a single region.
 *
 * @param params The parameters for creating the regional address
 * @returns An object containing the created address resource
 * @throws {ValidationError} For invalid configuration
 * @throws {ResourceError} For creation failures
 */
export function createRegionalAddress(params: CreateRegionalAddressParams): {
  address: gcp.compute.Address;
} {
  return withErrorHandling('regional address', params.resourceName, () => {
    const { config, resourceName, region, meta } = params;

    const addressArgs: gcp.compute.AddressArgs = {
      ...config, // User config first
      addressType: config.addressType ?? 'EXTERNAL',
      project: config.project ?? meta.getGcpProject(),
      region: region,
    };

    const address = new gcp.compute.Address(resourceName, addressArgs);
    return { address };
  });
}

/**
 * Common resolution logic for both global and regional addresses.
 *
 * @param params Resolution parameters
 * @param createFn Function to create the address if needed
 * @returns The resolved address result
 */
function resolveAddressCommon(
  params: ResolveAddressParams,
  createFn: () => { address: gcp.compute.GlobalAddress | gcp.compute.Address }
): ResolveAddressResult {
  const { input } = params;

  if (input && PulumiTypeDetector.isConfigObject(input)) {
    // Create new address from configuration
    const { address } = createFn();
    return { value: address.address, resource: address };
  } else if (input) {
    // Use existing reference
    return { value: input as pulumi.Input<string> };
  } else {
    // Create with defaults
    const { address } = createFn();
    return { value: address.address, resource: address };
  }
}

/**
 * Resolves a global address reference or creates a new one.
 *
 * This function implements the standard pattern for handling flexible inputs:
 * - String references to existing addresses are passed through
 * - Configuration objects trigger creation of new addresses
 * - Undefined inputs create addresses with defaults
 *
 * @param params The resolution parameters
 * @returns The resolved address value and optional created resource
 */
export function resolveGlobalAddress(
  params: ResolveAddressParams
): ResolveAddressResult {
  const { input, meta, resourceName } = params;

  return resolveAddressCommon(params, () =>
    createGlobalAddress({
      meta,
      config: (input as gcp.compute.GlobalAddressArgs) || {},
      resourceName,
    })
  );
}

/**
 * Resolves a regional address reference or creates a new one.
 *
 * This function implements the standard pattern for handling flexible inputs:
 * - String references to existing addresses are passed through
 * - Configuration objects trigger creation of new addresses
 * - Undefined inputs create addresses with defaults
 *
 * @param params The resolution parameters
 * @returns The resolved address value and optional created resource
 * @throws {ValidationError} If region is not provided
 */
export function resolveRegionalAddress(
  params: ResolveAddressParams
): ResolveAddressResult {
  const { input, meta, resourceName, region } = params;

  if (!region) {
    throw new ValidationError(
      'Region is required for regional address resolution',
      'alb-address',
      'resolveRegionalAddress'
    );
  }

  return resolveAddressCommon(params, () =>
    createRegionalAddress({
      meta,
      config: (input as gcp.compute.AddressArgs) || {},
      resourceName,
      region,
    })
  );
}

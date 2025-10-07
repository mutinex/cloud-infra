import * as gcp from '@pulumi/gcp';
import * as pulumi from '@pulumi/pulumi';
import { z } from 'zod';

import { CloudInfraMeta } from '../../core/meta';
import { ValidationError, ResourceError } from '../../core/errors';
import { PulumiTypeDetector } from '../../core/pulumi-type-detector';
import {
  createSslCertificate,
  createRegionalSslCertificate,
} from './sslcertificate';
import { GlobalAlbConfig, RegionAlbConfig } from './types';

/**
 * @fileoverview GCP compute target proxy management for Application Load Balancers.
 *
 * This module provides utilities for creating and managing both global and regional
 * target proxies, which are essential components of Google Cloud Platform load balancers.
 * Target proxies terminate incoming connections and route traffic to URL maps based
 * on the protocol (HTTP or HTTPS).
 *
 * Key features:
 * - Support for both global and regional target proxies
 * - Automatic HTTP/HTTPS proxy selection based on SSL certificate configuration
 * - Unified interfaces for proxy creation and resolution
 * - Flexible SSL certificate handling (references or new creation)
 * - Consistent error handling and validation
 */

/**
 * Base parameters shared by all proxy creation functions.
 */
interface BaseProxyParams {
  /** Metadata for the resource, including project and environment context */
  meta: CloudInfraMeta;
  /** The name of the resource */
  resourceName: string;
}

/**
 * Parameters for creating a global target HTTPS proxy.
 */
interface CreateTargetHttpsProxyParams extends BaseProxyParams {
  /** Configuration for the target HTTPS proxy based on Pulumi's GCP provider */
  config: gcp.compute.TargetHttpsProxyArgs;
  /** Optional SSL certificate to be used by the proxy */
  certificate?: gcp.compute.SSLCertificate;
}

/**
 * Parameters for creating a global target HTTP proxy.
 */
interface CreateTargetHttpProxyParams extends BaseProxyParams {
  /** Configuration for the target HTTP proxy based on Pulumi's GCP provider */
  config: gcp.compute.TargetHttpProxyArgs;
}

/**
 * Parameters for creating a regional target HTTPS proxy.
 */
interface CreateRegionalTargetHttpsProxyParams extends BaseProxyParams {
  /** Configuration for the regional target HTTPS proxy based on Pulumi's GCP provider */
  config: gcp.compute.RegionTargetHttpsProxyArgs;
  /** Optional SSL certificate to be used by the proxy */
  certificate?: gcp.compute.SSLCertificate;
  /** The GCP region for the proxy */
  region: string;
}

/**
 * Parameters for creating a regional target HTTP proxy.
 */
interface CreateRegionalTargetHttpProxyParams extends BaseProxyParams {
  /** Configuration for the regional target HTTP proxy based on Pulumi's GCP provider */
  config: gcp.compute.RegionTargetHttpProxyArgs;
  /** The GCP region for the proxy */
  region: string;
}

/**
 * Standard interface for resolving proxy resources.
 * Supports both references to existing proxies and configurations for new ones.
 */
export interface ResolveProxyParams {
  /** The input configuration containing proxy settings */
  input:
    | Exclude<GlobalAlbConfig['target'], pulumi.Input<string>>
    | Exclude<RegionAlbConfig['target'], pulumi.Input<string>>;
  /** Metadata for the resource */
  meta: CloudInfraMeta;
  /** The name of the resource */
  resourceName: string;
  /** The URL map reference to associate with the proxy */
  urlMap: pulumi.Input<string>;
  /** The GCP region (required for regional proxies) */
  region?: string;
}

/**
 * Standard result interface for proxy resolvers.
 */
export interface ResolveProxyResult {
  /** The resolved proxy reference (selfLink) */
  value: pulumi.Output<string>;
  /** The created proxy resource */
  proxy:
    | gcp.compute.TargetHttpsProxy
    | gcp.compute.TargetHttpProxy
    | gcp.compute.RegionTargetHttpsProxy
    | gcp.compute.RegionTargetHttpProxy;
  /** The created certificate, if any */
  certificate?: gcp.compute.SSLCertificate | gcp.compute.RegionSslCertificate;
}

/**
 * Unified parameters for creating proxy resources.
 * Supports both global and regional proxy creation.
 */
export interface CreateProxyParams {
  /** Configuration for the proxy */
  config:
    | gcp.compute.TargetHttpProxyArgs
    | gcp.compute.TargetHttpsProxyArgs
    | gcp.compute.RegionTargetHttpProxyArgs
    | gcp.compute.RegionTargetHttpsProxyArgs;
  /** Metadata for the resource */
  meta: CloudInfraMeta;
  /** The name of the resource */
  resourceName: string;
  /** Optional SSL certificate for HTTPS proxies */
  certificate?: gcp.compute.SSLCertificate;
  /** The GCP region (required for regional proxies) */
  region?: string;
  /** Whether this is an HTTPS proxy */
  isHttps: boolean;
}

/**
 * Result of proxy creation operations.
 */
export interface CreateProxyResult {
  /** The created resource */
  resource:
    | gcp.compute.TargetHttpsProxy
    | gcp.compute.TargetHttpProxy
    | gcp.compute.RegionTargetHttpsProxy
    | gcp.compute.RegionTargetHttpProxy;
}

/**
 * Wraps proxy creation with consistent error handling.
 *
 * @param operation The operation description for error messages
 * @param resourceName The resource name for error context
 * @param createFn The function that creates the proxy
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
 * Handles SSL certificate resolution for proxy configurations.
 *
 * This function determines whether to create a new SSL certificate or use
 * an existing reference based on the configuration.
 *
 * @param sslCertificates The SSL certificate configuration (reference or config)
 * @param params Parameters needed for certificate creation
 * @returns The resolved certificate and its reference
 */
function resolveSslCertificate(
  sslCertificates: unknown,
  params: { meta: CloudInfraMeta; resourceName: string; region?: string }
): {
  certificate?: gcp.compute.SSLCertificate | gcp.compute.RegionSslCertificate;
  certificateRefs?: pulumi.Input<pulumi.Input<string>[]>;
} {
  if (!sslCertificates) {
    return {};
  }

  if (PulumiTypeDetector.isConfigObject(sslCertificates)) {
    // Create new SSL certificate - global or regional based on region parameter
    if (params.region) {
      const { certificate } = createRegionalSslCertificate({
        meta: params.meta,
        config: sslCertificates as gcp.compute.RegionSslCertificateArgs,
        resourceName: params.resourceName,
        region: params.region,
      });
      return { certificate };
    } else {
      const { certificate } = createSslCertificate({
        meta: params.meta,
        config: sslCertificates as gcp.compute.SSLCertificateArgs,
        resourceName: params.resourceName,
      });
      return { certificate };
    }
  } else {
    // Use existing reference(s)
    return {
      certificateRefs: sslCertificates as pulumi.Input<pulumi.Input<string>[]>,
    };
  }
}

/**
 * Creates a new global target HTTPS proxy in GCP.
 *
 * HTTPS proxies are used for SSL-terminated load balancing, handling encrypted
 * traffic and forwarding it to backend services via URL maps.
 *
 * @param params The parameters for creating the proxy
 * @returns An object containing the created proxy resource
 * @throws {ValidationError} For invalid configuration
 * @throws {ResourceError} For creation failures
 */
export function createTargetHttpsProxy(params: CreateTargetHttpsProxyParams): {
  proxy: gcp.compute.TargetHttpsProxy;
} {
  return withErrorHandling('target HTTPS proxy', params.resourceName, () => {
    const { config, certificate, resourceName, meta } = params;

    const proxyArgs: gcp.compute.TargetHttpsProxyArgs = {
      ...config, // User config first
      project: config.project ?? meta.getGcpProject(),
    };

    // Apply SSL certificates: either from provided certificate or from config
    if (certificate) {
      proxyArgs.sslCertificates = [certificate.selfLink];
    }

    const proxy = new gcp.compute.TargetHttpsProxy(resourceName, proxyArgs);
    return { proxy };
  });
}

/**
 * Creates a new global target HTTP proxy in GCP.
 *
 * HTTP proxies are used for non-SSL load balancing, handling unencrypted
 * traffic and forwarding it to backend services via URL maps.
 *
 * @param params The parameters for creating the proxy
 * @returns An object containing the created proxy resource
 * @throws {ValidationError} For invalid configuration
 * @throws {ResourceError} For creation failures
 */
export function createTargetHttpProxy(params: CreateTargetHttpProxyParams): {
  proxy: gcp.compute.TargetHttpProxy;
} {
  return withErrorHandling('target HTTP proxy', params.resourceName, () => {
    const { config, resourceName, meta } = params;

    const proxyArgs: gcp.compute.TargetHttpProxyArgs = {
      ...config, // User config first
      project: config.project ?? meta.getGcpProject(),
    };

    const proxy = new gcp.compute.TargetHttpProxy(resourceName, proxyArgs);
    return { proxy };
  });
}

/**
 * Creates a new regional target HTTPS proxy in GCP.
 *
 * Regional HTTPS proxies operate within a specific region and are used for
 * SSL-terminated load balancing with regional scope.
 *
 * @param params The parameters for creating the proxy
 * @returns An object containing the created proxy resource
 * @throws {ValidationError} For invalid configuration
 * @throws {ResourceError} For creation failures
 */
export function createRegionalTargetHttpsProxy(
  params: CreateRegionalTargetHttpsProxyParams
): {
  proxy: gcp.compute.RegionTargetHttpsProxy;
} {
  return withErrorHandling(
    'regional target HTTPS proxy',
    params.resourceName,
    () => {
      const { config, certificate, resourceName, region, meta } = params;

      const proxyArgs: gcp.compute.RegionTargetHttpsProxyArgs = {
        ...config, // User config first
        project: config.project ?? meta.getGcpProject(),
        region: region,
      };

      // Apply SSL certificates: either from provided certificate or from config
      if (certificate) {
        proxyArgs.sslCertificates = [certificate.selfLink];
      }

      const proxy = new gcp.compute.RegionTargetHttpsProxy(
        resourceName,
        proxyArgs
      );
      return { proxy };
    }
  );
}

/**
 * Creates a new regional target HTTP proxy in GCP.
 *
 * Regional HTTP proxies operate within a specific region and are used for
 * non-SSL load balancing with regional scope.
 *
 * @param params The parameters for creating the proxy
 * @returns An object containing the created proxy resource
 * @throws {ValidationError} For invalid configuration
 * @throws {ResourceError} For creation failures
 */
export function createRegionalTargetHttpProxy(
  params: CreateRegionalTargetHttpProxyParams
): {
  proxy: gcp.compute.RegionTargetHttpProxy;
} {
  return withErrorHandling(
    'regional target HTTP proxy',
    params.resourceName,
    () => {
      const { config, resourceName, region, meta } = params;

      const proxyArgs: gcp.compute.RegionTargetHttpProxyArgs = {
        ...config, // User config first
        project: config.project ?? meta.getGcpProject(),
        region: region,
      };

      const proxy = new gcp.compute.RegionTargetHttpProxy(
        resourceName,
        proxyArgs
      );
      return { proxy };
    }
  );
}

/**
 * Common resolution logic for both global and regional proxies.
 *
 * @param params Resolution parameters
 * @param isRegional Whether this is a regional proxy
 * @returns The resolved proxy result
 */
function resolveProxyCommon(
  params: ResolveProxyParams,
  isRegional: boolean
): ResolveProxyResult {
  const { input, meta, resourceName, urlMap, region } = params;
  const targetConfig = input;

  // Resolve SSL certificates
  const { certificate, certificateRefs } = resolveSslCertificate(
    targetConfig.sslCertificates,
    { meta, resourceName, region }
  );

  // Extract Certificate Manager configurations
  const certificateManagerCerts = targetConfig.certificateManagerCertificates;
  const certificateMapInput = targetConfig.certificateMap;

  // Format certificate map ID to include the Certificate Manager service prefix
  const certificateMap = certificateMapInput
    ? pulumi.output(certificateMapInput).apply(mapId => {
        // If the ID doesn't start with //, add the Certificate Manager service prefix
        if (typeof mapId === 'string' && !mapId.startsWith('//')) {
          return `//certificatemanager.googleapis.com/${mapId}`;
        }
        return mapId;
      })
    : undefined;

  // Prepare proxy configuration
  const {
    sslCertificates: _sslCertificates,
    certificateManagerCertificates: _certificateManagerCertificates,
    certificateMap: _certificateMap,
    urlMap: _targetUrlMap,
    ...baseConfig
  } = targetConfig;
  void _sslCertificates; // Explicitly ignore
  void _certificateManagerCertificates; // Explicitly ignore
  void _certificateMap; // Explicitly ignore
  void _targetUrlMap; // Explicitly ignore

  const proxyConfig = {
    ...baseConfig,
    urlMap: urlMap,
    ...(certificate && { sslCertificates: [certificate.selfLink] }),
    ...(certificateRefs && { sslCertificates: certificateRefs }),
    ...(certificateManagerCerts && {
      certificateManagerCertificates: certificateManagerCerts,
    }),
    ...(certificateMap && { certificateMap: certificateMap }),
  };

  // Determine if HTTPS proxy is needed - check all three certificate options
  const isHttps = !!(
    certificate ||
    certificateRefs ||
    certificateManagerCerts ||
    certificateMapInput
  );

  // Create the appropriate proxy type
  const { resource: proxy } = createProxy({
    config: proxyConfig,
    meta,
    resourceName,
    certificate,
    region: isRegional ? region : undefined,
    isHttps,
  });

  return {
    value: pulumi.output(proxy).apply(p => {
      if ('selfLink' in p && p.selfLink) {
        return p.selfLink;
      }
      throw new ResourceError(
        'Proxy resource does not have selfLink property',
        'alb-proxy',
        'resolveProxyCommon'
      );
    }),
    proxy,
    certificate,
  };
}

/**
 * Resolves a global proxy using the standardized pattern.
 * Creates the appropriate type (HTTP or HTTPS) based on SSL certificate configuration.
 *
 * @param params The resolution parameters
 * @returns The resolved proxy value and created resources
 */
export function resolveGlobalProxy(
  params: ResolveProxyParams
): ResolveProxyResult {
  return resolveProxyCommon(params, false);
}

/**
 * Resolves a regional proxy using the standardized pattern.
 * Creates the appropriate type (HTTP or HTTPS) based on SSL certificate configuration.
 *
 * @param params The resolution parameters
 * @returns The resolved proxy value and created resources
 * @throws {ValidationError} If region is not provided
 */
export function resolveRegionalProxy(
  params: ResolveProxyParams
): ResolveProxyResult {
  if (!params.region) {
    throw new ValidationError(
      'Region is required for regional proxy resolution',
      'alb-proxy',
      'resolveRegionalProxy'
    );
  }
  return resolveProxyCommon(params, true);
}

/**
 * Creates either a global or regional proxy based on the presence of region.
 * Automatically selects between HTTP and HTTPS proxy types based on the
 * isHttps parameter.
 *
 * This unified interface simplifies proxy creation by automatically
 * determining the correct proxy type and scope based on the provided parameters.
 *
 * @param params The creation parameters
 * @returns The created proxy resource
 */
export function createProxy(params: CreateProxyParams): CreateProxyResult {
  const { config, meta, resourceName, certificate, region, isHttps } = params;

  if (region) {
    // Regional proxy
    if (isHttps) {
      const { proxy } = createRegionalTargetHttpsProxy({
        meta,
        config: config as gcp.compute.RegionTargetHttpsProxyArgs,
        certificate,
        resourceName,
        region,
      });
      return { resource: proxy };
    } else {
      const { proxy } = createRegionalTargetHttpProxy({
        meta,
        config: config as gcp.compute.RegionTargetHttpProxyArgs,
        resourceName,
        region,
      });
      return { resource: proxy };
    }
  } else {
    // Global proxy
    if (isHttps) {
      const { proxy } = createTargetHttpsProxy({
        meta,
        config: config as gcp.compute.TargetHttpsProxyArgs,
        certificate,
        resourceName,
      });
      return { resource: proxy };
    } else {
      const { proxy } = createTargetHttpProxy({
        meta,
        config: config as gcp.compute.TargetHttpProxyArgs,
        resourceName,
      });
      return { resource: proxy };
    }
  }
}

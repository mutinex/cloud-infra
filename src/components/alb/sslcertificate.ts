import * as gcp from '@pulumi/gcp';
import { z } from 'zod';

import { CloudInfraMeta } from '../../core/meta';
import { ValidationError, ResourceError } from '../../core/errors';

/**
 * @fileoverview GCP compute SSL certificate management for Application Load Balancers.
 *
 * This module provides utilities for creating and managing SSL certificates, which
 * are essential components of HTTPS load balancers in Google Cloud Platform. SSL
 * certificates enable secure, encrypted communication between clients and load
 * balancers by providing TLS termination.
 *
 * Key features:
 * - Support for managed and self-managed SSL certificates
 * - Integration with target HTTPS proxies for secure traffic handling
 * - Consistent error handling and validation
 * - Project-aware certificate creation with metadata support
 *
 * SSL certificates can be:
 * - Google-managed: Automatically provisioned and renewed by Google
 * - Self-managed: Customer-provided certificates with manual renewal
 * - Regional or global scope depending on the load balancer type
 */

/**
 * Parameters for creating a global SSL certificate resource.
 */
interface CreateSslCertificateParams {
  /** Metadata for the resource, including project and environment context */
  meta: CloudInfraMeta;
  /** Configuration for the SSL certificate based on Pulumi's GCP provider */
  config: gcp.compute.SSLCertificateArgs;
  /** The name of the resource */
  resourceName: string;
}

/**
 * Parameters for creating a regional SSL certificate resource.
 */
interface CreateRegionalSslCertificateParams {
  /** Metadata for the resource, including project and environment context */
  meta: CloudInfraMeta;
  /** Configuration for the regional SSL certificate based on Pulumi's GCP provider */
  config: gcp.compute.RegionSslCertificateArgs;
  /** The name of the resource */
  resourceName: string;
  /** The GCP region where the certificate will be created */
  region: string;
}

/**
 * Unified parameters for creating SSL certificates.
 * Supports both global and regional certificate creation.
 */
export interface CreateCertificateParams {
  /** Metadata for the resource */
  meta: CloudInfraMeta;
  /** The certificate configuration */
  config: gcp.compute.SSLCertificateArgs | gcp.compute.RegionSslCertificateArgs;
  /** The name of the resource */
  resourceName: string;
  /** The GCP region (required for regional certificates) */
  region?: string;
}

/**
 * Result of SSL certificate creation operations.
 */
export interface CreateCertificateResult {
  /** The created certificate resource */
  certificate: gcp.compute.SSLCertificate | gcp.compute.RegionSslCertificate;
}

// ============================================================================
// PRIVATE UTILITIES
// ============================================================================

/**
 * Wraps SSL certificate creation with consistent error handling.
 *
 * @param operation The operation description for error messages
 * @param resourceName The resource name for error context
 * @param createFn The function that creates the SSL certificate
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
 * Creates a new SSL certificate in GCP.
 *
 * SSL certificates are used by HTTPS load balancers to terminate SSL/TLS
 * connections and establish secure communication channels. This function
 * supports both managed certificates (automatically provisioned by Google)
 * and self-managed certificates (provided by the user).
 *
 * The certificate can be attached to target HTTPS proxies to enable secure
 * traffic handling. Multiple certificates can be attached to a single proxy
 * to support multiple domains or SANs (Subject Alternative Names).
 *
 * @param params The parameters for creating the SSL certificate
 * @returns An object containing the created certificate resource
 * @throws {ValidationError} For invalid configuration
 * @throws {ResourceError} For creation failures
 *
 * @example
 * // Create a self-managed certificate
 * const { certificate } = createSslCertificate({
 *   meta: myMeta,
 *   config: {
 *     certificate: readFileSync('cert.pem', 'utf8'),
 *     privateKey: readFileSync('key.pem', 'utf8'),
 *   },
 *   resourceName: "my-ssl-cert"
 * });
 *
 * @example
 * // Create a Google-managed certificate
 * const { certificate } = createSslCertificate({
 *   meta: myMeta,
 *   config: {
 *     managed: {
 *       domains: ["example.com", "www.example.com"],
 *     },
 *   },
 *   resourceName: "my-managed-cert"
 * });
 */
export function createSslCertificate(params: CreateSslCertificateParams): {
  certificate: gcp.compute.SSLCertificate;
} {
  return withErrorHandling('SSL certificate', params.resourceName, () => {
    const { config, resourceName, meta } = params;

    const sslArgs: gcp.compute.SSLCertificateArgs = {
      ...config, // User config first
      project: config.project ?? meta.getGcpProject(),
    };

    const certificate = new gcp.compute.SSLCertificate(resourceName, sslArgs);

    return { certificate };
  });
}

/**
 * Creates a new regional SSL certificate in GCP.
 *
 * Regional SSL certificates are used with regional load balancers and are
 * created within a specific region. They contain the same certificate data
 * as global certificates but are regional resources.
 *
 * @param params The parameters for creating the regional SSL certificate
 * @returns An object containing the created certificate resource
 * @throws {ValidationError} For invalid configuration
 * @throws {ResourceError} For creation failures
 *
 * @example
 * // Create a regional self-managed certificate
 * const { certificate } = createRegionalSslCertificate({
 *   meta: myMeta,
 *   config: {
 *     certificate: readFileSync('cert.pem', 'utf8'),
 *     privateKey: readFileSync('key.pem', 'utf8'),
 *   },
 *   resourceName: "my-regional-ssl-cert",
 *   region: "us-central1"
 * });
 */
export function createRegionalSslCertificate(
  params: CreateRegionalSslCertificateParams
): {
  certificate: gcp.compute.RegionSslCertificate;
} {
  return withErrorHandling(
    'regional SSL certificate',
    params.resourceName,
    () => {
      const { config, resourceName, region, meta } = params;

      const sslArgs: gcp.compute.RegionSslCertificateArgs = {
        ...config, // User config first
        project: config.project ?? meta.getGcpProject(),
        region: region,
      };

      const certificate = new gcp.compute.RegionSslCertificate(
        resourceName,
        sslArgs
      );

      return { certificate };
    }
  );
}

/**
 * Creates either a global or regional SSL certificate based on the presence of region.
 *
 * This unified interface simplifies SSL certificate creation by automatically
 * determining whether to create a global or regional certificate based on
 * the provided parameters.
 *
 * @param params The creation parameters
 * @returns The created certificate resource
 */
export function createCertificate(
  params: CreateCertificateParams
): CreateCertificateResult {
  const { config, meta, resourceName, region } = params;

  if (region) {
    const regionalConfig = config as gcp.compute.RegionSslCertificateArgs;
    const { certificate } = createRegionalSslCertificate({
      meta,
      config: regionalConfig,
      resourceName,
      region,
    });
    return { certificate };
  } else {
    const globalConfig = config as gcp.compute.SSLCertificateArgs;
    const { certificate } = createSslCertificate({
      meta,
      config: globalConfig,
      resourceName,
    });
    return { certificate };
  }
}

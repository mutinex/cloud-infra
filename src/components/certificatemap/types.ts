/**
 * Type definitions for the CloudInfraCertificateMap component
 */

import * as pulumi from '@pulumi/pulumi';

/**
 * Individual certificate configuration
 */
export interface CertificateDefinition {
  /**
   * Name identifier for the certificate
   * Used to reference the certificate later
   */
  name: string;

  /**
   * List of domains to include in the certificate (SAN certificate)
   */
  domains: string[];

  /**
   * Whether to include wildcard domains (*.domain) for each domain
   * Default: false
   */
  wildcard?: boolean;

  /**
   * Whether to include a wildcard for the immediate parent of each domain.
   * For example, if the domain is 'demo.dbecd8hyd.product.domain.com', this will also
   * include the wildcard '*.dbecd8hyd.product.domain.com' in the certificate.
   * Default: false
   */
  includePreview?: boolean;
}

/**
 * Configuration for creating a managed certificate with DNS validation
 */
export interface CloudInfraCertificateMapConfig {
  /**
   * Array of certificate definitions
   * Each certificate can have multiple domains (SAN certificate)
   * Wildcard certificates (*.domain) are optionally created based on the wildcard flag
   *
   * Example:
   * {
   *   certificates: [
   *     {
   *       name: 'api',
   *       domains: ['api.example.com'],
   *       wildcard: true  // Creates both api.example.com and *.api.example.com
   *     },
   *     {
   *       name: 'web',
   *       domains: ['www.example.com', 'example.com'],
   *       wildcard: false  // Creates only exact domains
   *     }
   *   ],
   *   cloudflareZoneId: 'your-zone-id'
   * }
   */
  certificates: CertificateDefinition[];

  /**
   * Cloudflare Zone ID for DNS validation
   * Required for creating DNS authorization records
   */
  cloudflareZoneId: string;

  /**
   * Optional GCP project override
   * If not provided, uses the project from CloudInfraMeta
   */
  project?: pulumi.Input<string>;

  /**
   * Optional resource labels. Merged on top of the uniform org label floor
   * (`{ ...orgLabels, ...labels }`) into every label-supporting child
   * (DnsAuthorization, Certificate, CertificateMap, CertificateMapEntry) via the
   * standard `withLabels` mechanism — caller labels win over the org floor.
   * ADDITIVE: when omitted, behaviour is unchanged (org labels only). The
   * label-UNSUPPORTED Cloudflare DNS records are never passed through
   * `withLabels` and are unaffected.
   */
  labels?: Record<string, string>;
}

/**
 * CloudInfraCertificateMap: Managed SSL certificates with DNS validation
 */

import * as pulumi from '@pulumi/pulumi';
import * as gcp from '@pulumi/gcp';
import * as cloudflare from '@pulumi/cloudflare';

import { CloudInfraMeta } from '../../core/meta';
import { CloudInfraOutput } from '../../core/output';
import { ResourceError, ValidationError } from '../../core/errors';
import { deriveRegion } from '../../core/helpers';
import { CloudInfraLogger } from '../../core/logging';
import {
  CloudInfraComponent,
  resolveMeta,
  type NamingArgs,
} from '../../core/component';
import { resourceNamingConfig } from '../../config';
import { CloudInfraCertificateMapConfig, CertificateDefinition } from './types';

/**
 * Name-first construction args for `CloudInfraCertificateMap` (v2 DX).
 *
 * Folds the naming metadata ({@link NamingArgs}: `domain` / `location` /
 * `prefix` / `naming`) together with the certificate config
 * ({@link CloudInfraCertificateMapConfig}) into a single args object, so a
 * certificate map can be built as
 * `new CloudInfraCertificateMap("certs", { domain: "gl", certificates: [...], cloudflareZoneId: "..." })`.
 *
 * The naming fields are resolved into a `CloudInfraMeta` internally (identical
 * `generateName` output, Frozen Contract F1); the remaining fields are passed
 * straight through as the certificate config — every child name derived from
 * the full config (the `-${cert.name}` certificate suffix, the
 * `-${sanitize(domain)}` DNS-authorization / Cloudflare-record / map-entry
 * suffixes), the sanitizer, the `deleteBeforeReplace`/`dependsOn` wiring and the
 * regional-vs-global `location` handling are all derived exactly as the
 * meta-first path — only meta acquisition is rerouted.
 *
 * {@link CloudInfraCertificateMapConfig} has no `location` field (location is
 * derived from the meta domain via `determineLocation()`), so
 * {@link NamingArgs.location} (which drives only the generated name) cannot
 * collide with the config arm.
 */
export type CloudInfraCertificateMapArgs = NamingArgs &
  CloudInfraCertificateMapConfig;

// Type definitions for better type safety
type DnsAuthorizationMap = Record<
  string,
  Record<string, gcp.certificatemanager.DnsAuthorization>
>;
type CloudflareRecordMap = Record<string, Record<string, cloudflare.Record>>;
type CertificateMap = Record<string, gcp.certificatemanager.Certificate>;
type CertificateMapEntryMap = Record<
  string,
  gcp.certificatemanager.CertificateMapEntry
>;

/**
 * Creates managed SSL certificates with DNS validation through Certificate Manager.
 * Supports both global and regional certificates based on the meta domain.
 *
 * Location handling:
 * - Global resources (domain === 'gl'): No location parameter is passed
 * - Regional resources: Location is derived from meta and passed to the resources
 *
 * Certificate maps:
 * - Only created for global certificates (domain === 'gl')
 * - Not available for regional certificates
 * - Use getCertificateMap() for global load balancers with certificate maps
 * - Use getManagedCertificate() for certificateManagerCertificates in any load balancer
 */
/** Pulumi type token for the certificate-map component. */
export const CERTIFICATE_MAP_TYPE =
  'cloud-infra:certificatemap:CloudInfraCertificateMap';

/**
 * Resolves and validates the single component name before `this` exists (so it
 * can feed `super()`). Throws the component's ValidationError on array names.
 */
function resolveCertificateMapName(meta: CloudInfraMeta): string {
  const candidateInputName = meta.getInputName();
  if (Array.isArray(candidateInputName)) {
    throw new ValidationError(
      'CloudInfraCertificateMap expects a single name. Use separate Certificate components per certificate.',
      'certificatemap',
      'validateAndGetInputName'
    );
  }
  return meta.getName();
}

export class CloudInfraCertificateMap extends CloudInfraComponent {
  private readonly meta: CloudInfraMeta;
  private readonly config: CloudInfraCertificateMapConfig;
  private readonly inputName: string;
  private readonly resourceName: string;
  private readonly isGlobal: boolean;
  private readonly location: string;

  // Certificate Manager resources mapped by certificate key and domain
  private readonly dnsAuthorizations: DnsAuthorizationMap = {};
  private readonly cloudflareRecords: CloudflareRecordMap = {};
  private readonly certificates: CertificateMap = {};
  private certificateMap?: gcp.certificatemanager.CertificateMap;
  private readonly certificateMapEntries: CertificateMapEntryMap = {};

  /**
   * Name-first construction (v2 DX, preferred). Naming metadata
   * (`domain` / `location` / `prefix` / `naming`) and the certificate config
   * are folded into a single args object; the name is resolved into a
   * `CloudInfraMeta` internally with byte-identical naming (Frozen Contract F1).
   * Every child name derived from the full config (the `-${cert.name}`
   * certificate suffix and the sanitized `-${domain}`/`-${hostname}` suffixes),
   * the sanitizer, and the `deleteBeforeReplace`/`dependsOn` wiring are derived
   * exactly as the meta-first path — only meta acquisition is rerouted.
   */
  constructor(
    name: string,
    args: CloudInfraCertificateMapArgs,
    opts?: pulumi.ComponentResourceOptions
  );
  /**
   * @deprecated Meta-first construction. Prefer the name-first overload
   * `new CloudInfraCertificateMap(name, args, opts)`. Retained for backward
   * compatibility; produces identical resources.
   */
  constructor(
    meta: CloudInfraMeta,
    config: CloudInfraCertificateMapConfig,
    opts?: pulumi.ComponentResourceOptions
  );
  constructor(
    nameOrMeta: string | CloudInfraMeta,
    argsOrConfig: CloudInfraCertificateMapArgs | CloudInfraCertificateMapConfig,
    opts?: pulumi.ComponentResourceOptions
  ) {
    // Normalize both overloads to a (meta, config) pair. For the name-first
    // path, split the naming metadata out of the args; everything else is the
    // certificate config passed straight through (consumed UNCHANGED below —
    // every child name/suffix, the sanitizer and deleteBeforeReplace/dependsOn
    // are derived from it).
    let meta: CloudInfraMeta;
    let config: CloudInfraCertificateMapConfig;
    if (typeof nameOrMeta === 'string') {
      const { domain, location, prefix, naming, ...rest } =
        argsOrConfig as CloudInfraCertificateMapArgs;
      meta = resolveMeta(nameOrMeta, { domain, location, prefix, naming });
      config = rest;
    } else {
      meta = nameOrMeta;
      config = argsOrConfig as CloudInfraCertificateMapConfig;
    }

    // Validate + resolve the generated NAME (unchanged, F1) before super. The
    // child suffix conventions (`-domain`/`-cert.name`/`-hostname`, sanitized)
    // are preserved verbatim further down (F2).
    const resourceName = resolveCertificateMapName(meta);

    super(
      CERTIFICATE_MAP_TYPE,
      resourceName,
      resourceName,
      { domain: meta.getDomain() },
      opts
    );

    try {
      CloudInfraLogger.info('Initializing certificate map component', {
        component: 'certificatemap',
        operation: 'constructor',
      });

      this.meta = meta;
      this.config = config;

      // Initialize properties
      this.isGlobal = this.isGlobalDomain();
      this.location = this.determineLocation();
      this.inputName = meta.getInputName() as string;
      this.resourceName = resourceName;

      // Create resources after initialization
      this.createManagedCertificateResources();

      this.registerOutputs({
        certificateMap: this.certificateMap,
      });
    } catch (err) {
      throw new ResourceError(
        `Failed to create certificate ${meta.getName()}: ${err}`,
        'certificatemap',
        'constructor'
      );
    }
  }

  /**
   * Determines if the certificate should be global based on domain
   */
  private isGlobalDomain(): boolean {
    return this.meta.getDomain() === 'gl';
  }

  /**
   * Determines the location for the certificate resources
   */
  private determineLocation(): string {
    return this.isGlobal ? 'global' : deriveRegion(this.meta);
  }

  /**
   * Sanitizes resource names to comply with GCP naming requirements
   * - Converts to lowercase
   * - Replaces wildcards (*) with 'star'
   * - Replaces dots with hyphens
   * - Truncates to maximum allowed length
   */
  private sanitizeResourceName(name: string): string {
    if (!name || typeof name !== 'string') {
      throw new ValidationError(
        `Invalid resource name: expected string, got ${typeof name}`,
        'certificatemap',
        'sanitizeResourceName'
      );
    }
    const maxLength = resourceNamingConfig.certificateMaxLength;

    return name
      .toLowerCase()
      .replace(/\*/g, 'star') // Replace * with 'star' for wildcard domains
      .replace(/\./g, '-')
      .substring(0, maxLength);
  }

  /**
   * Gets location configuration for resources
   * Returns empty object for global resources, location object for regional
   */
  private getLocationConfig(): { location?: string } {
    return this.isGlobal ? {} : { location: this.location };
  }

  /**
   * Orchestrates the creation of all certificate resources
   */
  private createManagedCertificateResources(): void {
    this.createDnsAuthorizations();
    this.createCloudflareRecords();
    this.createManagedCertificate();

    if (this.isGlobal) {
      this.createCertificateMap();
      this.createCertificateMapEntries();
    }
  }

  /**
   * Creates DNS authorization resources for certificate validation
   */
  private createDnsAuthorizations(): void {
    CloudInfraLogger.info(
      'Creating DNS authorizations for certificate validation',
      {
        component: 'certificatemap',
        operation: 'createDnsAuthorizations',
      }
    );

    for (const cert of this.config.certificates) {
      this.dnsAuthorizations[cert.name] = {};

      for (const domain of cert.domains) {
        const authorization = this.createDnsAuthorization(cert.name, domain);
        this.dnsAuthorizations[cert.name][domain] = authorization;
      }
    }
  }

  /**
   * Creates a single DNS authorization resource
   */
  private createDnsAuthorization(
    certName: string,
    domain: string
  ): gcp.certificatemanager.DnsAuthorization {
    void certName; // Used for logging context but not in implementation
    const authorizationName = `${this.resourceName}-${this.sanitizeResourceName(domain)}`;
    const authorizationArgs: gcp.certificatemanager.DnsAuthorizationArgs = {
      domain: domain,
      project: this.config.project ?? this.meta.getGcpProject(),
      ...this.getLocationConfig(),
    };

    // certificatemanager.DnsAuthorization HAS a `labels` input → merge the org
    // label floor into its args via withLabels. FLAT (root) in v1 → childOpts()
    // aliases it back to its old root URN. PRESERVE the existing
    // deleteBeforeReplace.
    return new gcp.certificatemanager.DnsAuthorization(
      authorizationName,
      this.withLabels(authorizationArgs),
      this.childOpts({
        deleteBeforeReplace: true,
      })
    );
  }

  /**
   * Creates Cloudflare DNS records for certificate validation
   */
  private createCloudflareRecords(): void {
    for (const [certificateKey, authorizations] of Object.entries(
      this.dnsAuthorizations
    )) {
      this.cloudflareRecords[certificateKey] = {};

      for (const [domain, authorization] of Object.entries(authorizations)) {
        const record = this.createCloudflareRecord(domain, authorization);
        this.cloudflareRecords[certificateKey][domain] = record;
      }
    }
  }

  /**
   * Creates a single Cloudflare DNS record
   */
  private createCloudflareRecord(
    domain: string,
    authorization: gcp.certificatemanager.DnsAuthorization
  ): cloudflare.Record {
    const recordName = `${this.resourceName}-${this.sanitizeResourceName(domain)}`;

    // cloudflare.DnsRecord has NO `labels` input → args are NOT passed through
    // withLabels (it would inject an unsupported `labels` key and hard-error).
    // FLAT (root) in v1 → childOpts() aliases it back to its old root URN.
    return new cloudflare.DnsRecord(
      recordName,
      {
        zoneId: this.config.cloudflareZoneId,
        name: authorization.dnsResourceRecords.apply(
          records => records[0]?.name ?? ''
        ),
        type: 'CNAME',
        content: authorization.dnsResourceRecords.apply(
          records => records[0]?.data ?? ''
        ),
        ttl: 1, // Minimum TTL for validation records
        proxied: false,
      },
      this.childOpts()
    );
  }

  /**
   * Creates managed certificates with DNS validation
   */
  private createManagedCertificate(): void {
    CloudInfraLogger.info('Creating managed certificates with DNS validation', {
      component: 'certificatemap',
      operation: 'createManagedCertificate',
    });

    for (const cert of this.config.certificates) {
      const certificate = this.createCertificate(cert);
      this.certificates[cert.name] = certificate;
    }
  }

  /**
   * Creates a single certificate resource
   */
  private createCertificate(
    cert: CertificateDefinition
  ): gcp.certificatemanager.Certificate {
    const authorizations = this.dnsAuthorizations[cert.name];
    const authorizationRefs = Object.values(authorizations).map(
      auth => auth.id
    );
    const allDomains = this.getAllDomainsForCertificate(cert);

    const certificateArgs: gcp.certificatemanager.CertificateArgs = {
      managed: {
        domains: allDomains,
        dnsAuthorizations: authorizationRefs,
      },
      project: this.config.project ?? this.meta.getGcpProject(),
      ...this.getLocationConfig(),
    };

    // certificatemanager.Certificate HAS a `labels` input → merge org labels
    // into its args via withLabels. FLAT (root) in v1 → childOpts() aliases it
    // back to its old root URN. Child name suffix `-${cert.name}` preserved
    // verbatim (F2).
    return new gcp.certificatemanager.Certificate(
      `${this.resourceName}-${cert.name}`,
      this.withLabels(certificateArgs),
      this.childOpts()
    );
  }

  /**
   * Gets all domains (exact and wildcard) for a certificate
   */
  private getAllDomainsForCertificate(cert: CertificateDefinition): string[] {
    const exactDomains = cert.domains;

    if (!cert.wildcard) {
      return exactDomains;
    }

    const wildcardDomains = exactDomains.map(domain => `*.${domain}`);
    return [...exactDomains, ...wildcardDomains];
  }

  /**
   * Creates certificate map for global certificates
   */
  private createCertificateMap(): void {
    if (!this.isGlobal) {
      return;
    }

    CloudInfraLogger.info('Creating certificate map for global certificates', {
      component: 'certificatemap',
      operation: 'createCertificateMap',
    });

    // certificatemanager.CertificateMap HAS a `labels` input → merge org labels
    // into its args via withLabels. FLAT (root) in v1 → childOpts() aliases it
    // back to its old root URN. PRESERVE the existing deleteBeforeReplace.
    const certificateMapArgs: gcp.certificatemanager.CertificateMapArgs = {
      project: this.config.project ?? this.meta.getGcpProject(),
    };
    this.certificateMap = new gcp.certificatemanager.CertificateMap(
      this.resourceName,
      this.withLabels(certificateMapArgs),
      this.childOpts({
        deleteBeforeReplace: true,
      })
    );
  }

  /**
   * Creates certificate map entries for domain mapping
   */
  private createCertificateMapEntries(): void {
    if (!this.isGlobal || !this.certificateMap) {
      return;
    }

    for (const cert of this.config.certificates) {
      this.createMapEntriesForCertificate(cert);
    }
  }

  /**
   * Creates map entries for a single certificate
   */
  private createMapEntriesForCertificate(cert: CertificateDefinition): void {
    const certificate = this.certificates[cert.name];

    // Create entries for exact domains
    for (const domain of cert.domains) {
      this.createCertificateMapEntry(domain, certificate);
    }

    // Create entries for wildcard domains if enabled
    if (cert.wildcard) {
      for (const domain of cert.domains) {
        const wildcardDomain = `*.${domain}`;
        this.createCertificateMapEntry(wildcardDomain, certificate);
      }
    }
  }

  /**
   * Creates a single certificate map entry
   */
  private createCertificateMapEntry(
    hostname: string,
    certificate: gcp.certificatemanager.Certificate
  ): void {
    if (!this.certificateMap) {
      return;
    }

    const entryName = `${this.resourceName}-${this.sanitizeResourceName(hostname)}`;

    // certificatemanager.CertificateMapEntry HAS a `labels` input → merge org
    // labels into its args via withLabels. FLAT (root) in v1 → childOpts()
    // aliases it back to its old root URN. PRESERVE the existing dependsOn.
    // Child name suffix `-${hostname}` (sanitized) preserved verbatim (F2).
    const entryArgs: gcp.certificatemanager.CertificateMapEntryArgs = {
      map: this.certificateMap.name,
      certificates: [certificate.id],
      hostname: hostname,
      project: this.config.project ?? this.meta.getGcpProject(),
    };
    const entry = new gcp.certificatemanager.CertificateMapEntry(
      entryName,
      this.withLabels(entryArgs),
      this.childOpts({
        dependsOn: [certificate, this.certificateMap],
      })
    );

    this.certificateMapEntries[hostname] = entry;
  }

  /**
   * Get a specific managed certificate by key.
   * Can be used with certificateManagerCertificates field in both global and regional load balancers.
   * For global load balancers, you can alternatively use getCertificateMap() for certificate maps.
   *
   * @param key - The certificate key to retrieve
   * @returns The certificate resource if found, undefined otherwise
   */
  public getManagedCertificate(
    key: string
  ): gcp.certificatemanager.Certificate | undefined {
    return this.certificates[key];
  }

  /**
   * Get the certificate map resource for global load balancers.
   * Only available for global certificates (domain === 'gl').
   *
   * @returns The certificate map for global certificates
   * @throws {ValidationError} If called on a regional certificate
   */
  public getCertificateMap():
    | gcp.certificatemanager.CertificateMap
    | undefined {
    this.validateGlobalCertificateMapAccess();
    return this.certificateMap;
  }

  /**
   * Validates that certificate map access is allowed (only for global certificates)
   * @throws {ValidationError} If not a global certificate
   */
  private validateGlobalCertificateMapAccess(): void {
    if (!this.isGlobal) {
      throw new ValidationError(
        'Certificate maps are only available for global certificates. ' +
          'Regional certificates do not support certificate maps. ' +
          'Use getManagedCertificate() for regional load balancers instead.',
        'certificatemap',
        'validateGlobalCertificateMapAccess'
      );
    }
  }

  /**
   * Get all domains (including wildcards) from the actual certificate resources.
   *
   * @param certName - Optional. The name of the certificate to get domains for.
   *                   If not provided, returns domains from all certificates.
   * @returns Pulumi Output of array of all domains from the certificate(s), or undefined if certificate not found (when certName is specified)
   *
   * @example
   * // Get domains for a specific certificate
   * getDomains('api').apply(domains => console.log(domains))
   * // Outputs: ['api.example.com', '*.api.example.com']
   *
   * // Get all domains from all certificates
   * getDomains().apply(domains => console.log(domains))
   * // Outputs: ['api.example.com', '*.api.example.com', 'www.example.com', 'example.com']
   */
  public getDomains(certName?: string): pulumi.Output<string[]> | undefined {
    if (certName !== undefined) {
      return this.getDomainsForCertificate(certName);
    }

    return this.getAllDomains();
  }

  /**
   * Gets domains for a specific certificate
   */
  private getDomainsForCertificate(
    certName: string
  ): pulumi.Output<string[]> | undefined {
    const certificate = this.certificates[certName];

    if (!certificate) {
      return undefined;
    }

    return certificate.managed.apply(managed => managed?.domains ?? []);
  }

  /**
   * Gets all domains from all certificates
   */
  private getAllDomains(): pulumi.Output<string[]> {
    const allCertificateOutputs = Object.values(this.certificates).map(cert =>
      cert.managed.apply(managed => managed?.domains ?? [])
    );

    return pulumi
      .all(allCertificateOutputs)
      .apply(domainArrays => domainArrays.flat());
  }

  /**
   * Exports certificate map outputs to the CloudInfraOutput manager for cross-stack references.
   * Only exports certificate maps for global certificates.
   *
   * @param manager - The output manager to record resources to
   */
  public exportOutputs(manager: CloudInfraOutput): void {
    const grouping = this.inputName;

    // Only export certificate map for global certificates
    if (this.isGlobal && this.certificateMap) {
      manager.record(
        'gcp:certificatemanager:CertificateMap',
        grouping,
        this.meta,
        this.certificateMap
      );
    }
  }
}

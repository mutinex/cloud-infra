/**
 * Part of **`@mutinex/cloud-infra`** – internal Pulumi helpers.
 *
 * This file implements the core `CloudInfraMeta` class – a small utility that
 * converts a declarative {@link CloudInfraMetaInput | metadata input} into
 * predictable, policy-compliant values such as:
 *
 * • Fully qualified resource names
 * • Region / multi-region / dual-region codes
 * • Derived prefix / environment / project identifiers
 *
 * The class is runtime-only (no side-effects) and **does not** create any
 * cloud resources. It is safe to instantiate multiple times in a single
 * Pulumi program.
 */

import * as pulumi from '@pulumi/pulumi';
import { z } from 'zod';
import { CloudInfraLogger } from '../logging';
import {
  GcpMultiRegions,
  prefixLengthLimit,
  GcpRegion,
  GcpLocation,
} from './locations';
import {
  getRegionCode,
  getZoneCode,
  getDualRegionLocation,
  hash7,
  getDomainRegion,
  isZone,
  getRegionFromZone,
} from './locations';
import {
  CloudInfraMetaSchema,
  type CloudInfraMetaInput,
  type CloudInfraMetaData,
} from './schemas';
import { ValidationError } from '../errors';

/**
 * Manages resource metadata for cloud-infra components.
 *
 * This class is a foundational helper in `@mutinex/cloud-infra`. It takes a
 * declarative input object and provides consistent, policy-compliant metadata
 * for Pulumi components, such as resource names, locations, and environment
 * identifiers.
 *
 * It centralizes naming conventions and location logic, ensuring that all
 * resources across the infrastructure are created and tagged uniformly. The class
 * itself does not create any cloud resources; it is a runtime-only utility.
 *
 * @example
 * ```ts
 * import { CloudInfraMeta } from "@mutinex/cloud-infra/meta";
 *
 * const meta = new CloudInfraMeta({
 *   name: "my-app",
 *   domain: "au",
 * });
 *
 * export const resourceName = meta.getName(); // -> "your-pulumi-project-my-app-au"
 * export const resourceLocation = meta.getLocation(); // -> "australia-southeast1"
 * ```
 */
export class CloudInfraMeta {
  private readonly input: CloudInfraMetaData;
  private readonly finalPrefix: string;
  private readonly finalGcpProject: pulumi.Input<string>;

  /**
   * Creates a new CloudInfraMeta instance.
   *
   * The constructor validates the user-provided input, derives default values
   * for `prefix` from the Pulumi context if not explicitly provided, and prepares
   * the instance for use.
   *
   * @param userInput A {@link CloudInfraMetaInput} object.
   * @throws An error if the input fails validation against {@link CloudInfraMetaSchema},
   * or if the derived prefix from the Pulumi project name is too long.
   */
  constructor(input: CloudInfraMetaInput) {
    const derivedPrefix = pulumi.getProject();

    // Early validation for Pulumi project name length if using default.
    if (!input.prefix && derivedPrefix.length > prefixLengthLimit) {
      CloudInfraLogger.warn(
        `Derived prefix '${derivedPrefix}' exceeds limit of ${prefixLengthLimit} characters`,
        { component: 'meta', operation: 'validation' }
      );
      throw new ValidationError(
        `Derived prefix '${derivedPrefix}' (from stack) exceeds limit of ${prefixLengthLimit} characters. Please provide a 'prefix' in the component input or adjust the Pulumi project name.`
      );
    }

    // Full schema validation, including all other fields and constraints.
    try {
      this.input = CloudInfraMetaSchema.parse(input);
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new ValidationError(
          `Configuration validation failed: ${error.message}`
        );
      }
      throw error;
    }

    this.finalPrefix = this.input.prefix || derivedPrefix;

    // Use input parameter with fallback to Pulumi stack config.
    // The gcpProject can be either a string or a Pulumi Input<string>
    this.finalGcpProject =
      (this.input.gcpProject as pulumi.Input<string> | undefined) ||
      new pulumi.Config('gcp').require('project');
  }

  /**
   * Gets the default GCP region associated with a given domain.
   * This provides a consistent, opinionated mapping for core domains.
   *
   * @param domain The domain identifier (`au`, `us`, `gl`).
   * @returns The corresponding default GCP region string.
   * @internal
   */

  /**
   * Resolves and returns the GCP location for the resource.
   *
   * The location can be a single region, a multi-region, or a dual-region code
   * (like "nam4"). If no `location` was specified in the input, it falls back
   * to the default region for the specified `domain`.
   *
   * @returns The resolved GCP location string.
   * @see getRegion
   * @see getDualRegion
   */
  public getLocation(): GcpLocation {
    const { location, domain } = this.input;

    if (!location) {
      return getDomainRegion(domain);
    }

    if (Array.isArray(location)) {
      return getDualRegionLocation(location);
    }

    return location as GcpLocation;
  }

  /**
   * Returns the single GCP region for the resource.
   *
   * This method is a strict variant of `getLocation`. It ensures the resolved
   * location is a single region and will throw an error if the configuration
   * uses a multi-region or dual-region setup. If the location is a zone,
   * it extracts and returns the region part.
   *
   * @returns The single GCP region string.
   * @throws An error if the location is a multi-region or dual-region.
   */
  public getRegion(): GcpRegion {
    const { location, domain } = this.input;
    if (!location) {
      return getDomainRegion(domain);
    }
    if (Array.isArray(location)) {
      throw new Error(
        'Cannot use getRegion with dual regions. Use getDualRegion instead.'
      );
    }
    if ((GcpMultiRegions as readonly string[]).includes(location as string)) {
      throw new Error(
        'Cannot use getRegion with multi-regions. Use getLocation instead.'
      );
    }

    // Handle zone by extracting the region
    if (isZone(location as string)) {
      return getRegionFromZone(location as string) as GcpRegion;
    }

    return location as GcpRegion;
  }

  /**
   * Returns the dual-region configuration as an array of two strings.
   *
   * Use this method when you need to access the two specific regions that
   * make up a dual-region pair.
   *
   * @returns A string array containing the two GCP regions.
   * @throws An error if the location is not configured as a dual-region.
   */
  public getDualRegion(): string[] {
    const { location } = this.input;
    if (!location || !Array.isArray(location)) {
      throw new Error(
        'No dual region specified. Use getDualRegion only with dual region configurations.'
      );
    }
    return location;
  }

  /**
   * Returns the zone if the location is configured as a zone.
   *
   * @returns The GCP zone string if location is a zone
   * @throws An error if the location is not a zone
   */
  public getZone(): string {
    const { location } = this.input;
    if (!location || Array.isArray(location)) {
      throw new Error(
        'No zone specified. Use getZone only when location is a zone (e.g., "us-central1-a").'
      );
    }
    if ((GcpMultiRegions as readonly string[]).includes(location as string)) {
      throw new Error(
        'Location is a multi-region, not a zone. Use getLocation instead.'
      );
    }
    if (!isZone(location as string)) {
      throw new Error(
        `Location "${location}" is not a zone. Use getZone only with zone locations (e.g., "us-central1-a").`
      );
    }
    return location as string;
  }

  /**
   * Checks if the configured location is a zone.
   *
   * @returns True if the location is a zone, false otherwise
   */
  public isLocationZone(): boolean {
    const { location } = this.input;
    if (!location || Array.isArray(location)) {
      return false;
    }
    if ((GcpMultiRegions as readonly string[]).includes(location as string)) {
      return false;
    }
    return isZone(location as string);
  }

  /**
   * Internal helper that applies all naming rules and precedence logic.
   *
   * Rule precedence (highest → lowest):
   * 1. `preview` – returns `<prefix>-<name>-<hash7(preview)>`
   * 2. `omitDomain` or `omitLocation` + optional `omitPrefix`
   * 3. Standard `<prefix>-<name>-<location>` pattern
   *
   * @param name        The base name supplied by the caller (validated)
   * @param domain      Domain selected by the caller or defaulted ("au" | "us" | "gl")
   * @param location    Explicit location override (region / multi / dual)
   * @param preview     Short string identifying an ephemeral preview resource
   * @param omitPrefix  When `true`, suppresses the `<prefix>-` segment
   * @param omitDomain  When `true`, suppresses the `-<location>` suffix
   * @param omitLocation When `true`, suppresses the `-<location>` suffix
   * @param prefix      Final prefix derived from Pulumi project or explicit `prefix`
   * @returns           The fully-generated name, compliant with GCP naming rules
   * @internal
   */
  private generateName(name: string): string {
    const { domain, location, preview, omitPrefix, omitDomain, omitLocation } =
      this.input;

    if (preview) {
      return `${this.finalPrefix}-${name}-${hash7(preview)}`;
    }

    const shouldOmitLocation = omitDomain || omitLocation;
    const locationStr = this.resolveLocationString(location, domain as string);

    if (shouldOmitLocation && omitPrefix) {
      return name;
    }

    if (shouldOmitLocation) {
      return `${this.finalPrefix}-${name}`;
    }

    if (omitPrefix) {
      return `${name}-${locationStr}`;
    }

    return `${this.finalPrefix}-${name}-${locationStr}`;
  }

  /**
   * Internal helper for generating zonal resource names.
   * Similar to generateName but uses zone codes instead of region codes.
   *
   * @param name The base name supplied by the caller
   * @param zone The GCP zone (e.g., "australia-southeast1-a")
   * @returns The fully-generated zonal name
   * @internal
   */
  private generateZonalName(name: string, zone: string): string {
    const { preview, omitPrefix, omitDomain, omitLocation } = this.input;

    if (preview) {
      return `${this.finalPrefix}-${name}-${hash7(preview)}`;
    }

    const shouldOmitLocation = omitDomain || omitLocation;
    const zoneCode = getZoneCode(zone);

    if (shouldOmitLocation && omitPrefix) {
      return name;
    }

    if (shouldOmitLocation) {
      return `${this.finalPrefix}-${name}`;
    }

    if (omitPrefix) {
      return `${name}-${zoneCode}`;
    }

    return `${this.finalPrefix}-${name}-${zoneCode}`;
  }

  private resolveLocationString(
    location: string | string[] | undefined,
    domain: string
  ): string {
    if (!location) return domain;
    if (Array.isArray(location)) return getRegionCode(location);
    if ((GcpMultiRegions as readonly string[]).includes(location))
      return location;

    // Handle zones by using zone code, otherwise use region code
    if (isZone(location)) {
      return getZoneCode(location);
    }

    return getRegionCode(location);
  }
  /**
   * Generates and returns the resource name.
   *
   * This method should be used when the `name` input was a single string.
   * It constructs the name based on the instance's configuration (prefix,
   * location, preview flags, etc.).
   *
   * For zonal resources, pass the zone parameter to get zone-specific naming.
   *
   * @param zone Optional GCP zone for zonal resources (e.g., "australia-southeast1-a")
   * @returns The fully generated resource name.
   * @throws An error if the original `name` input was an array.
   * @see getNames
   */
  public getName(zone?: string): string {
    const { name } = this.input;
    if (Array.isArray(name)) {
      throw new Error(
        'Cannot use getName with array of names. Use getNames instead.'
      );
    }

    // If zone is provided, use zonal naming; otherwise use regional/global naming
    return zone ? this.generateZonalName(name, zone) : this.generateName(name);
  }

  /**
   * Generates and returns a map of resource names.
   *
   * This method handles both single and array `name` inputs. It returns a
   * record where keys are the original names and values are the fully
   * generated names. This is useful for bulk resource creation.
   *
   * @returns A `Record<string, string>` mapping original names to generated names.
   * @example
   * ```ts
   * const meta = new CloudInfraMeta({ name: ["db", "redis"], domain: "us" });
   * const names = meta.getNames();
   * // names -> { db: "my-proj-db-us", redis: "my-proj-redis-us" }
   * ```
   */
  public getNames(): Record<string, string> {
    const { name } = this.input;
    if (typeof name === 'string') {
      return { [name]: this.generateName(name) };
    }

    const result: Record<string, string> = {};
    for (const n of name) {
      result[n] = this.generateName(n);
    }
    return result;
  }

  /**
   * Returns the configured domain identifier.
   * @returns The domain string (e.g., "au", "us", "gl").
   */
  public getDomain(): string {
    return this.input.domain;
  }

  /**
   * Returns the final resource name prefix.
   *
   * This will be the value of the `prefix` input if it was provided,
   * otherwise it's the name of the Pulumi project.
   *
   * @returns The resolved prefix string.
   */
  public getPrefix(): string {
    return this.finalPrefix;
  }

  /**
   * Returns the GCP project ID.
   *
   * The project ID is sourced from the Pulumi GCP configuration (`gcp:project`).
   * This is a required configuration value for any stack using this component.
   *
   * @returns The GCP project ID as a Pulumi `Input<string>`.
   */
  public getGcpProject(): pulumi.Input<string> {
    return this.finalGcpProject;
  }

  /**
   * Returns whether naming rule validation should be bypassed.
   *
   * When true, components should skip strict naming validations like length limits.
   * This allows for edge cases where GCP's strict naming rules need to be overridden.
   *
   * @returns Boolean indicating if naming rules should be overridden
   */
  public shouldOverrideNamingRules(): boolean {
    return this.input.overrideNamingRules ?? false;
  }

  /**
   * Returns the name of the Pulumi project.
   * @returns The Pulumi project name string.
   * This method will be removed in a future version.
   */
  public getPulumiProject(): string {
    return this.finalPrefix;
  }

  /**
   * Returns the original `name` input.
   * @returns The original name or array of names provided to the constructor.
   */
  public getInputName(): string | string[] {
    return this.input.name;
  }

  /**
   * Returns the location as an array of one or more region strings.
   *
   * This method is particularly useful for components like `CloudInfraSecretVersion`
   * that need a list of regions for replication, regardless of whether the input
   * was a single region, zone, a dual-region, or a multi-region. If the location
   * is a zone, it extracts the region part.
   *
   * @returns An array of region strings.
   */
  public getMultiRegion(): string[] {
    const { location, domain } = this.input;
    if (Array.isArray(location)) {
      return location;
    }

    if (!location) {
      return [getDomainRegion(domain)];
    }

    // Handle zones by extracting the region
    if (isZone(location as string)) {
      return [getRegionFromZone(location as string)];
    }

    // For multi-region codes ("us", "eu", etc.) or single region strings, just wrap in array.
    return [location as string];
  }

  /**
   * Creates a new CloudInfraMeta instance with the same configuration as this instance,
   * but with the specified overrides applied. This is useful for creating derived
   * instances that share most configuration but differ in specific fields.
   *
   * @param overrides - Partial configuration to override in the new instance
   * @returns A new CloudInfraMeta instance with overrides applied
   * @example
   * ```ts
   * const parent = new CloudInfraMeta({ name: "app", domain: "us", omitPrefix: true });
   * const child = parent.derive({ name: "worker" });
   * // child has same domain, omitPrefix, etc. but different name
   * ```
   */
  public derive(overrides: Partial<CloudInfraMetaInput>): CloudInfraMeta {
    return new CloudInfraMeta({
      ...this.input,
      ...overrides,
    });
  }
}

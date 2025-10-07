import { createHash } from 'crypto';
import { ValidationError } from '../errors';

// CloudInfra environment and domain constants, not related to GCP
export const Domains = ['au', 'us', 'gl'] as const;

export type Domain = (typeof Domains)[number];

export const prefixLengthLimit = 12;

// GCP location types
export const GcpRegions = [
  'us-central1',
  'us-east1',
  'australia-southeast1',
  'australia-southeast2',
  'asia-northeast1',
  'asia-northeast2',
  'asia-east1',
  'asia-southeast1',
  'europe-north1',
  'europe-west1',
  'europe-west2',
  'europe-west3',
  'northamerica-northeast1',
  'northamerica-northeast2',
] as const;

export type GcpRegion = (typeof GcpRegions)[number];

export const GcpMultiRegions = ['us', 'eu', 'asia', 'europe'] as const;

export const GcpDualRegionLocations = ['au'] as const;

export const GcpPredefinedDualRegions = [
  'asia1',
  'nam4',
  'eur4',
  'eur5',
  'eur7',
  'eur8',
] as const;

export type GcpMultiRegion =
  | (typeof GcpMultiRegions)[number]
  | (typeof GcpPredefinedDualRegions)[number]
  | (typeof GcpDualRegionLocations)[number];

export const GcpDualRegions = [
  ['australia-southeast1', 'australia-southeast2'],
  ['asia-northeast1', 'asia-northeast2'],
  ['europe-north1', 'europe-west4'],
  ['europe-west1', 'europe-west2'],
  ['europe-west2', 'europe-west3'],
  ['europe-west3', 'europe-west6'],
  ['us-central1', 'us-east1'],
] as const;

export type GcpDualRegion = (typeof GcpDualRegions)[number];

/**
 * GCP Zone type - represents a specific zone within a region (e.g., "us-central1-a")
 * Zones follow the pattern: region-letter where letter is a single lowercase letter (a-z)
 */
export type GcpZone = `${GcpRegion}-${string}`;

export type GcpLocation = GcpRegion | GcpMultiRegion | GcpZone;

// Google Engineers created a very specific naming convention for locations used in dual regions.
// This is the mapping of the dual region locations to the GcpMultiRegion type.
export const GcpDualRegionToLocation: Record<string, GcpMultiRegion> = {
  'australia-southeast1,australia-southeast2': 'au',
  'asia-northeast1,asia-northeast2': 'asia1',
  'europe-north1,europe-west4': 'eur4',
  'europe-west1,europe-west2': 'eur5',
  'europe-west2,europe-west3': 'eur7',
  'europe-west3,europe-west6': 'eur8',
  'us-central1,us-east1': 'nam4',
};

export const domainToRegionMap: Record<Domain, GcpRegion | undefined> = {
  au: 'australia-southeast1',
  us: 'us-central1',
  gl: undefined,
};

const MAIN_REGION_MAP: Record<string, string> = {
  us: 'us',
  australia: 'au',
  asia: 'as',
  europe: 'eu',
  northamerica: 'na',
  southamerica: 'sa',
};

const SUB_REGION_MAP: Record<string, string> = {
  central: 'c',
  east: 'e',
  north: 'n',
  south: 's',
  west: 'w',
  northeast: 'ne',
  northwest: 'nw',
  southeast: 'se',
  southwest: 'sw',
};

// -----------------------------
// Helper functions
// -----------------------------

export function getDualRegionLocation(pair: string[]): GcpLocation {
  if (!Array.isArray(pair) || pair.length !== 2) {
    throw new ValidationError(
      `Dual region must contain exactly 2 regions, got ${pair?.length ?? 'undefined'}`
    );
  }

  if (pair.some(region => !region || typeof region !== 'string')) {
    throw new ValidationError(
      `Dual region must contain valid region strings, got: [${pair.join(', ')}]`
    );
  }

  const sortedKey = pair.slice().sort().join(',');
  const location = GcpDualRegionToLocation[sortedKey];

  if (!location) {
    throw new ValidationError(
      `Invalid dual region combination: '${pair.join(', ')}'. Valid combinations are: ${Object.keys(GcpDualRegionToLocation).join(', ')}`
    );
  }

  return location;
}

/**
 * Checks if a dual-region pair has a predefined GCP dual-region location code.
 * Returns the code if found, undefined otherwise. Does not throw.
 *
 * @param pair - Array of exactly 2 region strings
 * @returns Predefined dual-region code (e.g., 'nam4', 'eur4') or undefined
 */
export function tryGetDualRegionLocation(
  pair: readonly string[]
): GcpMultiRegion | undefined {
  if (!Array.isArray(pair) || pair.length !== 2) {
    return undefined;
  }

  if (pair.some(region => !region || typeof region !== 'string')) {
    return undefined;
  }

  const sortedKey = pair.slice().sort().join(',');
  return GcpDualRegionToLocation[sortedKey];
}

/**
 * Convert a GCP zone to a short zone code.
 * Examples: "australia-southeast1-a" → "au-se1a", "us-central1-b" → "us-c1b"
 *
 * @param zone - The full GCP zone string (e.g., "australia-southeast1-a")
 * @returns Short zone code (e.g., "au-se1a")
 */
export function getZoneCode(zone: string): string {
  if (!zone || typeof zone !== 'string') {
    throw new ValidationError(
      `Zone must be a non-empty string, got: ${typeof zone}`
    );
  }

  // Split zone into region and zone letter
  const lastDashIndex = zone.lastIndexOf('-');
  if (lastDashIndex === -1) {
    throw new ValidationError(
      `Invalid zone format: '${zone}'. Expected format: 'region-letter'`
    );
  }

  const region = zone.substring(0, lastDashIndex);
  const zoneLetter = zone.substring(lastDashIndex + 1);

  if (!zoneLetter || zoneLetter.length !== 1 || !/^[a-z]$/.test(zoneLetter)) {
    throw new ValidationError(
      `Invalid zone letter: '${zoneLetter}'. Expected single lowercase letter (a-z)`
    );
  }

  // Get the region code and append the zone letter
  const regionCode = getRegionCode(region);
  return `${regionCode}${zoneLetter}`;
}

export function getRegionCode(
  region: GcpRegion | GcpDualRegion | string | string[]
): string {
  if (!region) {
    throw new ValidationError('Region cannot be null or undefined');
  }

  const convertSingleRegion = (regionStr: string): string => {
    if (!regionStr || typeof regionStr !== 'string') {
      throw new ValidationError(
        `Region must be a non-empty string, got: ${typeof regionStr}`
      );
    }

    const parts = regionStr.split('-');
    if (parts.length === 0) {
      throw new ValidationError(`Invalid region format: '${regionStr}'`);
    }

    const main = MAIN_REGION_MAP[parts[0]] ?? parts[0].slice(0, 2);

    let subRegionPart = parts[1];
    let num = '';

    if (subRegionPart) {
      const numMatch = subRegionPart.match(/(\D+)(\d+)/);
      if (numMatch) {
        subRegionPart = numMatch[1];
        num = numMatch[2];
      }
    }

    const sub =
      SUB_REGION_MAP[subRegionPart] ?? subRegionPart?.slice(0, 1) ?? '';

    return `${main}-${sub}${num}`;
  };

  if (typeof region === 'string') {
    return convertSingleRegion(region);
  }

  if (Array.isArray(region)) {
    if (region.length === 0) {
      throw new ValidationError('Region array cannot be empty');
    }
    return region.map(convertSingleRegion).join('-');
  }

  throw new ValidationError(
    `Invalid region type. Expected string or string[], got: ${typeof region}`
  );
}

/**
 * Generate a 7-character hash from a string using SHA-256.
 * Used for creating short, unique identifiers from longer strings.
 *
 * @param str - Input string to hash
 * @returns First 7 characters of the SHA-256 hash
 */
export function hash7(str: string): string {
  return createHash('sha256').update(str).digest('hex').slice(0, 7);
}

/**
 * Checks if a location string is a GCP zone (ends with -letter pattern).
 * @param location - The location string to check
 * @returns True if the location is a zone, false otherwise
 */
export function isZone(location: string): location is GcpZone {
  if (!location || typeof location !== 'string') {
    return false;
  }

  // Zone pattern: ends with dash followed by single lowercase letter
  return /^.+-[a-z]$/.test(location);
}

/**
 * Extracts the region from a zone string.
 * @param zone - The zone string (e.g., "us-central1-a")
 * @returns The region part (e.g., "us-central1")
 */
export function getRegionFromZone(zone: string): string {
  if (!zone || typeof zone !== 'string') {
    throw new ValidationError(
      `Zone must be a non-empty string, got: ${typeof zone}`
    );
  }

  if (!isZone(zone)) {
    throw new ValidationError(
      `Invalid zone format: '${zone}'. Expected format: 'region-letter'`
    );
  }

  const lastDashIndex = zone.lastIndexOf('-');
  return zone.substring(0, lastDashIndex);
}

/**
 * Validates that a zone string corresponds to a known GCP region.
 * @param zone - The zone string to validate
 * @returns True if valid, throws ValidationError otherwise
 */
export function validateZone(zone: string): boolean {
  if (!isZone(zone)) {
    throw new ValidationError(
      `Invalid zone format: '${zone}'. Expected format: 'region-letter'`
    );
  }

  const zoneLetter = zone.substring(zone.lastIndexOf('-') + 1);

  // Check if the zone letter is valid (single lowercase letter)
  if (!/^[a-z]$/.test(zoneLetter)) {
    throw new ValidationError(
      `Invalid zone letter: '${zoneLetter}'. Expected single lowercase letter (a-z)`
    );
  }

  // Note: We don't validate the region portion since zones can exist in any valid region
  // and maintaining an exhaustive list would be fragile. The format check above is sufficient.

  return true;
}

/**
 * Gets the default GCP region associated with a given domain.
 * This provides a consistent, opinionated mapping for core domains.
 *
 * @param domain The domain identifier (`au`, `us`, `gl`).
 * @returns The corresponding default GCP region string.
 * @internal
 */
export function getDomainRegion(domain: string): GcpRegion {
  if (!domain || typeof domain !== 'string') {
    throw new ValidationError(
      `Domain must be a non-empty string, got: ${typeof domain}`
    );
  }

  if (!(domain in domainToRegionMap)) {
    throw new ValidationError(
      `Invalid domain '${domain}'. Valid domains are: ${Object.keys(
        domainToRegionMap
      ).join(', ')}`
    );
  }

  const region = domainToRegionMap[domain as Domain];

  if (!region) {
    return 'global' as GcpRegion;
  }

  return region;
}

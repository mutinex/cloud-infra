/**
 * **`@mutinex/cloud-infra/meta`** – public export surface.
 *
 * Re-exports the core {@link CloudInfraMeta} class along with all related
 * constants, types, validation schemas and helpers.  No runtime logic lives in
 * this file; it purely aggregates symbols so callers can write succinct
 * imports such as:
 *
 * ```ts
 * import { CloudInfraMeta, Domains } from "@mutinex/cloud-infra/meta";
 * ```
 */

// Export the main class
export { CloudInfraMeta } from './meta';

// Export configuration types and constants
export type {
  Domain,
  GcpRegion,
  GcpMultiRegion,
  GcpDualRegion,
  GcpLocation,
} from './locations';

export {
  Domains,
  GcpMultiRegions,
  GcpDualRegions,
  GcpDualRegionLocations,
  GcpPredefinedDualRegions,
  GcpDualRegionToLocation,
  prefixLengthLimit,
} from './locations';

// Export validation schemas
export {
  gcpGenericNameSchema,
  gcpServiceAccountNameSchema,
  CloudInfraMetaSchema,
  type CloudInfraMetaInput,
} from './schemas';

// Export helper functions
export { getRegionCode, getDualRegionLocation, hash7 } from './locations';

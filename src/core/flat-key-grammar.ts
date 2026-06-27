/**
 * @module @mutinex/cloud-infra/core/flat-key-grammar
 *
 * NEUTRAL home for the flat-output KEY GRAMMAR shared by BOTH layers:
 *   - the PRODUCER (`core/output/output-manager.ts` — composes keys), and
 *   - the CONSUMER (`core/reference/reference-manager.ts` — parses keys).
 *
 * It deliberately depends only on `core/meta` (locations), never on `output`
 * or `reference`, so neither layer has to reach across into the other to share
 * the grammar. `core/reference/config.ts` re-exports these symbols for
 * backwards compatibility (so the public export surface is unchanged).
 *
 * The grammar is `<domain>.<service>[.<region>].<name>.<field>`:
 *   - `<service>` is the short alias derived from a full Pulumi type
 *     (see {@link serviceAliasMap} / {@link getServiceAlias});
 *   - `<region>` is the short region segment (see {@link deriveRegionSegment}),
 *     present iff the recorded entry carries a `location`.
 */
import { CloudInfraMeta } from './meta';
import {
  GcpMultiRegions,
  GcpPredefinedDualRegions,
  GcpDualRegionLocations,
  getRegionCode,
} from './meta/locations';

/**
 * The single-character separator used to compose a flat-output KEY
 * (`<domain>.<service>[.<region>].<name>.<field>`). The producer composes keys
 * with it and the consumer parses keys by it, so it is the single source of
 * truth for both layers.
 */
export const FLAT_KEY_SEPARATOR = '.';

/**
 * The canonical `<full Pulumi type token> → <short service alias>` table used
 * to build the `service` segment of a flat-output key.
 *
 * This is the FORWARD (type → alias) direction; `reference/config.resourceTypeMap`
 * is the REVERSE (alias → type) direction the consumer reader uses to resolve a
 * `{ type }` disambiguator. Both directions are intentionally kept consistent
 * (e.g. `sa` ⇄ `gcp:serviceaccount:Account`).
 *
 * EVERY type token emitted by any component's `exportOutputs()`/`record()` MUST
 * have an EXPLICIT entry here. A coverage test
 * (`output/__tests__/alias-coverage.test.ts`) fails if any emitted type is
 * missing, so a newly added resource type cannot silently fall back to the
 * deterministic {@link deriveServiceAliasFallback}.
 */
export const serviceAliasMap: Record<string, string> = {
  // Identity / IAM
  'gcp:serviceaccount:Account': 'sa',
  'gcp:projects:IAMCustomRole': 'role',
  'gcp:organizations:IAMCustomRole': 'orgrole',
  'gcp:iam:WorkloadIdentityPool': 'wip',
  'gcp:iam:WorkloadIdentityPoolProvider': 'wipprovider',
  'gcp:privilegedaccessmanager:Entitlement': 'entitlement',
  // Org hierarchy
  'gcp:organizations:Project': 'project',
  'gcp:organizations:Folder': 'folder',
  'gcp:tags:TagKey': 'tagkey',
  'gcp:tags:TagValue': 'tag',
  // Storage / data
  'gcp:storage:Bucket': 'bucket',
  'gcp:secretmanager:Secret': 'secret',
  'gcp:secretmanager:SecretVersion': 'secretversion',
  'gcp:secretmanager:RegionalSecret': 'regionalsecret',
  'gcp:secretmanager:RegionalSecretVersion': 'regionalsecretversion',
  'gcp:artifactregistry:Repository': 'repo',
  // SQL
  'gcp:sql:DatabaseInstance': 'sqlinstance',
  'gcp:sql:Database': 'sqldb',
  'gcp:sql:User': 'sqluser',
  // Networking
  'gcp:compute:Network': 'network',
  'gcp:compute:Subnetwork': 'subnet',
  'gcp:vpcaccess:Connector': 'connector',
  'gcp:compute:Address': 'address',
  'gcp:compute:GlobalAddress': 'globaladdress',
  'gcp:compute:Route': 'route',
  'gcp:compute:Router': 'router',
  'gcp:compute:RouterNat': 'routernat',
  'gcp:servicenetworking:Connection': 'psaconnection',
  // Load balancing
  'gcp:compute:BackendService': 'backend',
  'gcp:compute:RegionBackendService': 'regionbackend',
  'gcp:compute:HealthCheck': 'healthcheck',
  'gcp:certificatemanager:CertificateMap': 'certmap',
  // Compute / serverless
  'gcp:compute:Instance': 'instance',
  'gcp:cloudrunv2:Service': 'run',
  'gcp:cloudrunv2:Job': 'job',
};

/**
 * Deterministic fallback alias for a type token that has no EXPLICIT entry in
 * {@link serviceAliasMap}: the lowercased final token of a `gcp:x/y:Z` string
 * (the segment after the last `:`). e.g. `gcp:foo:BarBaz` → `barbaz`.
 *
 * This exists so the producer never throws on an unmapped type, but the
 * alias-coverage test ensures it is NEVER reached for a type any component
 * actually emits — new types must be added to {@link serviceAliasMap} explicitly.
 */
export function deriveServiceAliasFallback(type: string): string {
  const lastColon = type.lastIndexOf(':');
  const lastToken = lastColon === -1 ? type : type.slice(lastColon + 1);
  return lastToken.toLowerCase();
}

/**
 * Resolves the short `service` segment for a flat-output key from a full Pulumi
 * type token: the explicit {@link serviceAliasMap} entry when present, else the
 * deterministic {@link deriveServiceAliasFallback}.
 */
export function getServiceAlias(type: string): string {
  return serviceAliasMap[type] ?? deriveServiceAliasFallback(type);
}

/**
 * The set of GCP location tokens that are multi-/dual-region and so are used
 * VERBATIM (rather than shortened) in the `<region>` key segment.
 */
const MULTI_REGION_TOKENS: ReadonlySet<string> = new Set<string>([
  ...GcpMultiRegions,
  ...GcpPredefinedDualRegions,
  ...GcpDualRegionLocations,
]);

/**
 * Derives the deterministic short `region` segment for a flat-output key from
 * a {@link CloudInfraMeta}, mirroring the `<region>` naming used elsewhere:
 *
 *   - single region (e.g. `us-central1`) → `getRegionCode` → `us-c1`;
 *   - multi-region code (e.g. `us`, `eu`, `asia`) → the token verbatim;
 *   - dual-region (array, e.g. `[australia-southeast1, australia-southeast2]`)
 *     → `meta.getLocation()` resolves it to its canonical multi/dual-region
 *     token (e.g. `au`, `nam4`) which is used verbatim.
 *
 * The choice for multi/dual regions (use the canonical GCP location token
 * rather than concatenating per-region codes) is documented in
 * `core/output/README.md`; it is deterministic and collision-stable.
 */
export function deriveRegionSegment(meta: CloudInfraMeta): string {
  // `getLocation()` collapses a dual-region array to its canonical token, so it
  // returns a single string: a single region, a multi-region code, or a
  // dual-region code.
  const location = meta.getLocation();
  // Multi-region / dual-region canonical token (e.g. "us", "eu", "au", "nam4")
  // is used verbatim; only a true single region is shortened via getRegionCode.
  if (MULTI_REGION_TOKENS.has(location)) {
    return location;
  }
  return getRegionCode(location);
}

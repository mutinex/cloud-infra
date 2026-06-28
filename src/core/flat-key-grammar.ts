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
 * The POSITIVE charset every ADDRESSING segment (`domain`, `service`, `region`,
 * `name`) of a flat-output key must match: letters, digits, `_` or `-` only —
 * no separator, whitespace, control or unicode characters. Enforced by
 * {@link composeFlatKey}; see its docs for why.
 */
const SAFE_SEGMENT = /^[A-Za-z0-9_-]+$/;

/**
 * The addressing parts of a flat-output key, EXCLUSIVE of the trailing
 * `<field>`. Together they form the key PREFIX
 * `<domain>.<service>[.<region>].<name>` that the producer composes once per
 * recorded resource and the consumer groups keys by. `region` is present iff
 * the resource is regional.
 */
export interface FlatKeyAddress {
  domain: string;
  service: string;
  region?: string;
  name: string;
}

/**
 * One fully-parsed flat-output key: its {@link FlatKeyAddress}, the trailing
 * `<field>`, and the addressing `prefix` (`<domain>.<service>[.<region>].<name>`
 * — the key with its final `.<field>` segment removed) the consumer groups by.
 * Produced by {@link parseFlatKey}.
 */
export interface ParsedFlatKey extends FlatKeyAddress {
  field: string;
  prefix: string;
}

/**
 * Validates one ADDRESSING segment of a flat-output key against
 * {@link SAFE_SEGMENT}, THROWING a descriptive error if it is unsafe.
 *
 * HARD INVARIANT: the key grammar is positional and the consumer
 * ({@link parseFlatKey}) parses segments by count — so each addressing segment
 * must be a SAFE token (no separator, whitespace, control, or unicode), or the
 * round-trip silently corrupts (a dotted name would shift the region/name split;
 * whitespace/unicode breaks a plain `requireOutput("<key>")`). This is the
 * single producer-side gate; both the prefix segments and (defensively) the
 * field pass through here.
 */
function assertSafeSegment(segName: string, segValue: string): void {
  if (!SAFE_SEGMENT.test(segValue)) {
    throw new Error(
      `Invalid flat-output ${segName} segment '${segValue}': it must match ` +
        `${SAFE_SEGMENT} (letters, digits, '_' or '-' only) — no separator ` +
        `'${FLAT_KEY_SEPARATOR}', whitespace, control or unicode characters. ` +
        `The flat-output key grammar ` +
        `'<domain>.<service>[.<region>].<name>.<field>' is positional and is ` +
        `read by a plain stack-output lookup, so an unsafe segment would ` +
        `corrupt the consumer's parse.`
    );
  }
}

/**
 * Composes the key PREFIX `<domain>.<service>[.<region>].<name>` from a
 * {@link FlatKeyAddress}, validating every addressing segment first. This is the
 * single place the producer turns addressing parts into a string — the consumer
 * parses the same shape back via {@link parseFlatKey}.
 */
export function composeFlatKeyPrefix(address: FlatKeyAddress): string {
  const sep = FLAT_KEY_SEPARATOR;
  // `domain` (au/us/gl) and `service` (alias `[a-z0-9]+`) are already safe by
  // construction; `name` (grouping key) is user-supplied and `region` is
  // defensive — validate all four so an unsafe token throws here rather than
  // emitting an un-parseable key.
  assertSafeSegment('domain', address.domain);
  assertSafeSegment('service', address.service);
  if (address.region !== undefined) {
    assertSafeSegment('region', address.region);
  }
  assertSafeSegment('name (grouping key)', address.name);
  return address.region !== undefined
    ? `${address.domain}${sep}${address.service}${sep}${address.region}${sep}${address.name}`
    : `${address.domain}${sep}${address.service}${sep}${address.name}`;
}

/**
 * Composes a full flat-output key `<domain>.<service>[.<region>].<name>.<field>`
 * by appending `<field>` to the validated {@link composeFlatKeyPrefix}. The
 * single producer-side composer; the consumer reverses it with
 * {@link parseFlatKey}.
 */
export function composeFlatKey(address: FlatKeyAddress, field: string): string {
  return `${composeFlatKeyPrefix(address)}${FLAT_KEY_SEPARATOR}${field}`;
}

/**
 * Parses a flat-output key string back into its {@link ParsedFlatKey} parts, or
 * returns `undefined` for a malformed key (wrong segment arity) the consumer
 * should skip.
 *
 * The grammar is positional and parsed from BOTH ends so it tolerates neither
 * dots in the `name`/`service` nor an unknown region: segment[0] is the domain,
 * the LAST segment is the field, the SECOND-TO-LAST is the name, segment[1] is
 * the service, and a 5-segment key carries the region at segment[2] (a
 * 4-segment key has no region). Keys with any other segment count are malformed
 * and yield `undefined`. The single consumer-side parser; the producer composes
 * the same shape with {@link composeFlatKey}.
 */
export function parseFlatKey(key: string): ParsedFlatKey | undefined {
  const seg = key.split(FLAT_KEY_SEPARATOR);
  // Need at least domain.service.name.field (4) — optionally +region (5).
  if (seg.length !== 4 && seg.length !== 5) {
    return undefined;
  }
  return {
    domain: seg[0],
    service: seg[1],
    region: seg.length === 5 ? seg[2] : undefined,
    name: seg[seg.length - 2],
    field: seg[seg.length - 1],
    // The addressing prefix is the key minus its final `.<field>` segment —
    // a pure re-join of the SAME split, so grouping never re-validates or
    // re-throws on already-emitted wire data.
    prefix: seg.slice(0, seg.length - 1).join(FLAT_KEY_SEPARATOR),
  };
}

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
 * The REVERSE of {@link serviceAliasMap}: short service alias → full Pulumi
 * type. Built ONCE at module load, DERIVED from the single authored
 * {@link serviceAliasMap} so the canonical alias→type direction can never drift
 * from the type→alias direction. The alias→type direction MUST be unambiguous
 * (each service segment maps to exactly one Pulumi type) — if two types ever
 * shared an alias the reverse would be lossy, so we THROW at load rather than
 * silently pick one. (The alias-coverage test independently pins alias
 * uniqueness; this is the runtime backstop the consumer relies on.)
 *
 * `reference/config.resourceTypeMap` is BUILT from this map (plus a few extra
 * user-facing convenience aliases), so there is no longer a hand-maintained
 * second copy of the canonical alias⇄type pairs to keep in sync.
 */
export const serviceAliasToType: Record<string, string> = (() => {
  const reverse: Record<string, string> = {};
  for (const [type, alias] of Object.entries(serviceAliasMap)) {
    const prior = reverse[alias];
    if (prior !== undefined && prior !== type) {
      throw new Error(
        `Ambiguous flat-output service alias '${alias}': mapped from both ` +
          `'${prior}' and '${type}'. The alias→type reverse lookup must be ` +
          `one-to-one; give each type a distinct alias in serviceAliasMap.`
      );
    }
    reverse[alias] = type;
  }
  return reverse;
})();

/**
 * Reverse-maps a flat-key `<service>` segment (a short alias) back to the FULL
 * Pulumi type that produced it, or `undefined` if the alias has no explicit
 * mapping (e.g. it came from {@link deriveServiceAliasFallback}). Used by the
 * consumer's flat `all()` to surface the full Pulumi type under `type` for
 * cross-mode parity with the nested wire.
 */
export function getTypeForServiceAlias(alias: string): string | undefined {
  return serviceAliasToType[alias];
}

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
 *
 * When falling back, THROW if the derived alias collides with an alias already
 * assigned to a DIFFERENT type in {@link serviceAliasMap}: an unmapped future
 * type must not silently shadow an explicit alias (e.g. `sa`/`run`) and so be
 * read back as the wrong resource. The fix is to add an explicit, distinct
 * entry for the new type to {@link serviceAliasMap}.
 */
export function getServiceAlias(type: string): string {
  const explicit = serviceAliasMap[type];
  if (explicit !== undefined) {
    return explicit;
  }
  const derived = deriveServiceAliasFallback(type);
  // The derived alias must be unique against every EXPLICIT alias. If some
  // other (different) type already owns this alias, the fallback would compose
  // the same `service` segment and silently collide with that type on read.
  for (const [mappedType, mappedAlias] of Object.entries(serviceAliasMap)) {
    if (mappedAlias === derived && mappedType !== type) {
      throw new Error(
        `Flat-output service alias collision: the unmapped type '${type}' ` +
          `derives the fallback alias '${derived}', which is already the ` +
          `explicit alias of '${mappedType}'. An unmapped type must not silently ` +
          `shadow another type's service segment — add an EXPLICIT, distinct ` +
          `entry for '${type}' to serviceAliasMap.`
      );
    }
  }
  return derived;
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

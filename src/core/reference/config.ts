import { referenceConfig } from '../../config';
import { serviceAliasToType } from '../flat-key-grammar';

export const getDefaultOutputKey = () => referenceConfig.defaultOutputKey;

export const serviceAccountAliases = [
  'serviceaccount',
  'sa',
  'account',
] as const;

export const bucketAliases = ['gcs', 'bucket'] as const;
export const roleAliases = ['role'] as const;
export const orgRoleAliases = ['orgrole'] as const;
export const networkAliases = ['network'] as const;
export const subnetAliases = ['subnet'] as const;
export const connectorAliases = ['connector'] as const;
export const projectAliases = ['project'] as const;
export const tagAliases = ['tag'] as const;
export const folderAliases = ['folder'] as const;
export const cloudRunAliases = ['cloudrun'] as const;

/**
 * EXTRA user-facing aliases for the `{ type }` disambiguator that are NOT the
 * canonical wire `<service>` segment. The canonical alias⇄type pairs are
 * DERIVED from the single authored `serviceAliasMap` (via `serviceAliasToType`)
 * and spread into {@link resourceTypeMap} below — only these convenience
 * synonyms remain authored here, so the two layers can no longer drift on the
 * canonical pairs.
 *
 * (e.g. the canonical segment for `gcp:storage:Bucket` is `bucket`; `gcs` is an
 * additional human-friendly synonym the reader also accepts.)
 */
const EXTRA_TYPE_ALIASES: Record<string, string> = {
  // Targets defined BY REFERENCE to the canonical reverse map, NOT by restated
  // string literals: a rename of the underlying type in `serviceAliasMap`
  // propagates here automatically, and a removed/renamed canonical alias makes
  // the lookup `undefined` so the collision guard below throws loud rather than
  // silently pointing a synonym at a stale type.
  gcs: serviceAliasToType['bucket'],
  serviceaccount: serviceAliasToType['sa'],
  account: serviceAliasToType['sa'],
  pam: serviceAliasToType['entitlement'],
  cloudrun: serviceAliasToType['run'],
};

/**
 * Short resource-type alias → full Pulumi type, used to normalize a caller's
 * `{ type }` disambiguator. BUILT from the single source of truth: every
 * canonical `<service>` segment (the reverse of `serviceAliasMap`) plus the
 * {@link EXTRA_TYPE_ALIASES} convenience synonyms. There is no longer a
 * hand-maintained second table restating the canonical alias⇄type pairs, so the
 * producer's key segment and the consumer's `{ type }` filter cannot diverge.
 *
 * Built ONCE at module load with a THROW-ON-COLLISION guard (mirroring the
 * {@link serviceAliasToType} IIFE): if an {@link EXTRA_TYPE_ALIASES} synonym ever
 * collides with a DIFFERENT canonical alias→type pair, OR references a canonical
 * alias that no longer resolves (a rename left a dangling `undefined`), we fail
 * loud at load rather than silently shadowing or emitting a broken mapping.
 */
export const resourceTypeMap: Record<string, string> = (() => {
  const map: Record<string, string> = { ...serviceAliasToType };
  for (const [alias, type] of Object.entries(EXTRA_TYPE_ALIASES)) {
    if (type === undefined) {
      throw new Error(
        `EXTRA_TYPE_ALIASES synonym '${alias}' references a canonical service ` +
          `alias that no longer resolves in serviceAliasToType (likely a type ` +
          `rename). Update the reference in reference/config.ts.`
      );
    }
    const prior = map[alias];
    if (prior !== undefined && prior !== type) {
      throw new Error(
        `Ambiguous resourceTypeMap alias '${alias}': mapped to both '${prior}' ` +
          `and '${type}'. A '{ type }' disambiguator alias must resolve to ` +
          `exactly one Pulumi type; remove the conflicting entry.`
      );
    }
    map[alias] = type;
  }
  return map;
})();

/**
 * The flat-output KEY GRAMMAR now lives in the NEUTRAL module
 * `core/flat-key-grammar` so the producer (`output`) and consumer (`reference`)
 * can share it without an `output → reference` dependency. Re-exported here so
 * the historical `reference/config` import path and the public export surface
 * (`reference/index.ts`, `src/index.ts`) are unchanged.
 */
export {
  FLAT_KEY_SEPARATOR,
  serviceAliasMap,
  deriveServiceAliasFallback,
  getServiceAlias,
  getTypeForServiceAlias,
  deriveRegionSegment,
  composeFlatKey,
  composeFlatKeyPrefix,
  parseFlatKey,
} from '../flat-key-grammar';
export type { FlatKeyAddress, ParsedFlatKey } from '../flat-key-grammar';

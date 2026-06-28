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
  gcs: 'gcp:storage:Bucket',
  serviceaccount: 'gcp:serviceaccount:Account',
  account: 'gcp:serviceaccount:Account',
  pam: 'gcp:privilegedaccessmanager:Entitlement',
  cloudrun: 'gcp:cloudrunv2:Service',
};

/**
 * Short resource-type alias → full Pulumi type, used to normalize a caller's
 * `{ type }` disambiguator. BUILT from the single source of truth: every
 * canonical `<service>` segment (the reverse of `serviceAliasMap`) plus the
 * {@link EXTRA_TYPE_ALIASES} convenience synonyms. There is no longer a
 * hand-maintained second table restating the canonical alias⇄type pairs, so the
 * producer's key segment and the consumer's `{ type }` filter cannot diverge.
 */
export const resourceTypeMap: Record<string, string> = {
  ...serviceAliasToType,
  ...EXTRA_TYPE_ALIASES,
};

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

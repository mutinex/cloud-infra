/**
 * Alias-coverage guard for the flat-output `service` segment.
 *
 * The flat KEYED MAP builds its `<service>` segment from `serviceAliasMap`
 * (type → short alias). A deterministic fallback (`deriveServiceAliasFallback`)
 * exists so the producer never throws on an unmapped type — but EVERY type
 * token a component actually emits via `record()`/`exportOutputs()` MUST have an
 * EXPLICIT entry in `serviceAliasMap`, so a new resource type can never silently
 * fall back.
 *
 * EMITTED_TYPE_TOKENS below is the hand-maintained enumeration of every first
 * argument passed to `CloudInfraOutput.record(...)` across `src/components` and
 * `src/organization` (some are built dynamically — see notes). If a new
 * component emits a new type, ADD it both here AND to `serviceAliasMap`; this
 * test fails until the explicit alias exists.
 */
import { describe, it, expect } from 'vitest';
import {
  serviceAliasMap,
  resourceTypeMap,
  getServiceAlias,
  deriveServiceAliasFallback,
} from '../../reference/config';

/**
 * Every distinct Pulumi type token emitted by a `record()` call in the repo.
 * Keep alphabetised for easy diffing. Dynamic emitters are annotated.
 */
const EMITTED_TYPE_TOKENS: readonly string[] = [
  'gcp:artifactregistry:Repository',
  'gcp:certificatemanager:CertificateMap',
  'gcp:cloudrunv2:Job',
  'gcp:cloudrunv2:Service',
  'gcp:compute:Address',
  'gcp:compute:BackendService',
  'gcp:compute:GlobalAddress',
  'gcp:compute:HealthCheck',
  'gcp:compute:Instance',
  'gcp:compute:Network',
  'gcp:compute:RegionBackendService',
  'gcp:compute:Route',
  'gcp:compute:Router',
  'gcp:compute:RouterNat',
  'gcp:compute:Subnetwork',
  'gcp:iam:WorkloadIdentityPool',
  'gcp:iam:WorkloadIdentityPoolProvider',
  // role/index.ts emits one of these two depending on whether an orgId is set.
  'gcp:organizations:IAMCustomRole',
  'gcp:projects:IAMCustomRole',
  'gcp:organizations:Folder',
  'gcp:organizations:Project',
  'gcp:privilegedaccessmanager:Entitlement',
  'gcp:secretmanager:RegionalSecret',
  'gcp:secretmanager:RegionalSecretVersion',
  'gcp:secretmanager:Secret',
  'gcp:secretmanager:SecretVersion',
  'gcp:serviceaccount:Account',
  'gcp:servicenetworking:Connection',
  'gcp:sql:Database',
  'gcp:sql:DatabaseInstance',
  'gcp:sql:User',
  'gcp:storage:Bucket',
  'gcp:tags:TagKey',
  'gcp:tags:TagValue',
  'gcp:vpcaccess:Connector',
];

describe('flat-output service alias coverage', () => {
  it('every emitted type token has an EXPLICIT serviceAliasMap entry', () => {
    const missing = EMITTED_TYPE_TOKENS.filter(
      t => serviceAliasMap[t] === undefined
    );
    expect(
      missing,
      `These emitted type tokens lack an explicit alias in serviceAliasMap ` +
        `(they would silently use deriveServiceAliasFallback): ${missing.join(', ')}`
    ).toEqual([]);
  });

  it('aliases are unique (no two types share a service segment)', () => {
    const seen = new Map<string, string>();
    for (const [type, alias] of Object.entries(serviceAliasMap)) {
      const prior = seen.get(alias);
      expect(
        prior,
        `alias '${alias}' is shared by '${prior}' and '${type}'`
      ).toBeUndefined();
      seen.set(alias, type);
    }
  });

  it('every alias is a safe key segment (lowercase, no separator/dots/colons)', () => {
    for (const alias of Object.values(serviceAliasMap)) {
      expect(alias).toMatch(/^[a-z0-9]+$/);
    }
  });

  it('the fallback derives the lowercased final type token', () => {
    expect(deriveServiceAliasFallback('gcp:foo:BarBaz')).toBe('barbaz');
    expect(deriveServiceAliasFallback('gcp:x:Y')).toBe('y');
    expect(deriveServiceAliasFallback('nocolon')).toBe('nocolon');
  });

  it('the two alias tables are consistent: every resourceTypeMap alias resolves to the SAME service segment as its full type', () => {
    // The consumer's flat `{ type }` disambiguator resolves a short alias
    // through `resourceTypeMap` (alias → full type) and then `getServiceAlias`
    // (full type → service segment). Pin that this round-trip agrees with
    // resolving the alias string directly, so the producer's key segment and the
    // consumer's filter can never silently diverge for any mapped alias.
    for (const [alias, fullType] of Object.entries(resourceTypeMap)) {
      const viaFullType = getServiceAlias(fullType);
      const viaAliasString = getServiceAlias(
        resourceTypeMap[alias.toLowerCase()] ?? alias
      );
      expect(
        viaAliasString,
        `alias '${alias}' (→ ${fullType}) must resolve to service '${viaFullType}'`
      ).toBe(viaFullType);
    }
  });
});

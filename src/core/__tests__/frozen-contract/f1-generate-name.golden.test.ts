/**
 * Frozen Contract F1 — `generateName` / `generateZonalName` golden table.
 *
 * See `docs/v2-redesign-notes.md` §2 (F1) and §5 (Move 3). `generateName()` is
 * NOT just a Pulumi logical name — its output flows into PHYSICAL cloud identity
 * (service-account `accountId` → email, bucket physical name, secret `secretId`,
 * SQL `name`). Changing the byte output changes cloud identity → replacement /
 * data loss. The 3-boolean naming matrix has 5 reachable formulas plus the zonal
 * variant; ALL must stay byte-identical through the v2 rework.
 *
 * This file pins the EXACT output string for every formula branch, the region-
 * code / zone-code / dual-region tables that feed them, and the
 * documented-but-easy-to-regress nuances (array-location → joined region code,
 * NOT the `nam4`-style predefined code; multi-region literal passthrough; the
 * instance zonal `-a` default; preview hash stability).
 *
 * If a refactor changes any value here, a real `pulumi preview` against a
 * consuming stack would show a destroy/recreate (Frozen Contract violation).
 *
 * These are pure-function assertions (no Pulumi runtime / mocks needed): the
 * formulas are deterministic given `gcpProject` + explicit `prefix`, so no
 * Date.now/random and no stack/project context dependency.
 */
import { describe, it, expect } from 'vitest';
import { CloudInfraMeta } from '../../meta';
import {
  getRegionCode,
  getZoneCode,
  getDualRegionLocation,
  hash7,
  GcpRegions,
  GcpDualRegionToLocation,
} from '../../meta/locations';

const PREFIX = 'p';
const GCP = 'test-project';

/** Build a meta with a fixed prefix + project so output is context-free. */
function meta(input: Record<string, unknown>): CloudInfraMeta {
  return new CloudInfraMeta({
    prefix: PREFIX,
    gcpProject: GCP,
    ...input,
  } as never);
}

describe('F1 — generateName: the 5 formula branches (byte-identical golden table)', () => {
  // [description, metaInput, expectedName]
  const cases: ReadonlyArray<[string, Record<string, unknown>, string]> = [
    // ── Formula 1: standard `prefix-name-loc` ──────────────────────────────
    ['standard au (domain → default region literal)', { name: 'api', domain: 'au' }, 'p-api-au'],
    ['standard us', { name: 'db', domain: 'us' }, 'p-db-us'],
    ['standard gl', { name: 'api', domain: 'gl' }, 'p-api-gl'],
    ['standard with explicit region → region code', { name: 'cache', domain: 'au', location: 'australia-southeast2' }, 'p-cache-au-se2'],
    ['standard with complex region (na-ne1)', { name: 'api', domain: 'au', location: 'northamerica-northeast1' }, 'p-api-na-ne1'],

    // ── Formula 2: `omitDomain`-only → `prefix-name` ───────────────────────
    // NB: `omitLocation` is NOT a separate branch — the source folds it into
    // `shouldOmitLocation = omitDomain || omitLocation` (meta.ts:275,309), so it
    // is an alias of `omitDomain` and produces the identical shape. Both pinned
    // so a refactor that splits them apart (changing one's output) is caught.
    ['omitDomain only → prefix-name', { name: 'global-svc', domain: 'au', omitDomain: true }, 'p-global-svc'],
    ['omitLocation only → prefix-name (alias of omitDomain)', { name: 'global-svc', domain: 'au', omitLocation: true }, 'p-global-svc'],

    // ── Formula 3: `omitPrefix`-only → `name-loc` ──────────────────────────
    ['omitPrefix only → name-loc', { name: 'shared-api', domain: 'us', omitPrefix: true }, 'shared-api-us'],

    // ── Formula 4: both-omit → `name` ──────────────────────────────────────
    ['omitPrefix + omitDomain → name', { name: 'standalone', domain: 'au', omitPrefix: true, omitDomain: true }, 'standalone'],

    // ── Formula 5: `preview` → `prefix-name-hash7(preview)` ────────────────
    // (preview wins over every omit/location branch; hash is SHA-256[:7].)
    ['preview wins → prefix-name-hash7', { name: 'api', domain: 'au', preview: 'pr-123' }, `p-api-${hash7('pr-123')}`],
    ['preview wins even with omitPrefix', { name: 'api', domain: 'au', preview: 'pr-123', omitPrefix: true }, `p-api-${hash7('pr-123')}`],

    // ── Multi-region literal passthrough (NOT a region code) ───────────────
    ['multi-region us literal', { name: 's', domain: 'au', location: 'us' }, 'p-s-us'],
    ['multi-region eu literal', { name: 's', domain: 'au', location: 'eu' }, 'p-s-eu'],

    // ── Dual-region ARRAY → JOINED region code (NOT the nam4-style code) ────
    // Load-bearing nuance: getName([...]) joins per-region codes; the predefined
    // `nam4`/`eur4`/`asia1` codes come from getLocation()/getDualRegionLocation,
    // NOT from the name. A refactor that "helpfully" collapses the array to nam4
    // in the NAME would change cloud identity → this pins against it.
    ['dual-region array (us pair) → joined code', { name: 's', domain: 'au', location: ['us-central1', 'us-east1'] }, 'p-s-us-c1-us-e1'],
    ['dual-region array (au pair) → joined code', { name: 's', domain: 'au', location: ['australia-southeast1', 'australia-southeast2'] }, 'p-s-au-se1-au-se2'],
  ];

  it.each(cases)('%s', (_desc, input, expected) => {
    expect(meta(input).getName()).toBe(expected);
  });
});

describe('F1 — generateZonalName: zonal `-a` default + zone codes', () => {
  it('getName(zone) appends the zone code, incl. the instance `<region>-a` default', () => {
    // This is exactly what CloudInfraComputeInstance computes for its DEFAULT
    // zone: `${deriveRegion(meta)}-a` (instance/index.ts:80) → for domain au the
    // region is australia-southeast1 → zone australia-southeast1-a → code au-se1a.
    // So the instance physical NAME (F1) is pinned by this assertion.
    expect(
      meta({ name: 's', domain: 'au' }).getName('australia-southeast1-a')
    ).toBe('p-s-au-se1a');
  });

  it('zone-as-location resolves through generateName → zone code', () => {
    expect(meta({ name: 's', domain: 'au', location: 'us-central1-b' }).getName()).toBe(
      'p-s-us-c1b'
    );
  });

  it('zonal preview branch still wins (prefix-name-hash7)', () => {
    expect(
      meta({ name: 's', domain: 'au', preview: 'pr-1' }).getName('us-central1-a')
    ).toBe(`p-s-${hash7('pr-1')}`);
  });

  it('zonal omit branches mirror generateName', () => {
    expect(
      meta({ name: 's', domain: 'au', omitDomain: true }).getName('us-central1-a')
    ).toBe('p-s');
    expect(
      meta({ name: 's', domain: 'au', omitPrefix: true }).getName('us-central1-a')
    ).toBe('s-us-c1a');
    expect(
      meta({ name: 's', domain: 'au', omitPrefix: true, omitDomain: true }).getName(
        'us-central1-a'
      )
    ).toBe('s');
  });
});

describe('F1 — region-code table (getRegionCode) is frozen', () => {
  // Every supported single region → its frozen short code. A region-code drift
  // renames every resource in that region.
  const table: ReadonlyArray<[string, string]> = [
    ['us-central1', 'us-c1'],
    ['us-east1', 'us-e1'],
    ['australia-southeast1', 'au-se1'],
    ['australia-southeast2', 'au-se2'],
    ['asia-northeast1', 'as-ne1'],
    ['asia-northeast2', 'as-ne2'],
    ['asia-east1', 'as-e1'],
    ['asia-southeast1', 'as-se1'],
    ['europe-north1', 'eu-n1'],
    ['europe-west1', 'eu-w1'],
    ['europe-west2', 'eu-w2'],
    ['europe-west3', 'eu-w3'],
    ['northamerica-northeast1', 'na-ne1'],
    ['northamerica-northeast2', 'na-ne2'],
  ];

  it.each(table)('getRegionCode(%s) === %s', (region, code) => {
    expect(getRegionCode(region)).toBe(code);
  });

  it('is a BIJECTION with GcpRegions (new region must be pinned; removed region must be unpinned)', () => {
    // Forward: every GcpRegions entry has a pinned code (a new region forces a
    // conscious freeze here). Reverse + length: no stale pinned row survives a
    // region removal. Together this makes the table a 1:1 mirror of GcpRegions.
    const covered = new Set(table.map(([r]) => r));
    for (const r of GcpRegions) {
      expect(covered.has(r)).toBe(true);
    }
    expect(table.length).toBe(GcpRegions.length);
  });
});

describe('F1 — zone-code table (getZoneCode) is frozen', () => {
  const table: ReadonlyArray<[string, string]> = [
    ['australia-southeast1-a', 'au-se1a'],
    ['us-central1-b', 'us-c1b'],
    ['europe-west2-c', 'eu-w2c'],
    ['northamerica-northeast1-a', 'na-ne1a'],
  ];
  it.each(table)('getZoneCode(%s) === %s', (zone, code) => {
    expect(getZoneCode(zone)).toBe(code);
  });
});

describe('F1 — predefined dual-region location table (getDualRegionLocation) is frozen', () => {
  // These are the Google-defined dual-region codes returned by getLocation() /
  // getDualRegionLocation() (used e.g. as the bucket `location`). Order of the
  // pair must not matter (it is sorted internally).
  const table: ReadonlyArray<[[string, string], string]> = [
    [['us-central1', 'us-east1'], 'nam4'],
    [['europe-north1', 'europe-west4'], 'eur4'],
    [['europe-west1', 'europe-west2'], 'eur5'],
    [['europe-west2', 'europe-west3'], 'eur7'],
    [['europe-west3', 'europe-west6'], 'eur8'],
    [['asia-northeast1', 'asia-northeast2'], 'asia1'],
    [['australia-southeast1', 'australia-southeast2'], 'au'],
  ];
  it.each(table)('getDualRegionLocation(%j) === %s', (pair, code) => {
    expect(getDualRegionLocation([...pair])).toBe(code);
    // sort-insensitive
    expect(getDualRegionLocation([...pair].reverse())).toBe(code);
  });

  it('covers every predefined dual-region in GcpDualRegionToLocation (no silent gap)', () => {
    // A new predefined dual-region code added to the source map forces a
    // conscious freeze here rather than being silently unpinned.
    expect(table.length).toBe(Object.keys(GcpDualRegionToLocation).length);
  });
});

describe('F1 — hash7 is a stable SHA-256[:7] (preview-mode determinism)', () => {
  it('pins a known hash value (no Date.now/random)', () => {
    // Frozen: SHA-256("pr-123")[:7]. If the hash algorithm/slice changes, every
    // preview-mode resource name changes.
    expect(hash7('pr-123')).toBe('e004542');
    expect(hash7('pr-123')).toMatch(/^[a-f0-9]{7}$/);
  });
  it('is deterministic across calls', () => {
    expect(hash7('same-input')).toBe(hash7('same-input'));
  });
});

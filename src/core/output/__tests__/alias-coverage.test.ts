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
 * This guard is FAIL-CLOSED: the emitted type-token set is DERIVED from source
 * at test time (not a hand-maintained list) by scanning every emitter file
 * under `src/components` and `src/organization` for the `'gcp:…:…'` type-string
 * literals they pass to `record()`/`exportOutputs()`. A newly-emitted type added
 * to neither `serviceAliasMap` nor the source automatically appears here and
 * fails the suite — there is no list to forget to update.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
// Import the GRAMMAR from its neutral home (not via reference/config) so this
// producer-side test does not reach into the consumer layer. `resourceTypeMap`
// is a genuine consumer-layer symbol and stays sourced from reference/config.
import {
  serviceAliasMap,
  getServiceAlias,
  deriveServiceAliasFallback,
} from '../../flat-key-grammar';
import { resourceTypeMap } from '../../reference/config';

// Repo root, derived from this test file's location
// (src/core/output/__tests__/ -> up 4).
const REPO_ROOT = path.resolve(__dirname, '../../../..');
const EMITTER_DIRS = [
  path.join(REPO_ROOT, 'src', 'components'),
  path.join(REPO_ROOT, 'src', 'organization'),
];

/** Recursively list every non-test `.ts` file under a directory. */
function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__') continue;
      out.push(...listSourceFiles(full));
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Derives the set of emitted Pulumi type tokens from source. A file is an
 * EMITTER if it calls `record(` or defines/uses `exportOutputs`; from each
 * emitter file we collect every `'gcp:<segment>:<segment>'` type-string literal.
 * Type tokens in these emitter files are exclusively the first argument of a
 * `record()` call (sometimes via a local `const resourceType = … ? 'gcp:…' :
 * 'gcp:…'` ternary), so scanning the literals is precise AND fail-closed: a new
 * emitted type introduces a new literal that must be mapped.
 */
function deriveEmittedTypeTokens(): string[] {
  const tokens = new Set<string>();
  // Match a `gcp:<module>:<Type>` string literal. The middle/last segments use a
  // permissive `[^':]+` charset (not just alnum) so module-path spellings such
  // as `gcp:compute/v1:X` cannot silently slip past the scan and re-open the
  // silent-fallback path this guard closes.
  const literalRe = /'(gcp:[^':]+:[^':]+)'/g;
  for (const dir of EMITTER_DIRS) {
    for (const file of listSourceFiles(dir)) {
      const src = fs.readFileSync(file, 'utf8');
      if (!src.includes('.record(') && !src.includes('exportOutputs')) {
        continue;
      }
      for (const m of src.matchAll(literalRe)) {
        tokens.add(m[1]);
      }
    }
  }
  return Array.from(tokens).sort();
}

const EMITTED_TYPE_TOKENS: readonly string[] = deriveEmittedTypeTokens();

describe('flat-output service alias coverage', () => {
  it('derived the emitted type-token set from source (non-empty)', () => {
    // Sanity: the scan must actually find emitters. A zero count would make the
    // coverage assertion vacuously pass (NOT fail-closed) — guard against a
    // moved directory / broken glob silently disabling the check.
    expect(EMITTED_TYPE_TOKENS.length).toBeGreaterThan(20);
  });

  it('every emitted type token has an EXPLICIT serviceAliasMap entry', () => {
    const missing = EMITTED_TYPE_TOKENS.filter(
      t => serviceAliasMap[t] === undefined
    );
    expect(
      missing,
      `These emitted type tokens (DERIVED from src/components + ` +
        `src/organization) lack an explicit alias in serviceAliasMap ` +
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

  it('getServiceAlias THROWS when an unmapped type derives an alias already owned by an explicit type', () => {
    // `gcp:foo:Sa` is not in serviceAliasMap, so it falls back to the lowercased
    // final token 'sa' — which is the EXPLICIT alias of gcp:serviceaccount:Account.
    // Allowing it would let the unmapped type silently shadow the SA service
    // segment and be read back as a service account. It must throw instead.
    expect(() => getServiceAlias('gcp:foo:Sa')).toThrow(
      /service alias collision/
    );
    expect(() => getServiceAlias('gcp:foo:Sa')).toThrow(
      /already the explicit alias of 'gcp:serviceaccount:Account'/
    );
    // A genuinely novel fallback (no collision with any explicit alias) still
    // resolves silently — the guard fires ONLY on a real collision.
    expect(getServiceAlias('gcp:foo:BrandNewWidget')).toBe('brandnewwidget');
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

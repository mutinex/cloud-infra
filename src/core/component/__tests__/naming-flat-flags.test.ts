/**
 * Wave 2.2 — flat naming flags ≡ the deprecated `NamingMode` discriminator.
 *
 * Task 2 added `omitPrefix` / `omitLocation` / `preview` directly onto
 * {@link NamingArgs}, mapping through the SAME `namingModeToFlags` path the
 * (now `@deprecated`) `naming: NamingMode` alias used. This is an ADDITIVE,
 * resource-neutral DX change: for every one of the five `generateName`
 * formulas, the flat-flag input must resolve to a `CloudInfraMeta` whose
 * `getName()` is byte-identical to the equivalent `naming` mode (Frozen
 * Contract F1). It also pins the documented nuances:
 *   - `preview` wins over `omit*` (matches meta.ts);
 *   - when both a flat flag and `naming` are supplied, the flat flag wins;
 *   - the `string[]` (bulk) overload honours the flat flags identically.
 *
 * If any assertion here drifts, a real `pulumi preview` against a consuming
 * stack would show destroy/recreate — i.e. the flat-flag sugar would NOT be a
 * pure alias.
 */
import { describe, it, expect } from 'vitest';
import * as pulumi from '@pulumi/pulumi';
import { resolveMeta, type NamingArgs } from '../naming';

// CloudInfraMeta derives its default prefix from the GCP project; pin it so the
// resolved names are deterministic and context-free (same pattern as the
// component namefirst tests).
pulumi.runtime.setConfig('gcp:project', 'p');

const PREFIX = 'p';

/** Resolve a single name-first meta with a fixed prefix; return `getName()`. */
function one(n: string, args: Partial<NamingArgs>): string {
  return resolveMeta(n, { prefix: PREFIX, ...args } as NamingArgs).getName();
}

/** Resolve a bulk name-first meta; return the `getNames()` record. */
function many(
  n: string[],
  args: Partial<NamingArgs>
): Record<string, string> {
  return resolveMeta(n, { prefix: PREFIX, ...args } as NamingArgs).getNames();
}

describe('flat naming flags resolve identically to the NamingMode alias (F1)', () => {
  // [desc, flatFlags, equivalent NamingMode, name, expected getName()]
  const cases: ReadonlyArray<
    [string, Partial<NamingArgs>, NamingArgs['naming'], string, string]
  > = [
    ['conventional (no flags)', {}, 'conventional', 'api', 'p-api-au'],
    ['omitLocation → prefix-name', { omitLocation: true }, 'no-location', 'api', 'p-api'],
    ['omitPrefix → name-loc', { omitPrefix: true }, 'no-prefix', 'api', 'api-au'],
    [
      'omitPrefix+omitLocation → name',
      { omitPrefix: true, omitLocation: true },
      'literal',
      'api',
      'api',
    ],
  ];

  it.each(cases)('%s', (_desc, flat, mode, n, expected) => {
    const viaFlat = one(n, { domain: 'au', ...flat });
    const viaMode = one(n, { domain: 'au', naming: mode });
    expect(viaFlat).toBe(expected);
    // Byte-identical to the deprecated NamingMode alias.
    expect(viaFlat).toBe(viaMode);
  });

  it('preview flat flag === { preview } mode (and wins over omit flags)', () => {
    const viaFlat = one('api', { domain: 'au', preview: 'pr-123' });
    const viaMode = one('api', { domain: 'au', naming: { preview: 'pr-123' } });
    expect(viaFlat).toBe(viaMode);

    // preview wins over omit flags (matches meta.ts) — same as the mode path.
    expect(one('api', { domain: 'au', preview: 'pr-123', omitPrefix: true })).toBe(
      viaFlat
    );
  });

  it('flat flag wins when both a flat flag and `naming` are supplied (additive)', () => {
    // naming says conventional (no omit), flat flag says omitLocation → flat wins.
    expect(one('api', { domain: 'au', naming: 'conventional', omitLocation: true })).toBe(
      'p-api'
    );
  });

  it('flat flag wins SUBTRACTIVELY (explicit false overrides a naming-mode omit)', () => {
    // naming: 'no-prefix' would set omitPrefix:true (→ name-loc), but an
    // explicit omitPrefix:false must override it back to the conventional form.
    // Guards the `!== undefined` merge (a truthiness check would miss this).
    expect(one('api', { domain: 'au', naming: 'no-prefix', omitPrefix: false })).toBe(
      'p-api-au'
    );
  });

  it('bulk (string[]) overload honours flat flags identically to the mode', () => {
    const viaFlat = many(['api', 'db'], { domain: 'au', omitPrefix: true });
    const viaMode = many(['api', 'db'], { domain: 'au', naming: 'no-prefix' });
    expect(viaFlat).toEqual({ api: 'api-au', db: 'db-au' });
    expect(viaFlat).toEqual(viaMode);
  });
});

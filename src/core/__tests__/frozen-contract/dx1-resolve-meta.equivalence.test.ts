/**
 * DX1 — name-first `resolveMeta` equivalence (Frozen Contract F1).
 *
 * The v2 name-first surface (`resolveMeta(name, { naming })`) must map each of
 * the 5 `NamingMode` values onto a `CloudInfraMeta` whose `generateName` output
 * is BYTE-IDENTICAL to constructing `CloudInfraMeta` directly with the
 * equivalent v1 flags. If these drift, name-first construction would change
 * physical cloud identity vs the meta-first path (F1 violation).
 *
 * Pure-function assertions (no Pulumi runtime/mocks): output is deterministic
 * given an explicit `prefix` + `gcpProject`, mirroring f1-generate-name.
 */
import * as pulumi from '@pulumi/pulumi';
// `gcp:project` config must be set before any CloudInfraMeta is built — its
// constructor reads it for the project id (irrelevant to generateName, but
// required so the meta-first/name-first metas construct without throwing).
pulumi.runtime.setConfig('gcp:project', 'test-project');

import { describe, it, expect } from 'vitest';
import { CloudInfraMeta } from '../../meta';
import { hash7 } from '../../meta/locations';
import { resolveMeta, type NamingArgs } from '../../component';

const PREFIX = 'p';
const NAME = 'api';
const DOMAIN = 'au';

/** Meta-first baseline with a fixed prefix (context-free generateName output). */
function baseline(flags: Record<string, unknown>): CloudInfraMeta {
  return new CloudInfraMeta({
    name: NAME,
    domain: DOMAIN,
    prefix: PREFIX,
    ...flags,
  } as never);
}

/** Name-first via resolveMeta with the same fixed prefix. */
function nameFirst(naming: NamingArgs['naming']): CloudInfraMeta {
  return resolveMeta(NAME, {
    domain: DOMAIN,
    prefix: PREFIX,
    naming,
  });
}

describe('DX1 — resolveMeta maps all 5 NamingModes to the exact generateName output', () => {
  // [mode, equivalent v1 flags, expected name]
  const cases: ReadonlyArray<
    [string, NamingArgs['naming'], Record<string, unknown>, string]
  > = [
    ['conventional (default) → prefix-name-loc', 'conventional', {}, 'p-api-au'],
    ['undefined naming defaults to conventional', undefined, {}, 'p-api-au'],
    [
      'no-location → prefix-name',
      'no-location',
      { omitLocation: true },
      'p-api',
    ],
    ['no-prefix → name-loc', 'no-prefix', { omitPrefix: true }, 'api-au'],
    [
      'literal → name',
      'literal',
      { omitPrefix: true, omitLocation: true },
      'api',
    ],
    [
      'preview → prefix-name-hash7',
      { preview: 'pr-123' },
      { preview: 'pr-123' },
      `p-api-${hash7('pr-123')}`,
    ],
  ];

  it.each(cases)(
    '%s',
    (_desc, mode, equivalentFlags, expected) => {
      const viaNameFirst = nameFirst(mode).getName();
      const viaMetaFirst = baseline(equivalentFlags).getName();
      // (a) name-first equals the hardcoded golden output, AND
      expect(viaNameFirst).toBe(expected);
      // (b) name-first is byte-identical to the equivalent meta-first build.
      expect(viaNameFirst).toBe(viaMetaFirst);
    }
  );
});

describe('DX1 — resolveMeta passthrough + non-default naming args', () => {
  it('returns a CloudInfraMeta unchanged when given a meta (meta-first overload)', () => {
    const meta = baseline({});
    expect(resolveMeta(meta)).toBe(meta);
    // The ignored config arg does not alter the returned meta.
    expect(resolveMeta(meta, { forceDestroy: true })).toBe(meta);
  });

  it('forwards explicit location through to the region code (conventional)', () => {
    const viaNameFirst = resolveMeta(NAME, {
      domain: DOMAIN,
      prefix: PREFIX,
      location: 'australia-southeast2',
    }).getName();
    const viaMetaFirst = baseline({
      location: 'australia-southeast2',
    }).getName();
    expect(viaNameFirst).toBe('p-api-au-se2');
    expect(viaNameFirst).toBe(viaMetaFirst);
  });

  it('forwards dual-region array → joined region code (NOT nam4)', () => {
    const viaNameFirst = resolveMeta(NAME, {
      domain: DOMAIN,
      prefix: PREFIX,
      location: ['us-central1', 'us-east1'],
    }).getName();
    const viaMetaFirst = baseline({
      location: ['us-central1', 'us-east1'],
    }).getName();
    expect(viaNameFirst).toBe('p-api-us-c1-us-e1');
    expect(viaNameFirst).toBe(viaMetaFirst);
  });
});

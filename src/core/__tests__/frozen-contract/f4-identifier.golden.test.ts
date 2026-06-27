/**
 * Frozen Contract F4 — `getIdentifier` string formats.
 *
 * See `docs/v2-redesign-notes.md` §2 (F4). `CloudInfraReference.getIdentifier`
 * and `ReferenceWithoutDomain.getIdentifier` are PURE string builders whose
 * output is consumed by downstream IAM URNs / dependent-resource names. If the
 * byte output drifts, every consumer that derived a name from it would see a
 * destroy/recreate against its referencing stack (Frozen Contract violation).
 *
 *   - CloudInfraReference.getIdentifier (reference-manager.ts:274-280)
 *       → `${proj}-${name}-${env}-${domain}`
 *   - ReferenceWithoutDomain.getIdentifier (reference-without-domain.ts:161-166)
 *       → `${proj}-${name}-${env}`
 *
 * Both derive `proj`/`env` from `stack.split('/')` (index 1 / index 2 of the
 * `org/project/env` triple) and the domain one additionally appends the
 * configured `domain`. The fallbacks (`unkproj` / `unkenv`) are unreachable in
 * practice because the constructor rejects any `stack` not in 3-part form, but
 * the index arithmetic is still pinned here for the valid case.
 *
 * Both reference classes build a real `pulumi.StackReference` in their
 * constructor (via `getStackRef`), which requires `pulumi.runtime.setMocks`.
 * `getIdentifier` itself touches no Pulumi runtime — it is deterministic given
 * the constructor inputs (no Date.now/random). An explicit `outputKey` is passed
 * to `CloudInfraReference` so it does not fall back to the `cloudInfra:defaultOutputKey`
 * Pulumi config lookup (which would throw outside a real stack); the key is
 * irrelevant to `getIdentifier`.
 */
import { describe, it, expect } from 'vitest';
import * as pulumi from '@pulumi/pulumi';

// Mocks MUST be set before importing anything that builds a StackReference.
pulumi.runtime.setMocks(
  {
    newResource(args: pulumi.runtime.MockResourceArgs): {
      id: string;
      state: Record<string, unknown>;
    } {
      return { id: `${args.name}-id`, state: args.inputs };
    },
    call(): Record<string, unknown> {
      return {};
    },
  },
  'project',
  'stack'
);

import { CloudInfraReference } from '../../reference/reference-manager';
import { ReferenceWithoutDomain } from '../../reference/reference-without-domain';

const STACK = 'mutiny-group/foundation/prd';
// Explicit outputKey → avoids the `cloudInfra:defaultOutputKey` config lookup.
const OUTPUT_KEY = 'cloud-infra';

describe('F4 — CloudInfraReference.getIdentifier → `${proj}-${name}-${env}-${domain}`', () => {
  // [description, stack, domain, name, expected]
  const cases: ReadonlyArray<[string, string, string, string, string]> = [
    [
      'standard au',
      'mutiny-group/foundation/prd',
      'au',
      'default-vpc',
      'foundation-default-vpc-prd-au',
    ],
    [
      'standard us',
      'mutiny-group/foundation/prd',
      'us',
      'default-vpc',
      'foundation-default-vpc-prd-us',
    ],
    [
      'dev env / different project',
      'mutiny-group/dataos/dev',
      'gl',
      'my-app',
      'dataos-my-app-dev-gl',
    ],
  ];

  it.each(cases)('%s', (_desc, stack, domain, name, expected) => {
    const ref = new CloudInfraReference({ stack, domain, outputKey: OUTPUT_KEY });
    expect(ref.getIdentifier(name)).toBe(expected);
  });

  it('proj is stack[1] and env is stack[2] (index arithmetic is frozen)', () => {
    // org=A, project=B, env=C → identifier uses B (proj) and C (env), NOT org.
    const ref = new CloudInfraReference({
      stack: 'A/B/C',
      domain: 'au',
      outputKey: OUTPUT_KEY,
    });
    expect(ref.getIdentifier('n')).toBe('B-n-C-au');
  });
});

describe('F4 — ReferenceWithoutDomain.getIdentifier → `${proj}-${name}-${env}` (NO domain segment)', () => {
  const cases: ReadonlyArray<[string, string, string, string]> = [
    [
      'standard',
      'mutiny-group/accounts/prd',
      'keyOfMyAccount',
      'accounts-keyOfMyAccount-prd',
    ],
    ['dev env', 'mutiny-group/base/dev', 'sa-deployer', 'base-sa-deployer-dev'],
  ];

  it.each(cases)('%s', (_desc, stack, name, expected) => {
    const ref = new ReferenceWithoutDomain({ stack });
    expect(ref.getIdentifier(name)).toBe(expected);
  });

  it('proj is stack[1] and env is stack[2]; domain is NEVER appended', () => {
    const ref = new ReferenceWithoutDomain({ stack: 'A/B/C' });
    expect(ref.getIdentifier('n')).toBe('B-n-C');
  });

  it('the two formats differ ONLY by the trailing `-${domain}` segment', () => {
    // Same stack + name → the domain-aware identifier is the domain-less one
    // with `-${domain}` appended. Pin that the no-domain variant is the exact
    // prefix (any divergence beyond the suffix is a regression in either).
    const withDomain = new CloudInfraReference({
      stack: STACK,
      domain: 'au',
      outputKey: OUTPUT_KEY,
    }).getIdentifier('x');
    const withoutDomain = new ReferenceWithoutDomain({
      stack: STACK,
    }).getIdentifier('x');
    expect(withDomain).toBe(`${withoutDomain}-au`);
  });
});

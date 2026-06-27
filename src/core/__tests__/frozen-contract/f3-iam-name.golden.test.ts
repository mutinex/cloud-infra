/**
 * Frozen Contract F3 — access-matrix IAM resource-name formula.
 *
 * See `docs/v2-redesign-notes.md` §2 (F3) and Trap §3.1 (the DEDUP no-op).
 *
 * `PolicyRuleProcessor.generateResourceName` (policy-rule-processor.ts:241-274)
 * builds the Pulumi LOGICAL name of every IAM binding it emits as:
 *
 *     `${componentName}:${safeRole}:${principalIdentifier}`
 *
 * truncated to `accessMatrixConfig.maxResourceNameLength` (default 100) chars.
 * This logical name is the first arg to the IAM resource constructor, so any
 * byte drift renames the binding → destroy/recreate against every consuming
 * stack (Frozen Contract violation). The `safeRole` segment comes from
 * `getSafeRoleName` (policy-rule-processor.ts:284-306), whose 4 branches are:
 *
 *   1. explicit `label` (string)            → the label verbatim (wins over role)
 *   2. string role                          → `role.replace(/^.*roles\//, '')`
 *   3. `CloudInfraRole`                      → `role.getMeta().getName()`
 *   4. fallback                              → `role-${ruleIndex}`
 *
 * and the principal segment is `resolvedPrincipal.identifier || \`principal-${principalIndex}\``.
 *
 * Both methods are PRIVATE; these tests invoke the REAL methods via a typed cast
 * so they pin the actual source formula (not a re-implementation). `componentName`
 * is supplied via the `resourceKey` arg so the `ResourceRegistry` lookup branch
 * is bypassed — the formula stays deterministic (no Date.now/random).
 *
 * The CloudInfraRole branch only exercises `role instanceof CloudInfraRole` +
 * `role.getMeta().getName()` inside `getSafeRoleName`. Constructing a full
 * CloudInfraRole would fire heavy async permission-resolution invokes that have
 * nothing to do with the name formula, so we use a prototype-backed instance
 * (real `instanceof`, real `getMeta()`) to exercise exactly that branch.
 */
import { describe, it, expect } from 'vitest';

import { PolicyRuleProcessor } from '../../access-matrix/core/policy-rule-processor';
import { PrincipalFactory } from '../../access-matrix/principals/principal-factory';
import { CloudInfraRole } from '../../../components/role';
import { CloudInfraMeta } from '../../meta';
import { accessMatrixConfig } from '../../../config';
import type {
  MatrixPolicyRule,
  MatrixRoleInput,
  PolicyRuleProcessingContext,
} from '../../access-matrix/types/matrix-types';
import type { ResolvedPrincipal } from '../../access-matrix/types/common-types';

/**
 * Reflection surface onto the two PRIVATE methods under test. Casting the real
 * processor instance to this shape calls the genuine source implementations.
 */
interface ProcessorInternals {
  generateResourceName(
    rule: MatrixPolicyRule,
    resolvedPrincipal: ResolvedPrincipal,
    context: PolicyRuleProcessingContext,
    resourceKey?: string
  ): string;
  getSafeRoleName(
    role: MatrixRoleInput,
    label: string | undefined,
    ruleIndex: number
  ): string;
}

function internals(): ProcessorInternals {
  return new PolicyRuleProcessor() as unknown as ProcessorInternals;
}

function ctx(
  ruleIndex = 0,
  principalIndex = 0
): PolicyRuleProcessingContext {
  return {
    caseName: 'f3',
    ruleIndex,
    principalIndex,
    configPrincipals: [],
  };
}

function principal(identifier: string): ResolvedPrincipal {
  return { member: `serviceAccount:${identifier}@p.iam`, identifier };
}

/** Build a rule with a fixed resource (unused — componentName comes via key). */
function rule(role: MatrixRoleInput, label?: string): MatrixPolicyRule {
  return { resource: {}, role, ...(label ? { label } : {}) } as MatrixPolicyRule;
}

const COMPONENT = 'my-bucket';

/**
 * A prototype-backed CloudInfraRole whose `getMeta().getName()` returns a fixed
 * string. `instanceof CloudInfraRole` is true (real prototype) so the genuine
 * `getSafeRoleName` CloudInfraRole branch runs; the heavy constructor (async
 * permission invokes) is intentionally skipped — it is irrelevant to the name.
 */
function fakeRole(name: string): CloudInfraRole {
  const role = Object.create(CloudInfraRole.prototype) as CloudInfraRole;
  (role as unknown as { getMeta(): CloudInfraMeta }).getMeta = () =>
    new CloudInfraMeta({
      name,
      domain: 'au',
      omitPrefix: true,
      omitDomain: true,
      gcpProject: 'test-project',
    } as never);
  return role;
}

describe('F3 — getSafeRoleName: the 4 frozen branches', () => {
  it('string role STRIPS the `roles/` prefix (and any path before it)', () => {
    expect(internals().getSafeRoleName('roles/storage.admin', undefined, 0)).toBe(
      'storage.admin'
    );
    // `.*roles/` is greedy → strips a full resource path up to the last `roles/`.
    expect(
      internals().getSafeRoleName(
        'projects/p/roles/customRole',
        undefined,
        0
      )
    ).toBe('customRole');
    // No `roles/` anywhere → passthrough unchanged.
    expect(internals().getSafeRoleName('storage.admin', undefined, 0)).toBe(
      'storage.admin'
    );
  });

  it('explicit `label` WINS over the role (returned verbatim)', () => {
    expect(
      internals().getSafeRoleName('roles/storage.admin', 'reader', 0)
    ).toBe('reader');
  });

  it('CloudInfraRole branch → role.getMeta().getName()', () => {
    // omitPrefix + omitDomain → getName() === the bare input name, so the safe
    // role name is deterministic and context-free.
    expect(internals().getSafeRoleName(fakeRole('custom-admin'), undefined, 0)).toBe(
      'custom-admin'
    );
  });

  it('fallback → `role-${ruleIndex}` when role is neither string nor CloudInfraRole', () => {
    expect(
      internals().getSafeRoleName({} as unknown as MatrixRoleInput, undefined, 7)
    ).toBe('role-7');
  });
});

describe('F3 — generateResourceName: `${componentName}:${safeRole}:${principalIdentifier}`', () => {
  it('string role case (strips `roles/`)', () => {
    expect(
      internals().generateResourceName(
        rule('roles/storage.objectViewer'),
        principal('viewer'),
        ctx(),
        COMPONENT
      )
    ).toBe('my-bucket:storage.objectViewer:viewer');
  });

  it('explicit label case (label is the middle segment)', () => {
    expect(
      internals().generateResourceName(
        rule('roles/storage.admin', 'writer'),
        principal('deployer'),
        ctx(),
        COMPONENT
      )
    ).toBe('my-bucket:writer:deployer');
  });

  it('CloudInfraRole case (uses the role component name)', () => {
    expect(
      internals().generateResourceName(
        rule(fakeRole('data-editor')),
        principal('analyst'),
        ctx(),
        COMPONENT
      )
    ).toBe('my-bucket:data-editor:analyst');
  });

  it('`role-${index}` fallback feeds the middle segment', () => {
    expect(
      internals().generateResourceName(
        rule({} as unknown as MatrixRoleInput),
        principal('user1'),
        ctx(3),
        COMPONENT
      )
    ).toBe('my-bucket:role-3:user1');
  });

  it('`principal-${index}` fallback when the resolved identifier is empty', () => {
    // resolvedPrincipal.identifier falsy → `principal-${principalIndex}`.
    const emptyIdentifier: ResolvedPrincipal = {
      member: 'serviceAccount:x@p.iam',
      identifier: '',
    };
    expect(
      internals().generateResourceName(
        rule('roles/viewer'),
        emptyIdentifier,
        ctx(0, 5),
        COMPONENT
      )
    ).toBe('my-bucket:viewer:principal-5');
  });
});

describe('F3 — 100-char truncation (maxResourceNameLength)', () => {
  it('default max length is the frozen 100', () => {
    expect(accessMatrixConfig.maxResourceNameLength).toBe(100);
  });

  it('a name longer than 100 chars is truncated to EXACTLY the first 100 chars', () => {
    const longComponent = 'c'.repeat(120);
    const out = internals().generateResourceName(
      rule('roles/viewer'),
      principal('p'),
      ctx(),
      longComponent
    );
    const full = `${longComponent}:viewer:p`;
    expect(full.length).toBeGreaterThan(100);
    expect(out.length).toBe(100);
    expect(out).toBe(full.substring(0, 100));
  });

  it('a name of exactly 100 chars is NOT truncated (boundary: `> max`, not `>=`)', () => {
    // componentName chosen so total === 100. `viewer` (6) + two `:` (2) + `p`
    // (1) = 9 fixed → component of 91 → total 100.
    const component = 'c'.repeat(91);
    const out = internals().generateResourceName(
      rule('roles/viewer'),
      principal('p'),
      ctx(),
      component
    );
    expect(out.length).toBe(100);
    expect(out).toBe(`${component}:viewer:p`);
  });
});

describe('F3 / Trap §3.1 — the principal DEDUP no-op is PRESERVED (pin current behavior, do NOT fix)', () => {
  it('non-string principals are deduped by REFERENCE identity, not by resolved member', () => {
    // PrincipalFactory.deduplicate uses `const key = ... ? principal : principal`
    // (both branches are `principal`) over a Set of references. Two DISTINCT
    // objects with the SAME logical member are therefore NOT deduplicated — they
    // both survive. This is the documented no-op; pin it so a "fix" is visible.
    const a = { member: 'serviceAccount:same@p.iam' };
    const b = { member: 'serviceAccount:same@p.iam' };
    const out = PrincipalFactory.deduplicate([a, b]);
    expect(out).toHaveLength(2);
    expect(out).toEqual([a, b]);
  });

  it('the SAME object reference IS removed (reference-identity dedup still works)', () => {
    const a = { member: 'serviceAccount:same@p.iam' };
    const out = PrincipalFactory.deduplicate([a, a]);
    expect(out).toHaveLength(1);
    expect(out[0]).toBe(a);
  });

  it('identical string principals ARE deduped (strings compare by value in a Set)', () => {
    const out = PrincipalFactory.deduplicate([
      'serviceAccount:s@p.iam',
      'serviceAccount:s@p.iam',
    ]);
    expect(out).toHaveLength(1);
  });
});

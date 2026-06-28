import { describe, it, expect } from 'vitest';

import { PolicyRuleProcessor } from '../../core/policy-rule-processor';
import { CloudInfraRole } from '../../../../components/role';
import { CloudInfraMeta } from '../../../meta';
import { accessMatrixConfig } from '../../../../config';
import type {
  MatrixPolicyRule,
  MatrixRoleInput,
  OutputPrincipalWithHints,
  PolicyRuleProcessingContext,
} from '../../types/matrix-types';
import type { ResolvedPrincipal } from '../../types/common-types';

/**
 * W3-A — OPT-IN deterministic, reorder-stable auto-derived grant `label`.
 *
 * These tests drive the REAL private `getSafeRoleName` / `generateResourceName`
 * (via a typed cast onto the genuine instance, mirroring the F3 golden), so they
 * pin the actual source formula rather than a re-implementation.
 *
 * Three guarantees are pinned:
 *  (a) DEFAULT OFF → byte-identical to today, including the `role-<index>`
 *      fallback for opaque Output roles (zero IAM binding rename for everyone
 *      who has not opted in).
 *  (b) OPT-IN (`autoLabel: true`) → a deterministic, REORDER-STABLE derived
 *      label that NEVER depends on the rule's array position.
 *  (c) Manual `label` ALWAYS wins (auto-label is never consulted).
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
    ruleIndex: number,
    rule?: MatrixPolicyRule,
    componentName?: string
  ): string;
}

function internals(): ProcessorInternals {
  return new PolicyRuleProcessor() as unknown as ProcessorInternals;
}

function ctx(ruleIndex = 0, principalIndex = 0): PolicyRuleProcessingContext {
  return { caseName: 'w3a', ruleIndex, principalIndex, configPrincipals: [] };
}

function principal(identifier: string): ResolvedPrincipal {
  return { member: `serviceAccount:${identifier}@p.iam`, identifier };
}

/**
 * An opaque role: a plain object that is neither a string nor a CloudInfraRole,
 * so `getSafeRoleName` reaches the fallback branch. `toString()` is fixed so the
 * stable-hash path is reproducible. (A real `pulumi.Output<string>` lands in the
 * same branch — it is not a string and not a CloudInfraRole.)
 */
function opaqueRole(token: string): MatrixRoleInput {
  return {
    toString() {
      return `output<${token}>`;
    },
  } as unknown as MatrixRoleInput;
}

/** An opaque role carrying an `__identifierHint` (mirrors the principal hint). */
function hintedOpaqueRole(hint: string): MatrixRoleInput {
  const role = opaqueRole('ignored') as unknown as OutputPrincipalWithHints;
  role.__identifierHint = hint;
  return role as unknown as MatrixRoleInput;
}

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

function ruleOf(
  role: MatrixRoleInput,
  extra: Partial<MatrixPolicyRule> = {}
): MatrixPolicyRule {
  return { resource: {}, role, ...extra } as MatrixPolicyRule;
}

const COMPONENT = 'my-bucket';

describe('W3-A (a) DEFAULT OFF → byte-identical to historical behavior', () => {
  it('opaque Output role with autoLabel UNSET keeps the `role-<ruleIndex>` fallback', () => {
    expect(
      internals().getSafeRoleName(opaqueRole('x'), undefined, 7, ruleOf(opaqueRole('x')), COMPONENT)
    ).toBe('role-7');
  });

  it('opaque Output role with autoLabel === false keeps the `role-<ruleIndex>` fallback', () => {
    expect(
      internals().getSafeRoleName(
        opaqueRole('x'),
        undefined,
        3,
        ruleOf(opaqueRole('x'), { autoLabel: false }),
        COMPONENT
      )
    ).toBe('role-3');
  });

  it('generateResourceName is unchanged for the default fallback path', () => {
    const role = opaqueRole('x');
    expect(
      internals().generateResourceName(ruleOf(role), principal('user1'), ctx(3), COMPONENT)
    ).toBe('my-bucket:role-3:user1');
  });

  it('string-role and CloudInfraRole branches are untouched by autoLabel (even when on)', () => {
    // String role: still strips `roles/`, ignores autoLabel entirely.
    expect(
      internals().getSafeRoleName(
        'roles/storage.admin',
        undefined,
        0,
        ruleOf('roles/storage.admin', { autoLabel: true }),
        COMPONENT
      )
    ).toBe('storage.admin');
    // CloudInfraRole: still uses the role component name, ignores autoLabel.
    const cir = fakeRole('data-editor');
    expect(
      internals().getSafeRoleName(cir, undefined, 0, ruleOf(cir, { autoLabel: true }), COMPONENT)
    ).toBe('data-editor');
  });

  it('roleHint is ignored when autoLabel is off (no leak into the default path)', () => {
    expect(
      internals().getSafeRoleName(
        opaqueRole('x'),
        undefined,
        2,
        ruleOf(opaqueRole('x'), { roleHint: 'should-be-ignored' }),
        COMPONENT
      )
    ).toBe('role-2');
  });
});

describe('W3-A (c) manual label ALWAYS wins (auto-label never consulted)', () => {
  it('manual label wins over autoLabel + roleHint', () => {
    expect(
      internals().getSafeRoleName(
        opaqueRole('x'),
        'my-explicit-label',
        0,
        ruleOf(opaqueRole('x'), { autoLabel: true, roleHint: 'hint', label: 'my-explicit-label' }),
        COMPONENT
      )
    ).toBe('my-explicit-label');
  });

  it('generateResourceName uses the manual label as the middle segment even with autoLabel on', () => {
    const role = opaqueRole('x');
    expect(
      internals().generateResourceName(
        ruleOf(role, { autoLabel: true, label: 'writer' }),
        principal('deployer'),
        ctx(),
        COMPONENT
      )
    ).toBe('my-bucket:writer:deployer');
  });
});

describe('W3-A (b) OPT-IN → deterministic, reorder-stable derived label', () => {
  it('autoLabel on opaque role derives `auto-<component>-<roleHint>` (no index)', () => {
    const role = hintedOpaqueRole('org-project-admin');
    expect(
      internals().getSafeRoleName(role, undefined, 9, ruleOf(role, { autoLabel: true }), COMPONENT)
    ).toBe('auto-my-bucket-org-project-admin');
  });

  it('explicit roleHint is preferred and sanitized', () => {
    const role = opaqueRole('x');
    expect(
      internals().getSafeRoleName(
        role,
        undefined,
        0,
        ruleOf(role, { autoLabel: true, roleHint: 'Org Project Admin!' }),
        COMPONENT
      )
    ).toBe('auto-my-bucket-org-project-admin');
  });

  it('no hint → falls back to a stable FNV-1a hash of the role ref (8 hex chars)', () => {
    const role = opaqueRole('roleRefABC');
    const out = internals().getSafeRoleName(
      role,
      undefined,
      0,
      ruleOf(role, { autoLabel: true }),
      COMPONENT
    );
    expect(out).toMatch(/^auto-my-bucket-role-[0-9a-f]{8}$/);
  });

  it('DETERMINISTIC: identical inputs → identical label across separate calls', () => {
    const r1 = ruleOf(opaqueRole('same-role-ref'), { autoLabel: true });
    const r2 = ruleOf(opaqueRole('same-role-ref'), { autoLabel: true });
    const a = internals().getSafeRoleName(r1.role, undefined, 0, r1, COMPONENT);
    const b = internals().getSafeRoleName(r2.role, undefined, 0, r2, COMPONENT);
    expect(a).toBe(b);
  });

  it('REORDER-STABLE: same rule at DIFFERENT ruleIndex → SAME derived label', () => {
    // The crux of W3-A: the derived label must not depend on array position.
    const proc = internals();
    const labels = [0, 1, 2, 5, 42].map(idx => {
      const role = hintedOpaqueRole('viewer-role');
      return proc.getSafeRoleName(role, undefined, idx, ruleOf(role, { autoLabel: true }), COMPONENT);
    });
    // All identical regardless of ruleIndex.
    expect(new Set(labels).size).toBe(1);
    expect(labels[0]).toBe('auto-my-bucket-viewer-role');
  });

  it('REORDER-STABLE (hash path): reordering two distinct rules keeps each label tied to its role, not its slot', () => {
    const proc = internals();
    const roleA = opaqueRole('roleA');
    const roleB = opaqueRole('roleB');

    // "Order 1": A at index 0, B at index 1.
    const a0 = proc.getSafeRoleName(roleA, undefined, 0, ruleOf(roleA, { autoLabel: true }), COMPONENT);
    const b1 = proc.getSafeRoleName(roleB, undefined, 1, ruleOf(roleB, { autoLabel: true }), COMPONENT);

    // "Order 2": swapped — B at index 0, A at index 1.
    const b0 = proc.getSafeRoleName(roleB, undefined, 0, ruleOf(roleB, { autoLabel: true }), COMPONENT);
    const a1 = proc.getSafeRoleName(roleA, undefined, 1, ruleOf(roleA, { autoLabel: true }), COMPONENT);

    // A's label is the same in both orders; B's label is the same in both orders.
    expect(a0).toBe(a1);
    expect(b1).toBe(b0);
    // And the two roles get DISTINCT labels (no collision).
    expect(a0).not.toBe(b0);
  });

  it('full resource name uses the derived segment in the middle', () => {
    const role = hintedOpaqueRole('custom-admin');
    expect(
      internals().generateResourceName(
        ruleOf(role, { autoLabel: true }),
        principal('analyst'),
        ctx(4),
        COMPONENT
      )
    ).toBe('my-bucket:auto-my-bucket-custom-admin:analyst');
  });
});

describe('F3 — auto-label resource-name truncation at maxResourceNameLength (100)', () => {
  // The README advertises the 100-char truncation; pin it on the REAL
  // generateResourceName. The auto-derived middle segment can be long (it
  // includes the component name + role token), so an autoLabel grant on a
  // long-named component is exactly where the cap bites.
  it('a name longer than 100 chars is truncated to EXACTLY 100', () => {
    expect(accessMatrixConfig.maxResourceNameLength).toBe(100);

    const longComponent = 'c'.repeat(80); // forces > 100 once joined
    const role = hintedOpaqueRole('admin');
    const name = internals().generateResourceName(
      ruleOf(role, { autoLabel: true }),
      principal('p'.repeat(40)),
      ctx(0),
      longComponent
    );

    expect(name.length).toBe(100);
    // Truncation is a plain prefix-substring of the untruncated name, which
    // starts with the (un-truncated) component segment.
    expect(name.startsWith(`${longComponent}:`)).toBe(true);
  });

  it('a name at/under 100 chars is returned verbatim (no truncation)', () => {
    const name = internals().generateResourceName(
      ruleOf('roles/storage.admin'),
      principal('analyst'),
      ctx(0),
      'my-bucket'
    );
    expect(name).toBe('my-bucket:storage.admin:analyst');
    expect(name.length).toBeLessThanOrEqual(100);
  });

  it('component name is sanitized into the derived label', () => {
    const role = hintedOpaqueRole('admin');
    expect(
      internals().getSafeRoleName(
        role,
        undefined,
        0,
        ruleOf(role, { autoLabel: true }),
        'My Weird Comp/Name'
      )
    ).toBe('auto-my-weird-comp-name-admin');
  });
});

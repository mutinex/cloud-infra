import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PrincipalFactory } from '../principal-factory';
import type { MatrixPrincipalObject } from '../../types/matrix-types';

// Mock CloudInfraReference and ReferenceWithoutDomain
vi.mock('../../../reference', () => ({
  CloudInfraReference: vi.fn().mockImplementation(({ domain, stack }) => ({
    getEmail: vi.fn((resourceType, name) => `${name}@${stack}-${domain}.iam.gserviceaccount.com`),
    getMember: vi.fn((resourceType, name) => `serviceAccount:${name}@${stack}-${domain}.iam.gserviceaccount.com`),
    getIdentifier: vi.fn((name) => `${stack}-${name}-${domain}`),
  })),
  ReferenceWithoutDomain: vi.fn().mockImplementation(({ stack }) => ({
    getEmail: vi.fn((name) => `${name}@${stack}.iam.gserviceaccount.com`),
    getMember: vi.fn((name) => `serviceAccount:${name}@${stack}.iam.gserviceaccount.com`),
    getIdentifier: vi.fn((name) => `${stack}-${name}`),
  })),
}));

vi.mock('../../../reference/config', () => ({
  serviceAccountAliases: ['account', 'serviceaccount'],
}));

vi.mock('@pulumi/pulumi', () => ({
  interpolate: vi.fn((template, ...args) => {
    if (Array.isArray(template)) {
      return template.join('') + args.join('');
    }
    return String(template) + args.join('');
  }),
  Output: {
    isInstance: vi.fn(() => false),
  },
  log: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('PrincipalFactory Cache Collision Fix', () => {
  beforeEach(() => {
    // Clear the cache before each test
    PrincipalFactory.clearCache();
    vi.clearAllMocks();
  });

  it('should NOT have cache collisions for similar objects with different names', () => {
    // These two principals have the same structure and only differ in the 'name' field
    // Previously, they would collide because only the first 50 chars were used for the cache key
    const principal1: MatrixPrincipalObject = {
      domain: 'gl',
      stack: 'mutinex/mtx/dev',
      name: 'mtx-dev-gha',
      resourceType: 'account',
    };

    const principal2: MatrixPrincipalObject = {
      domain: 'gl',
      stack: 'mutinex/mtx/dev',
      name: 'mtx-dev-run',
      resourceType: 'account',
    };

    // Resolve both principals
    const resolved1 = PrincipalFactory.resolvePrincipal(principal1, 0);
    const resolved2 = PrincipalFactory.resolvePrincipal(principal2, 0);

    // They should have different identifiers
    expect(resolved1.identifier).toBe('mutinex/mtx/dev-mtx-dev-gha-gl');
    expect(resolved2.identifier).toBe('mutinex/mtx/dev-mtx-dev-run-gl');

    // They should have different members (emails)
    expect(resolved1.member).toContain('mtx-dev-gha');
    expect(resolved2.member).toContain('mtx-dev-run');

    // Verify they are NOT the same (this was the bug)
    expect(resolved1.identifier).not.toBe(resolved2.identifier);
    expect(resolved1.member).not.toBe(resolved2.member);
  });

  it('should cache and reuse results for identical principals', () => {
    const principal: MatrixPrincipalObject = {
      domain: 'gl',
      stack: 'mutinex/mtx/dev',
      name: 'mtx-dev-gha',
      resourceType: 'account',
    };

    // Resolve the same principal twice
    const resolved1 = PrincipalFactory.resolvePrincipal(principal, 0);
    const resolved2 = PrincipalFactory.resolvePrincipal(principal, 0);

    // They should be identical (from cache)
    expect(resolved1.identifier).toBe(resolved2.identifier);
    expect(resolved1.member).toBe(resolved2.member);
  });

  it('should handle different principal indices correctly', () => {
    const principal: MatrixPrincipalObject = {
      domain: 'gl',
      stack: 'mutinex/mtx/dev',
      name: 'mtx-dev-gha',
      resourceType: 'account',
    };

    // Same principal but different indices should have different cache keys
    const resolved1 = PrincipalFactory.resolvePrincipal(principal, 0);
    const resolved2 = PrincipalFactory.resolvePrincipal(principal, 1);

    // They should have the same identifier (same principal)
    expect(resolved1.identifier).toBe(resolved2.identifier);
    expect(resolved1.member).toBe(resolved2.member);
  });

  it('should handle the exact scenario from the bug report', () => {
    // Simulate the exact configuration from the bug report
    const growthosPrincipal: MatrixPrincipalObject = {
      domain: 'gl',
      stack: 'mutinex/mtx/dev',
      name: 'mtx-dev-gha',
      resourceType: 'account',
    };

    const cmsPrincipal: MatrixPrincipalObject = {
      domain: 'gl',
      stack: 'mutinex/mtx/dev',
      name: 'mtx-dev-gha', // Same as growthos, this is correct
      resourceType: 'account',
    };

    const artifactRegistryPrincipals: MatrixPrincipalObject[] = [
      { domain: 'gl', stack: 'mutinex/mtx/dev', name: 'mtx-dev-run', resourceType: 'account' },
      { domain: 'gl', stack: 'mutinex/mtx/stg', name: 'mtx-stg-run', resourceType: 'account' },
      { domain: 'gl', stack: 'mutinex/mtx/uat', name: 'mtx-uat-run', resourceType: 'account' },
      { domain: 'gl', stack: 'mutinex/mtx/prd', name: 'mtx-prd-run', resourceType: 'account' },
    ];

    // Resolve all principals
    const growthosResolved = PrincipalFactory.resolvePrincipal(growthosPrincipal, 0);
    const cmsResolved = PrincipalFactory.resolvePrincipal(cmsPrincipal, 1);
    const artifactResolved = artifactRegistryPrincipals.map((p, i) =>
      PrincipalFactory.resolvePrincipal(p, i + 2)
    );

    // Verify growthos and cms get the correct 'gha' principal
    expect(growthosResolved.identifier).toContain('mtx-dev-gha');
    expect(cmsResolved.identifier).toContain('mtx-dev-gha');

    // Verify artifact registry principals get the correct 'run' principals
    expect(artifactResolved[0].identifier).toContain('mtx-dev-run');
    expect(artifactResolved[1].identifier).toContain('mtx-stg-run');
    expect(artifactResolved[2].identifier).toContain('mtx-uat-run');
    expect(artifactResolved[3].identifier).toContain('mtx-prd-run');

    // Most importantly, verify that 'gha' principals don't get replaced with 'run' principals
    expect(growthosResolved.identifier).not.toContain('run');
    expect(cmsResolved.identifier).not.toContain('run');
  });

  it('should handle principals with very long similar prefixes', () => {
    // Create principals with very long similar prefixes (> 50 chars)
    const principal1: MatrixPrincipalObject = {
      domain: 'gl',
      stack: 'organization/very-long-project-name/environment',
      name: 'service-account-with-very-long-name-variant-a',
      resourceType: 'account',
    };

    const principal2: MatrixPrincipalObject = {
      domain: 'gl',
      stack: 'organization/very-long-project-name/environment',
      name: 'service-account-with-very-long-name-variant-b',
      resourceType: 'account',
    };

    const resolved1 = PrincipalFactory.resolvePrincipal(principal1, 0);
    const resolved2 = PrincipalFactory.resolvePrincipal(principal2, 0);

    // They should have different identifiers
    expect(resolved1.identifier).toContain('variant-a');
    expect(resolved2.identifier).toContain('variant-b');
    expect(resolved1.identifier).not.toBe(resolved2.identifier);
  });
});

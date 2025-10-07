import { describe, it, expect, beforeEach } from 'vitest';
import { MatrixObjectPrincipalResolver } from '../principal-types';
import type { MatrixPrincipalObject } from '../../types/matrix-types';

// Create a more realistic integration test that doesn't rely on complex mocking
describe('Domain-Optional Matrix Principal Integration', () => {
  let resolver: MatrixObjectPrincipalResolver;

  beforeEach(() => {
    resolver = new MatrixObjectPrincipalResolver();
  });

  describe('Principal Type Detection', () => {
    it('should correctly identify domain-based principals', () => {
      const domainBasedPrincipal = {
        domain: 'gl',
        stack: 'organization/mtx/uat',
        name: 'mtx-uat-run',
        resourceType: 'account',
      };

      expect(resolver.canResolve(domainBasedPrincipal)).toBe(true);
    });

    it('should correctly identify domain-optional principals', () => {
      const domainOptionalPrincipal = {
        stack: 'organization/mtx/prd',
        name: 'keyOfMyAccount',
        resourceType: 'account',
      };

      expect(resolver.canResolve(domainOptionalPrincipal)).toBe(true);
    });

    it('should handle mixed principal configurations', () => {
      const principals = [
        {
          domain: 'gl',
          stack: 'organization/mtx/uat',
          name: 'mtx-uat-run',
          resourceType: 'account',
        },
        {
          stack: 'organization/mtx/prd',
          name: 'keyOfMyAccount',
          resourceType: 'account',
        },
        {
          domain: 'gl',
          stack: 'organization/base/dev',
          name: 'dev-service',
          resourceType: 'project',
        },
        {
          stack: 'organization/secrets/prd',
          name: 'api-key',
          resourceType: 'secret',
        },
      ];

      principals.forEach(principal => {
        expect(resolver.canResolve(principal)).toBe(true);
      });
    });
  });

  describe('Type Safety and Schema Validation', () => {
    it('should accept valid MatrixPrincipalObject types', () => {
      const validPrincipals: MatrixPrincipalObject[] = [
        {
          domain: 'gl',
          stack: 'organization/mtx/uat',
          name: 'mtx-uat-run',
          resourceType: 'account',
        },
        {
          stack: 'organization/mtx/prd',
          name: 'keyOfMyAccount',
          resourceType: 'account',
        },
        {
          stack: 'organization/mtx/prd',
          name: 'keyOfMyAccount',
          resourceType: 'account', // explicitly set since it's required in type
        },
        {
          domain: 'gl',
          stack: 'organization/mtx/uat',
          name: 'mtx-uat-run',
          version: 'v1.2.3',
          resourceType: 'account',
        },
      ];

      validPrincipals.forEach(principal => {
        expect(resolver.canResolve(principal)).toBe(true);
      });
    });

    it('should reject invalid principal objects', () => {
      const invalidPrincipals = [
        { domain: 'gl', name: 'missing-stack' }, // missing stack
        { stack: 'organization/mtx/uat', domain: 'gl' }, // missing name
        { stack: 'organization/mtx/uat' }, // missing name
        null,
        undefined,
        'string-principal',
        123,
        { domain: 123, stack: 'organization/mtx/uat', name: 'invalid-domain-type' },
      ];

      invalidPrincipals.forEach(principal => {
        expect(resolver.canResolve(principal)).toBeFalsy();
      });
    });
  });

  describe('Resource Type Handling', () => {
    it('should handle various resource types for domain-based principals', () => {
      const resourceTypes = ['account', 'project', 'secret', 'bucket', 'serviceaccount'];
      
      resourceTypes.forEach(resourceType => {
        const principal = {
          domain: 'gl',
          stack: 'organization/mtx/uat',
          name: 'test-resource',
          resourceType,
        };

        expect(resolver.canResolve(principal)).toBe(true);
      });
    });

    it('should handle various resource types for domain-optional principals', () => {
      const resourceTypes = ['account', 'project', 'secret', 'bucket', 'serviceaccount'];
      
      resourceTypes.forEach(resourceType => {
        const principal = {
          stack: 'organization/mtx/prd',
          name: 'test-resource',
          resourceType,
        };

        expect(resolver.canResolve(principal)).toBe(true);
      });
    });

    it('should handle case variations in resource types', () => {
      const caseVariations = ['ACCOUNT', 'Account', 'account', 'PROJECT', 'Project'];
      
      caseVariations.forEach(resourceType => {
        const principal = {
          stack: 'organization/mtx/prd',
          name: 'test-resource',
          resourceType,
        };

        expect(resolver.canResolve(principal)).toBe(true);
      });
    });
  });

  describe('Configuration Flexibility', () => {
    it('should support optional domain field', () => {
      const principalWithUndefinedDomain = {
        domain: undefined,
        stack: 'organization/mtx/prd',
        name: 'keyOfMyAccount',
        resourceType: 'account',
      };

      expect(resolver.canResolve(principalWithUndefinedDomain)).toBe(true);
    });

    it('should support optional version field', () => {
      const principals = [
        {
          domain: 'gl',
          stack: 'organization/mtx/uat',
          name: 'mtx-uat-run',
          version: 'v1.2.3',
          resourceType: 'account',
        },
        {
          stack: 'organization/mtx/prd',
          name: 'keyOfMyAccount',
          version: 'latest',
          resourceType: 'account',
        },
      ];

      principals.forEach(principal => {
        expect(resolver.canResolve(principal)).toBe(true);
      });
    });

    it('should support optional resourceType field with default', () => {
      const principals = [
        {
          domain: 'gl',
          stack: 'organization/mtx/uat',
          name: 'mtx-uat-run',
          // resourceType should default to 'account'
        },
        {
          stack: 'organization/mtx/prd',
          name: 'keyOfMyAccount',
          // resourceType should default to 'account'
        },
      ];

      principals.forEach(principal => {
        expect(resolver.canResolve(principal)).toBe(true);
      });
    });
  });

  describe('Real-world Configuration Examples', () => {
    it('should handle typical domain-based configuration', () => {
      const domainBasedConfig = [
        {
          domain: 'gl',
          stack: 'organization/mtx/uat',
          name: 'mtx-uat-run',
          resourceType: 'account',
        },
        {
          domain: 'gl',
          stack: 'organization/base/dev',
          name: 'dev-project',
          resourceType: 'project',
        },
        {
          domain: 'gl',
          stack: 'organization/secrets/dev',
          name: 'api-secret',
          resourceType: 'secret',
        },
      ];

      domainBasedConfig.forEach(principal => {
        expect(resolver.canResolve(principal)).toBe(true);
      });
    });

    it('should handle typical domain-optional configuration', () => {
      const domainOptionalConfig = [
        {
          stack: 'organization/mtx/prd',
          name: 'keyOfMyAccount',
          resourceType: 'account',
        },
        {
          stack: 'organization/base/prd',
          name: 'prod-project',
          resourceType: 'project',
        },
        {
          stack: 'organization/secrets/prd',
          name: 'prod-secret',
          resourceType: 'secret',
        },
      ];

      domainOptionalConfig.forEach(principal => {
        expect(resolver.canResolve(principal)).toBe(true);
      });
    });

    it('should handle mixed configuration (both formats together)', () => {
      const mixedConfig = [
        // Domain-based principals
        {
          domain: 'gl',
          stack: 'organization/mtx/uat',
          name: 'mtx-uat-run',
          resourceType: 'account',
        },
        {
          domain: 'gl',
          stack: 'organization/base/dev',
          name: 'dev-project',
          resourceType: 'project',
        },
        // Domain-optional principals
        {
          stack: 'organization/mtx/prd',
          name: 'keyOfMyAccount',
          resourceType: 'account',
        },
        {
          stack: 'organization/secrets/prd',
          name: 'prod-secret',
          resourceType: 'secret',
        },
      ];

      mixedConfig.forEach(principal => {
        expect(resolver.canResolve(principal)).toBe(true);
      });
    });
  });

  describe('Backward Compatibility', () => {
    it('should maintain compatibility with existing domain-based principals', () => {
      // These are the existing patterns that should continue to work
      const existingPatterns = [
        {
          domain: 'gl',
          stack: 'organization/mtx/uat',
          name: 'mtx-uat-run',
          resourceType: 'account',
        },
        {
          domain: 'gl',
          stack: 'organization/base/dev',
          name: 'dev-service',
          resourceType: 'project',
          version: 'v1.0.0',
        },
      ];

      existingPatterns.forEach(principal => {
        expect(resolver.canResolve(principal)).toBe(true);
      });
    });

    it('should not break when domain is explicitly provided', () => {
      const principalWithDomain = {
        domain: 'gl',
        stack: 'organization/mtx/uat',
        name: 'mtx-uat-run',
        resourceType: 'account',
      };

      const principalWithoutDomain = {
        stack: 'organization/mtx/prd',
        name: 'keyOfMyAccount',
        resourceType: 'account',
      };

      expect(resolver.canResolve(principalWithDomain)).toBe(true);
      expect(resolver.canResolve(principalWithoutDomain)).toBe(true);
    });
  });
});
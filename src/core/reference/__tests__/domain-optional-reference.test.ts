import { describe, it, expect, vi, beforeEach } from 'vitest';

// A controllable mock StackReference. `outputs.apply` runs the resolver
// synchronously and wraps the result in a thenable-like `{ apply }` so the
// lazy `.apply(...)` chains in CloudInfraReference resolve eagerly in tests.
const mockStackRef = {
  outputs: {
    apply: vi.fn(),
  },
  getOutput: vi.fn(),
};

// Mock @pulumi/pulumi so the REAL CloudInfraReference (and the
// ReferenceWithoutDomain shim that delegates to it) construct a controllable
// StackReference. This exercises the merged domain-optional resolution path.
vi.mock('@pulumi/pulumi', () => ({
  Config: vi.fn(() => ({
    require: vi.fn((key: string) => `mock-${key}`),
  })),
  StackReference: vi.fn(() => mockStackRef),
}));

import { ReferenceWithoutDomain } from '../reference-without-domain';
import { CloudInfraReference } from '../reference-manager';

function primeOutputs(outputs: Record<string, unknown>): void {
  mockStackRef.outputs.apply.mockImplementation(
    (fn: (outputs: unknown) => unknown) => {
      const result = fn(outputs);
      // `all()` consumes the first `.apply` result directly (an array); the
      // resolve()/record path chains a second `.apply`, so wrap non-arrays.
      if (Array.isArray(result)) {
        return result;
      }
      return {
        apply: (callback: (result: unknown) => unknown) => callback(result),
      };
    }
  );
}

describe('DomainOptionalReference (ReferenceWithoutDomain shim)', () => {
  let domainOptionalRef: ReferenceWithoutDomain;

  beforeEach(() => {
    vi.clearAllMocks();
    CloudInfraReference.clearCache();
    domainOptionalRef = new ReferenceWithoutDomain({
      stack: 'organization/cms/prod',
    });
  });

  describe('String Value Handling', () => {
    it('should handle email format string values', () => {
      primeOutputs({
        ciServiceAccountEmail: 'ci-service@cms-prod.iam.gserviceaccount.com',
        anotherAccount: 'another@project.iam.gserviceaccount.com',
      });

      domainOptionalRef.get('ciServiceAccountEmail');

      const result = mockStackRef.outputs.apply.mock.calls[0][0]({
        ciServiceAccountEmail: 'ci-service@cms-prod.iam.gserviceaccount.com',
        anotherAccount: 'another@project.iam.gserviceaccount.com',
      });

      expect(result).toEqual({
        email: 'ci-service@cms-prod.iam.gserviceaccount.com',
        member: 'serviceAccount:ci-service@cms-prod.iam.gserviceaccount.com',
        id: 'ci-service@cms-prod.iam.gserviceaccount.com',
        name: 'ci-service',
      });
    });

    it('should handle member format string values', () => {
      primeOutputs({
        anotherAccount:
          'serviceAccount:another@project.iam.gserviceaccount.com',
      });

      domainOptionalRef.get('anotherAccount');

      const result = mockStackRef.outputs.apply.mock.calls[0][0]({
        anotherAccount:
          'serviceAccount:another@project.iam.gserviceaccount.com',
      });

      expect(result).toEqual({
        email: 'another@project.iam.gserviceaccount.com',
        member: 'serviceAccount:another@project.iam.gserviceaccount.com',
        id: 'another@project.iam.gserviceaccount.com',
        name: 'another',
      });
    });

    it('should throw error for missing keys', () => {
      primeOutputs({ existingKey: 'existing@example.com' });

      expect(() => {
        domainOptionalRef.get('missingKey');
        mockStackRef.outputs.apply.mock.calls[0][0]({
          existingKey: 'existing@example.com',
        });
      }).toThrow(
        "Domain-optional resource 'missingKey' not found in stack 'organization/cms/prod'. Available keys: [existingKey]"
      );
    });

    it('should throw error for non-string values', () => {
      primeOutputs({
        invalidKey: {
          email: 'test@example.com',
          member: 'serviceAccount:test@example.com',
        },
      });

      expect(() => {
        domainOptionalRef.get('invalidKey');
        mockStackRef.outputs.apply.mock.calls[0][0]({
          invalidKey: {
            email: 'test@example.com',
            member: 'serviceAccount:test@example.com',
          },
        });
      }).toThrow(
        "Expected string value for 'invalidKey' in stack 'organization/cms/prod', got object"
      );
    });
  });

  describe('Public API Methods', () => {
    beforeEach(() => {
      primeOutputs({ testAccount: 'test@example.com' });
    });

    it('should return email via getEmail method', () => {
      const email = domainOptionalRef.getEmail('testAccount');
      expect(email).toBe('test@example.com');
    });

    it('should return member via getMember method', () => {
      const member = domainOptionalRef.getMember('testAccount');
      expect(member).toBe('serviceAccount:test@example.com');
    });

    it('should return identifier via getIdentifier method', () => {
      const result = domainOptionalRef.getIdentifier('testAccount');
      expect(result).toBe('cms-testAccount-prod');
    });
  });

  describe('Stack Format Validation', () => {
    it('should throw error for invalid stack format', () => {
      expect(() => {
        new ReferenceWithoutDomain({ stack: 'invalid-format' });
      }).toThrow(
        "Stack must be in 'organization/project/environment' format (e.g. 'organization/base/dev')"
      );
    });

    it('should accept valid stack format', () => {
      expect(() => {
        new ReferenceWithoutDomain({ stack: 'organization/base/dev' });
      }).not.toThrow();
    });
  });
});

describe('Domain-optional mode via CloudInfraReference directly', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    CloudInfraReference.clearCache();
    primeOutputs({ testAccount: 'test@example.com' });
  });

  it('resolves a flat string output through the merged path', () => {
    const ref = new CloudInfraReference('organization/cms/prod');
    expect(ref.get('testAccount').email).toBe('test@example.com');
    expect(ref.get('testAccount').member).toBe(
      'serviceAccount:test@example.com'
    );
  });

  it('getIdentifier omits the domain segment in domain-optional mode', () => {
    const ref = new CloudInfraReference('organization/cms/prod');
    expect(ref.getIdentifier('testAccount')).toBe('cms-testAccount-prod');
    expect(ref.get('testAccount').identifier).toBe('cms-testAccount-prod');
  });

  it('rejects a per-lookup { domain } on a domain-optional reference', () => {
    const ref = new CloudInfraReference('organization/cms/prod');
    expect(() => ref.get('testAccount', { domain: 'au' }).email).toThrow(
      /domain-optional reference/
    );
  });

  it('all() lists every flat string output', () => {
    primeOutputs({
      a: 'a@example.com',
      b: 'serviceAccount:b@example.com',
      notAString: 123,
    });
    const ref = new CloudInfraReference('organization/cms/prod');
    const entries = ref.all() as unknown as Array<{
      name: string;
      record: { email?: string };
    }>;
    // The non-string output is filtered out.
    expect(entries.map(e => e.name).sort()).toEqual(['a', 'b']);
    expect(entries.find(e => e.name === 'a')?.record.email).toBe(
      'a@example.com'
    );
  });
});

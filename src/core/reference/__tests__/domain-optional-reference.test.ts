import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReferenceWithoutDomain } from '../reference-without-domain';

// Mock the reference manager
const mockStackRef = {
  outputs: {
    apply: vi.fn(),
  },
};

vi.mock('../reference-manager', () => ({
  CloudInfraReference: {
    getStackRef: vi.fn(() => mockStackRef),
  },
}));

describe('DomainOptionalReference', () => {
  let domainOptionalRef: ReferenceWithoutDomain;

  beforeEach(() => {
    vi.clearAllMocks();
    domainOptionalRef = new ReferenceWithoutDomain({
      stack: 'organization/cms/prod',
    });
  });

  describe('String Value Handling', () => {
    it('should handle email format string values', () => {
      // Mock stack outputs with string values
      const mockStackOutputs = {
        'ciServiceAccountEmail': 'ci-service@cms-prod.iam.gserviceaccount.com',
        'anotherAccount': 'another@project.iam.gserviceaccount.com',
      };

      mockStackRef.outputs.apply.mockImplementation((fn: (outputs: unknown) => unknown) => {
        const result = fn(mockStackOutputs);
        return {
          apply: (callback: (result: unknown) => unknown) => callback(result),
        };
      });

      domainOptionalRef.get('ciServiceAccountEmail');
      
      // Since we're mocking, we can directly check the result
      const result = mockStackRef.outputs.apply.mock.calls[0][0](mockStackOutputs);

      expect(result).toEqual({
        email: 'ci-service@cms-prod.iam.gserviceaccount.com',
        member: 'serviceAccount:ci-service@cms-prod.iam.gserviceaccount.com',
        id: 'ci-service@cms-prod.iam.gserviceaccount.com',
        name: 'ci-service',
      });
    });

    it('should handle member format string values', () => {
      // Mock stack outputs with member format string values
      const mockStackOutputs = {
        'anotherAccount': 'serviceAccount:another@project.iam.gserviceaccount.com',
      };

      mockStackRef.outputs.apply.mockImplementation((fn: (outputs: unknown) => unknown) => {
        const result = fn(mockStackOutputs);
        return {
          apply: (callback: (result: unknown) => unknown) => callback(result),
        };
      });

      domainOptionalRef.get('anotherAccount');
      
      // Since we're mocking, we can directly check the result
      const result = mockStackRef.outputs.apply.mock.calls[0][0](mockStackOutputs);

      expect(result).toEqual({
        email: 'another@project.iam.gserviceaccount.com',
        member: 'serviceAccount:another@project.iam.gserviceaccount.com',
        id: 'another@project.iam.gserviceaccount.com',
        name: 'another',
      });
    });

    it('should throw error for missing keys', () => {
      const mockStackOutputs = {
        'existingKey': 'existing@example.com',
      };

      mockStackRef.outputs.apply.mockImplementation((fn: (outputs: unknown) => unknown) => {
        const result = fn(mockStackOutputs);
        return {
          apply: (callback: (result: unknown) => unknown) => callback(result),
        };
      });

      expect(() => {
        domainOptionalRef.get('missingKey');
        // Trigger the apply function to test the error
        mockStackRef.outputs.apply.mock.calls[0][0](mockStackOutputs);
      }).toThrow(
        "Domain-optional resource 'missingKey' not found in stack 'organization/cms/prod'. Available keys: [existingKey]"
      );
    });

    it('should throw error for non-string values', () => {
      const mockStackOutputs = {
        'invalidKey': { email: 'test@example.com', member: 'serviceAccount:test@example.com' },
      };

      mockStackRef.outputs.apply.mockImplementation((fn: (outputs: unknown) => unknown) => {
        const result = fn(mockStackOutputs);
        return {
          apply: (callback: (result: unknown) => unknown) => callback(result),
        };
      });

      expect(() => {
        domainOptionalRef.get('invalidKey');
        // Trigger the apply function to test the error
        mockStackRef.outputs.apply.mock.calls[0][0](mockStackOutputs);
      }).toThrow(
        "Expected string value for 'invalidKey' in stack 'organization/cms/prod', got object"
      );
    });
  });

  describe('Public API Methods', () => {
    beforeEach(() => {
      const mockStackOutputs = {
        'testAccount': 'test@example.com',
      };

      mockStackRef.outputs.apply.mockImplementation((fn: (outputs: unknown) => unknown) => {
        const result = fn(mockStackOutputs);
        return {
          apply: (callback: (result: unknown) => unknown) => callback(result),
        };
      });
    });

    it('should return email via getEmail method', () => {
      domainOptionalRef.getEmail('testAccount');
      
      // Test that the method was called correctly
      expect(mockStackRef.outputs.apply).toHaveBeenCalled();
      
      // Test the conversion logic by calling the function directly
      const mockStackOutputs = { 'testAccount': 'test@example.com' };
      const result = mockStackRef.outputs.apply.mock.calls[0][0](mockStackOutputs);
      expect(result.email).toBe('test@example.com');
    });

    it('should return member via getMember method', () => {
      domainOptionalRef.getMember('testAccount');
      
      // Test that the method was called correctly
      expect(mockStackRef.outputs.apply).toHaveBeenCalled();
      
      // Test the conversion logic by calling the function directly
      const mockStackOutputs = { 'testAccount': 'test@example.com' };
      const result = mockStackRef.outputs.apply.mock.calls[0][0](mockStackOutputs);
      expect(result.member).toBe('serviceAccount:test@example.com');
    });

    it('should return identifier via getIdentifier method', () => {
      const result = domainOptionalRef.getIdentifier('testAccount');
      expect(result).toBe('cms-testAccount-prod');
    });
  });

  describe('Stack Format Validation', () => {
    it('should throw error for invalid stack format', () => {
      expect(() => {
        new ReferenceWithoutDomain({
          stack: 'invalid-format',
        });
      }).toThrow("Stack must be in 'organization/project/environment' format (e.g. 'organization/base/dev')");
    });

    it('should accept valid stack format', () => {
      expect(() => {
        new ReferenceWithoutDomain({
          stack: 'organization/base/dev',
        });
      }).not.toThrow();
    });
  });
});
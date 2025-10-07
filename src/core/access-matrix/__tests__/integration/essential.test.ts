import { describe, test, expect, vi, beforeEach } from 'vitest';
import * as pulumi from '@pulumi/pulumi';
import * as gcp from '@pulumi/gcp';

// Import the core components
import { CloudInfraAccessMatrix } from '../..';
import { ConfigResolver } from '../../core/config-resolver';
import { PrincipalFactory } from '../../principals/principal-factory';
import { ResourceRegistry } from '../../resources/resource-registry';
import { PolicyRuleProcessor } from '../../core/policy-rule-processor';

// Import test utilities
import {
  TestResourceFactory,
  TestPrincipalFactory,
  TestScenarios,
  TestMatrixBuilder,
} from '../fixtures/test-builders';
import { createMockOutput } from '../fixtures/mock-resources';

// Mock Pulumi modules
vi.mock('@pulumi/pulumi', () => ({
  Config: vi.fn(() => ({
    getObject: vi.fn().mockReturnValue({}),
    require: vi.fn((key: string) => {
      // Mock required config values for tests
      const mockConfigs: Record<string, string> = {
        'organizationId': 'test-org-id',
        'billingAccountId': 'test-billing-account',
        'organizationName': 'Test-Org',
        'defaultOutputKey': 'test-key',
      };
      return mockConfigs[key] || `mock-${key}`;
    }),
  })),
  CustomResource: vi.fn(),
  output: vi.fn((value) => ({ 
    apply: vi.fn((fn) => fn(value)), 
    __isOutput: true,
    isSecret: false,
  })),
  Output: {
    isInstance: vi.fn((obj) => obj && obj.__isOutput === true),
  },
  StackReference: vi.fn((stack) => {
    // Mock the stack output structure that contains resource data
    const mockStackOutput = {
      project: {
        'gcp:serviceaccount:Account': {
          'admin-sa': {
            id: 'admin-sa',
            name: 'admin-sa',
            email: 'admin-sa@test-project.iam.gserviceaccount.com',
            member: 'serviceAccount:admin-sa@test-project.iam.gserviceaccount.com'
          },
          'service-sa': {
            id: 'service-sa',
            name: 'service-sa',
            email: 'service-sa@test-project.iam.gserviceaccount.com',
            member: 'serviceAccount:service-sa@test-project.iam.gserviceaccount.com'
          },
          'shared-sa': {
            id: 'shared-sa',
            name: 'shared-sa',
            email: 'shared-sa@test-project.iam.gserviceaccount.com',
            member: 'serviceAccount:shared-sa@test-project.iam.gserviceaccount.com'
          }
        }
      }
    };
    
    return {
      stack,
      getOutput: vi.fn(() => ({
        apply: vi.fn((fn) => {
          // fn processes the raw stack output and returns a resource
          const resource = fn(mockStackOutput);
          // Return another Output with the resource as the value
          return {
            apply: vi.fn((resourceFn) => resourceFn(resource)),
            __isOutput: true,
            isSecret: false,
          };
        }),
        __isOutput: true,
        isSecret: false,
      })),
      outputs: {
        apply: vi.fn((fn) => {
          // For domain-optional resolution, provide string values (not objects)
          const domainOptionalOutputs = {
            'service-sa': 'service-sa@test-project.iam.gserviceaccount.com'
          };
          const result = fn(domainOptionalOutputs);
          // Return another Output with the result
          return {
            apply: vi.fn((resourceFn) => resourceFn(result)),
            __isOutput: true,
            isSecret: false,
          };
        }),
        __isOutput: true,
        isSecret: false,
      },
    };
  }),
  interpolate: vi.fn((template, ...args) => {
    // Mock interpolate to return a simple string concatenation
    const templateStr = Array.isArray(template) ? template.join('') : String(template);
    return templateStr + args.join('');
  }),
  log: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@pulumi/gcp', () => {
  // Create base classes for instanceof checks inside the mock
  class MockBucket {
    name: pulumi.Input<string>;
    __pulumiType: string;
    __name: string;
    
    constructor(name: string, args?: { name?: pulumi.Input<string> }) {
      this.name = args?.name || name;
      this.__pulumiType = 'gcp:storage/bucket:Bucket';
      this.__name = name;
    }
  }

  class MockServiceAccount {
    name: pulumi.Input<string>;
    email: pulumi.Input<string>;
    __pulumiType: string;
    __name: string;
    
    constructor(name: string, args?: { name?: pulumi.Input<string>; email?: pulumi.Input<string> }) {
      this.name = args?.name || name;
      this.email = args?.email || `${name}@test-project.iam.gserviceaccount.com`;
      this.__pulumiType = 'gcp:serviceaccount/account:Account';
      this.__name = name;
    }
  }

  return {
    storage: {
      BucketIAMMember: vi.fn().mockImplementation((name, args) => ({ name, args })),
      Bucket: MockBucket,
    },
    serviceaccount: {
      IAMMember: vi.fn().mockImplementation((name, args) => ({ name, args })),
      Account: MockServiceAccount,
    },
  organizations: {
    Project: vi.fn(function(this: any) {
      Object.assign(this, { __pulumiType: 'gcp:organizations/project:Project' });
    }),
          Folder: vi.fn(function(this: any) {
        Object.assign(this, { __pulumiType: 'gcp:organizations/folder:Folder' });
      }),
  },
  projects: {
    IAMMember: vi.fn().mockImplementation((name, args) => ({ name, args })),
  },
  folder: {
    IAMMember: vi.fn().mockImplementation((name, args) => ({ name, args })),
  },
  cloudrunv2: {
    ServiceIamMember: vi.fn().mockImplementation((name, args) => ({ name, args })),
    JobIamMember: vi.fn().mockImplementation((name, args) => ({ name, args })),
    Service: vi.fn(function(this: any) {
      Object.assign(this, { __pulumiType: 'gcp:cloudrunv2/service:Service' });
    }),
    Job: vi.fn(function(this: any) {
      Object.assign(this, { __pulumiType: 'gcp:cloudrunv2/job:Job' });
    }),
  },
  secretmanager: {
    SecretIamMember: vi.fn().mockImplementation((name, args) => ({ name, args })),
    RegionalSecretIamMember: vi.fn().mockImplementation((name, args) => ({ name, args })),
    Secret: vi.fn(function(this: any) {
      Object.assign(this, { __pulumiType: 'gcp:secretmanager/secret:Secret' });
    }),
    RegionalSecret: vi.fn(function(this: any) {
      Object.assign(this, { __pulumiType: 'gcp:secretmanager/regionalSecret:RegionalSecret' });
    }),
  },
  artifactregistry: {
    RepositoryIamMember: vi.fn().mockImplementation((name, args) => ({ name, args })),
    Repository: vi.fn(function(this: any) {
      Object.assign(this, { __pulumiType: 'gcp:artifactregistry/repository:Repository' });
    }),
  },
      compute: {
      SubnetworkIAMMember: vi.fn().mockImplementation((name, args) => ({ name, args })),
      Subnetwork: vi.fn(function(this: any) {
        Object.assign(this, { __pulumiType: 'gcp:compute/subnetwork:Subnetwork' });
      }),
    },
  };
});

describe('Critical Test Cases - Access Matrix', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear any cached state
    ResourceRegistry.clearCache();
    PrincipalFactory.clear();
  });

  describe('1. Principal Resolution Chain', () => {
    test('should resolve string principals correctly', () => {
      const principal = 'serviceAccount:test@project.iam.gserviceaccount.com';
      const resolved = PrincipalFactory.resolvePrincipal(principal, 0);

      expect(resolved.member).toBe(principal);
      expect(resolved.identifier).toBe('test@project.iam.gserviceaccount.com');
    });

    test('should resolve Output principals correctly', () => {
      const outputValue = 'user:admin@company.com';
      const output = createMockOutput(outputValue, 'admin-user');
      const resolved = PrincipalFactory.resolvePrincipal(output, 0);

      expect(resolved.member).toBe(output);
      expect(resolved.identifier).toBe('admin-user');
    });

    test('should resolve resource principals correctly', () => {
      const sa = TestResourceFactory.serviceAccount('test-sa', 'test-sa@project.iam');
      const resolved = PrincipalFactory.resolvePrincipal(sa, 0);

      expect(resolved.member).toContain('serviceAccount:test-sa@project.iam');
      expect(resolved.identifier).toBe('test-sa');
    });

    test('should resolve matrix object principals correctly', () => {
      const matrixObj = TestPrincipalFactory.matrixObject('organization/test-project/dev', 'admin-sa', 'project');
      const resolved = PrincipalFactory.resolvePrincipal(matrixObj, 0);

      expect(resolved.identifier).toBe('test-project-admin-sa-dev-project');
    });

    test('should handle bulk principal expansion', () => {
      const bulkAccounts = TestResourceFactory.bulkAccounts({
        dev: 'dev-sa',
        prod: 'prod-sa',
      });

      const expanded = PrincipalFactory.expandPrincipals([bulkAccounts]);
      expect(expanded).toHaveLength(2);
    });

    test('should deduplicate principals correctly', () => {
      const principals = [
        'user:admin@company.com',
        'user:admin@company.com', // duplicate
        'serviceAccount:sa@project.iam',
      ];

      const deduplicated = PrincipalFactory.deduplicate(principals);
      expect(deduplicated).toHaveLength(2);
    });
  });

  describe('2. Resource Discovery Chain', () => {
    test('should discover resource type from __pulumiType', () => {
      const bucket = TestResourceFactory.bucket('test-bucket');
      const handler = ResourceRegistry.getHandler(bucket);

      expect(handler.supportedType).toBe('gcp:storage/bucket:Bucket');
    });

    test('should discover resource type from component getters', () => {
      const bucketComponent = TestResourceFactory.bucketComponent('wrapped-bucket');
      const handler = ResourceRegistry.getHandler(bucketComponent);

      expect(handler.supportedType).toBe('gcp:storage/bucket:Bucket');
    });

    test('should extract resource names correctly', () => {
      const bucket = TestResourceFactory.bucket('my-test-bucket');
      const name = ResourceRegistry.getResourceName(bucket);

      expect(name).toBe('my-test-bucket');
    });

    test('should extract Pulumi resources from components', () => {
      const bucketComponent = TestResourceFactory.bucketComponent('wrapped-bucket');
      const extracted = ResourceRegistry.extractPulumiResource(bucketComponent);

      expect(extracted).toHaveProperty('__pulumiType', 'gcp:storage/bucket:Bucket');
    });

    test('should handle unsupported resource types', () => {
      const unsupportedResource = { __pulumiType: 'unsupported:resource:Type' };

      expect(() => ResourceRegistry.getHandler(unsupportedResource)).toThrow();
    });
  });

  describe('3. End-to-End IAM Creation Flow', () => {
    test('should create IAM bindings for simple scenario', () => {
      const cases = TestScenarios.simple();
      const matrix = new CloudInfraAccessMatrix(cases);

      expect(matrix.getPolicyRuleCount()).toBeGreaterThan(0);
    });

    test('should handle complex multi-resource scenario', () => {
      const cases = TestScenarios.complex();
      const matrix = new CloudInfraAccessMatrix(cases);

      expect(matrix.getPolicyRuleCount()).toBeGreaterThan(1); // Multiple rules
    });

    test('should process bulk resources correctly', () => {
      const cases = TestScenarios.bulk();
      const matrix = new CloudInfraAccessMatrix(cases);

      // Should create IAM bindings for each account in the bulk resource
      expect(matrix.getPolicyRuleCount()).toBe(3); // dev, staging, prod
    });

    test('should handle component resources', () => {
      const cases = TestScenarios.components();
      const matrix = new CloudInfraAccessMatrix(cases);

      expect(matrix.getPolicyRuleCount()).toBeGreaterThan(0);
    });
  });

  describe('4. Type Safety Validation', () => {
    test('should handle unknown resource types safely', () => {
      const unknownResource = { someProperty: 'value' };

      expect(() => {
        ResourceRegistry.getHandler(unknownResource);
      }).toThrow('Cannot determine resource type');
    });

    test('should handle malformed principals safely', () => {
      const malformedPrincipal = { invalid: 'principal' };

      expect(() => {
        PrincipalFactory.resolvePrincipal(malformedPrincipal, 0);
      }).toThrow('Principal of type \'object\' is not supported');
    });

    test('should validate resource property access safely', () => {
      const resourceWithoutName = { __pulumiType: 'gcp:storage/bucket:Bucket' };
      
      expect(() => {
        const handler = ResourceRegistry.getHandler(resourceWithoutName);
        handler.extractResourceInfo(resourceWithoutName);
      }).toThrow('Unable to determine bucket name');
    });

    test('should handle null/undefined inputs gracefully', () => {
      expect(() => ResourceRegistry.getHandler(null)).toThrow();
      expect(() => ResourceRegistry.getHandler(undefined)).toThrow();
      expect(() => PrincipalFactory.resolvePrincipal(null, 0)).toThrow();
      expect(() => PrincipalFactory.resolvePrincipal(undefined, 0)).toThrow();
    });
  });

  describe('5. Error Boundary Testing', () => {
    test('should handle configuration validation errors', () => {
      const mockConfig = vi.mocked(pulumi.Config);
      mockConfig.mockImplementation((): any => ({
        getObject: vi.fn().mockReturnValue({
          'invalid-case': [{ invalid: 'principal-object' }],
        }),
      }));

      const resolver = new ConfigResolver();
      const config = resolver.resolveConfig('invalid-case');

      // Should return empty array for invalid principals
      expect(config.principals).toEqual([]);
    });

    test('should handle IAM creation failures gracefully', () => {
      const mockIAMConstructor = vi.mocked(gcp.storage.BucketIAMMember);
      const originalImplementation = mockIAMConstructor.getMockImplementation();
      
      mockIAMConstructor.mockImplementation(() => {
        throw new Error('IAM creation failed');
      });

      const processor = new PolicyRuleProcessor();
      const rule = {
        resource: TestResourceFactory.bucket('test-bucket'),
        role: 'roles/storage.objectViewer',
        principals: ['user:test@company.com'],
      };

      expect(() => {
        processor.processUseCase(
          { rules: [rule] },
          { principals: [] },
          'test-case'
        );
      }).toThrow('Failed to process access matrix rule');

      // Restore the original mock implementation
      if (originalImplementation) {
        mockIAMConstructor.mockImplementation(originalImplementation);
      } else {
        mockIAMConstructor.mockImplementation((name, args) => ({
          name,
          args,
          bucket: args.bucket,
          condition: args.condition,
          member: args.member,
          role: args.role,
          id: `${name}-id`
        }) as any);
      }
    });

    test('should handle resource extraction failures', () => {
      const emptyBucket = { __pulumiType: 'gcp:storage/bucket:Bucket' };
      const handler = ResourceRegistry.getHandler(emptyBucket);

      expect(() => {
        handler.extractResourceInfo(emptyBucket);
      }).toThrow('Unable to determine bucket name');
    });
  });

  describe('6. Real-World Scenarios', () => {
    test('should handle mixed resource types in single matrix', () => {
      const cases = TestScenarios.mixed();
      const matrix = new CloudInfraAccessMatrix(cases);

      expect(matrix.getPolicyRuleCount()).toBe(6); // 2 principals × 3 resources (bucket + project + secret)
    });

    test('should handle cross-environment principal access', () => {
      const builder = new TestMatrixBuilder();
      const caseBuilder = builder.addCase('multi-env')
        .withPrincipals([
          TestPrincipalFactory.user('admin@company.com'),
          TestPrincipalFactory.matrixObject('organization/test-project/dev', 'service-sa') as any,
          TestPrincipalFactory.matrixObject('organization/test-project/prod', 'service-sa') as any,
        ]);
      
      caseBuilder.addRule()
        .withResource(TestResourceFactory.bucket('shared-data'))
        .withRole('roles/storage.objectViewer')
        .build();
      
      const multiEnvCases = caseBuilder.build().build();

      const matrix = new CloudInfraAccessMatrix(multiEnvCases);

      expect(matrix.getPolicyRuleCount()).toBeGreaterThan(0);
    });

    test('should handle regional vs global resources', () => {
      const regionalSecret = TestResourceFactory.secret('regional-secret', 'us-central1');
      const globalSecret = TestResourceFactory.secret('global-secret');

      const builder = new TestMatrixBuilder();
      const caseBuilder = builder.addCase('regional-test');
      
      caseBuilder.addRule()
        .withResource(regionalSecret)
        .withRole('roles/secretmanager.secretAccessor')
        .withPrincipals([TestPrincipalFactory.user('regional-user@company.com')])
        .build();
      
      caseBuilder.addRule()
        .withResource(globalSecret)
        .withRole('roles/secretmanager.secretAccessor')
        .withPrincipals([TestPrincipalFactory.user('global-user@company.com')])
        .build();
        
      const cases = caseBuilder.build().build();

      const matrix = new CloudInfraAccessMatrix(cases);

      expect(matrix.getPolicyRuleCount()).toBe(2);
    });
  });

  describe('7. Performance & Scale', () => {
    test('should handle large matrices efficiently', () => {
      const builder = new TestMatrixBuilder();
      const caseBuilder = builder.addCase('large-scale');

      // Create 50 rules with different resources
      for (let i = 0; i < 50; i++) {
        caseBuilder.addRule()
          .withResource(TestResourceFactory.bucket(`bucket-${i}`))
          .withRole('roles/storage.objectViewer')
          .withPrincipals([TestPrincipalFactory.user(`user-${i}@company.com`)])
          .build();
      }

      const cases = caseBuilder.build().build();
      const matrix = new CloudInfraAccessMatrix(cases);

      expect(matrix.getPolicyRuleCount()).toBe(50);
    });

    test('should handle principal deduplication at scale', () => {
      const duplicatePrincipals = Array(100).fill('user:admin@company.com');
      const uniquePrincipals = Array.from({ length: 50 }, (_, i) => `user:user-${i}@company.com`);
      const allPrincipals = [...duplicatePrincipals, ...uniquePrincipals];

      const deduplicated = PrincipalFactory.deduplicate(allPrincipals);

      expect(deduplicated.length).toBe(51); // 1 admin + 50 unique users
    });
  });
}); 
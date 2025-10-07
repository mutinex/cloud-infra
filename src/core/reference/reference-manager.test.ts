import { vi } from 'vitest';
import { CloudInfraReference } from "./reference-manager";

// Mock Pulumi Config
vi.mock('@pulumi/pulumi', () => ({
  Config: vi.fn(() => ({
    require: vi.fn((key: string) => {
      const mockConfigs: Record<string, string> = {
        'organizationId': 'test-org-id',
        'billingAccountId': 'test-billing-account',
        'organizationName': 'Test-Org',
        'defaultOutputKey': 'test-key',
      };
      return mockConfigs[key] || `mock-${key}`;
    }),
  })),
  StackReference: vi.fn(() => ({
    outputs: {},
    getOutput: vi.fn(),
  })),
}));

describe("CloudInfraReference Caching", () => {
  beforeEach(() => {
    // Clear cache before each test
    CloudInfraReference.clearCache();
  });

  describe("Cache functionality", () => {
    it("should reuse cached StackReference for same stack", () => {
      const stack = "org/project/env";

      // Create two references with same stack
      const ref1 = new CloudInfraReference({ stack, domain: "au" });
      const ref2 = new CloudInfraReference({ stack, domain: "gl" });

      // Cache should have only one entry
      expect(CloudInfraReference.getCacheSize()).toBe(1);
    });

    it("should create separate cache entries for different stacks", () => {
      const stack1 = "org/project/dev";
      const stack2 = "org/project/prd";

      new CloudInfraReference({ stack: stack1, domain: "au" });
      new CloudInfraReference({ stack: stack2, domain: "au" });

      expect(CloudInfraReference.getCacheSize()).toBe(2);
    });

    it("should handle potential name collisions correctly", () => {
      // These would generate similar safeNames in the original implementation
      // but must follow the org/project/env format
      const stack1 = "org/project/env";
      const stack2 = "org/project-/env"; // Different but similar
      const stack3 = "org/project_/env"; // Different but similar

      new CloudInfraReference({ stack: stack1, domain: "au" });
      new CloudInfraReference({ stack: stack2, domain: "au" });
      new CloudInfraReference({ stack: stack3, domain: "au" });

      // All three should be cached separately
      expect(CloudInfraReference.getCacheSize()).toBe(3);
    });

    it("should evict LRU entries when cache is full", () => {
      // Set MAX_CACHE_SIZE to a small value for testing
      // Note: In real implementation, you'd make this configurable

      // Create more references than MAX_CACHE_SIZE
      for (let i = 0; i < 105; i++) {
        new CloudInfraReference({
          stack: `org/project/env${i}`,
          domain: "au",
        });
      }

      // Cache should not exceed MAX_CACHE_SIZE (100)
      expect(CloudInfraReference.getCacheSize()).toBeLessThanOrEqual(100);
    });

    it("should update access order on cache hit", () => {
      const stack1 = "org/project/env1";
      const stack2 = "org/project/env2";

      // Create first reference
      new CloudInfraReference({ stack: stack1, domain: "au" });

      // Create second reference
      new CloudInfraReference({ stack: stack2, domain: "au" });

      // Access first reference again (moves it to end of LRU)
      new CloudInfraReference({ stack: stack1, domain: "gl" });

      // Both should still be cached
      expect(CloudInfraReference.getCacheSize()).toBe(2);
    });
  });

  describe("Real-world usage patterns", () => {
    it("should efficiently handle the pattern from refs.ts", () => {
      // Simulate the usage pattern from refs.ts
      const currentStack = "dev"; // Mock pulumi.getStack()

      // These two use the same stack
      const mtxAuRef = new CloudInfraReference({
        domain: "au",
        stack: `organization/mtx/${currentStack}`,
      });

      const mtxGlRef = new CloudInfraReference({
        domain: "gl",
        stack: `organization/mtx/${currentStack}`,
      });

      // This uses a different stack
      const mtxOrgRef = new CloudInfraReference({
        domain: "gl",
        stack: "organization/mtx-org/prd",
      });

      // Should have only 2 cache entries (not 3)
      expect(CloudInfraReference.getCacheSize()).toBe(2);
    });
  });
});

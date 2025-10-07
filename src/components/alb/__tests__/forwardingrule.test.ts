import { describe, it, expect, beforeEach, vi } from "vitest";

import {
  createGlobalForwardingRule,
  createRegionalForwardingRule,
  createForwardingRule,
} from "../forwardingrule";
import { CloudInfraMeta } from "../../../core/meta";
import { ResourceError } from "../../../core/errors";

// Mock Pulumi GCP
vi.mock("@pulumi/gcp", () => ({
  compute: {
    GlobalForwardingRule: vi.fn(),
    ForwardingRule: vi.fn(),
  },
}));

// Import mocked modules after mocking
import * as gcp from "@pulumi/gcp";
const mockGlobalForwardingRule = vi.mocked(gcp.compute.GlobalForwardingRule);
const mockForwardingRule = vi.mocked(gcp.compute.ForwardingRule);

// Mock CloudInfraMeta
const mockMeta = {
  getGcpProject: vi.fn(() => "test-project"),
  getName: vi.fn(() => "test-alb"),
  getRegion: vi.fn(() => "us-central1"),
} as unknown as CloudInfraMeta;

describe("forwardingrule.ts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createGlobalForwardingRule", () => {
    beforeEach(() => {
      const mockForwardingRuleInstance = {
        ipAddress: "192.168.1.1",
        selfLink: "projects/test-project/global/forwardingRules/test-alb",
        id: "test-alb",
        name: "test-alb",
        project: "test-project",
        target: "projects/test-project/global/targetHttpsProxies/test-proxy",
        loadBalancingScheme: "EXTERNAL_MANAGED",
        portRange: "80",
      } as unknown as gcp.compute.GlobalForwardingRule;
      mockGlobalForwardingRule.mockImplementation(
        () => mockForwardingRuleInstance,
      );
    });

    it("should create global forwarding rule with default configuration", () => {
      const params = {
        meta: mockMeta,
        config: {
          target: "projects/test-project/global/targetHttpsProxies/test-proxy",
        },
        ipAddress: "192.168.1.1",
        target: "projects/test-project/global/targetHttpsProxies/test-proxy",
        resourceName: "test-alb",
      };

      const result = createGlobalForwardingRule(params);

      expect(mockGlobalForwardingRule).toHaveBeenCalledWith("test-alb", {
        loadBalancingScheme: "EXTERNAL_MANAGED",
        portRange: "80",
        project: "test-project",
        ipAddress: "192.168.1.1",
        target: "projects/test-project/global/targetHttpsProxies/test-proxy",
      });

      expect(result.forwardingRule).toBeDefined();
    });

    it("should pass through user configuration", () => {
      const userConfig = {
        description: "Custom forwarding rule",
        labels: { env: "test" },
        portRange: "443",
        target: "projects/test-project/global/targetHttpsProxies/test-proxy",
      };

      const params = {
        meta: mockMeta,
        config: userConfig,
        ipAddress: "192.168.1.1",
        target: "projects/test-project/global/targetHttpsProxies/test-proxy",
        resourceName: "test-alb",
      };

      createGlobalForwardingRule(params);

      expect(mockGlobalForwardingRule).toHaveBeenCalledWith("test-alb", {
        loadBalancingScheme: "EXTERNAL_MANAGED",
        portRange: "443", // User override
        project: "test-project",
        description: "Custom forwarding rule",
        labels: { env: "test" },
        ipAddress: "192.168.1.1",
        target: "projects/test-project/global/targetHttpsProxies/test-proxy",
      });
    });

    it("should allow project override", () => {
      const userConfig = {
        project: "override-project",
        description: "Custom forwarding rule",
        target: "projects/test-project/global/targetHttpsProxies/test-proxy",
      };

      const params = {
        meta: mockMeta,
        config: userConfig,
        ipAddress: "192.168.1.1",
        target: "projects/test-project/global/targetHttpsProxies/test-proxy",
        resourceName: "test-alb",
      };

      createGlobalForwardingRule(params);

      expect(mockGlobalForwardingRule).toHaveBeenCalledWith("test-alb", {
        loadBalancingScheme: "EXTERNAL_MANAGED",
        portRange: "80",
        project: "override-project",
        description: "Custom forwarding rule",
        ipAddress: "192.168.1.1",
        target: "projects/test-project/global/targetHttpsProxies/test-proxy",
      });
    });

    it("should not allow ipAddress override in config", () => {
      const userConfig = {
        ipAddress: "10.0.0.1", // This should be overridden by function parameter
        target: "projects/test-project/global/targetHttpsProxies/test-proxy",
      };

      const params = {
        meta: mockMeta,
        config: userConfig,
        ipAddress: "192.168.1.1", // Function parameter takes precedence
        target: "projects/test-project/global/targetHttpsProxies/test-proxy",
        resourceName: "test-alb",
      };

      createGlobalForwardingRule(params);

      expect(mockGlobalForwardingRule).toHaveBeenCalledWith("test-alb", {
        loadBalancingScheme: "EXTERNAL_MANAGED",
        portRange: "80",
        project: "test-project",
        ipAddress: "192.168.1.1", // Function-controlled parameter
        target: "projects/test-project/global/targetHttpsProxies/test-proxy",
      });
    });

    it("should not allow target override in config", () => {
      const userConfig = {
        target: "projects/test-project/global/targetHttpProxies/other-proxy", // Should be overridden
      };

      const params = {
        meta: mockMeta,
        config: userConfig,
        ipAddress: "192.168.1.1",
        target: "projects/test-project/global/targetHttpsProxies/test-proxy", // Function parameter takes precedence
        resourceName: "test-alb",
      };

      createGlobalForwardingRule(params);

      expect(mockGlobalForwardingRule).toHaveBeenCalledWith("test-alb", {
        loadBalancingScheme: "EXTERNAL_MANAGED",
        portRange: "80",
        project: "test-project",
        ipAddress: "192.168.1.1",
        target: "projects/test-project/global/targetHttpsProxies/test-proxy", // Function-controlled
      });
    });

    it("should throw ResourceError on creation failure", () => {
      mockGlobalForwardingRule.mockImplementation(() => {
        throw new Error("GCP Error");
      });

      const params = {
        meta: mockMeta,
        config: {
          target: "projects/test-project/global/targetHttpsProxies/test-proxy",
        },
        ipAddress: "192.168.1.1",
        target: "projects/test-project/global/targetHttpsProxies/test-proxy",
        resourceName: "test-alb",
      };

      expect(() => createGlobalForwardingRule(params)).toThrow(ResourceError);
      expect(() => createGlobalForwardingRule(params)).toThrow(
        "Failed to create global forwarding rule test-alb",
      );
    });
  });

  describe("createRegionalForwardingRule", () => {
    beforeEach(() => {
      const mockForwardingRuleInstance = {
        ipAddress: "10.0.0.1",
        selfLink:
          "projects/test-project/regions/us-central1/forwardingRules/test-alb",
        id: "test-alb",
        name: "test-alb",
        project: "test-project",
        region: "us-central1",
        target:
          "projects/test-project/regions/us-central1/targetHttpsProxies/test-proxy",
        loadBalancingScheme: "EXTERNAL_MANAGED",
        portRange: "80",
      } as unknown as gcp.compute.ForwardingRule;
      mockForwardingRule.mockImplementation(() => mockForwardingRuleInstance);
    });

    it("should create regional forwarding rule with default configuration", () => {
      const params = {
        meta: mockMeta,
        config: {
          target:
            "projects/test-project/regions/us-central1/targetHttpsProxies/test-proxy",
        },
        ipAddress: "10.0.0.1",
        target:
          "projects/test-project/regions/us-central1/targetHttpsProxies/test-proxy",
        resourceName: "test-alb",
        region: "us-central1",
      };

      const result = createRegionalForwardingRule(params);

      expect(mockForwardingRule).toHaveBeenCalledWith("test-alb", {
        loadBalancingScheme: "EXTERNAL_MANAGED",
        portRange: "80",
        project: "test-project",
        region: "us-central1",
        ipAddress: "10.0.0.1",
        target:
          "projects/test-project/regions/us-central1/targetHttpsProxies/test-proxy",
      });

      expect(result.forwardingRule).toBeDefined();
    });

    it("should pass through user configuration", () => {
      const userConfig = {
        description: "Regional forwarding rule",
        labels: { region: "us-central1" },
        portRange: "8080",
        target:
          "projects/test-project/regions/us-central1/targetHttpsProxies/test-proxy",
      };

      const params = {
        meta: mockMeta,
        config: userConfig,
        ipAddress: "10.0.0.1",
        target:
          "projects/test-project/regions/us-central1/targetHttpsProxies/test-proxy",
        resourceName: "test-alb",
        region: "us-central1",
      };

      createRegionalForwardingRule(params);

      expect(mockForwardingRule).toHaveBeenCalledWith("test-alb", {
        loadBalancingScheme: "EXTERNAL_MANAGED",
        portRange: "8080", // User override
        project: "test-project",
        region: "us-central1",
        description: "Regional forwarding rule",
        labels: { region: "us-central1" },
        ipAddress: "10.0.0.1",
        target:
          "projects/test-project/regions/us-central1/targetHttpsProxies/test-proxy",
      });
    });

    it("should allow project override", () => {
      const userConfig = {
        project: "override-project",
        description: "Regional forwarding rule",
        target:
          "projects/test-project/regions/us-central1/targetHttpsProxies/test-proxy",
      };

      const params = {
        meta: mockMeta,
        config: userConfig,
        ipAddress: "10.0.0.1",
        target:
          "projects/test-project/regions/us-central1/targetHttpsProxies/test-proxy",
        resourceName: "test-alb",
        region: "us-central1",
      };

      createRegionalForwardingRule(params);

      expect(mockForwardingRule).toHaveBeenCalledWith("test-alb", {
        loadBalancingScheme: "EXTERNAL_MANAGED",
        portRange: "80",
        project: "override-project",
        region: "us-central1",
        description: "Regional forwarding rule",
        ipAddress: "10.0.0.1",
        target:
          "projects/test-project/regions/us-central1/targetHttpsProxies/test-proxy",
      });
    });

    it("should not allow function-controlled parameter overrides", () => {
      const userConfig = {
        region: "europe-west1", // Should be overridden
        ipAddress: "192.168.1.1", // Should be overridden
        target: "other-target", // Should be overridden
      };

      const params = {
        meta: mockMeta,
        config: userConfig,
        ipAddress: "10.0.0.1", // Function parameter takes precedence
        target:
          "projects/test-project/regions/us-central1/targetHttpsProxies/test-proxy", // Function parameter
        resourceName: "test-alb",
        region: "us-central1", // Function parameter takes precedence
      };

      createRegionalForwardingRule(params);

      expect(mockForwardingRule).toHaveBeenCalledWith("test-alb", {
        loadBalancingScheme: "EXTERNAL_MANAGED",
        portRange: "80",
        project: "test-project",
        region: "us-central1", // Function-controlled
        ipAddress: "10.0.0.1", // Function-controlled
        target:
          "projects/test-project/regions/us-central1/targetHttpsProxies/test-proxy", // Function-controlled
      });
    });

    it("should throw ResourceError on creation failure", () => {
      mockForwardingRule.mockImplementation(() => {
        throw new Error("GCP Error");
      });

      const params = {
        meta: mockMeta,
        config: {
          target:
            "projects/test-project/regions/us-central1/targetHttpsProxies/test-proxy",
        },
        ipAddress: "10.0.0.1",
        target:
          "projects/test-project/regions/us-central1/targetHttpsProxies/test-proxy",
        resourceName: "test-alb",
        region: "us-central1",
      };

      expect(() => createRegionalForwardingRule(params)).toThrow(ResourceError);
      expect(() => createRegionalForwardingRule(params)).toThrow(
        "Failed to create regional forwarding rule test-alb",
      );
    });
  });

  describe("createForwardingRule (unified)", () => {
    beforeEach(() => {
      const mockGlobalInstance = {
        ipAddress: "192.168.1.1",
        selfLink: "projects/test-project/global/forwardingRules/test-alb",
        id: "test-alb",
        name: "test-alb",
        project: "test-project",
        target: "projects/test-project/global/targetHttpsProxies/test-proxy",
        loadBalancingScheme: "EXTERNAL_MANAGED",
        portRange: "80",
      } as unknown as gcp.compute.GlobalForwardingRule;

      const mockRegionalInstance = {
        ipAddress: "10.0.0.1",
        selfLink:
          "projects/test-project/regions/us-central1/forwardingRules/test-alb",
        id: "test-alb",
        name: "test-alb",
        project: "test-project",
        region: "us-central1",
        target:
          "projects/test-project/regions/us-central1/targetHttpsProxies/test-proxy",
        loadBalancingScheme: "EXTERNAL_MANAGED",
        portRange: "80",
      } as unknown as gcp.compute.ForwardingRule;

      mockGlobalForwardingRule.mockImplementation(() => mockGlobalInstance);
      mockForwardingRule.mockImplementation(() => mockRegionalInstance);
    });

    it("should create global forwarding rule when region is not provided", () => {
      const params = {
        meta: mockMeta,
        config: {
          description: "Global forwarding rule",
        },
        ipAddress: "192.168.1.1",
        target: "projects/test-project/global/targetHttpsProxies/test-proxy",
        resourceName: "test-alb",
      };

      const result = createForwardingRule(params);

      expect(mockGlobalForwardingRule).toHaveBeenCalledWith("test-alb", {
        loadBalancingScheme: "EXTERNAL_MANAGED",
        portRange: "80",
        project: "test-project",
        description: "Global forwarding rule",
        ipAddress: "192.168.1.1",
        target: "projects/test-project/global/targetHttpsProxies/test-proxy",
      });

      expect(result.resource).toBeDefined();
      expect(result.resource).toHaveProperty("selfLink");
    });

    it("should create regional forwarding rule when region is provided", () => {
      const params = {
        meta: mockMeta,
        config: {
          description: "Regional forwarding rule",
        },
        ipAddress: "10.0.0.1",
        target:
          "projects/test-project/regions/us-central1/targetHttpsProxies/test-proxy",
        resourceName: "test-alb",
        region: "us-central1",
      };

      const result = createForwardingRule(params);

      expect(mockForwardingRule).toHaveBeenCalledWith("test-alb", {
        loadBalancingScheme: "EXTERNAL_MANAGED",
        portRange: "80",
        project: "test-project",
        description: "Regional forwarding rule",
        region: "us-central1",
        ipAddress: "10.0.0.1",
        target:
          "projects/test-project/regions/us-central1/targetHttpsProxies/test-proxy",
      });

      expect(result.resource).toBeDefined();
      expect(result.resource).toHaveProperty("region");
    });

    it("should handle config overrides properly", () => {
      const params = {
        meta: mockMeta,
        config: {
          portRange: "443",
          labels: { env: "production" },
          project: "custom-project",
        },
        ipAddress: "192.168.1.1",
        target: "projects/test-project/global/targetHttpsProxies/test-proxy",
        resourceName: "test-alb",
      };

      createForwardingRule(params);

      expect(mockGlobalForwardingRule).toHaveBeenCalledWith("test-alb", {
        loadBalancingScheme: "EXTERNAL_MANAGED",
        portRange: "443",
        project: "custom-project",
        labels: { env: "production" },
        ipAddress: "192.168.1.1",
        target: "projects/test-project/global/targetHttpsProxies/test-proxy",
      });
    });

    it("should throw ResourceError on creation failure", () => {
      mockGlobalForwardingRule.mockImplementation(() => {
        throw new Error("GCP Error");
      });

      const params = {
        meta: mockMeta,
        config: {},
        ipAddress: "192.168.1.1",
        target: "projects/test-project/global/targetHttpsProxies/test-proxy",
        resourceName: "test-alb",
      };

      expect(() => createForwardingRule(params)).toThrow(ResourceError);
      expect(() => createForwardingRule(params)).toThrow(
        "Failed to create global forwarding rule test-alb",
      );
    });
  });
});

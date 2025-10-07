import { describe, it, expect, beforeEach, vi } from "vitest";

import { createGlobalAddress, createRegionalAddress } from "../address";
import { CloudInfraMeta } from "../../../core/meta";
import { ResourceError } from "../../../core/errors";

// Mock Pulumi GCP
vi.mock("@pulumi/gcp", () => ({
  compute: {
    GlobalAddress: vi.fn(),
    Address: vi.fn(),
  },
}));

// Import mocked modules
import * as gcp from "@pulumi/gcp";
const mockGlobalAddress = vi.mocked(gcp.compute.GlobalAddress);
const mockAddress = vi.mocked(gcp.compute.Address);

// Mock CloudInfraMeta
const mockMeta = {
  getGcpProject: vi.fn(() => "test-project"),
  getName: vi.fn(() => "test-alb"),
  getRegion: vi.fn(() => "us-central1"),
} as unknown as CloudInfraMeta;

describe("address.ts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createGlobalAddress", () => {
    beforeEach(() => {
      const mockAddressInstance = {
        address: "192.168.1.1",
        selfLink: "projects/test-project/global/addresses/test-alb",
      } as unknown as gcp.compute.GlobalAddress;
      mockGlobalAddress.mockImplementation(() => mockAddressInstance);
    });

    it("should create global address with default configuration", () => {
      const params = {
        meta: mockMeta,
        config: {},
        resourceName: "test-alb",
      };

      const result = createGlobalAddress(params);

      expect(mockGlobalAddress).toHaveBeenCalledWith("test-alb", {
        addressType: "EXTERNAL",
        project: "test-project",
      });

      expect(result.address).toBeDefined();
    });

    it("should pass through user configuration", () => {
      const userConfig = {
        description: "Custom description",
        labels: { env: "test" },
      };

      const params = {
        meta: mockMeta,
        config: userConfig,
        resourceName: "test-alb",
      };

      const result = createGlobalAddress(params);

      expect(mockGlobalAddress).toHaveBeenCalledWith("test-alb", {
        addressType: "EXTERNAL",
        project: "test-project",
        description: "Custom description",
        labels: { env: "test" },
      });

      expect(result.address).toBeDefined();
    });

    it("should allow project override", () => {
      const userConfig = {
        project: "override-project",
        description: "Custom description",
      };

      const params = {
        meta: mockMeta,
        config: userConfig,
        resourceName: "test-alb",
      };

      createGlobalAddress(params);

      expect(mockGlobalAddress).toHaveBeenCalledWith("test-alb", {
        addressType: "EXTERNAL",
        project: "override-project",
        description: "Custom description",
      });
    });

    it("should allow addressType override", () => {
      const userConfig = {
        addressType: "EXTERNAL", // User can override this
      };

      const params = {
        meta: mockMeta,
        config: userConfig,
        resourceName: "test-alb",
      };

      createGlobalAddress(params);

      // addressType should be user-provided value
      expect(mockGlobalAddress).toHaveBeenCalledWith("test-alb", {
        addressType: "EXTERNAL",
        project: "test-project",
      });
    });

    it("should throw ResourceError on creation failure", () => {
      mockGlobalAddress.mockImplementation(() => {
        throw new Error("GCP Error");
      });

      const params = {
        meta: mockMeta,
        config: {},
        resourceName: "test-alb",
      };

      expect(() => createGlobalAddress(params)).toThrow(ResourceError);
      expect(() => createGlobalAddress(params)).toThrow(
        "Failed to create global address test-alb",
      );
    });
  });

  describe("createRegionalAddress", () => {
    beforeEach(() => {
      const mockAddressInstance = {
        address: "10.0.0.1",
        selfLink:
          "projects/test-project/regions/us-central1/addresses/test-alb",
      } as unknown as gcp.compute.Address;
      mockAddress.mockImplementation(() => mockAddressInstance);
    });

    it("should create regional address with default configuration", () => {
      const params = {
        meta: mockMeta,
        config: {},
        resourceName: "test-alb",
        region: "us-central1",
      };

      const result = createRegionalAddress(params);

      expect(mockAddress).toHaveBeenCalledWith("test-alb", {
        addressType: "EXTERNAL",
        project: "test-project",
        region: "us-central1",
      });

      expect(result.address).toBeDefined();
    });

    it("should pass through user configuration", () => {
      const userConfig = {
        description: "Regional address",
        labels: { region: "us-central1" },
      };

      const params = {
        meta: mockMeta,
        config: userConfig,
        resourceName: "test-alb",
        region: "us-central1",
      };

      const result = createRegionalAddress(params);

      expect(mockAddress).toHaveBeenCalledWith("test-alb", {
        addressType: "EXTERNAL",
        project: "test-project",
        region: "us-central1",
        description: "Regional address",
        labels: { region: "us-central1" },
      });

      expect(result.address).toBeDefined();
    });

    it("should allow project override", () => {
      const userConfig = {
        project: "override-project",
        description: "Regional address",
      };

      const params = {
        meta: mockMeta,
        config: userConfig,
        resourceName: "test-alb",
        region: "us-central1",
      };

      createRegionalAddress(params);

      expect(mockAddress).toHaveBeenCalledWith("test-alb", {
        addressType: "EXTERNAL",
        project: "override-project",
        region: "us-central1",
        description: "Regional address",
      });
    });

    it("should not allow region override", () => {
      const userConfig = {
        region: "europe-west1", // This should be overridden
      };

      const params = {
        meta: mockMeta,
        config: userConfig,
        resourceName: "test-alb",
        region: "us-central1", // Function parameter takes precedence
      };

      createRegionalAddress(params);

      // region should be us-central1 (function-controlled)
      expect(mockAddress).toHaveBeenCalledWith("test-alb", {
        addressType: "EXTERNAL",
        project: "test-project",
        region: "us-central1",
      });
    });

    it("should throw ResourceError on creation failure", () => {
      mockAddress.mockImplementation(() => {
        throw new Error("GCP Error");
      });

      const params = {
        meta: mockMeta,
        config: {},
        resourceName: "test-alb",
        region: "us-central1",
      };

      expect(() => createRegionalAddress(params)).toThrow(ResourceError);
      expect(() => createRegionalAddress(params)).toThrow(
        "Failed to create regional address test-alb",
      );
    });
  });
});

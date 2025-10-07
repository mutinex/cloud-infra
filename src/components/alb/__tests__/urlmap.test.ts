import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock Pulumi GCP at the top to avoid hoisting issues
vi.mock("@pulumi/gcp", () => ({
  compute: {
    URLMap: vi.fn(),
    RegionUrlMap: vi.fn(),
  },
}));

import * as gcp from "@pulumi/gcp";
import { createGlobalUrlMap, createRegionalUrlMap } from "../urlmap";
import { CloudInfraMeta } from "../../../core/meta";
import { ResourceError } from "../../../core/errors";

// Mock CloudInfraMeta
const mockMeta = {
  getGcpProject: vi.fn(() => "test-project"),
  getName: vi.fn(() => "test-alb"),
  getRegion: vi.fn(() => "us-central1"),
} as unknown as CloudInfraMeta;

describe("urlmap.ts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createGlobalUrlMap", () => {
    beforeEach(() => {
      const mockUrlMapInstance = {
        selfLink: "projects/test-project/global/urlMaps/test-alb",
        id: "test-alb",
      };
      (gcp.compute.URLMap as any).mockImplementation(() => mockUrlMapInstance);
    });

    it("should create global URL map with minimal configuration", () => {
      const params = {
        meta: mockMeta,
        config: {},
        resourceName: "test-alb",
      };

      const result = createGlobalUrlMap(params);

      expect(gcp.compute.URLMap).toHaveBeenCalledWith("test-alb", {
        project: "test-project",
      });

      expect(result.urlMap).toBeDefined();
    });

    it("should pass through user configuration", () => {
      const userConfig = {
        description: "Custom URL map",
        defaultService:
          "projects/test-project/global/backendServices/default-backend",
        hostRules: [
          {
            hosts: ["example.com"],
            pathMatcher: "path-matcher-1",
          },
        ],
        pathMatchers: [
          {
            name: "path-matcher-1",
            defaultService:
              "projects/test-project/global/backendServices/api-backend",
            pathRules: [
              {
                paths: ["/api/*"],
                service:
                  "projects/test-project/global/backendServices/api-backend",
              },
            ],
          },
        ],
        labels: { env: "production" },
      };

      const params = {
        meta: mockMeta,
        config: userConfig,
        resourceName: "test-alb",
      };

      createGlobalUrlMap(params);

      expect(gcp.compute.URLMap).toHaveBeenCalledWith("test-alb", {
        project: "test-project",
        description: "Custom URL map",
        defaultService:
          "projects/test-project/global/backendServices/default-backend",
        hostRules: [
          {
            hosts: ["example.com"],
            pathMatcher: "path-matcher-1",
          },
        ],
        pathMatchers: [
          {
            name: "path-matcher-1",
            defaultService:
              "projects/test-project/global/backendServices/api-backend",
            pathRules: [
              {
                paths: ["/api/*"],
                service:
                  "projects/test-project/global/backendServices/api-backend",
              },
            ],
          },
        ],
        labels: { env: "production" },
      });
    });

    it("should allow project override", () => {
      const userConfig = {
        project: "override-project",
        description: "Custom URL map",
        defaultService:
          "projects/override-project/global/backendServices/default-backend",
      };

      const params = {
        meta: mockMeta,
        config: userConfig,
        resourceName: "test-alb",
      };

      createGlobalUrlMap(params);

      expect(gcp.compute.URLMap).toHaveBeenCalledWith("test-alb", {
        project: "override-project",
        description: "Custom URL map",
        defaultService:
          "projects/override-project/global/backendServices/default-backend",
      });
    });

    it("should handle complex routing rules", () => {
      const userConfig = {
        description: "Complex routing URL map",
        defaultService:
          "projects/test-project/global/backendServices/default-backend",
        hostRules: [
          {
            hosts: ["api.example.com"],
            pathMatcher: "api-matcher",
          },
          {
            hosts: ["admin.example.com"],
            pathMatcher: "admin-matcher",
          },
        ],
        pathMatchers: [
          {
            name: "api-matcher",
            defaultService:
              "projects/test-project/global/backendServices/api-backend",
            pathRules: [
              {
                paths: ["/v1/*"],
                service:
                  "projects/test-project/global/backendServices/api-v1-backend",
              },
              {
                paths: ["/v2/*"],
                service:
                  "projects/test-project/global/backendServices/api-v2-backend",
              },
            ],
          },
          {
            name: "admin-matcher",
            defaultService:
              "projects/test-project/global/backendServices/admin-backend",
          },
        ],
      };

      const params = {
        meta: mockMeta,
        config: userConfig,
        resourceName: "test-alb",
      };

      expect(() => createGlobalUrlMap(params)).not.toThrow();

      expect(gcp.compute.URLMap).toHaveBeenCalledWith(
        "test-alb",
        expect.objectContaining({
          project: "test-project",
          description: "Complex routing URL map",
          hostRules: expect.arrayContaining([
            expect.objectContaining({ hosts: ["api.example.com"] }),
            expect.objectContaining({ hosts: ["admin.example.com"] }),
          ]),
        }),
      );
    });

    it("should throw ResourceError on creation failure", () => {
      (gcp.compute.URLMap as any).mockImplementation(() => {
        throw new Error("GCP Error");
      });

      const params = {
        meta: mockMeta,
        config: {},
        resourceName: "test-alb",
      };

      expect(() => createGlobalUrlMap(params)).toThrow(ResourceError);
      expect(() => createGlobalUrlMap(params)).toThrow(
        "Failed to create global URL map test-alb",
      );
    });
  });

  describe("createRegionalUrlMap", () => {
    beforeEach(() => {
      const mockUrlMapInstance = {
        selfLink: "projects/test-project/regions/us-central1/urlMaps/test-alb",
        id: "test-alb",
      };
      (gcp.compute.RegionUrlMap as any).mockImplementation(
        () => mockUrlMapInstance,
      );
    });

    it("should create regional URL map with minimal configuration", () => {
      const params = {
        meta: mockMeta,
        config: {},
        resourceName: "test-alb",
        region: "us-central1",
      };

      const result = createRegionalUrlMap(params);

      expect(gcp.compute.RegionUrlMap).toHaveBeenCalledWith("test-alb", {
        project: "test-project",
        region: "us-central1",
      });

      expect(result.urlMap).toBeDefined();
    });

    it("should pass through user configuration", () => {
      const userConfig = {
        description: "Regional URL map",
        defaultService:
          "projects/test-project/regions/us-central1/backendServices/regional-backend",
        hostRules: [
          {
            hosts: ["regional.example.com"],
            pathMatcher: "regional-matcher",
          },
        ],
        pathMatchers: [
          {
            name: "regional-matcher",
            defaultService:
              "projects/test-project/regions/us-central1/backendServices/regional-api",
          },
        ],
      };

      const params = {
        meta: mockMeta,
        config: userConfig,
        resourceName: "test-alb",
        region: "us-central1",
      };

      createRegionalUrlMap(params);

      expect(gcp.compute.RegionUrlMap).toHaveBeenCalledWith("test-alb", {
        project: "test-project",
        region: "us-central1",
        description: "Regional URL map",
        defaultService:
          "projects/test-project/regions/us-central1/backendServices/regional-backend",
        hostRules: [
          {
            hosts: ["regional.example.com"],
            pathMatcher: "regional-matcher",
          },
        ],
        pathMatchers: [
          {
            name: "regional-matcher",
            defaultService:
              "projects/test-project/regions/us-central1/backendServices/regional-api",
          },
        ],
      });
    });

    it("should allow project override", () => {
      const userConfig = {
        project: "override-project",
        description: "Regional URL map with project override",
        defaultService:
          "projects/override-project/regions/us-central1/backendServices/backend",
      };

      const params = {
        meta: mockMeta,
        config: userConfig,
        resourceName: "test-alb",
        region: "us-central1",
      };

      createRegionalUrlMap(params);

      expect(gcp.compute.RegionUrlMap).toHaveBeenCalledWith("test-alb", {
        project: "override-project",
        region: "us-central1",
        description: "Regional URL map with project override",
        defaultService:
          "projects/override-project/regions/us-central1/backendServices/backend",
      });
    });

    it("should not allow region override", () => {
      const userConfig = {
        region: "europe-west1", // Should be overridden by function parameter
        description: "Regional URL map",
      };

      const params = {
        meta: mockMeta,
        config: userConfig,
        resourceName: "test-alb",
        region: "us-central1", // Function parameter takes precedence
      };

      createRegionalUrlMap(params);

      expect(gcp.compute.RegionUrlMap).toHaveBeenCalledWith("test-alb", {
        project: "test-project",
        region: "us-central1", // Function-controlled parameter
        description: "Regional URL map",
      });
    });

    it("should handle regional backend services", () => {
      const userConfig = {
        description: "Regional URL map with regional backends",
        defaultService:
          "projects/test-project/regions/us-central1/backendServices/default-regional",
        pathMatchers: [
          {
            name: "regional-api-matcher",
            defaultService:
              "projects/test-project/regions/us-central1/backendServices/api-regional",
            pathRules: [
              {
                paths: ["/api/regional/*"],
                service:
                  "projects/test-project/regions/us-central1/backendServices/api-regional",
              },
            ],
          },
        ],
      };

      const params = {
        meta: mockMeta,
        config: userConfig,
        resourceName: "test-alb",
        region: "us-central1",
      };

      expect(() => createRegionalUrlMap(params)).not.toThrow();

      expect(gcp.compute.RegionUrlMap).toHaveBeenCalledWith(
        "test-alb",
        expect.objectContaining({
          project: "test-project",
          region: "us-central1",
          description: "Regional URL map with regional backends",
          defaultService:
            "projects/test-project/regions/us-central1/backendServices/default-regional",
        }),
      );
    });

    it("should throw ResourceError on creation failure", () => {
      (gcp.compute.RegionUrlMap as any).mockImplementation(() => {
        throw new Error("GCP Error");
      });

      const params = {
        meta: mockMeta,
        config: {},
        resourceName: "test-alb",
        region: "us-central1",
      };

      expect(() => createRegionalUrlMap(params)).toThrow(ResourceError);
      expect(() => createRegionalUrlMap(params)).toThrow(
        "Failed to create regional URL map test-alb",
      );
    });
  });
});

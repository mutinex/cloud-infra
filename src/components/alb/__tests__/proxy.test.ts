import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock Pulumi GCP at the top to avoid hoisting issues
vi.mock("@pulumi/gcp", () => ({
  compute: {
    TargetHttpsProxy: vi.fn(),
    TargetHttpProxy: vi.fn(),
    RegionTargetHttpsProxy: vi.fn(),
    RegionTargetHttpProxy: vi.fn(),
  },
}));

import * as gcp from "@pulumi/gcp";
import {
  createTargetHttpsProxy,
  createTargetHttpProxy,
  createRegionalTargetHttpsProxy,
  createRegionalTargetHttpProxy,
} from "../proxy";
import { CloudInfraMeta } from "../../../core/meta";
import { ResourceError } from "../../../core/errors";

// Mock CloudInfraMeta
const mockMeta = {
  getGcpProject: vi.fn(() => "test-project"),
  getName: vi.fn(() => "test-alb"),
  getRegion: vi.fn(() => "us-central1"),
} as unknown as CloudInfraMeta;

// Mock SSL Certificate
const mockCertificate = {
  selfLink: "projects/test-project/global/sslCertificates/test-cert",
  id: "test-cert",
} as unknown as gcp.compute.SSLCertificate;

describe("proxy.ts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createTargetHttpsProxy", () => {
    beforeEach(() => {
      const mockProxyInstance = {
        selfLink: "projects/test-project/global/targetHttpsProxies/test-alb",
        id: "test-alb",
      };
      (gcp.compute.TargetHttpsProxy as any).mockImplementation(
        () => mockProxyInstance,
      );
    });

    it("should create global HTTPS proxy with default configuration", () => {
      const params = {
        meta: mockMeta,
        config: {
          urlMap: "projects/test-project/global/urlMaps/test-map",
        },
        certificate: mockCertificate,
        resourceName: "test-alb",
      };

      const result = createTargetHttpsProxy(params);

      expect(gcp.compute.TargetHttpsProxy).toHaveBeenCalledWith("test-alb", {
        project: "test-project",
        urlMap: "projects/test-project/global/urlMaps/test-map",
        sslCertificates: [
          "projects/test-project/global/sslCertificates/test-cert",
        ],
      });

      expect(result.proxy).toBeDefined();
    });

    it("should pass through user configuration", () => {
      const userConfig = {
        description: "Custom HTTPS proxy",
        urlMap: "projects/test-project/global/urlMaps/test-map",
        labels: { env: "test" },
      };

      const params = {
        meta: mockMeta,
        config: userConfig,
        certificate: mockCertificate,
        resourceName: "test-alb",
      };

      createTargetHttpsProxy(params);

      expect(gcp.compute.TargetHttpsProxy).toHaveBeenCalledWith("test-alb", {
        project: "test-project",
        description: "Custom HTTPS proxy",
        urlMap: "projects/test-project/global/urlMaps/test-map",
        labels: { env: "test" },
        sslCertificates: [
          "projects/test-project/global/sslCertificates/test-cert",
        ],
      });
    });

    it("should allow project override", () => {
      const userConfig = {
        project: "override-project",
        description: "Custom HTTPS proxy",
        urlMap: "projects/test-project/global/urlMaps/test-map",
      };

      const params = {
        meta: mockMeta,
        config: userConfig,
        certificate: mockCertificate,
        resourceName: "test-alb",
      };

      createTargetHttpsProxy(params);

      expect(gcp.compute.TargetHttpsProxy).toHaveBeenCalledWith("test-alb", {
        project: "override-project",
        description: "Custom HTTPS proxy",
        urlMap: "projects/test-project/global/urlMaps/test-map",
        sslCertificates: [
          "projects/test-project/global/sslCertificates/test-cert",
        ],
      });
    });

    it("should not allow sslCertificates override", () => {
      const userConfig = {
        sslCertificates: [
          "projects/test-project/global/sslCertificates/other-cert",
        ],
        description: "Custom HTTPS proxy",
        urlMap: "projects/test-project/global/urlMaps/test-map",
      };

      const params = {
        meta: mockMeta,
        config: userConfig,
        certificate: mockCertificate,
        resourceName: "test-alb",
      };

      createTargetHttpsProxy(params);

      expect(gcp.compute.TargetHttpsProxy).toHaveBeenCalledWith("test-alb", {
        project: "test-project",
        description: "Custom HTTPS proxy",
        urlMap: "projects/test-project/global/urlMaps/test-map",
        sslCertificates: [
          "projects/test-project/global/sslCertificates/test-cert",
        ], // Function-controlled
      });
    });

    it("should throw ResourceError on creation failure", () => {
      (gcp.compute.TargetHttpsProxy as any).mockImplementation(() => {
        throw new Error("GCP Error");
      });

      const params = {
        meta: mockMeta,
        config: {
          urlMap: "projects/test-project/global/urlMaps/test-map",
        },
        certificate: mockCertificate,
        resourceName: "test-alb",
      };

      expect(() => createTargetHttpsProxy(params)).toThrow(ResourceError);
      expect(() => createTargetHttpsProxy(params)).toThrow(
        "Failed to create target HTTPS proxy test-alb",
      );
    });

    it("should handle optional certificate parameter with sslCertificates in config", () => {
      const params = {
        meta: mockMeta,
        config: {
          urlMap: "projects/test-project/global/urlMaps/test-map",
          sslCertificates: [
            "projects/test-project/global/sslCertificates/ref-cert",
          ],
        },
        resourceName: "test-alb",
      };

      const result = createTargetHttpsProxy(params);

      expect(gcp.compute.TargetHttpsProxy).toHaveBeenCalledWith("test-alb", {
        project: "test-project",
        urlMap: "projects/test-project/global/urlMaps/test-map",
        sslCertificates: [
          "projects/test-project/global/sslCertificates/ref-cert",
        ],
      });

      expect(result.proxy).toBeDefined();
    });

    it("should handle optional certificate parameter without sslCertificates", () => {
      const params = {
        meta: mockMeta,
        config: {
          urlMap: "projects/test-project/global/urlMaps/test-map",
        },
        resourceName: "test-alb",
      };

      const result = createTargetHttpsProxy(params);

      expect(gcp.compute.TargetHttpsProxy).toHaveBeenCalledWith("test-alb", {
        project: "test-project",
        urlMap: "projects/test-project/global/urlMaps/test-map",
      });

      expect(result.proxy).toBeDefined();
    });
  });

  describe("createTargetHttpProxy", () => {
    beforeEach(() => {
      const mockProxyInstance = {
        selfLink: "projects/test-project/global/targetHttpProxies/test-alb",
        id: "test-alb",
      };
      (gcp.compute.TargetHttpProxy as any).mockImplementation(
        () => mockProxyInstance,
      );
    });

    it("should create global HTTP proxy with default configuration", () => {
      const params = {
        meta: mockMeta,
        config: {
          urlMap: "projects/test-project/global/urlMaps/test-map",
        },
        resourceName: "test-alb",
      };

      const result = createTargetHttpProxy(params);

      expect(gcp.compute.TargetHttpProxy).toHaveBeenCalledWith("test-alb", {
        project: "test-project",
        urlMap: "projects/test-project/global/urlMaps/test-map",
      });

      expect(result.proxy).toBeDefined();
    });

    it("should pass through user configuration", () => {
      const userConfig = {
        description: "Custom HTTP proxy",
        urlMap: "projects/test-project/global/urlMaps/test-map",
        labels: { env: "test" },
      };

      const params = {
        meta: mockMeta,
        config: userConfig,
        resourceName: "test-alb",
      };

      createTargetHttpProxy(params);

      expect(gcp.compute.TargetHttpProxy).toHaveBeenCalledWith("test-alb", {
        project: "test-project",
        description: "Custom HTTP proxy",
        urlMap: "projects/test-project/global/urlMaps/test-map",
        labels: { env: "test" },
      });
    });

    it("should allow project override", () => {
      const userConfig = {
        project: "override-project",
        description: "Custom HTTP proxy",
        urlMap: "projects/test-project/global/urlMaps/test-map",
      };

      const params = {
        meta: mockMeta,
        config: userConfig,
        resourceName: "test-alb",
      };

      createTargetHttpProxy(params);

      expect(gcp.compute.TargetHttpProxy).toHaveBeenCalledWith("test-alb", {
        project: "override-project",
        description: "Custom HTTP proxy",
        urlMap: "projects/test-project/global/urlMaps/test-map",
      });
    });

    it("should throw ResourceError on creation failure", () => {
      (gcp.compute.TargetHttpProxy as any).mockImplementation(() => {
        throw new Error("GCP Error");
      });

      const params = {
        meta: mockMeta,
        config: {
          urlMap: "projects/test-project/global/urlMaps/test-map",
        },
        resourceName: "test-alb",
      };

      expect(() => createTargetHttpProxy(params)).toThrow(ResourceError);
      expect(() => createTargetHttpProxy(params)).toThrow(
        "Failed to create target HTTP proxy test-alb",
      );
    });
  });

  describe("createRegionalTargetHttpsProxy", () => {
    beforeEach(() => {
      const mockProxyInstance = {
        selfLink:
          "projects/test-project/regions/us-central1/targetHttpsProxies/test-alb",
        id: "test-alb",
      };
      (gcp.compute.RegionTargetHttpsProxy as any).mockImplementation(
        () => mockProxyInstance,
      );
    });

    it("should create regional HTTPS proxy with default configuration", () => {
      const params = {
        meta: mockMeta,
        config: {
          urlMap: "projects/test-project/global/urlMaps/test-map",
        },
        certificate: mockCertificate,
        resourceName: "test-alb",
        region: "us-central1",
      };

      const result = createRegionalTargetHttpsProxy(params);

      expect(gcp.compute.RegionTargetHttpsProxy).toHaveBeenCalledWith(
        "test-alb",
        {
          project: "test-project",
          region: "us-central1",
          urlMap: "projects/test-project/global/urlMaps/test-map",
          sslCertificates: [
            "projects/test-project/global/sslCertificates/test-cert",
          ],
        },
      );

      expect(result.proxy).toBeDefined();
    });

    it("should pass through user configuration", () => {
      const userConfig = {
        description: "Regional HTTPS proxy",
        urlMap: "projects/test-project/regions/us-central1/urlMaps/test-map",
        labels: { region: "us-central1" },
      };

      const params = {
        meta: mockMeta,
        config: userConfig,
        certificate: mockCertificate,
        resourceName: "test-alb",
        region: "us-central1",
      };

      createRegionalTargetHttpsProxy(params);

      expect(gcp.compute.RegionTargetHttpsProxy).toHaveBeenCalledWith(
        "test-alb",
        {
          project: "test-project",
          description: "Regional HTTPS proxy",
          urlMap: "projects/test-project/regions/us-central1/urlMaps/test-map",
          labels: { region: "us-central1" },
          region: "us-central1",
          sslCertificates: [
            "projects/test-project/global/sslCertificates/test-cert",
          ],
        },
      );
    });

    it("should not allow function-controlled parameter overrides", () => {
      const userConfig = {
        region: "europe-west1", // Should be overridden
        sslCertificates: ["other-cert"], // Should be overridden
        urlMap: "projects/test-project/regions/us-central1/urlMaps/test-map",
      };

      const params = {
        meta: mockMeta,
        config: userConfig,
        certificate: mockCertificate,
        resourceName: "test-alb",
        region: "us-central1", // Function parameter takes precedence
      };

      createRegionalTargetHttpsProxy(params);

      expect(gcp.compute.RegionTargetHttpsProxy).toHaveBeenCalledWith(
        "test-alb",
        {
          project: "test-project",
          region: "us-central1", // Function-controlled
          urlMap: "projects/test-project/regions/us-central1/urlMaps/test-map",
          sslCertificates: [
            "projects/test-project/global/sslCertificates/test-cert",
          ], // Function-controlled
        },
      );
    });

    it("should throw ResourceError on creation failure", () => {
      (gcp.compute.RegionTargetHttpsProxy as any).mockImplementation(() => {
        throw new Error("GCP Error");
      });

      const params = {
        meta: mockMeta,
        config: {
          urlMap: "projects/test-project/global/urlMaps/test-map",
        },
        certificate: mockCertificate,
        resourceName: "test-alb",
        region: "us-central1",
      };

      expect(() => createRegionalTargetHttpsProxy(params)).toThrow(
        ResourceError,
      );
      expect(() => createRegionalTargetHttpsProxy(params)).toThrow(
        "Failed to create regional target HTTPS proxy test-alb",
      );
    });

    it("should handle optional certificate parameter with sslCertificates in config", () => {
      const params = {
        meta: mockMeta,
        config: {
          urlMap: "projects/test-project/regions/us-central1/urlMaps/test-map",
          sslCertificates: [
            "projects/test-project/global/sslCertificates/ref-cert",
          ],
        },
        resourceName: "test-alb",
        region: "us-central1",
      };

      const result = createRegionalTargetHttpsProxy(params);

      expect(gcp.compute.RegionTargetHttpsProxy).toHaveBeenCalledWith(
        "test-alb",
        {
          project: "test-project",
          region: "us-central1",
          urlMap: "projects/test-project/regions/us-central1/urlMaps/test-map",
          sslCertificates: [
            "projects/test-project/global/sslCertificates/ref-cert",
          ],
        },
      );

      expect(result.proxy).toBeDefined();
    });

    it("should handle optional certificate parameter without sslCertificates", () => {
      const params = {
        meta: mockMeta,
        config: {
          urlMap: "projects/test-project/regions/us-central1/urlMaps/test-map",
        },
        resourceName: "test-alb",
        region: "us-central1",
      };

      const result = createRegionalTargetHttpsProxy(params);

      expect(gcp.compute.RegionTargetHttpsProxy).toHaveBeenCalledWith(
        "test-alb",
        {
          project: "test-project",
          region: "us-central1",
          urlMap: "projects/test-project/regions/us-central1/urlMaps/test-map",
        },
      );

      expect(result.proxy).toBeDefined();
    });
  });

  describe("createRegionalTargetHttpProxy", () => {
    beforeEach(() => {
      const mockProxyInstance = {
        selfLink:
          "projects/test-project/regions/us-central1/targetHttpProxies/test-alb",
        id: "test-alb",
      };
      (gcp.compute.RegionTargetHttpProxy as any).mockImplementation(
        () => mockProxyInstance,
      );
    });

    it("should create regional HTTP proxy with default configuration", () => {
      const params = {
        meta: mockMeta,
        config: {
          urlMap: "projects/test-project/global/urlMaps/test-map",
        },
        resourceName: "test-alb",
        region: "us-central1",
      };

      const result = createRegionalTargetHttpProxy(params);

      expect(gcp.compute.RegionTargetHttpProxy).toHaveBeenCalledWith(
        "test-alb",
        {
          project: "test-project",
          region: "us-central1",
          urlMap: "projects/test-project/global/urlMaps/test-map",
        },
      );

      expect(result.proxy).toBeDefined();
    });

    it("should pass through user configuration", () => {
      const userConfig = {
        description: "Regional HTTP proxy",
        urlMap: "projects/test-project/regions/us-central1/urlMaps/test-map",
        labels: { region: "us-central1" },
      };

      const params = {
        meta: mockMeta,
        config: userConfig,
        resourceName: "test-alb",
        region: "us-central1",
      };

      createRegionalTargetHttpProxy(params);

      expect(gcp.compute.RegionTargetHttpProxy).toHaveBeenCalledWith(
        "test-alb",
        {
          project: "test-project",
          description: "Regional HTTP proxy",
          urlMap: "projects/test-project/regions/us-central1/urlMaps/test-map",
          labels: { region: "us-central1" },
          region: "us-central1",
        },
      );
    });

    it("should not allow region override", () => {
      const userConfig = {
        region: "europe-west1", // Should be overridden
        description: "Regional HTTP proxy",
        urlMap: "projects/test-project/regions/us-central1/urlMaps/test-map",
      };

      const params = {
        meta: mockMeta,
        config: userConfig,
        resourceName: "test-alb",
        region: "us-central1", // Function parameter takes precedence
      };

      createRegionalTargetHttpProxy(params);

      expect(gcp.compute.RegionTargetHttpProxy).toHaveBeenCalledWith(
        "test-alb",
        {
          project: "test-project",
          description: "Regional HTTP proxy",
          region: "us-central1", // Function-controlled
          urlMap: "projects/test-project/regions/us-central1/urlMaps/test-map",
        },
      );
    });

    it("should throw ResourceError on creation failure", () => {
      (gcp.compute.RegionTargetHttpProxy as any).mockImplementation(() => {
        throw new Error("GCP Error");
      });

      const params = {
        meta: mockMeta,
        config: {
          urlMap: "projects/test-project/global/urlMaps/test-map",
        },
        resourceName: "test-alb",
        region: "us-central1",
      };

      expect(() => createRegionalTargetHttpProxy(params)).toThrow(
        ResourceError,
      );
      expect(() => createRegionalTargetHttpProxy(params)).toThrow(
        "Failed to create regional target HTTP proxy test-alb",
      );
    });
  });
});

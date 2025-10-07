/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, vi } from "vitest";

import { CloudInfraAlb, CloudInfraAlbConfigSchema } from "../index";
import { CloudInfraMeta } from "../../../core/meta";
import { CloudInfraOutput } from "../../../core/output";
import { ResourceError } from "../../../core/errors";

// Import modules to be mocked
import * as addressModule from "../address";
import * as sslCertificateModule from "../sslcertificate";
import * as proxyModule from "../proxy";
import * as forwardingRuleModule from "../forwardingrule";
import * as urlMapModule from "../urlmap";
import * as helpersModule from "../../../core/helpers";

// Mock only the factory functions, preserve schemas
vi.mock("../address", async () => {
  const actual = await vi.importActual("../address");
  return {
    ...actual,
    createGlobalAddress: vi.fn(),
    createRegionalAddress: vi.fn(),
    resolveGlobalAddress: vi.fn(),
    resolveRegionalAddress: vi.fn(),
  };
});

vi.mock("../sslcertificate", async () => {
  const actual = await vi.importActual("../sslcertificate");
  return {
    ...actual,
    createSslCertificate: vi.fn(),
  };
});

vi.mock("../proxy", async () => {
  const actual = await vi.importActual("../proxy");
  return {
    ...actual,
    createTargetHttpsProxy: vi.fn(),
    createTargetHttpProxy: vi.fn(),
    createRegionalTargetHttpsProxy: vi.fn(),
    createRegionalTargetHttpProxy: vi.fn(),
    resolveGlobalProxy: vi.fn(),
    resolveRegionalProxy: vi.fn(),
  };
});

vi.mock("../forwardingrule", async () => {
  const actual = await vi.importActual("../forwardingrule");
  return {
    ...actual,
    createGlobalForwardingRule: vi.fn(),
    createRegionalForwardingRule: vi.fn(),
    createForwardingRule: vi.fn(),
  };
});

vi.mock("../urlmap", async () => {
  const actual = await vi.importActual("../urlmap");
  return {
    ...actual,
    createGlobalUrlMap: vi.fn(),
    createRegionalUrlMap: vi.fn(),
    resolveGlobalUrlMap: vi.fn(),
    resolveRegionalUrlMap: vi.fn(),
  };
});

vi.mock("../../../core/helpers");

// Get mocked modules
const mockedAddress = vi.mocked(addressModule);
const mockedSslCertificate = vi.mocked(sslCertificateModule);
const mockedProxy = vi.mocked(proxyModule);
const mockedForwardingRule = vi.mocked(forwardingRuleModule);
const mockedUrlMap = vi.mocked(urlMapModule);
const mockedHelpers = vi.mocked(helpersModule);

// Create mock Meta instances
const createMockMeta = (
  domain: string,
  inputName: string | string[] = "test-alb",
) =>
  ({
    getDomain: vi.fn(() => domain),
    getName: vi.fn(() => "test-alb"),
    getInputName: vi.fn(() => inputName),
    getGcpProject: vi.fn(() => "test-project"),
    getRegion: vi.fn(() => "us-central1"),
  }) as unknown as CloudInfraMeta;

describe("CloudInfraAlb Integration Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Setup mock implementations
    mockedAddress.createGlobalAddress.mockReturnValue({
      address: {
        address: "192.168.1.1",
        selfLink: "projects/test-project/global/addresses/test-alb",
      } as unknown as any,
    });

    mockedAddress.createRegionalAddress.mockReturnValue({
      address: {
        address: "10.0.0.1",
        selfLink:
          "projects/test-project/regions/us-central1/addresses/test-alb",
      } as unknown as any,
    });

    // Mock standardized resolve functions
    mockedAddress.resolveGlobalAddress.mockImplementation((params) => {
      if (params.input && typeof params.input === "string") {
        return {
          value: params.input,
        };
      } else if (params.input) {
        // It's a config object
        const result = mockedAddress.createGlobalAddress({
          meta: params.meta,
          config: params.input as any,
          resourceName: params.resourceName,
        });
        return {
          value: result.address.address,
          resource: result.address,
        };
      } else {
        // No input specified
        const result = mockedAddress.createGlobalAddress({
          meta: params.meta,
          config: {},
          resourceName: params.resourceName,
        });
        return {
          value: result.address.address,
          resource: result.address,
        };
      }
    });

    // Mock standardized regional address resolver
    mockedAddress.resolveRegionalAddress.mockImplementation((params) => {
      if (params.input && typeof params.input === "string") {
        return {
          value: params.input,
        };
      } else if (params.input) {
        // It's a config object
        const result = mockedAddress.createRegionalAddress({
          meta: params.meta,
          config: params.input as any,
          resourceName: params.resourceName,
          region: params.region!,
        });
        return {
          value: result.address.address,
          resource: result.address,
        };
      } else {
        // No input specified
        const result = mockedAddress.createRegionalAddress({
          meta: params.meta,
          config: {},
          resourceName: params.resourceName,
          region: params.region!,
        });
        return {
          value: result.address.address,
          resource: result.address,
        };
      }
    });

    mockedSslCertificate.createSslCertificate.mockReturnValue({
      certificate: {
        selfLink: "projects/test-project/global/sslCertificates/test-alb",
        id: "test-cert",
      } as unknown as any,
    });

    mockedProxy.createTargetHttpsProxy.mockReturnValue({
      proxy: {
        selfLink: "projects/test-project/global/targetHttpsProxies/test-alb",
        id: "test-https-proxy",
      } as unknown as any,
    });

    mockedProxy.createTargetHttpProxy.mockReturnValue({
      proxy: {
        selfLink: "projects/test-project/global/targetHttpProxies/test-alb",
        id: "test-http-proxy",
      } as unknown as any,
    });

    mockedProxy.createRegionalTargetHttpsProxy.mockReturnValue({
      proxy: {
        selfLink:
          "projects/test-project/regions/us-central1/targetHttpsProxies/test-alb",
        id: "test-regional-https-proxy",
      } as unknown as any,
    });

    mockedProxy.createRegionalTargetHttpProxy.mockReturnValue({
      proxy: {
        selfLink:
          "projects/test-project/regions/us-central1/targetHttpProxies/test-alb",
        id: "test-regional-http-proxy",
      } as unknown as any,
    });

    mockedForwardingRule.createGlobalForwardingRule.mockReturnValue({
      forwardingRule: {
        ipAddress: "192.168.1.1",
        selfLink: "projects/test-project/global/forwardingRules/test-alb",
      } as unknown as any,
    });

    mockedForwardingRule.createRegionalForwardingRule.mockReturnValue({
      forwardingRule: {
        ipAddress: "10.0.0.1",
        selfLink:
          "projects/test-project/regions/us-central1/forwardingRules/test-alb",
      } as unknown as any,
    });

    mockedUrlMap.createGlobalUrlMap.mockReturnValue({
      urlMap: {
        selfLink: "projects/test-project/global/urlMaps/test-alb",
        id: "test-url-map",
      } as unknown as any,
    });

    mockedUrlMap.createRegionalUrlMap.mockReturnValue({
      urlMap: {
        selfLink: "projects/test-project/regions/us-central1/urlMaps/test-alb",
        id: "test-regional-url-map",
      } as unknown as any,
    });

    mockedHelpers.deriveRegion.mockReturnValue("us-central1");

    // Mock standardized URL map resolvers
    mockedUrlMap.resolveGlobalUrlMap.mockImplementation((params) => {
      const result = mockedUrlMap.createGlobalUrlMap({
        meta: params.meta,
        config: params.input as any,
        resourceName: params.resourceName,
      });
      return {
        value: result.urlMap.selfLink,
        resource: result.urlMap,
      };
    });

    mockedUrlMap.resolveRegionalUrlMap.mockImplementation((params) => {
      const result = mockedUrlMap.createRegionalUrlMap({
        meta: params.meta,
        config: params.input as any,
        resourceName: params.resourceName,
        region: params.region!,
      });
      return {
        value: result.urlMap.selfLink,
        resource: result.urlMap,
      };
    });

    // Mock standardized proxy resolvers
    mockedProxy.resolveGlobalProxy.mockImplementation((params) => {
      if (
        params.input.sslCertificates &&
        typeof params.input.sslCertificates === "object" &&
        !Array.isArray(params.input.sslCertificates)
      ) {
        const cert = mockedSslCertificate.createSslCertificate({
          meta: params.meta,
          config: params.input.sslCertificates as any,
          resourceName: params.resourceName,
        });
        const proxy = mockedProxy.createTargetHttpsProxy({
          meta: params.meta,
          config: { urlMap: params.urlMap },
          certificate: cert.certificate,
          resourceName: params.resourceName,
        });
        return {
          value: proxy.proxy.selfLink,
          proxy: proxy.proxy,
          certificate: cert.certificate,
        };
      } else {
        const proxy = mockedProxy.createTargetHttpProxy({
          meta: params.meta,
          config: { urlMap: params.urlMap },
          resourceName: params.resourceName,
        });
        return {
          value: proxy.proxy.selfLink,
          proxy: proxy.proxy,
        };
      }
    });

    mockedProxy.resolveRegionalProxy.mockImplementation((params) => {
      if (
        params.input.sslCertificates &&
        typeof params.input.sslCertificates === "object" &&
        !Array.isArray(params.input.sslCertificates)
      ) {
        const cert = mockedSslCertificate.createSslCertificate({
          meta: params.meta,
          config: params.input.sslCertificates as any,
          resourceName: params.resourceName,
        });
        const proxy = mockedProxy.createRegionalTargetHttpsProxy({
          meta: params.meta,
          config: { urlMap: params.urlMap },
          certificate: cert.certificate,
          resourceName: params.resourceName,
          region: params.region!,
        });
        return {
          value: proxy.proxy.selfLink,
          proxy: proxy.proxy,
          certificate: cert.certificate,
        };
      } else {
        const proxy = mockedProxy.createRegionalTargetHttpProxy({
          meta: params.meta,
          config: { urlMap: params.urlMap },
          resourceName: params.resourceName,
          region: params.region!,
        });
        return {
          value: proxy.proxy.selfLink,
          proxy: proxy.proxy,
        };
      }
    });

    // Mock forwarding rule with params
    mockedForwardingRule.createForwardingRule.mockImplementation((params) => {
      if (params.region) {
        return {
          resource: mockedForwardingRule.createRegionalForwardingRule({
            meta: params.meta,
            config: params.config as any,
            ipAddress: params.ipAddress,
            target: params.target,
            resourceName: params.resourceName,
            region: params.region,
          }).forwardingRule,
        };
      } else {
        return {
          resource: mockedForwardingRule.createGlobalForwardingRule({
            meta: params.meta,
            config: params.config as any,
            ipAddress: params.ipAddress,
            target: params.target,
            resourceName: params.resourceName,
          }).forwardingRule,
        };
      }
    });
  });

  describe("CloudInfraAlbConfigSchema", () => {
    it("should validate minimal configuration", () => {
      const config = {
        target: {
          urlMap: { defaultService: "backend-service" },
        },
      };
      expect(() => CloudInfraAlbConfigSchema.parse(config)).not.toThrow();
    });

    it("should validate full configuration", () => {
      const config = {
        ipAddress: { description: "Static IP for ALB" },
        portRange: "443",
        description: "Test ALB",
        target: {
          description: "Custom proxy",
          sslCertificates: {
            certificate: "cert-data",
            privateKey: "key-data",
          },
          urlMap: { defaultService: "backend-service" },
        },
      };
      expect(() => CloudInfraAlbConfigSchema.parse(config)).not.toThrow();
    });

    it("should pass through unknown properties", () => {
      const config = {
        target: {
          urlMap: { defaultService: "backend-service" },
        },
        customField: "value",
        anotherField: { nested: "value" },
      };
      const result = CloudInfraAlbConfigSchema.parse(config);
      expect(result.customField).toBe("value");
      expect(result.anotherField).toEqual({ nested: "value" });
    });
  });

  describe("Global ALB Creation", () => {
    it("should create global HTTP ALB without SSL certificate", () => {
      const meta = createMockMeta("gl");
      const config = {
        portRange: "80",
        target: {
          urlMap: { defaultService: "backend-service" },
        },
      };

      expect(() => new CloudInfraAlb(meta, config as any)).not.toThrow();

      expect(mockedProxy.createTargetHttpProxy).toHaveBeenCalled();
      expect(
        mockedForwardingRule.createGlobalForwardingRule,
      ).toHaveBeenCalled();
      expect(mockedUrlMap.createGlobalUrlMap).toHaveBeenCalled();
    });

    it("should create global HTTPS ALB with SSL certificate", () => {
      const meta = createMockMeta("gl");
      const config = {
        portRange: "443",
        target: {
          sslCertificates: {
            certificate: "cert-data",
            privateKey: "key-data",
          },
          urlMap: { defaultService: "backend-service" },
        },
      };

      expect(() => new CloudInfraAlb(meta, config as any)).not.toThrow();

      expect(mockedProxy.createTargetHttpsProxy).toHaveBeenCalled();
      expect(mockedSslCertificate.createSslCertificate).toHaveBeenCalled();
    });

    it("should create global address when no IP specified", () => {
      const meta = createMockMeta("gl");
      const config = {
        target: {
          urlMap: { defaultService: "backend-service" },
        },
      };

      new CloudInfraAlb(meta, config as any);

      expect(mockedAddress.createGlobalAddress).toHaveBeenCalled();
    });

    it("should use existing IP when specified as string", () => {
      const meta = createMockMeta("gl");
      const config = {
        ipAddress: "existing-ip-address",
        target: {
          urlMap: { defaultService: "backend-service" },
        },
      };

      new CloudInfraAlb(meta, config as any);

      expect(mockedAddress.createGlobalAddress).not.toHaveBeenCalled();
    });

    it("should use ipAddress when specified", () => {
      const meta = createMockMeta("gl");
      const config = {
        ipAddress: "direct-ip-config",
        target: {
          urlMap: { defaultService: "backend-service" },
        },
      };

      new CloudInfraAlb(meta, config as any);

      expect(mockedAddress.createGlobalAddress).not.toHaveBeenCalled();
    });
  });

  describe("Regional ALB Creation", () => {
    it("should create regional HTTP ALB without SSL certificate", () => {
      const meta = createMockMeta("au");
      const config = {
        region: "australia-southeast1",
        portRange: "80",
        target: {
          urlMap: { defaultService: "backend-service" },
        },
      };

      expect(() => new CloudInfraAlb(meta, config as any)).not.toThrow();

      expect(mockedProxy.createRegionalTargetHttpProxy).toHaveBeenCalled();
      expect(
        mockedForwardingRule.createRegionalForwardingRule,
      ).toHaveBeenCalled();
      expect(mockedUrlMap.createRegionalUrlMap).toHaveBeenCalled();
    });

    it("should create regional HTTPS ALB with SSL certificate", () => {
      const meta = createMockMeta("us");
      const config = {
        portRange: "443",
        target: {
          sslCertificates: {
            certificate: "cert-data",
            privateKey: "key-data",
          },
          urlMap: { defaultService: "backend-service" },
        },
      };

      expect(() => new CloudInfraAlb(meta, config as any)).not.toThrow();

      expect(mockedProxy.createRegionalTargetHttpsProxy).toHaveBeenCalled();
      expect(mockedSslCertificate.createSslCertificate).toHaveBeenCalled();
    });
  });

  describe("Getter Methods", () => {
    it("should return global forwarding rule for global ALB", () => {
      const meta = createMockMeta("gl");
      const alb = new CloudInfraAlb(meta, {
        target: {
          urlMap: { defaultService: "backend-service" },
        },
      });

      const forwardingRule = alb.getForwardingRule();
      expect(forwardingRule).toBeDefined();
      expect(forwardingRule.selfLink).toContain("/global/forwardingRules/");
    });

    it("should return regional forwarding rule for regional ALB", () => {
      const meta = createMockMeta("us");
      const alb = new CloudInfraAlb(meta, {
        target: {
          urlMap: { defaultService: "backend-service" },
        },
      });

      const forwardingRule = alb.getForwardingRule();
      expect(forwardingRule).toBeDefined();
      expect(forwardingRule.selfLink).toContain("/regions/");
    });

    it("should return IP address from forwarding rule", () => {
      const meta = createMockMeta("gl");
      const alb = new CloudInfraAlb(meta, {
        target: {
          urlMap: { defaultService: "backend-service" },
        },
      });

      const ipAddress = alb.getIpAddress();
      expect(ipAddress).toBeDefined();
    });

    it("should return address resource when created", () => {
      const meta = createMockMeta("gl");
      const alb = new CloudInfraAlb(meta, {
        target: {
          urlMap: { defaultService: "backend-service" },
        },
      }); // Will create new address

      const address = alb.getAddressResource();
      expect(address).toBeDefined();
      expect(address?.selfLink).toContain("/addresses/");
    });

    it("should return undefined address resource when using existing IP", () => {
      const meta = createMockMeta("gl");
      const alb = new CloudInfraAlb(meta, {
        target: {
          urlMap: { defaultService: "backend-service" },
        },
        ipAddress: "existing-ip",
      });

      const address = alb.getAddressResource();
      expect(address).toBeUndefined();
    });

    it("should return URL map resource", () => {
      const meta = createMockMeta("gl");
      const alb = new CloudInfraAlb(meta, {
        target: {
          urlMap: { defaultService: "backend-service" },
        },
      });

      const urlMap = alb.getUrlMap();
      expect(urlMap).toBeDefined();
      expect(urlMap?.selfLink).toContain("/urlMaps/");
    });

    it("should return proxy resource", () => {
      const meta = createMockMeta("gl");
      const alb = new CloudInfraAlb(meta, {
        target: {
          urlMap: { defaultService: "backend-service" },
        },
      });

      const proxy = alb.getProxy();
      expect(proxy).toBeDefined();
    });

    it("should return certificate when HTTPS is used", () => {
      const meta = createMockMeta("gl");
      const alb = new CloudInfraAlb(meta, {
        target: {
          sslCertificates: {
            certificate: "cert-data",
            privateKey: "key-data",
          },
          urlMap: { defaultService: "backend-service" },
        },
      });

      const certificate = alb.getCertificate();
      expect(certificate).toBeDefined();
      expect(certificate?.selfLink).toContain("/sslCertificates/");
    });

    it("should return undefined certificate when HTTP is used", () => {
      const meta = createMockMeta("gl");
      const alb = new CloudInfraAlb(meta, {
        target: {
          urlMap: { defaultService: "backend-service" },
        },
      });

      const certificate = alb.getCertificate();
      expect(certificate).toBeUndefined();
    });
  });

  describe("Export Outputs", () => {
    it("should export global address to output manager", () => {
      const meta = createMockMeta("gl");
      const alb = new CloudInfraAlb(meta, {
        target: {
          urlMap: { defaultService: "backend-service" },
        },
      });

      const mockOutputManager = {
        record: vi.fn(),
      } as unknown as CloudInfraOutput;

      alb.exportOutputs(mockOutputManager);

      expect(mockOutputManager.record).toHaveBeenCalledWith(
        "gcp:compute:GlobalAddress",
        "test-alb",
        meta,
        expect.any(Object),
      );
    });

    it("should export regional address to output manager", () => {
      const meta = createMockMeta("us");
      const alb = new CloudInfraAlb(meta, {
        target: {
          urlMap: { defaultService: "backend-service" },
        },
      });

      const mockOutputManager = {
        record: vi.fn(),
      } as unknown as CloudInfraOutput;

      alb.exportOutputs(mockOutputManager);

      expect(mockOutputManager.record).toHaveBeenCalledWith(
        "gcp:compute:Address",
        "test-alb",
        meta,
        expect.any(Object),
      );
    });

    it("should not export address when using existing IP", () => {
      const meta = createMockMeta("gl");
      const alb = new CloudInfraAlb(meta, {
        target: {
          urlMap: { defaultService: "backend-service" },
        },
        ipAddress: "existing-ip",
      });

      const mockOutputManager = {
        record: vi.fn(),
      } as unknown as CloudInfraOutput;

      alb.exportOutputs(mockOutputManager);

      expect(mockOutputManager.record).not.toHaveBeenCalled();
    });
  });

  describe("Error Handling", () => {
    it("should throw ResourceError wrapping ValidationError for array input name", () => {
      const meta = createMockMeta("gl", ["name1", "name2"]);

      expect(
        () =>
          new CloudInfraAlb(meta, {
            target: {
              urlMap: { defaultService: "backend-service" },
            },
          }),
      ).toThrow(ResourceError);
      expect(
        () =>
          new CloudInfraAlb(meta, {
            target: {
              urlMap: { defaultService: "backend-service" },
            },
          }),
      ).toThrow("expects a single name");
    });

    it("should throw ResourceError wrapping ValidationError for regional ALB without region", () => {
      const meta = createMockMeta("us");
      // Mock deriveRegion to return undefined
      mockedHelpers.deriveRegion.mockReturnValue(
        undefined as unknown as string,
      );

      expect(
        () =>
          new CloudInfraAlb(meta, {
            // No region specified and deriveRegion returns undefined
            target: {
              urlMap: { defaultService: "backend-service" },
            },
          } as any),
      ).toThrow(ResourceError);
      expect(
        () =>
          new CloudInfraAlb(meta, {
            target: {
              urlMap: { defaultService: "backend-service" },
            },
          } as any),
      ).toThrow("Region is required");

      // Reset mock for other tests
      mockedHelpers.deriveRegion.mockReturnValue("us-central1");
    });

    it("should wrap unknown errors as ResourceError", () => {
      const meta = createMockMeta("gl");

      // Mock a resolver function to throw an error
      mockedUrlMap.resolveGlobalUrlMap.mockImplementation(() => {
        throw new Error("Unknown error");
      });

      expect(
        () =>
          new CloudInfraAlb(meta, {
            target: {
              urlMap: { defaultService: "backend-service" },
            },
          }),
      ).toThrow(ResourceError);
      expect(
        () =>
          new CloudInfraAlb(meta, {
            target: {
              urlMap: { defaultService: "backend-service" },
            },
          }),
      ).toThrow("Failed to create ALB test-alb");

      // Reset mock for other tests
      mockedUrlMap.resolveGlobalUrlMap.mockImplementation((params) => {
        const result = mockedUrlMap.createGlobalUrlMap({
          meta: params.meta,
          config: params.input as any,
          resourceName: params.resourceName,
        });
        return {
          value: result.urlMap.selfLink,
          resource: result.urlMap,
        };
      });
    });

    it("should throw error when getting forwarding rule from uninitialized global ALB", () => {
      const meta = createMockMeta("gl");
      const alb = new CloudInfraAlb(meta, {
        target: {
          urlMap: { defaultService: "backend-service" },
        },
      });

      // Reset the internal state
      (
        alb as unknown as { globalForwardingRule?: unknown }
      ).globalForwardingRule = undefined;

      expect(() => alb.getForwardingRule()).toThrow(
        "Global forwarding rule not initialized",
      );
    });

    it("should throw error when getting forwarding rule from uninitialized regional ALB", () => {
      const meta = createMockMeta("us");
      const alb = new CloudInfraAlb(meta, {
        target: {
          urlMap: { defaultService: "backend-service" },
        },
      });

      // Reset the internal state
      (
        alb as unknown as { regionalForwardingRule?: unknown }
      ).regionalForwardingRule = undefined;

      expect(() => alb.getForwardingRule()).toThrow(
        "Regional forwarding rule not initialized",
      );
    });
  });

  describe("Configuration Pass-through", () => {
    it("should use project from metadata for all resources", () => {
      const meta = createMockMeta("gl");
      const config = {
        target: {
          urlMap: { defaultService: "backend" },
        },
      };

      new CloudInfraAlb(meta, config);

      // Check that address creation uses project from metadata
      expect(mockedAddress.createGlobalAddress).toHaveBeenCalledWith(
        expect.objectContaining({
          meta,
          config: { project: "test-project" }, // Should use meta.getGcpProject()
          resourceName: "test-alb",
        }),
      );
    });
  });

  describe("Internal Load Balancer Support", () => {
    describe("Schema Validation", () => {
      it("should validate internal load balancer configuration", () => {
        const config = {
          loadBalancingScheme: 'INTERNAL_MANAGED' as const,
          network: 'projects/test-project/global/networks/vpc',
          subnetwork: 'projects/test-project/regions/us-central1/subnetworks/subnet',
          target: {
            urlMap: { defaultService: "backend-service" },
          },
        };
        expect(() => CloudInfraAlbConfigSchema.parse(config)).not.toThrow();
      });

      it("should validate external load balancer without internal fields", () => {
        const config = {
          loadBalancingScheme: 'EXTERNAL_MANAGED' as const,
          target: {
            urlMap: { defaultService: "backend-service" },
          },
        };
        expect(() => CloudInfraAlbConfigSchema.parse(config)).not.toThrow();
      });

      it("should reject invalid loadBalancingScheme values", () => {
        const config = {
          loadBalancingScheme: 'INVALID_SCHEME' as any,
          target: {
            urlMap: { defaultService: "backend-service" },
          },
        };
        expect(() => CloudInfraAlbConfigSchema.parse(config)).toThrow();
      });
    });

    describe("Internal ALB Creation", () => {
      it("should create internal regional ALB successfully", () => {
        const meta = createMockMeta("us");
        const config = {
          loadBalancingScheme: 'INTERNAL_MANAGED' as const,
          network: 'projects/test-project/global/networks/vpc',
          subnetwork: 'projects/test-project/regions/us-central1/subnetworks/subnet',
          portRange: '80',
          target: {
            urlMap: { defaultService: "backend-service" },
          },
        };

        expect(() => new CloudInfraAlb(meta, config)).not.toThrow();

        // Verify internal address creation
        expect(mockedAddress.createRegionalAddress).toHaveBeenCalledWith(
          expect.objectContaining({
            config: expect.objectContaining({
              addressType: 'INTERNAL',
              subnetwork: 'projects/test-project/regions/us-central1/subnetworks/subnet',
            }),
          }),
        );

        // Verify forwarding rule with internal scheme
        expect(mockedForwardingRule.createForwardingRule).toHaveBeenCalledWith(
          expect.objectContaining({
            config: expect.objectContaining({
              loadBalancingScheme: 'INTERNAL_MANAGED',
              network: 'projects/test-project/global/networks/vpc',
              subnetwork: 'projects/test-project/regions/us-central1/subnetworks/subnet',
            }),
          }),
        );
      });

      it("should create internal HTTPS ALB with SSL certificate", () => {
        const meta = createMockMeta("us");
        const config = {
          loadBalancingScheme: 'INTERNAL_MANAGED' as const,
          network: 'projects/test-project/global/networks/vpc',
          subnetwork: 'projects/test-project/regions/us-central1/subnetworks/subnet',
          portRange: '443',
          target: {
            sslCertificates: {
              certificate: 'cert-data',
              privateKey: 'key-data',
            },
            urlMap: { defaultService: "backend-service" },
          },
        };

        expect(() => new CloudInfraAlb(meta, config)).not.toThrow();

        expect(mockedProxy.createRegionalTargetHttpsProxy).toHaveBeenCalled();
        expect(mockedSslCertificate.createSslCertificate).toHaveBeenCalled();
      });

      it("should use existing IP address for internal ALB", () => {
        const meta = createMockMeta("us");
        const config = {
          loadBalancingScheme: 'INTERNAL_MANAGED' as const,
          network: 'projects/test-project/global/networks/vpc',
          subnetwork: 'projects/test-project/regions/us-central1/subnetworks/subnet',
          ipAddress: 'existing-internal-ip',
          target: {
            urlMap: { defaultService: "backend-service" },
          },
        };

        new CloudInfraAlb(meta, config);

        // Should not create new address when using existing IP
        expect(mockedAddress.createRegionalAddress).not.toHaveBeenCalled();
      });

      it("should use custom address config for internal ALB", () => {
        const meta = createMockMeta("us");
        const config = {
          loadBalancingScheme: 'INTERNAL_MANAGED' as const,
          network: 'projects/test-project/global/networks/vpc',
          subnetwork: 'projects/test-project/regions/us-central1/subnetworks/subnet',
          ipAddress: {
            description: 'Custom internal address',
            labels: { type: 'internal' },
          },
          target: {
            urlMap: { defaultService: "backend-service" },
          },
        };

        new CloudInfraAlb(meta, config);

        // Should create address with user config
        expect(mockedAddress.createRegionalAddress).toHaveBeenCalledWith(
          expect.objectContaining({
            config: expect.objectContaining({
              description: 'Custom internal address',
              labels: { type: 'internal' },
            }),
          }),
        );
      });
    });

    describe("Validation Errors", () => {
      it("should create global internal ALB (cross-region)", () => {
        const meta = createMockMeta("gl"); // Global domain
        const config = {
          loadBalancingScheme: 'INTERNAL_MANAGED' as const,
          network: 'projects/test-project/global/networks/vpc',
          subnetwork: 'projects/test-project/regions/us-central1/subnetworks/subnet',
          target: {
            urlMap: { defaultService: "backend-service" },
          },
        };

        expect(() => new CloudInfraAlb(meta, config)).not.toThrow();
        
        const alb = new CloudInfraAlb(meta, config);
        expect(alb).toBeDefined();

        // Verify global forwarding rule was created with internal scheme
        expect(mockedForwardingRule.createForwardingRule).toHaveBeenCalledWith(
          expect.objectContaining({
            config: expect.objectContaining({
              loadBalancingScheme: 'INTERNAL_MANAGED',
              network: 'projects/test-project/global/networks/vpc',
              subnetwork: 'projects/test-project/regions/us-central1/subnetworks/subnet',
            }),
          }),
        );
      });

      it("should require network for internal load balancer", () => {
        const meta = createMockMeta("us");
        const config = {
          loadBalancingScheme: 'INTERNAL_MANAGED' as const,
          subnetwork: 'projects/test-project/regions/us-central1/subnetworks/subnet',
          target: {
            urlMap: { defaultService: "backend-service" },
          },
        };

        expect(() => new CloudInfraAlb(meta, config)).toThrow(ResourceError);
        expect(() => new CloudInfraAlb(meta, config)).toThrow(
          'Internal load balancers require a network configuration'
        );
      });

      it("should require subnetwork for internal load balancer", () => {
        const meta = createMockMeta("us");
        const config = {
          loadBalancingScheme: 'INTERNAL_MANAGED' as const,
          network: 'projects/test-project/global/networks/vpc',
          target: {
            urlMap: { defaultService: "backend-service" },
          },
        };

        expect(() => new CloudInfraAlb(meta, config)).toThrow(ResourceError);
        expect(() => new CloudInfraAlb(meta, config)).toThrow(
          'Internal load balancers require a subnetwork configuration'
        );
      });

      it("should reject network/subnetwork for global external load balancer", () => {
        const meta = createMockMeta("gl");  // Global domain
        const config = {
          loadBalancingScheme: 'EXTERNAL_MANAGED' as const,
          network: 'projects/test-project/global/networks/vpc',
          target: {
            urlMap: { defaultService: "backend-service" },
          },
        };

        expect(() => new CloudInfraAlb(meta, config)).toThrow(ResourceError);
        expect(() => new CloudInfraAlb(meta, config)).toThrow(
          'Global external load balancers should not specify network or subnetwork parameters'
        );
      });

      it("should allow network but reject subnetwork for regional external load balancer", () => {
        const meta = createMockMeta("us");
        
        // Network should be allowed for regional external LB
        const configWithNetwork = {
          network: 'projects/test-project/global/networks/vpc',
          target: {
            urlMap: { defaultService: "backend-service" },
          },
        };
        expect(() => new CloudInfraAlb(meta, configWithNetwork)).not.toThrow();

        // Subnetwork should be rejected for regional external LB
        const configWithSubnetwork = {
          subnetwork: 'projects/test-project/regions/us-central1/subnetworks/subnet',
          target: {
            urlMap: { defaultService: "backend-service" },
          },
        };
        expect(() => new CloudInfraAlb(meta, configWithSubnetwork)).toThrow(ResourceError);
        expect(() => new CloudInfraAlb(meta, configWithSubnetwork)).toThrow(
          'Regional external proxy-based load balancers should not specify subnetwork parameter'
        );
      });
    });

    describe("Default Behavior", () => {
      it("should default to external load balancer when no scheme specified", () => {
        const meta = createMockMeta("us");
        const config = {
          target: {
            urlMap: { defaultService: "backend-service" },
          },
        };

        new CloudInfraAlb(meta, config);

        // Should create external address by default
        expect(mockedAddress.createRegionalAddress).toHaveBeenCalledWith(
          expect.objectContaining({
            meta: expect.any(Object),
            resourceName: 'test-alb',
            region: 'us-central1',
          }),
        );

        // Should not have internal-specific addressType or subnetwork in the config
        const callArgs = mockedAddress.createRegionalAddress.mock.calls[0][0];
        expect(callArgs.config).not.toHaveProperty('addressType');
        expect(callArgs.config).not.toHaveProperty('subnetwork');
      });
    });
  });
});

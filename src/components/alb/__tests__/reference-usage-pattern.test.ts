/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, vi } from "vitest";

import { CloudInfraAlb, CloudInfraAlbConfigSchema } from "../index";
import { CloudInfraMeta } from "../../../core/meta";

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

// Create mock Meta instance
const createMockMeta = (
  domain: string,
  inputName: string | string[] = "api-alb",
) =>
  ({
    getDomain: vi.fn(() => domain),
    getName: vi.fn(() => "api-alb"),
    getInputName: vi.fn(() => inputName),
    getGcpProject: vi.fn(() => "test-project"),
    getRegion: vi.fn(() => "us-central1"),
  }) as unknown as CloudInfraMeta;

// Mock backend service (simulating apiBackend.getId())
const mockBackendService = {
  getId: vi.fn(
    () => "projects/test-project/global/backendServices/api-backend",
  ),
};

describe("Example Usage Pattern Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Setup mock implementations
    mockedAddress.createGlobalAddress.mockReturnValue({
      address: {
        address: "34.102.136.180",
        selfLink: "projects/test-project/global/addresses/api-alb",
      } as unknown as any,
    });

    mockedSslCertificate.createSslCertificate.mockReturnValue({
      certificate: {
        selfLink: "projects/test-project/global/sslCertificates/api-alb",
        id: "api-alb-cert",
      } as unknown as any,
    });

    mockedProxy.createTargetHttpsProxy.mockReturnValue({
      proxy: {
        selfLink: "projects/test-project/global/targetHttpsProxies/api-alb",
        id: "api-alb-https-proxy",
      } as unknown as any,
    });

    mockedProxy.createTargetHttpProxy.mockReturnValue({
      proxy: {
        selfLink: "projects/test-project/global/targetHttpProxies/api-alb",
        id: "api-alb-http-proxy",
      } as unknown as any,
    });

    mockedForwardingRule.createGlobalForwardingRule.mockReturnValue({
      forwardingRule: {
        ipAddress: "34.102.136.180",
        selfLink: "projects/test-project/global/forwardingRules/api-alb",
      } as unknown as any,
    });

    mockedUrlMap.createGlobalUrlMap.mockReturnValue({
      urlMap: {
        selfLink: "projects/test-project/global/urlMaps/api-alb",
        id: "api-alb-url-map",
      } as unknown as any,
    });

    // Setup regional mocks
    mockedAddress.createRegionalAddress.mockReturnValue({
      address: {
        address: "10.0.0.1",
        selfLink: "projects/test-project/regions/us-central1/addresses/api-alb",
      } as unknown as any,
    });

    mockedProxy.createRegionalTargetHttpsProxy.mockReturnValue({
      proxy: {
        selfLink:
          "projects/test-project/regions/us-central1/targetHttpsProxies/api-alb",
        id: "api-alb-regional-https-proxy",
      } as unknown as any,
    });

    mockedForwardingRule.createRegionalForwardingRule.mockReturnValue({
      forwardingRule: {
        ipAddress: "10.0.0.1",
        selfLink:
          "projects/test-project/regions/us-central1/forwardingRules/api-alb",
      } as unknown as any,
    });

    mockedUrlMap.createRegionalUrlMap.mockReturnValue({
      urlMap: {
        selfLink: "projects/test-project/regions/us-central1/urlMaps/api-alb",
        id: "api-alb-regional-url-map",
      } as unknown as any,
    });

    mockedHelpers.deriveRegion.mockReturnValue("us-central1");

    // Mock standardized IP address resolvers
    mockedAddress.resolveGlobalAddress.mockImplementation(() => {
      const result = mockedAddress.createGlobalAddress({
        meta: {} as any,
        config: {},
        resourceName: "api-alb",
      });
      return {
        value: result.address.address,
        resource: result.address,
      };
    });

    mockedAddress.resolveRegionalAddress.mockImplementation(() => {
      const result = mockedAddress.createRegionalAddress({
        meta: {} as any,
        config: {},
        resourceName: "api-alb",
        region: "us-central1",
      });
      return {
        value: result.address.address,
        resource: result.address,
      };
    });

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

  describe("Exact CloudRun Example Pattern", () => {
    it("should handle the exact configuration pattern from cloudrun.ts", () => {
      // This is the EXACT usage pattern from cloudrun.ts
      const apiAlbMeta = createMockMeta("gl");
      const gcpProjectId = "test-project";
      const apiAlbConfig = {
        sslCertificate:
          "-----BEGIN CERTIFICATE-----\nMIIC...certificate data...\n-----END CERTIFICATE-----",
        sslCertificatePrivateKey:
          "-----BEGIN PRIVATE KEY-----\nMIIE...private key data...\n-----END PRIVATE KEY-----",
      };

      const config = {
        project: gcpProjectId,
        portRange: "443",
        target: {
          project: gcpProjectId,
          sslCertificates: {
            project: gcpProjectId,
            certificate: apiAlbConfig.sslCertificate,
            privateKey: apiAlbConfig.sslCertificatePrivateKey,
          },
          urlMap: {
            project: gcpProjectId,
            defaultService: mockBackendService.getId(),
          },
        },
      };

      // Test that the configuration is valid
      expect(() => CloudInfraAlbConfigSchema.parse(config)).not.toThrow();

      // Test that ALB creation works
      expect(() => new CloudInfraAlb(apiAlbMeta, config as any)).not.toThrow();

      // Verify HTTPS proxy is created (due to SSL certificates)
      expect(mockedProxy.createTargetHttpsProxy).toHaveBeenCalled();
      expect(mockedProxy.createTargetHttpProxy).not.toHaveBeenCalled();

      // Verify SSL certificate is created with correct data
      expect(mockedSslCertificate.createSslCertificate).toHaveBeenCalledWith({
        meta: apiAlbMeta,
        config: {
          project: gcpProjectId,
          certificate: apiAlbConfig.sslCertificate,
          privateKey: apiAlbConfig.sslCertificatePrivateKey,
        },
        resourceName: "api-alb",
      });

      // Verify URL map is created with correct backend service
      expect(mockedUrlMap.createGlobalUrlMap).toHaveBeenCalledWith({
        meta: apiAlbMeta,
        config: {
          project: gcpProjectId,
          defaultService: mockBackendService.getId(),
        },
        resourceName: "api-alb",
      });

      // Verify global forwarding rule is created with correct config
      expect(
        mockedForwardingRule.createGlobalForwardingRule,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            project: gcpProjectId,
            portRange: "443",
          }),
          target: expect.any(String),
        }),
      );
    });

    it("should handle project overrides at all levels", () => {
      const apiAlbMeta = createMockMeta("gl");
      const mainProject = "main-project";
      const certProject = "cert-project";
      const urlMapProject = "urlmap-project";

      const config = {
        project: mainProject,
        portRange: "443",
        target: {
          sslCertificates: {
            project: certProject,
            certificate: "cert-data",
            privateKey: "key-data",
          },
          urlMap: {
            project: urlMapProject,
            defaultService: "backend-service",
          },
        },
      };

      new CloudInfraAlb(apiAlbMeta, config as any);

      // Check that each component gets the correct project override
      expect(mockedSslCertificate.createSslCertificate).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            project: certProject,
          }),
        }),
      );

      expect(mockedUrlMap.createGlobalUrlMap).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            project: urlMapProject,
          }),
        }),
      );

      expect(mockedProxy.createTargetHttpsProxy).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            urlMap: expect.any(String), // URL map selfLink gets set by the component
          }),
        }),
      );

      expect(
        mockedForwardingRule.createGlobalForwardingRule,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            project: mainProject,
          }),
        }),
      );
    });

    it("should handle nested SSL certificate configuration", () => {
      const apiAlbMeta = createMockMeta("gl");
      const config = {
        project: "test-project",
        portRange: "443",
        target: {
          sslCertificates: {
            certificate: "cert-data",
            privateKey: "key-data",
            description: "API SSL Certificate",
            // Additional SSL certificate fields
            managed: {
              domains: ["api.example.com", "www.api.example.com"],
            },
          },
          urlMap: {
            defaultService: "backend-service",
          },
        },
      };

      expect(() => new CloudInfraAlb(apiAlbMeta, config as any)).not.toThrow();

      // Verify SSL certificate receives all nested configuration
      expect(mockedSslCertificate.createSslCertificate).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            certificate: "cert-data",
            privateKey: "key-data",
            description: "API SSL Certificate",
            managed: {
              domains: ["api.example.com", "www.api.example.com"],
            },
          }),
        }),
      );
    });

    it("should handle complex URL map configuration", () => {
      const apiAlbMeta = createMockMeta("gl");
      const config = {
        project: "test-project",
        portRange: "443",
        target: {
          sslCertificates: {
            certificate: "cert-data",
            privateKey: "key-data",
          },
          urlMap: {
            defaultService: "default-backend",
            description: "API URL Map",
            // Complex URL map configuration
            pathMatchers: [
              {
                name: "api-matcher",
                defaultService: "api-backend",
                pathRules: [
                  {
                    paths: ["/api/v1/*"],
                    service: "api-v1-backend",
                  },
                  {
                    paths: ["/api/v2/*"],
                    service: "api-v2-backend",
                  },
                ],
              },
            ],
            hostRules: [
              {
                hosts: ["api.example.com"],
                pathMatcher: "api-matcher",
              },
            ],
          },
        },
      };

      expect(() => new CloudInfraAlb(apiAlbMeta, config as any)).not.toThrow();

      // Verify URL map receives all complex configuration
      expect(mockedUrlMap.createGlobalUrlMap).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            defaultService: "default-backend",
            description: "API URL Map",
            pathMatchers: expect.arrayContaining([
              expect.objectContaining({
                name: "api-matcher",
                defaultService: "api-backend",
                pathRules: expect.arrayContaining([
                  expect.objectContaining({
                    paths: ["/api/v1/*"],
                    service: "api-v1-backend",
                  }),
                ]),
              }),
            ]),
            hostRules: expect.arrayContaining([
              expect.objectContaining({
                hosts: ["api.example.com"],
                pathMatcher: "api-matcher",
              }),
            ]),
          }),
        }),
      );
    });

    it("should handle pass-through of unknown configuration fields", () => {
      const apiAlbMeta = createMockMeta("gl");
      const config = {
        project: "test-project",
        portRange: "443",
        target: {
          sslCertificates: {
            certificate: "cert-data",
            privateKey: "key-data",
            // Unknown certificate field
            customCertField: "cert-custom",
          },
          urlMap: {
            defaultService: "backend-service",
            // Unknown URL map field
            customUrlMapField: "urlmap-custom",
          },
        },
        // Unknown top-level field
        customField: "custom-value",
      };

      expect(() => new CloudInfraAlb(apiAlbMeta, config as any)).not.toThrow();

      // Verify unknown fields are passed through
      expect(mockedSslCertificate.createSslCertificate).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            customCertField: "cert-custom",
          }),
        }),
      );

      expect(mockedUrlMap.createGlobalUrlMap).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            customUrlMapField: "urlmap-custom",
          }),
        }),
      );
    });

    it("should handle HTTP configuration without SSL certificates", () => {
      const apiAlbMeta = createMockMeta("gl");
      const config = {
        project: "test-project",
        portRange: "80", // Use HTTP port
        target: {
          urlMap: {
            defaultService: "backend-service",
          },
        },
      };

      expect(() => new CloudInfraAlb(apiAlbMeta, config as any)).not.toThrow();

      // Verify SSL certificate creation is not called when no certificate is specified
      expect(mockedSslCertificate.createSslCertificate).not.toHaveBeenCalled();

      // Verify HTTP proxy is created (no certificate)
      expect(mockedProxy.createTargetHttpProxy).toHaveBeenCalled();
    });

    it("should handle HTTPS configuration with SSL certificates", () => {
      const apiAlbMeta = createMockMeta("gl");
      const config = {
        project: "test-project",
        portRange: "443",
        target: {
          sslCertificates: {
            certificate: "cert-data",
            privateKey: "key-data",
          },
          urlMap: {
            defaultService: "backend-service",
          },
        },
      };

      expect(() => new CloudInfraAlb(apiAlbMeta, config as any)).not.toThrow();

      // Verify URL map creation is called
      expect(mockedUrlMap.createGlobalUrlMap).toHaveBeenCalled();

      // Verify HTTPS proxy is created (with certificate)
      expect(mockedProxy.createTargetHttpsProxy).toHaveBeenCalled();
    });

    it("should work with regional ALB using the same pattern", () => {
      const apiAlbMeta = createMockMeta("us");
      const config = {
        project: "test-project",
        portRange: "443",
        target: {
          sslCertificates: {
            project: "test-project",
            certificate: "cert-data",
            privateKey: "key-data",
          },
          urlMap: {
            project: "test-project",
            defaultService: "backend-service",
          },
        },
      };

      expect(() => new CloudInfraAlb(apiAlbMeta, config as any)).not.toThrow();

      // Verify regional resources are created
      expect(mockedProxy.createRegionalTargetHttpsProxy).toHaveBeenCalled();
      expect(
        mockedForwardingRule.createRegionalForwardingRule,
      ).toHaveBeenCalled();
      expect(mockedUrlMap.createRegionalUrlMap).toHaveBeenCalled();
    });
  });

  describe("Type Safety Validation", () => {
    it("should provide proper TypeScript type safety", () => {
      const apiAlbMeta = createMockMeta("gl");

      // This should compile without TypeScript errors
      const config = {
        project: "test-project",
        portRange: "443",
        target: {
          sslCertificates: {
            project: "test-project",
            certificate: "cert-data",
            privateKey: "key-data",
          },
          urlMap: {
            project: "test-project",
            defaultService: "backend-service",
          },
        },
      };

      expect(() => new CloudInfraAlb(apiAlbMeta, config as any)).not.toThrow();
    });

    it("should handle pulumi.Input types correctly", () => {
      const apiAlbMeta = createMockMeta("gl");

      // Simulate pulumi.Input<string> types
      const config = {
        project: "test-project",
        portRange: "443",
        target: {
          sslCertificates: {
            certificate: "cert-data", // This could be pulumi.Input<string>
            privateKey: "key-data", // This could be pulumi.Input<string>
          },
          urlMap: {
            defaultService: "backend-service", // This could be pulumi.Input<string>
          },
        },
      };

      expect(() => new CloudInfraAlb(apiAlbMeta, config as any)).not.toThrow();
    });
  });
});

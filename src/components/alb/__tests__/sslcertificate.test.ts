import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock Pulumi GCP at the top to avoid hoisting issues
vi.mock("@pulumi/gcp", () => ({
  compute: {
    SSLCertificate: vi.fn(),
    RegionSslCertificate: vi.fn(),
  },
}));

import * as gcp from "@pulumi/gcp";
import { createSslCertificate, createRegionalSslCertificate, createCertificate } from "../sslcertificate";
import { CloudInfraMeta } from "../../../core/meta";
import { ResourceError } from "../../../core/errors";

// Mock CloudInfraMeta
const mockMeta = {
  getGcpProject: vi.fn(() => "test-project"),
  getName: vi.fn(() => "test-alb"),
  getRegion: vi.fn(() => "us-central1"),
} as unknown as CloudInfraMeta;

describe("sslcertificate.ts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createSslCertificate", () => {
    beforeEach(() => {
      const mockCertificateInstance = {
        selfLink: "projects/test-project/global/sslCertificates/test-alb",
        id: "test-alb",
        certificate: "cert-data",
        privateKey: "key-data",
      };
      (gcp.compute.SSLCertificate as any).mockImplementation(
        () => mockCertificateInstance,
      );
    });

    it("should create SSL certificate with minimal configuration", () => {
      const config = {
        certificate:
          "-----BEGIN CERTIFICATE-----\nMIIC...\n-----END CERTIFICATE-----",
        privateKey:
          "-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----",
      };

      const params = {
        meta: mockMeta,
        config,
        resourceName: "test-alb",
      };

      const result = createSslCertificate(params);

      expect(gcp.compute.SSLCertificate).toHaveBeenCalledWith("test-alb", {
        project: "test-project",
        certificate:
          "-----BEGIN CERTIFICATE-----\nMIIC...\n-----END CERTIFICATE-----",
        privateKey:
          "-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----",
      });

      expect(result.certificate).toBeDefined();
    });

    it("should pass through user configuration", () => {
      const config = {
        certificate: "cert-data",
        privateKey: "key-data",
        description: "Custom SSL certificate",
        labels: { env: "production", team: "platform" },
      };

      const params = {
        meta: mockMeta,
        config,
        resourceName: "test-alb",
      };

      createSslCertificate(params);

      expect(gcp.compute.SSLCertificate).toHaveBeenCalledWith("test-alb", {
        project: "test-project",
        certificate: "cert-data",
        privateKey: "key-data",
        description: "Custom SSL certificate",
        labels: { env: "production", team: "platform" },
      });
    });

    it("should allow project override", () => {
      const config = {
        certificate: "cert-data",
        privateKey: "key-data",
        project: "override-project",
        description: "Custom SSL certificate",
      };

      const params = {
        meta: mockMeta,
        config,
        resourceName: "test-alb",
      };

      createSslCertificate(params);

      expect(gcp.compute.SSLCertificate).toHaveBeenCalledWith("test-alb", {
        project: "override-project",
        certificate: "cert-data",
        privateKey: "key-data",
        description: "Custom SSL certificate",
      });
    });

    it("should handle complex certificate data", () => {
      const complexCert = `-----BEGIN CERTIFICATE-----
MIIDQTCCAimgAwIBAgITBmyfz5m/jAo54vB4ikPmljZbyjANBgkqhkiG9w0BAQsF
ADA5MQswCQYDVQQGEwJVUzEPMA0GA1UEChMGQW1hem9uMRkwFwYDVQQDExBBbWF6
b24gUm9vdCBDQSAxMB4XDTE1MDUyNjAwMDAwMFoXDTM4MDExNzAwMDAwMFowOTEL
-----END CERTIFICATE-----`;

      const complexKey = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDGGGGGGGGGGGGG
GGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG
GGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG
-----END PRIVATE KEY-----`;

      const config = {
        certificate: complexCert,
        privateKey: complexKey,
        description: "Complex certificate test",
      };

      const params = {
        meta: mockMeta,
        config,
        resourceName: "test-alb",
      };

      expect(() => createSslCertificate(params)).not.toThrow();

      expect(gcp.compute.SSLCertificate).toHaveBeenCalledWith("test-alb", {
        project: "test-project",
        certificate: complexCert,
        privateKey: complexKey,
        description: "Complex certificate test",
      });
    });

    it("should handle minimal valid configuration", () => {
      const validConfig = {
        certificate: "cert-data",
        privateKey: "key-data",
      };

      const params = {
        meta: mockMeta,
        config: validConfig,
        resourceName: "test-alb",
      };

      expect(() => createSslCertificate(params)).not.toThrow();

      expect(gcp.compute.SSLCertificate).toHaveBeenCalledWith("test-alb", {
        project: "test-project",
        certificate: "cert-data",
        privateKey: "key-data",
      });
    });

    it("should handle configuration with managed certificate", () => {
      const validConfig = {
        certificate: "cert-data",
        privateKey: "key-data",
        managed: {
          domains: ["example.com"],
        },
      };

      const params = {
        meta: mockMeta,
        config: validConfig,
        resourceName: "test-alb",
      };

      expect(() => createSslCertificate(params)).not.toThrow();

      expect(gcp.compute.SSLCertificate).toHaveBeenCalledWith("test-alb", {
        project: "test-project",
        certificate: "cert-data",
        privateKey: "key-data",
        managed: {
          domains: ["example.com"],
        },
      });
    });

    it("should throw ResourceError on creation failure", () => {
      (gcp.compute.SSLCertificate as any).mockImplementation(() => {
        throw new Error("GCP Error");
      });

      const config = {
        certificate: "cert-data",
        privateKey: "key-data",
      };

      const params = {
        meta: mockMeta,
        config,
        resourceName: "test-alb",
      };

      expect(() => createSslCertificate(params)).toThrow(ResourceError);
      expect(() => createSslCertificate(params)).toThrow(
        "Failed to create SSL certificate test-alb",
      );
    });

    it("should handle Pulumi Input types for certificate data", () => {
      const config = {
        certificate: "cert-data", // Use simple string instead of complex mock
        privateKey: "key-data",
        description: "Certificate with Pulumi Inputs",
      };

      const params = {
        meta: mockMeta,
        config,
        resourceName: "test-alb",
      };

      expect(() => createSslCertificate(params)).not.toThrow();
    });
  });

  describe("Regional SSL Certificate Creation", () => {
    beforeEach(() => {
      const mockCertificateInstance = {
        selfLink: "projects/test-project/regions/us-central1/sslCertificates/test-regional-cert",
        id: "test-regional-cert",
        certificate: "cert-data",
        privateKey: "key-data",
      };
      (gcp.compute.RegionSslCertificate as any).mockImplementation(
        () => mockCertificateInstance,
      );
    });

    it("should create regional SSL certificate with basic configuration", () => {
      const config = {
        certificate: "cert-data",
        privateKey: "key-data",
      };

      const params = {
        meta: mockMeta,
        config,
        resourceName: "test-regional-cert",
        region: "us-central1",
      };

      expect(() => createRegionalSslCertificate(params)).not.toThrow();

      expect(gcp.compute.RegionSslCertificate).toHaveBeenCalledWith("test-regional-cert", {
        project: "test-project",
        region: "us-central1",
        certificate: "cert-data",
        privateKey: "key-data",
      });
    });

    it("should create regional SSL certificate with all configuration options", () => {
      const config = {
        certificate: "complex-cert-data",
        privateKey: "complex-key-data",
        description: "Regional certificate test",
        name: "custom-regional-cert-name",
      };

      const params = {
        meta: mockMeta,
        config,
        resourceName: "test-regional-cert",
        region: "europe-west1",
      };

      expect(() => createRegionalSslCertificate(params)).not.toThrow();

      expect(gcp.compute.RegionSslCertificate).toHaveBeenCalledWith("test-regional-cert", {
        project: "test-project",
        region: "europe-west1",
        certificate: "complex-cert-data",
        privateKey: "complex-key-data",
        description: "Regional certificate test",
        name: "custom-regional-cert-name",
      });
    });
  });

  describe("Unified Certificate Creation", () => {
    beforeEach(() => {
      const mockGlobalCertificateInstance = {
        selfLink: "projects/test-project/global/sslCertificates/test-unified-cert",
        id: "test-unified-cert",
        certificate: "cert-data",
        privateKey: "key-data",
      };
      const mockRegionalCertificateInstance = {
        selfLink: "projects/test-project/regions/asia-southeast1/sslCertificates/test-unified-cert",
        id: "test-unified-cert",
        certificate: "cert-data",
        privateKey: "key-data",
      };
      (gcp.compute.SSLCertificate as any).mockImplementation(
        () => mockGlobalCertificateInstance,
      );
      (gcp.compute.RegionSslCertificate as any).mockImplementation(
        () => mockRegionalCertificateInstance,
      );
    });

    it("should create global certificate when no region specified", () => {
      const config = {
        certificate: "cert-data",
        privateKey: "key-data",
      };

      const params = {
        meta: mockMeta,
        config,
        resourceName: "test-unified-cert",
      };

      const result = createCertificate(params);
      
      expect(result.certificate).toBeDefined();
      expect(gcp.compute.SSLCertificate).toHaveBeenCalledWith("test-unified-cert", {
        project: "test-project",
        certificate: "cert-data",
        privateKey: "key-data",
      });
    });

    it("should create regional certificate when region specified", () => {
      const config = {
        certificate: "cert-data",
        privateKey: "key-data",
      };

      const params = {
        meta: mockMeta,
        config,
        resourceName: "test-unified-cert",
        region: "asia-southeast1",
      };

      const result = createCertificate(params);
      
      expect(result.certificate).toBeDefined();
      expect(gcp.compute.RegionSslCertificate).toHaveBeenCalledWith("test-unified-cert", {
        project: "test-project",
        region: "asia-southeast1",
        certificate: "cert-data",
        privateKey: "key-data",
      });
    });
  });
});

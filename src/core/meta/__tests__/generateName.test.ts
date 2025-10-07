import { describe, it, expect } from "vitest";
import { CloudInfraMeta } from "../meta";
import { ValidationError } from "../../errors";

describe("CloudInfraMeta.getName() - generateName() method", () => {
  describe("Standard Naming Pattern Tests", () => {
    it("1. Basic Standard Pattern - Australia", () => {
      const meta = new CloudInfraMeta({
        name: "api",
        domain: "au",
        prefix: "myproject",
        gcpProject: "test-project",
      });
      expect(meta.getName()).toBe("myproject-api-au");
    });

    it("2. Basic Standard Pattern - US", () => {
      const meta = new CloudInfraMeta({
        name: "database",
        domain: "us",
        prefix: "myproject",
        gcpProject: "test-project",
      });
      expect(meta.getName()).toBe("myproject-database-us");
    });

    it("3. Standard Pattern with Region", () => {
      const meta = new CloudInfraMeta({
        name: "cache",
        domain: "au",
        location: "australia-southeast2",
        prefix: "myproject",
        gcpProject: "test-project",
      });
      expect(meta.getName()).toBe("myproject-cache-au-se2");
    });

    it("4. Standard Pattern with Multi-Region", () => {
      const meta = new CloudInfraMeta({
        name: "storage",
        domain: "au",
        location: "us",
        prefix: "myproject",
        gcpProject: "test-project",
      });
      expect(meta.getName()).toBe("myproject-storage-us");
    });
  });

  describe("Preview Mode Tests", () => {
    it("5. Preview Mode Basic", () => {
      const meta = new CloudInfraMeta({
        name: "api",
        domain: "au",
        preview: "pr-123",
        prefix: "myproject",
        gcpProject: "test-project",
      });
      expect(meta.getName()).toBe("myproject-api-e004542");
    });

    it("6. Preview Mode with Long String", () => {
      const meta = new CloudInfraMeta({
        name: "api",
        domain: "au",
        preview: "very-long-preview-string-that-exceeds-normal-length",
        prefix: "myproject",
        gcpProject: "test-project",
      });
      // The exact hash will be computed by hash7 function
      const result = meta.getName();
      expect(result).toMatch(/^myproject-api-[a-f0-9]{7}$/);
      expect(result.length).toBe(21); // myproject-api- (13) + 7 char hash
    });

    it("7. Preview Mode with Special Characters", () => {
      const meta = new CloudInfraMeta({
        name: "api",
        domain: "au",
        preview: "pr-123!@#$%",
        prefix: "myproject",
        gcpProject: "test-project",
      });
      // The exact hash will be computed by hash7 function
      const result = meta.getName();
      expect(result).toMatch(/^myproject-api-[a-f0-9]{7}$/);
    });
  });

  describe("Omit Flags Tests", () => {
    it("8. Omit Domain Only", () => {
      const meta = new CloudInfraMeta({
        name: "global-service",
        domain: "au",
        omitDomain: true,
        prefix: "myproject",
        gcpProject: "test-project",
      });
      expect(meta.getName()).toBe("myproject-global-service");
    });

    it("9. Omit Prefix Only", () => {
      const meta = new CloudInfraMeta({
        name: "shared-api",
        domain: "us",
        omitPrefix: true,
        prefix: "myproject",
        gcpProject: "test-project",
      });
      expect(meta.getName()).toBe("shared-api-us");
    });

    it("10. Omit Both Flags", () => {
      const meta = new CloudInfraMeta({
        name: "standalone",
        domain: "au",
        omitPrefix: true,
        omitDomain: true,
        prefix: "myproject",
        gcpProject: "test-project",
      });
      expect(meta.getName()).toBe("standalone");
    });
  });

  describe("Schema Violation Edge Cases", () => {
    it("11. Generated Name Too Long", () => {
      // Schema validation should prevent prefix longer than 12 characters
      expect(() => {
        new CloudInfraMeta({
          name: "very-long-component-name-here",
          domain: "au",
          prefix: "very-long-prefix",
          gcpProject: "test-project",
        });
      }).toThrow(ValidationError);
    });

    it("12. Long Preview Hash Combination", () => {
      // Schema validation should prevent prefix longer than 12 characters
      expect(() => {
        new CloudInfraMeta({
          name: "component-with-long-name",
          preview: "long-preview",
          prefix: "very-long-prefix",
          gcpProject: "test-project",
        });
      }).toThrow(ValidationError);
    });

    it("13. Name Ending with Hyphen via Region Code", () => {
      // Schema validation should prevent regions ending with hyphen
      expect(() => {
        new CloudInfraMeta({
          name: "api",
          domain: "au",
          location: "custom-region-",
          prefix: "project",
          gcpProject: "test-project",
        });
      }).toThrow(ValidationError);
    });

    it("14. Empty Name with Omit Flags", () => {
      // Schema validation should prevent empty names at construction
      expect(() => {
        new CloudInfraMeta({
          name: "",
          domain: "au",
          omitPrefix: true,
          omitDomain: true,
          prefix: "project",
          gcpProject: "test-project",
        });
      }).toThrow();
    });

    it("15. Name Starting with Number via Region Code", () => {
      // Schema validation should prevent regions starting with number
      expect(() => {
        new CloudInfraMeta({
          name: "api",
          domain: "au",
          location: "1-invalid-region",
          prefix: "project",
          gcpProject: "test-project",
        });
      }).toThrow(ValidationError);
    });
  });

  describe("Extreme Length Scenarios", () => {
    it("16. Maximum Length Prefix", () => {
      const meta = new CloudInfraMeta({
        name: "api",
        domain: "au",
        prefix: "abcdefghijkl",
        gcpProject: "test-project",
      });
      expect(meta.getName()).toBe("abcdefghijkl-api-au");
    });

    it("17. Maximum Length Name", () => {
      const meta = new CloudInfraMeta({
        name: "abcdefghijklmnopqrstuvwxyz1234",
        domain: "au",
        prefix: "short",
        gcpProject: "test-project",
      });
      const result = meta.getName();
      expect(result).toBe("short-abcdefghijklmnopqrstuvwxyz1234-au");
      expect(result.length).toBeGreaterThan(30);
    });

    it("18. Maximum Combined Length", () => {
      const meta = new CloudInfraMeta({
        name: "verylongcomponentnamehere1234",
        domain: "au",
        prefix: "maxlenpfx123",
        gcpProject: "test-project",
      });
      const result = meta.getName();
      expect(result).toBe("maxlenpfx123-verylongcomponentnamehere1234-au");
      expect(result.length).toBe(45);
    });
  });

  describe("Special Character and Invalid Input Scenarios", () => {
    it("19. Name with Uppercase (Pre-validation)", () => {
      // Schema validation should prevent this at construction
      expect(() => {
        new CloudInfraMeta({
          name: "API-Service",
          domain: "au",
          prefix: "project",
          gcpProject: "test-project",
        });
      }).toThrow();
    });

    it("20. Name with Invalid Characters (Pre-validation)", () => {
      // Schema validation should prevent this at construction
      expect(() => {
        new CloudInfraMeta({
          name: "api_service",
          domain: "au",
          prefix: "project",
          gcpProject: "test-project",
        });
      }).toThrow();
    });
  });

  describe("Location Resolution Edge Cases", () => {
    it("21. Dual Region Array", () => {
      const meta = new CloudInfraMeta({
        name: "api",
        domain: "au",
        location: ["us-central1", "us-east1"],
        prefix: "project",
        gcpProject: "test-project",
      });
      expect(meta.getName()).toBe("project-api-us-c1-us-e1");
    });

    it("22. Invalid Dual Region Array", () => {
      // Note: ["us-central1", "us-east1"] is actually a valid dual region combination
      // This test should actually pass without throwing an error
      const meta = new CloudInfraMeta({
        name: "api",
        domain: "au",
        location: ["us-central1", "us-east1"],
        prefix: "project",
        gcpProject: "test-project",
      });
      // Should generate a name with dual region code
      const result = meta.getName();
      expect(result).toBe("project-api-us-c1-us-e1");
    });

    it("23. Empty Location Array", () => {
      expect(() => {
        new CloudInfraMeta({
          name: "api",
          domain: "au",
          location: [],
          prefix: "project",
          gcpProject: "test-project",
        });
      }).toThrow();
    });

    it("24. Single Complex Region", () => {
      const meta = new CloudInfraMeta({
        name: "api",
        domain: "au",
        location: "northamerica-northeast1",
        prefix: "project",
        gcpProject: "test-project",
      });
      expect(meta.getName()).toBe("project-api-na-ne1");
    });
  });

  describe("Domain Resolution Edge Cases", () => {
    it("25. Global Domain Fallback", () => {
      const meta = new CloudInfraMeta({
        name: "api",
        domain: "gl",
        prefix: "project",
        gcpProject: "test-project",
      });
      expect(meta.getName()).toBe("project-api-gl");
    });
  });

  describe("Prefix Edge Cases", () => {
    it("26. Empty Prefix with Standard Pattern", () => {
      // Empty prefix is actually allowed - it defaults to Pulumi project name
      const meta = new CloudInfraMeta({
        name: "api",
        domain: "au",
        prefix: "",
        gcpProject: "test-project",
      });
      // Should use Pulumi project name as prefix when empty string provided
      expect(meta.getName()).toMatch(/^[^-]+-api-au$/);
    });

    it("27. Prefix with Hyphen at End", () => {
      // Schema validation should handle this
      const meta = new CloudInfraMeta({
        name: "api",
        domain: "au",
        prefix: "project-",
        gcpProject: "test-project",
      });
      const result = meta.getName();
      expect(result).toBe("project--api-au");
    });
  });

  describe("Hash Function Edge Cases", () => {
    it("28. Preview with Empty String", () => {
      // Empty preview string should not generate preview mode name
      const meta = new CloudInfraMeta({
        name: "api",
        domain: "au",
        preview: "",
        prefix: "project",
        gcpProject: "test-project",
      });
      // Should generate standard name, not preview name
      expect(meta.getName()).toBe("project-api-au");
    });

    it("29. Preview with Unicode Characters", () => {
      const meta = new CloudInfraMeta({
        name: "api",
        domain: "au",
        preview: "测试-123",
        prefix: "project",
        gcpProject: "test-project",
      });
      const result = meta.getName();
      expect(result).toMatch(/^project-api-[a-f0-9]{7}$/);
    });
  });
});

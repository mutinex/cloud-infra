import { describe, it, expect } from "vitest";
import { CloudInfraMeta } from "../meta";
import { ValidationError } from "../../errors";

describe("CloudInfraMeta.getLocation()", () => {
  describe("Domain Fallback Tests", () => {
    it("1. Domain Fallback - Australia", () => {
      const meta = new CloudInfraMeta({
        name: "test",
        domain: "au",
        gcpProject: "test-project",
      });
      expect(meta.getLocation()).toBe("australia-southeast1");
    });

    it("2. Domain Fallback - United States", () => {
      const meta = new CloudInfraMeta({
        name: "test",
        domain: "us",
        gcpProject: "test-project",
      });
      expect(meta.getLocation()).toBe("us-central1");
    });

    it("3. Domain Fallback - Global", () => {
      const meta = new CloudInfraMeta({
        name: "test",
        domain: "gl",
        gcpProject: "test-project",
      });
      expect(meta.getLocation()).toBe("global");
    });
  });

  describe("Single Region Location Tests", () => {
    it("4. Single Region Location", () => {
      const meta = new CloudInfraMeta({
        name: "test",
        domain: "au",
        location: "europe-west1",
        gcpProject: "test-project",
      });
      expect(meta.getLocation()).toBe("europe-west1");
    });

    it("15. Complex Single Region String", () => {
      const meta = new CloudInfraMeta({
        name: "test",
        domain: "au",
        location: "northamerica-northeast1",
        gcpProject: "test-project",
      });
      expect(meta.getLocation()).toBe("northamerica-northeast1");
    });
  });

  describe("Multi-Region Tests", () => {
    it("5. Multi-Region US", () => {
      const meta = new CloudInfraMeta({
        name: "test",
        domain: "au",
        location: "us",
        gcpProject: "test-project",
      });
      expect(meta.getLocation()).toBe("us");
    });

    it("6. Multi-Region Europe", () => {
      const meta = new CloudInfraMeta({
        name: "test",
        domain: "au",
        location: "eu",
        gcpProject: "test-project",
      });
      expect(meta.getLocation()).toBe("eu");
    });

    it("7. Multi-Region Asia", () => {
      const meta = new CloudInfraMeta({
        name: "test",
        domain: "au",
        location: "asia",
        gcpProject: "test-project",
      });
      expect(meta.getLocation()).toBe("asia");
    });
  });

  describe("Valid Dual-Region Tests", () => {
    it("8. Valid Dual-Region Australia", () => {
      const meta = new CloudInfraMeta({
        name: "test",
        domain: "au",
        location: ["australia-southeast1", "australia-southeast2"],
        gcpProject: "test-project",
      });
      expect(meta.getLocation()).toBe("au");
    });

    it("9. Valid Dual-Region North America", () => {
      const meta = new CloudInfraMeta({
        name: "test",
        domain: "us",
        location: ["us-central1", "us-east1"],
        gcpProject: "test-project",
      });
      expect(meta.getLocation()).toBe("nam4");
    });

    it("10. Valid Dual-Region Europe (eur4)", () => {
      const meta = new CloudInfraMeta({
        name: "test",
        domain: "au",
        location: ["europe-north1", "europe-west4"],
        gcpProject: "test-project",
      });
      expect(meta.getLocation()).toBe("eur4");
    });

    it("11. Valid Dual-Region Asia", () => {
      const meta = new CloudInfraMeta({
        name: "test",
        domain: "au",
        location: ["asia-northeast1", "asia-northeast2"],
        gcpProject: "test-project",
      });
      expect(meta.getLocation()).toBe("asia1");
    });
  });

  describe("Invalid Dual-Region Error Tests", () => {
    it("12. Invalid Dual-Region Combination", () => {
      expect(() => {
        const meta = new CloudInfraMeta({
          name: "test",
          domain: "us",
          location: ["us-central1", "europe-west1"],
          gcpProject: "test-project",
        });
        meta.getLocation();
      }).toThrow(ValidationError);
    });

    it("13. Dual-Region Array Wrong Length", () => {
      expect(() => {
        const meta = new CloudInfraMeta({
          name: "test",
          domain: "us",
          location: ["us-central1"],
          gcpProject: "test-project",
        });
        meta.getLocation();
      }).toThrow(ValidationError);
    });

    it("14. Dual-Region Array with Invalid Strings", () => {
      expect(() => {
        new CloudInfraMeta({
          name: "test",
          domain: "us",
          location: ["invalid-region", "not-valid"],
          gcpProject: "test-project",
        });
      }).toThrow(ValidationError);
    });
  });
});

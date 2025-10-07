import { describe, it, expect } from "vitest";
import { CloudInfraMeta } from "../meta";

describe("CloudInfraMeta.getRegion()", () => {
  describe("Domain Fallback Tests", () => {
    it("1. Domain Fallback - Australia", () => {
      const meta = new CloudInfraMeta({
        name: "test",
        domain: "au",
        gcpProject: "test-project",
      });
      expect(meta.getRegion()).toBe("australia-southeast1");
    });

    it("2. Domain Fallback - United States", () => {
      const meta = new CloudInfraMeta({
        name: "test",
        domain: "us",
        gcpProject: "test-project",
      });
      expect(meta.getRegion()).toBe("us-central1");
    });

    it("3. Domain Fallback - Global", () => {
      const meta = new CloudInfraMeta({
        name: "test",
        domain: "gl",
        gcpProject: "test-project",
      });
      expect(meta.getRegion()).toBe("global");
    });
  });

  describe("Valid Single Region Tests", () => {
    it("4. Valid Single Region - Australia", () => {
      const meta = new CloudInfraMeta({
        name: "test",
        domain: "au",
        location: "australia-southeast2",
        gcpProject: "test-project",
      });
      expect(meta.getRegion()).toBe("australia-southeast2");
    });

    it("5. Valid Single Region - US", () => {
      const meta = new CloudInfraMeta({
        name: "test",
        domain: "us",
        location: "us-east1",
        gcpProject: "test-project",
      });
      expect(meta.getRegion()).toBe("us-east1");
    });

    it("6. Valid Single Region - Europe", () => {
      const meta = new CloudInfraMeta({
        name: "test",
        domain: "au",
        location: "europe-west1",
        gcpProject: "test-project",
      });
      expect(meta.getRegion()).toBe("europe-west1");
    });

    it("7. Valid Single Region - Asia", () => {
      const meta = new CloudInfraMeta({
        name: "test",
        domain: "us",
        location: "asia-northeast1",
        gcpProject: "test-project",
      });
      expect(meta.getRegion()).toBe("asia-northeast1");
    });

    it("8. Valid Single Region - North America", () => {
      const meta = new CloudInfraMeta({
        name: "test",
        domain: "au",
        location: "northamerica-northeast1",
        gcpProject: "test-project",
      });
      expect(meta.getRegion()).toBe("northamerica-northeast1");
    });
  });

  describe("Multi-Region Error Tests", () => {
    it("9. Multi-Region US Error", () => {
      const meta = new CloudInfraMeta({
        name: "test",
        domain: "au",
        location: "us",
        gcpProject: "test-project",
      });
      expect(() => meta.getRegion()).toThrow(
        "Cannot use getRegion with multi-regions. Use getLocation instead.",
      );
    });

    it("10. Multi-Region Europe Error", () => {
      const meta = new CloudInfraMeta({
        name: "test",
        domain: "us",
        location: "eu",
        gcpProject: "test-project",
      });
      expect(() => meta.getRegion()).toThrow(
        "Cannot use getRegion with multi-regions. Use getLocation instead.",
      );
    });

    it("11. Multi-Region Asia Error", () => {
      const meta = new CloudInfraMeta({
        name: "test",
        domain: "au",
        location: "asia",
        gcpProject: "test-project",
      });
      expect(() => meta.getRegion()).toThrow(
        "Cannot use getRegion with multi-regions. Use getLocation instead.",
      );
    });
  });

  describe("Dual-Region Array Error Tests", () => {
    it("12. Dual-Region Array Error - Australia", () => {
      const meta = new CloudInfraMeta({
        name: "test",
        domain: "au",
        location: ["australia-southeast1", "australia-southeast2"],
        gcpProject: "test-project",
      });
      expect(() => meta.getRegion()).toThrow(
        "Cannot use getRegion with dual regions. Use getDualRegion instead.",
      );
    });

    it("13. Dual-Region Array Error - US", () => {
      const meta = new CloudInfraMeta({
        name: "test",
        domain: "us",
        location: ["us-central1", "us-east1"],
        gcpProject: "test-project",
      });
      expect(() => meta.getRegion()).toThrow(
        "Cannot use getRegion with dual regions. Use getDualRegion instead.",
      );
    });

    it("14. Dual-Region Array Error - Europe", () => {
      const meta = new CloudInfraMeta({
        name: "test",
        domain: "au",
        location: ["europe-north1", "europe-west4"],
        gcpProject: "test-project",
      });
      expect(() => meta.getRegion()).toThrow(
        "Cannot use getRegion with dual regions. Use getDualRegion instead.",
      );
    });

    it("15. Dual-Region Array Error - Asia", () => {
      const meta = new CloudInfraMeta({
        name: "test",
        domain: "au",
        location: ["asia-northeast1", "asia-northeast2"],
        gcpProject: "test-project",
      });
      expect(() => meta.getRegion()).toThrow(
        "Cannot use getRegion with dual regions. Use getDualRegion instead.",
      );
    });

    it("16. Single Item Array Error", () => {
      const meta = new CloudInfraMeta({
        name: "test",
        domain: "us",
        location: ["us-central1"],
        gcpProject: "test-project",
      });
      expect(() => meta.getRegion()).toThrow(
        "Cannot use getRegion with dual regions. Use getDualRegion instead.",
      );
    });

    it("17. Empty Array Error", () => {
      expect(() => {
        new CloudInfraMeta({
          name: "test",
          domain: "us",
          location: [],
          gcpProject: "test-project",
        });
      }).toThrow();
    });

    it("18. Invalid Dual-Region Array Error", () => {
      const meta = new CloudInfraMeta({
        name: "test",
        domain: "us",
        location: ["us-central1", "europe-west1"],
        gcpProject: "test-project",
      });
      expect(() => meta.getRegion()).toThrow(
        "Cannot use getRegion with dual regions. Use getDualRegion instead.",
      );
    });
  });
});

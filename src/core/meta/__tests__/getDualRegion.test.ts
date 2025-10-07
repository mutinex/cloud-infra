import { describe, it, expect } from "vitest";
import { CloudInfraMeta } from "../meta";
import { ValidationError } from "../../errors";

describe("CloudInfraMeta.getDualRegion()", () => {
  describe("No Location Error Tests", () => {
    it("1. No Location Error - Australia Domain", () => {
      const meta = new CloudInfraMeta({
        name: "test",
        domain: "au",
        gcpProject: "test-project",
      });
      expect(() => meta.getDualRegion()).toThrow(
        "No dual region specified. Use getDualRegion only with dual region configurations.",
      );
    });

    it("2. No Location Error - US Domain", () => {
      const meta = new CloudInfraMeta({
        name: "test",
        domain: "us",
        gcpProject: "test-project",
      });
      expect(() => meta.getDualRegion()).toThrow(
        "No dual region specified. Use getDualRegion only with dual region configurations.",
      );
    });

    it("3. No Location Error - Global Domain", () => {
      const meta = new CloudInfraMeta({
        name: "test",
        domain: "gl",
        gcpProject: "test-project",
      });
      expect(() => meta.getDualRegion()).toThrow(
        "No dual region specified. Use getDualRegion only with dual region configurations.",
      );
    });
  });

  describe("Single Region String Error Tests", () => {
    it("4. Single Region String Error - Australia", () => {
      const meta = new CloudInfraMeta({
        name: "test",
        domain: "au",
        location: "australia-southeast1",
        gcpProject: "test-project",
      });
      expect(() => meta.getDualRegion()).toThrow(
        "No dual region specified. Use getDualRegion only with dual region configurations.",
      );
    });

    it("5. Single Region String Error - US", () => {
      const meta = new CloudInfraMeta({
        name: "test",
        domain: "us",
        location: "us-central1",
        gcpProject: "test-project",
      });
      expect(() => meta.getDualRegion()).toThrow(
        "No dual region specified. Use getDualRegion only with dual region configurations.",
      );
    });

    it("6. Single Region String Error - Europe", () => {
      const meta = new CloudInfraMeta({
        name: "test",
        domain: "au",
        location: "europe-west1",
        gcpProject: "test-project",
      });
      expect(() => meta.getDualRegion()).toThrow(
        "No dual region specified. Use getDualRegion only with dual region configurations.",
      );
    });
  });

  describe("Multi-Region String Error Tests", () => {
    it("7. Multi-Region String Error - US", () => {
      const meta = new CloudInfraMeta({
        name: "test",
        domain: "au",
        location: "us",
        gcpProject: "test-project",
      });
      expect(() => meta.getDualRegion()).toThrow(
        "No dual region specified. Use getDualRegion only with dual region configurations.",
      );
    });

    it("8. Multi-Region String Error - Europe", () => {
      const meta = new CloudInfraMeta({
        name: "test",
        domain: "us",
        location: "eu",
        gcpProject: "test-project",
      });
      expect(() => meta.getDualRegion()).toThrow(
        "No dual region specified. Use getDualRegion only with dual region configurations.",
      );
    });

    it("9. Multi-Region String Error - Asia", () => {
      const meta = new CloudInfraMeta({
        name: "test",
        domain: "au",
        location: "asia",
        gcpProject: "test-project",
      });
      expect(() => meta.getDualRegion()).toThrow(
        "No dual region specified. Use getDualRegion only with dual region configurations.",
      );
    });
  });

  describe("Valid Dual-Region Tests", () => {
    it("10. Valid Dual-Region Australia", () => {
      const meta = new CloudInfraMeta({
        name: "test",
        domain: "au",
        location: ["australia-southeast1", "australia-southeast2"],
        gcpProject: "test-project",
      });
      expect(meta.getDualRegion()).toEqual([
        "australia-southeast1",
        "australia-southeast2",
      ]);
    });

    it("11. Valid Dual-Region North America", () => {
      const meta = new CloudInfraMeta({
        name: "test",
        domain: "us",
        location: ["us-central1", "us-east1"],
        gcpProject: "test-project",
      });
      expect(meta.getDualRegion()).toEqual(["us-central1", "us-east1"]);
    });

    it("12. Valid Dual-Region Europe (eur4)", () => {
      const meta = new CloudInfraMeta({
        name: "test",
        domain: "au",
        location: ["europe-north1", "europe-west4"],
        gcpProject: "test-project",
      });
      expect(meta.getDualRegion()).toEqual(["europe-north1", "europe-west4"]);
    });

    it("13. Valid Dual-Region Europe (eur5)", () => {
      const meta = new CloudInfraMeta({
        name: "test",
        domain: "au",
        location: ["europe-west1", "europe-west2"],
        gcpProject: "test-project",
      });
      expect(meta.getDualRegion()).toEqual(["europe-west1", "europe-west2"]);
    });

    it("14. Valid Dual-Region Asia", () => {
      const meta = new CloudInfraMeta({
        name: "test",
        domain: "au",
        location: ["asia-northeast1", "asia-northeast2"],
        gcpProject: "test-project",
      });
      expect(meta.getDualRegion()).toEqual([
        "asia-northeast1",
        "asia-northeast2",
      ]);
    });
  });

  describe("Array Without Validation Tests", () => {
    it("15. Invalid Dual-Region Combination", () => {
      const meta = new CloudInfraMeta({
        name: "test",
        domain: "us",
        location: ["us-central1", "europe-west1"],
        gcpProject: "test-project",
      });
      expect(meta.getDualRegion()).toEqual(["us-central1", "europe-west1"]);
    });

    it("16. Empty Array", () => {
      expect(() => {
        new CloudInfraMeta({
          name: "test",
          domain: "us",
          location: [],
          gcpProject: "test-project",
        });
      }).toThrow();
    });

    it("17. Single Item Array", () => {
      const meta = new CloudInfraMeta({
        name: "test",
        domain: "us",
        location: ["us-central1"],
        gcpProject: "test-project",
      });
      expect(meta.getDualRegion()).toEqual(["us-central1"]);
    });

    it("18. Three Item Array", () => {
      const meta = new CloudInfraMeta({
        name: "test",
        domain: "us",
        location: ["us-central1", "us-east1", "europe-west1"],
        gcpProject: "test-project",
      });
      expect(meta.getDualRegion()).toEqual([
        "us-central1",
        "us-east1",
        "europe-west1",
      ]);
    });

    it("19. Array with Invalid Strings", () => {
      expect(() => {
        new CloudInfraMeta({
          name: "test",
          domain: "us",
          location: ["", "invalid-region"],
          gcpProject: "test-project",
        });
      }).toThrow(ValidationError);
    });

    it("20. Array with Mixed Valid/Invalid", () => {
      expect(() => {
        new CloudInfraMeta({
          name: "test",
          domain: "us",
          location: ["us-central1", "not-a-region"],
          gcpProject: "test-project",
        });
      }).toThrow(ValidationError);
    });
  });
});

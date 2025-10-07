import { describe, it, expect } from "vitest";
import { CloudInfraMeta } from "../meta";

describe("CloudInfraMeta.getMultiRegion()", () => {
  describe("No Location Domain Fallback Tests", () => {
    it("1. No Location - Australia Domain", () => {
      const meta = new CloudInfraMeta({
        name: "test",
        domain: "au",
        gcpProject: "test-project",
      });
      expect(meta.getMultiRegion()).toEqual(["australia-southeast1"]);
    });

    it("2. No Location - US Domain", () => {
      const meta = new CloudInfraMeta({
        name: "test",
        domain: "us",
        gcpProject: "test-project",
      });
      expect(meta.getMultiRegion()).toEqual(["us-central1"]);
    });

    it("3. No Location - Global Domain", () => {
      const meta = new CloudInfraMeta({
        name: "test",
        domain: "gl",
        gcpProject: "test-project",
      });
      expect(meta.getMultiRegion()).toEqual(["global"]);
    });
  });

  describe("String Location Tests", () => {
    it("4. Single Region String", () => {
      const meta = new CloudInfraMeta({
        name: "test",
        domain: "au",
        location: "europe-west1",
        gcpProject: "test-project",
      });
      expect(meta.getMultiRegion()).toEqual(["europe-west1"]);
    });

    it("5. Multi-Region String - US", () => {
      const meta = new CloudInfraMeta({
        name: "test",
        domain: "au",
        location: "us",
        gcpProject: "test-project",
      });
      expect(meta.getMultiRegion()).toEqual(["us"]);
    });

    it("6. Multi-Region String - Europe", () => {
      const meta = new CloudInfraMeta({
        name: "test",
        domain: "us",
        location: "eu",
        gcpProject: "test-project",
      });
      expect(meta.getMultiRegion()).toEqual(["eu"]);
    });

    it("7. Multi-Region String - Asia", () => {
      const meta = new CloudInfraMeta({
        name: "test",
        domain: "au",
        location: "asia",
        gcpProject: "test-project",
      });
      expect(meta.getMultiRegion()).toEqual(["asia"]);
    });
  });

  describe("Array Location Tests", () => {
    it("8. Dual-Region Array", () => {
      const meta = new CloudInfraMeta({
        name: "test",
        domain: "au",
        location: ["australia-southeast1", "australia-southeast2"],
        gcpProject: "test-project",
      });
      expect(meta.getMultiRegion()).toEqual([
        "australia-southeast1",
        "australia-southeast2",
      ]);
    });

    it("9. Single Item Array", () => {
      const meta = new CloudInfraMeta({
        name: "test",
        domain: "us",
        location: ["us-central1"],
        gcpProject: "test-project",
      });
      expect(meta.getMultiRegion()).toEqual(["us-central1"]);
    });

    it("10. Multi-Item Array", () => {
      const meta = new CloudInfraMeta({
        name: "test",
        domain: "us",
        location: ["us-central1", "us-east1", "europe-west1"],
        gcpProject: "test-project",
      });
      expect(meta.getMultiRegion()).toEqual([
        "us-central1",
        "us-east1",
        "europe-west1",
      ]);
    });
  });
});

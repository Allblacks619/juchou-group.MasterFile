import { describe, it, expect } from "vitest";
import { parseDateString, parseDateRange, formatDateString } from "./dateHelpers";

describe("Date Helpers (UTC-safe)", () => {
  describe("parseDateString", () => {
    it("parses YYYY-MM-DD to noon UTC", () => {
      const d = parseDateString("2024-03-15");
      expect(d.getUTCFullYear()).toBe(2024);
      expect(d.getUTCMonth()).toBe(2); // March = 2
      expect(d.getUTCDate()).toBe(15);
      expect(d.getUTCHours()).toBe(12); // noon UTC
    });

    it("handles month boundaries correctly", () => {
      const d = parseDateString("2024-01-01");
      expect(d.getUTCFullYear()).toBe(2024);
      expect(d.getUTCMonth()).toBe(0);
      expect(d.getUTCDate()).toBe(1);
    });

    it("handles end of month", () => {
      const d = parseDateString("2024-02-29");
      expect(d.getUTCFullYear()).toBe(2024);
      expect(d.getUTCMonth()).toBe(1);
      expect(d.getUTCDate()).toBe(29);
    });

    it("handles ISO string input", () => {
      const d = parseDateString("2024-03-15T00:00:00.000Z");
      expect(d.getUTCDate()).toBe(15);
    });

    it("throws on invalid input", () => {
      expect(() => parseDateString("invalid")).toThrow("Invalid date string");
    });
  });

  describe("parseDateRange", () => {
    it("returns start and end of day in UTC", () => {
      const { start, end } = parseDateRange("2024-03-15");
      expect(start.getUTCHours()).toBe(0);
      expect(start.getUTCMinutes()).toBe(0);
      expect(end.getUTCHours()).toBe(23);
      expect(end.getUTCMinutes()).toBe(59);
      expect(start.getUTCDate()).toBe(15);
      expect(end.getUTCDate()).toBe(15);
    });
  });

  describe("formatDateString", () => {
    it("formats Date to YYYY-MM-DD", () => {
      const d = new Date(Date.UTC(2024, 2, 15, 12, 0, 0));
      expect(formatDateString(d)).toBe("2024-03-15");
    });

    it("pads single-digit month and day", () => {
      const d = new Date(Date.UTC(2024, 0, 5, 12, 0, 0));
      expect(formatDateString(d)).toBe("2024-01-05");
    });
  });

  describe("roundtrip", () => {
    it("parse -> format preserves date", () => {
      const original = "2024-12-31";
      const parsed = parseDateString(original);
      const formatted = formatDateString(parsed);
      expect(formatted).toBe(original);
    });

    it("handles JST-problematic dates (midnight UTC)", () => {
      // This is the key test: "2024-03-15" at midnight UTC is still March 14 in UTC-12
      // but our parseDateString uses noon UTC, so it should always be March 15
      const d = parseDateString("2024-03-15");
      expect(formatDateString(d)).toBe("2024-03-15");
    });
  });
});

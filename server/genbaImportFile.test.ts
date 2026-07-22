import { describe, it, expect } from "vitest";
import { sniffMime, resolveImportMime, decodeHeaderFilename } from "../shared/genba/importFile";

const bytes = (...b: number[]) => Uint8Array.from(b);
const PDF = bytes(0x25, 0x50, 0x44, 0x46, 0x2d, 0x31); // %PDF-1
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10);
const WEBP = bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50);

describe("genba importFile", () => {
  describe("sniffMime", () => {
    it("detects PDF / PNG / JPEG / WEBP by signature", () => {
      expect(sniffMime(PDF)).toBe("application/pdf");
      expect(sniffMime(PNG)).toBe("image/png");
      expect(sniffMime(JPEG)).toBe("image/jpeg");
      expect(sniffMime(WEBP)).toBe("image/webp");
    });
    it("returns null for unknown / short bytes", () => {
      expect(sniffMime(bytes(0x00, 0x01, 0x02))).toBeNull();
      expect(sniffMime(bytes())).toBeNull();
    });
  });

  describe("resolveImportMime", () => {
    it("keeps a valid declared content-type", () => {
      expect(resolveImportMime("image/png", PNG)).toBe("image/png");
      expect(resolveImportMime("application/pdf; charset=binary", PDF)).toBe("application/pdf");
    });
    it("recovers PDF served as application/octet-stream (Drive)", () => {
      expect(resolveImportMime("application/octet-stream", PDF)).toBe("application/pdf");
    });
    it("recovers when content-type is empty", () => {
      expect(resolveImportMime("", JPEG)).toBe("image/jpeg");
    });
    it("prefers signature when declared type is not allowed", () => {
      expect(resolveImportMime("application/x-pdf", PDF)).toBe("application/pdf");
    });
    it("falls back to declared type when signature is unknown", () => {
      expect(resolveImportMime("application/octet-stream", bytes(0, 1, 2, 3))).toBe("application/octet-stream");
    });
  });

  describe("decodeHeaderFilename", () => {
    it("returns fallback when header is absent", () => {
      expect(decodeHeaderFilename(null, "import")).toBe("import");
      expect(decodeHeaderFilename(undefined)).toBe("import");
    });
    it("reads a plain ASCII filename", () => {
      expect(decodeHeaderFilename('attachment; filename="report.pdf"')).toBe("report.pdf");
    });
    it("decodes RFC5987 filename*=UTF-8''", () => {
      // 電灯.pdf
      const enc = "attachment; filename*=UTF-8''%E9%9B%BB%E7%81%AF.pdf";
      expect(decodeHeaderFilename(enc)).toBe("電灯.pdf");
    });
    it("recovers a latin1-mangled UTF-8 Japanese filename", () => {
      // 電灯.pdf の UTF-8 バイトを latin1 文字列にしたもの (undici が返す形)
      const utf8 = Buffer.from("電灯.pdf", "utf8");
      const latin1Str = utf8.toString("latin1");
      const header = `attachment; filename="${latin1Str}"`;
      expect(decodeHeaderFilename(header)).toBe("電灯.pdf");
    });
    it("keeps a genuine latin1 accented filename intact", () => {
      // café.pdf を latin1 で送ってきた場合は壊さない
      const latin1Str = Buffer.from("café.pdf", "latin1").toString("latin1");
      const header = `attachment; filename="${latin1Str}"`;
      expect(decodeHeaderFilename(header)).toBe("café.pdf");
    });
  });
});

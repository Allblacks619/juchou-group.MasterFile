import { describe, it, expect } from "vitest";
import { validateFile, validateFiles, MAX_IMAGE_SIZE, MAX_PDF_SIZE, MAX_TOTAL_SIZE, MAX_FILES_PER_ACTION } from "../shared/uploadValidation";

describe("Upload Validation", () => {
  describe("validateFile", () => {
    it("accepts valid JPEG file", () => {
      expect(validateFile("photo.jpg", "image/jpeg", 5 * 1024 * 1024)).toBeNull();
    });

    it("accepts valid PNG file", () => {
      expect(validateFile("doc.png", "image/png", 8 * 1024 * 1024)).toBeNull();
    });

    it("accepts valid WEBP file", () => {
      expect(validateFile("image.webp", "image/webp", 3 * 1024 * 1024)).toBeNull();
    });

    it("accepts valid PDF file", () => {
      expect(validateFile("document.pdf", "application/pdf", 15 * 1024 * 1024)).toBeNull();
    });

    it("rejects disallowed MIME type", () => {
      const err = validateFile("script.js", "application/javascript", 1024);
      expect(err).toContain("許可されていないファイル形式");
    });

    it("rejects disallowed extension", () => {
      const err = validateFile("file.exe", "image/jpeg", 1024);
      expect(err).toContain("許可されていないファイル拡張子");
    });

    it("rejects MIME-extension mismatch", () => {
      const err = validateFile("photo.png", "image/jpeg", 1024);
      expect(err).toContain("ファイル形式と拡張子が一致しません");
    });

    it("rejects oversized image (>10MB)", () => {
      const err = validateFile("big.jpg", "image/jpeg", 11 * 1024 * 1024);
      expect(err).toContain("ファイルサイズが上限");
      expect(err).toContain("10MB");
    });

    it("rejects oversized PDF (>20MB)", () => {
      const err = validateFile("big.pdf", "application/pdf", 21 * 1024 * 1024);
      expect(err).toContain("ファイルサイズが上限");
      expect(err).toContain("20MB");
    });

    it("accepts PDF up to 20MB", () => {
      expect(validateFile("ok.pdf", "application/pdf", 20 * 1024 * 1024)).toBeNull();
    });

    it("accepts image up to 10MB", () => {
      expect(validateFile("ok.jpg", "image/jpeg", 10 * 1024 * 1024)).toBeNull();
    });
  });

  describe("validateFiles", () => {
    it("rejects too many files", () => {
      const files = Array.from({ length: 11 }, (_, i) => ({
        name: `file${i}.jpg`,
        mimeType: "image/jpeg",
        size: 1024,
      }));
      const errors = validateFiles(files);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toContain("最大10件");
    });

    it("rejects total size exceeding 40MB", () => {
      const files = [
        { name: "a.pdf", mimeType: "application/pdf", size: 19 * 1024 * 1024 },
        { name: "b.pdf", mimeType: "application/pdf", size: 19 * 1024 * 1024 },
        { name: "c.jpg", mimeType: "image/jpeg", size: 5 * 1024 * 1024 },
      ];
      const errors = validateFiles(files);
      expect(errors.some(e => e.includes("合計ファイルサイズ"))).toBe(true);
    });

    it("accepts valid batch", () => {
      const files = [
        { name: "a.jpg", mimeType: "image/jpeg", size: 5 * 1024 * 1024 },
        { name: "b.png", mimeType: "image/png", size: 3 * 1024 * 1024 },
        { name: "c.pdf", mimeType: "application/pdf", size: 10 * 1024 * 1024 },
      ];
      const errors = validateFiles(files);
      expect(errors).toHaveLength(0);
    });
  });
});

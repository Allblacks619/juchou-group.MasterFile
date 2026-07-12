import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { keyFromStoredUrl } from "./storage";

// keyFromStoredUrl は getS3Config() を呼ぶため、必須の環境変数を用意する。
const ENV = {
  S3_ENDPOINT: "https://storage.juchou-group.com",
  S3_BUCKET: "juchou-uploads",
  S3_ACCESS_KEY_ID: "x",
  S3_SECRET_ACCESS_KEY: "y",
};

describe("keyFromStoredUrl（失効URLからS3キーを取り出す）", () => {
  beforeEach(() => Object.assign(process.env, ENV));
  afterEach(() => { for (const k of Object.keys(ENV)) delete (process.env as any)[k]; });

  it("path-style（endpoint/bucket/key?署名）からキーを取り出す", () => {
    const url = "https://storage.juchou-group.com/juchou-uploads/invoices/invoice_INV-2026-06-001_123.pdf?X-Amz-Signature=abc";
    expect(keyFromStoredUrl(url)).toBe("invoices/invoice_INV-2026-06-001_123.pdf");
  });

  it("会社の社印URLからキーを取り出す", () => {
    const url = "https://storage.juchou-group.com/juchou-uploads/company/seal/abc123-seal.png?X-Amz-Expires=3600";
    expect(keyFromStoredUrl(url)).toBe("company/seal/abc123-seal.png");
  });

  it("日本語を含むキー（URLエンコード）を復元する", () => {
    const url = "https://storage.juchou-group.com/juchou-uploads/attendance/" + encodeURIComponent("出面表.pdf") + "?sig=1";
    expect(keyFromStoredUrl(url)).toBe("attendance/出面表.pdf");
  });

  it("空・不正値は null", () => {
    expect(keyFromStoredUrl(null)).toBeNull();
    expect(keyFromStoredUrl(undefined)).toBeNull();
    expect(keyFromStoredUrl("not a url")).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { findRosterWarnings } from "./pdfRoster";

const complete = {
  nameKana: "オオキ ミツル",
  dateOfBirth: new Date("1991-07-04"),
  phone: "08000000000",
  address: "埼玉県...",
  emergencyPhone: "08011111111",
  healthCheckDate: new Date("2026-03-22"),
  nationality: "日本",
} as any;

describe("findRosterWarnings", () => {
  it("必須項目が揃っていれば警告は出ない", () => {
    expect(findRosterWarnings(complete)).toEqual([]);
  });

  it("未入力の項目を名前付きで指摘する", () => {
    const warnings = findRosterWarnings({ ...complete, phone: null, healthCheckDate: null });
    expect(warnings).toContain("電話番号が未入力です");
    expect(warnings).toContain("健康診断日が未入力です");
    expect(warnings).toHaveLength(2);
  });

  it("日本国籍では在留情報を要求しない", () => {
    expect(findRosterWarnings({ ...complete, nationality: "日本" })).toEqual([]);
  });

  it("外国籍では在留情報の未入力を指摘する", () => {
    const warnings = findRosterWarnings({ ...complete, nationality: "ブラジル" });
    expect(warnings).toContain("在留資格が未入力です");
    expect(warnings).toContain("在留カード番号が未入力です");
    expect(warnings).toContain("在留期限が未入力です");
  });

  it("在留期限が切れていれば警告する（客先提出前に気づくため）", () => {
    const warnings = findRosterWarnings({
      ...complete,
      nationality: "ブラジル",
      residenceStatus: "定住者",
      residenceCardNumber: "AB1234567890",
      residenceCardExpiry: new Date("2020-01-01"),
    });
    expect(warnings.some((w) => w.startsWith("在留期限が切れています"))).toBe(true);
  });

  it("在留期限が有効なら期限切れ警告は出ない", () => {
    const future = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
    const warnings = findRosterWarnings({
      ...complete,
      nationality: "ブラジル",
      residenceStatus: "定住者",
      residenceCardNumber: "AB1234567890",
      residenceCardExpiry: future,
    });
    expect(warnings).toEqual([]);
  });
});

import { describe, it, expect } from "vitest";
import {
  buildAccountingCsv,
  accountingCsvFilename,
  csvField,
  formatCsvDate,
  type AccountingCsvInvoice,
} from "./accountingCsv";

const BOM = "﻿";

const sample: AccountingCsvInvoice[] = [
  {
    invoiceNumber: "INV-2025-01-001",
    clientName: "平安電工",
    projectName: "本社ビル電気工事",
    issueDate: "2025-01-31T00:00:00.000Z",
    dueDate: "2025-02-28T00:00:00.000Z",
    subtotal: 100000,
    taxAmount: 10000,
    totalAmount: 110000,
    receivedAmount: 0,
    receivedAt: null,
    statusLabel: "入金待ち",
    notes: "1月分",
  },
  {
    invoiceNumber: "INV-2025-01-002",
    clientName: "大木, 建設", // カンマを含む取引先名（エスケープ確認）
    projectName: null,
    issueDate: "2025-01-31T00:00:00.000Z",
    dueDate: null,
    subtotal: 50000,
    taxAmount: 0, // 免税事業者=0%
    totalAmount: 50000,
    receivedAmount: 50000,
    receivedAt: "2025-02-15T00:00:00.000Z",
    statusLabel: "入金済",
    notes: null,
  },
];

describe("csvField", () => {
  it("カンマ・引用符・改行を含む値を引用符で囲みエスケープする", () => {
    expect(csvField("abc")).toBe("abc");
    expect(csvField("a,b")).toBe('"a,b"');
    expect(csvField('a"b')).toBe('"a""b"');
    expect(csvField("a\nb")).toBe('"a\nb"');
    expect(csvField(null)).toBe("");
    expect(csvField(1200)).toBe("1200");
  });
});

describe("formatCsvDate", () => {
  it("yyyy/MM/dd に整形し、空・不正値は空文字", () => {
    expect(formatCsvDate("2025-01-31T00:00:00.000Z")).toMatch(/^2025\/01\/(31|30)$/);
    expect(formatCsvDate(null)).toBe("");
    expect(formatCsvDate("")).toBe("");
    expect(formatCsvDate("invalid")).toBe("");
  });
});

describe("buildAccountingCsv", () => {
  it("先頭にBOM、改行はCRLF", () => {
    const csv = buildAccountingCsv(sample, "detail");
    expect(csv.startsWith(BOM)).toBe(true);
    expect(csv).toContain("\r\n");
  });

  it("freee形式: 収入・売上高・税区分を出力し、税0円は対象外", () => {
    const csv = buildAccountingCsv(sample, "freee");
    const lines = csv.replace(BOM, "").trim().split("\r\n");
    expect(lines[0]).toBe("発生日,決済期日,収支区分,取引先,勘定科目,税区分,金額,備考");
    expect(lines[1]).toContain("収入");
    expect(lines[1]).toContain("売上高");
    expect(lines[1]).toContain("課税売上10%");
    expect(lines[1]).toContain("110000");
    // 2行目は免税(税0)→対象外
    expect(lines[2]).toContain("対象外");
    expect(lines[2]).toContain("50000");
  });

  it("mf形式: 借方売掛金/貸方売上高（総額法）と消費税額を出力", () => {
    const csv = buildAccountingCsv(sample, "mf");
    const lines = csv.replace(BOM, "").trim().split("\r\n");
    expect(lines[0]).toBe("取引日,借方勘定科目,借方金額,貸方勘定科目,貸方金額,消費税額,摘要,取引先");
    expect(lines[1]).toContain("売掛金");
    expect(lines[1]).toContain("売上高");
    expect(lines[1]).toContain("110000");
    expect(lines[1]).toContain("10000"); // 消費税額
  });

  it("detail形式: 未入金は請求額−入金額でクランプ、カンマ入り取引先はエスケープ", () => {
    const csv = buildAccountingCsv(sample, "detail");
    const lines = csv.replace(BOM, "").trim().split("\r\n");
    expect(lines[0]).toContain("請求書番号");
    // 1件目: 未入金 110000
    expect(lines[1]).toContain("110000");
    // 2件目: カンマ入り取引先はダブルクォートで囲まれる
    expect(lines[2]).toContain('"大木, 建設"');
    // 2件目: 入金済み→未入金0
    const cells = lines[2].split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/); // 引用符を考慮した分割
    // 未入金列（index 9）が 0
    expect(cells[9]).toBe("0");
  });

  it("空配列でもヘッダー行のみ返す", () => {
    const csv = buildAccountingCsv([], "freee");
    const lines = csv.replace(BOM, "").trim().split("\r\n");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("発生日");
  });
});

describe("accountingCsvFilename", () => {
  it("形式と対象月を含むファイル名", () => {
    expect(accountingCsvFilename("freee", "2025-01")).toBe("売上_freee_2025-01.csv");
    expect(accountingCsvFilename("mf", "2025-01")).toBe("売上_MF_2025-01.csv");
    expect(accountingCsvFilename("detail", "2025-01")).toBe("売上_明細_2025-01.csv");
  });
});

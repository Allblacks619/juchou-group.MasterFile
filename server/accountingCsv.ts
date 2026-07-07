/*
 * accountingCsv.ts — 会計ソフト向けCSV出力（参考用）
 *
 * 取引先請求（売上）を freee / マネーフォワード(MF) の取込を想定した形式、
 * および汎用の明細形式でCSVに変換する。
 *
 * 方針:
 * - 純関数（DB非依存）。ルーターから請求データを渡して文字列を得る。テスト容易。
 * - 数値は円・カンマ無し・整数。日付は yyyy/MM/dd。
 * - Excel / 会計ソフトの文字化け対策として UTF-8 BOM を先頭に付与。改行は CRLF。
 * - 各ソフトのインポート形式はバージョンで変わるため「参考用」。取込前に列を調整可能な
 *   分かりやすい列名にしている。
 */

export type AccountingCsvFormat = "freee" | "mf" | "detail";

export type AccountingCsvInvoice = {
  invoiceNumber: string;
  clientName: string;
  projectName?: string | null;
  issueDate?: string | Date | null;
  dueDate?: string | Date | null;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  receivedAmount: number;
  receivedAt?: string | Date | null;
  /** 日本語の入金状況ラベル（例: 入金待ち / 入金済 / 期限超過 / 取消） */
  statusLabel: string;
  notes?: string | null;
};

const BOM = "﻿";

/** CSVフィールドをエスケープ（カンマ・引用符・改行を含む場合はダブルクォートで囲む）。 */
export function csvField(value: unknown): string {
  const s = value == null ? "" : String(value);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** 日付を yyyy/MM/dd 形式へ。空・不正値は空文字。 */
export function formatCsvDate(value?: string | Date | null): string {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}/${m}/${day}`;
}

function toRow(cells: unknown[]): string {
  return cells.map(csvField).join(",");
}

function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [toRow(headers), ...rows.map(toRow)];
  return BOM + lines.join("\r\n") + "\r\n";
}

/** 課税/対象外の税区分ラベル（freee向け）。 */
function freeeTaxLabel(taxAmount: number): string {
  return taxAmount > 0 ? "課税売上10%" : "対象外";
}

/**
 * freee「取引（収入）」インポートを想定した参考CSV。
 * 収入取引 1件 = 請求書1件。金額は税込（totalAmount）。
 */
function buildFreeeCsv(invoices: AccountingCsvInvoice[]): string {
  const headers = ["発生日", "決済期日", "収支区分", "取引先", "勘定科目", "税区分", "金額", "備考"];
  const rows = invoices.map((inv) => [
    formatCsvDate(inv.issueDate),
    formatCsvDate(inv.dueDate),
    "収入",
    inv.clientName,
    "売上高",
    freeeTaxLabel(inv.taxAmount),
    inv.totalAmount,
    [inv.invoiceNumber, inv.projectName || "", inv.notes || ""].filter(Boolean).join(" / "),
  ]);
  return toCsv(headers, rows);
}

/**
 * マネーフォワード クラウド会計「仕訳」インポートを想定した参考CSV。
 * 掛売上（総額法）: 借方 売掛金 / 貸方 売上高。消費税額は参考列として併記。
 */
function buildMfCsv(invoices: AccountingCsvInvoice[]): string {
  const headers = ["取引日", "借方勘定科目", "借方金額", "貸方勘定科目", "貸方金額", "消費税額", "摘要", "取引先"];
  const rows = invoices.map((inv) => [
    formatCsvDate(inv.issueDate),
    "売掛金",
    inv.totalAmount,
    "売上高",
    inv.totalAmount,
    inv.taxAmount,
    [inv.invoiceNumber, inv.projectName || ""].filter(Boolean).join(" / "),
    inv.clientName,
  ]);
  return toCsv(headers, rows);
}

/** 汎用の請求・入金明細CSV（Excel等での確認用）。 */
function buildDetailCsv(invoices: AccountingCsvInvoice[]): string {
  const headers = [
    "請求書番号", "取引先", "案件", "請求日", "支払期限",
    "小計", "消費税", "請求額", "入金額", "未入金", "入金日", "状態", "備考",
  ];
  const rows = invoices.map((inv) => [
    inv.invoiceNumber,
    inv.clientName,
    inv.projectName || "",
    formatCsvDate(inv.issueDate),
    formatCsvDate(inv.dueDate),
    inv.subtotal,
    inv.taxAmount,
    inv.totalAmount,
    inv.receivedAmount,
    Math.max(inv.totalAmount - inv.receivedAmount, 0),
    formatCsvDate(inv.receivedAt),
    inv.statusLabel,
    inv.notes || "",
  ]);
  return toCsv(headers, rows);
}

/** 指定形式で会計ソフト向けCSVを生成する（先頭にUTF-8 BOM、改行CRLF）。 */
export function buildAccountingCsv(invoices: AccountingCsvInvoice[], format: AccountingCsvFormat): string {
  switch (format) {
    case "freee":
      return buildFreeeCsv(invoices);
    case "mf":
      return buildMfCsv(invoices);
    case "detail":
      return buildDetailCsv(invoices);
    default:
      return buildDetailCsv(invoices);
  }
}

/** 出力ファイル名（形式・対象月付き）。 */
export function accountingCsvFilename(format: AccountingCsvFormat, closingMonth: string): string {
  const label = format === "freee" ? "freee" : format === "mf" ? "MF" : "明細";
  return `売上_${label}_${closingMonth}.csv`;
}

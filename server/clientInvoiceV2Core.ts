/**
 * Client Invoice (取引先請求書 / 売上側) draft — PURE computation core (no DB / no network).
 *
 * Turns already-fetched Monthly Closing V2 data (gated projects, their billable
 * participants' attendance + resolved client rates, and per-project client-billable
 * transport) into an editable client-invoice draft, mirroring the freee請求書 layout
 * the user works with today.
 *
 * Like `workerInvoiceV2Core`, this file is intentionally free of any `./db` or
 * `./rateResolver` import so it can be unit-tested with sample data.
 *
 * Business rules (see docs_client_invoice_spec.md):
 * - Client invoice is the SELL side (company → client). It is NOT the worker invoice.
 * - Grouped per project/site → per 請求単価グループ (A/B/C), NOT one row per worker.
 *   Workers are never named on the client invoice (their names go only into the
 *   internal memo, which is never printed).
 * - A/B/C are per-project unit-price tiers (same unit price = same row), NOT global
 *   fixed amounts. Different unit price ⇒ different A/B/C row. Night shift is its own
 *   row (marked 夜勤).
 * - 交通費 is billed per PROJECT as a single 0% line, sourced from client-billable
 *   transport only (isClientBillable, paid_by_client already excluded upstream). No
 *   per-worker / per-day breakdown on the client invoice.
 * - 残業代 (overtime) has no dedicated rate in the rate model, so it is derived from the
 *   project's representative day rate via a configurable multiplier and ALWAYS carries a
 *   "verify the rate" warning. Fully editable afterwards. Nothing is hard-coded as a
 *   silent business rule — the multiplier/standard-hours are parameters.
 * - 源泉徴収 (withholding) is a PAYER-side concept (worker invoice). It is NOT applied to
 *   the client invoice here (withholdingAmount is always 0).
 * - Quantities use 「日」/「時間」/「式」 — never 人工日.
 */

export type ClientInvoiceItem = {
  employeeId: number | null;
  itemType: "normal" | "text";
  description: string;
  /** days (labor) / hours (overtime) / 1 (aggregated transport). NOT ×10 here. */
  quantity: number;
  unit: string;
  unitPrice: number;
  amount: number;
  itemTaxRate: number;
  notes?: string | null;
  sortOrder: number;
};

export type ClientInvoiceTaxRates = {
  /** labor (作業費) tax rate, default 10 */
  labor?: number;
  /** overtime (残業代) tax rate, default 10 */
  overtime?: number;
  /** transport (交通費) tax rate, default 0 */
  transport?: number;
};

export type ClientInvoiceUnits = {
  labor?: string;
  overtime?: string;
  transport?: string;
};

/** One worker's worked-day aggregation for a single (project, shift). */
export type ClientInvoiceLaborInput = {
  projectId: number;
  projectName: string;
  workerId: number;
  workerName: string;
  /** "day" | "night" */
  shiftType: string;
  /** worked days × 10 (e.g. 140 = 14.0 days) */
  daysTimes10: number;
  /** overtime hours × 10 (e.g. 50 = 5.0h) */
  overtimeHoursTimes10: number;
  /** resolved client daily rate; null = no rate configured (line emitted at ¥0 + warning) */
  clientRate: number | null;
  clientRateSource?: string | null;
};

export type ClientInvoiceProjectInput = {
  projectId: number;
  projectName: string;
  /** client-billable transport total for this project (already filtered upstream) */
  transportTotal: number;
};

export type ClientInvoiceComputeInput = {
  targetMonth: string;
  /** project ids in the desired display order */
  projectOrder: number[];
  projects: ClientInvoiceProjectInput[];
  labor: ClientInvoiceLaborInput[];
  taxRates?: ClientInvoiceTaxRates;
  units?: ClientInvoiceUnits;
  /** overtime hourly = round(repDayRate / standardDayHours * overtimeMultiplier). Default 1.25. */
  overtimeMultiplier?: number;
  /** standard hours in one work-day, used for the overtime derivation. Default 8. */
  standardDayHours?: number;
  /** emit a 【現場名】 text header per project (default: true when >1 project) */
  includeProjectSectionHeaders?: boolean;
};

export type ClientInvoiceComputeResult = {
  items: ClientInvoiceItem[];
  subtotal: number;
  /** per-bracket tax total (10%対象・0%対象 などを合算) */
  taxAmount: number;
  totalAmount: number;
  /** always 0 for the client invoice (源泉は支払い側の話) */
  withholdingAmount: number;
  /** tax base per rate, for the 税率別内訳 display: { "10": base, "0": base } */
  taxableByRate: Record<string, number>;
  /** never printed — worker names / rate sources behind each A/B/C line */
  internalRateMemo: string | null;
  warnings: string[];
};

const DEFAULT_TAX_RATES: Required<ClientInvoiceTaxRates> = { labor: 10, overtime: 10, transport: 0 };
const DEFAULT_UNITS: Required<ClientInvoiceUnits> = { labor: "日", overtime: "時間", transport: "式" };
const DEFAULT_OVERTIME_MULTIPLIER = 1.25;
const DEFAULT_STANDARD_DAY_HOURS = 8;

function bucketLetter(index: number): string {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  return letters[index] || String(index + 1);
}

function shiftLabel(shiftType: string): string {
  return shiftType === "night" ? "夜勤" : "日勤";
}

/**
 * Convert a human value (days / hours / 1) into the stored `invoice_items.quantity`,
 * matching the existing renderer convention: unit「日」is stored ×10 (140 = 14.0 日),
 * every other unit (式 / 時間 …) is stored literally.
 */
function storedQuantity(value: number, unit: string): number {
  return unit === "日" ? Math.round(value * 10) : value;
}

/**
 * Compute an editable client-invoice draft from already-fetched, already-gated V2 data.
 * Pure: callers resolve closing status, billable participants, rates and transport.
 */
export function computeClientInvoiceDraft(input: ClientInvoiceComputeInput): ClientInvoiceComputeResult {
  const taxRates = { ...DEFAULT_TAX_RATES, ...(input.taxRates || {}) };
  const units = { ...DEFAULT_UNITS, ...(input.units || {}) };
  const overtimeMultiplier = input.overtimeMultiplier ?? DEFAULT_OVERTIME_MULTIPLIER;
  const standardDayHours = input.standardDayHours ?? DEFAULT_STANDARD_DAY_HOURS;
  const includeHeaders = input.includeProjectSectionHeaders ?? input.projectOrder.length > 1;

  const items: ClientInvoiceItem[] = [];
  const warnings: string[] = [];
  const internalRateMemoLines: string[] = [];

  const projectById = new Map(input.projects.map((p) => [p.projectId, p]));
  const laborByProject = new Map<number, ClientInvoiceLaborInput[]>();
  for (const row of input.labor) {
    if (!laborByProject.has(row.projectId)) laborByProject.set(row.projectId, []);
    laborByProject.get(row.projectId)!.push(row);
  }

  for (const projectId of input.projectOrder) {
    const project = projectById.get(projectId);
    const projectName = project?.projectName ?? `現場${projectId}`;
    const laborRows = laborByProject.get(projectId) || [];
    const transportTotal = Math.max(0, Math.round(project?.transportTotal || 0));

    // Bucket labor by (clientRate, shiftType): same unit price + shift = one A/B/C row.
    type Bucket = {
      clientRate: number | null;
      shiftType: string;
      daysTimes10: number;
      workerNames: Set<string>;
      rateSources: Set<string>;
    };
    const buckets = new Map<string, Bucket>();
    let projectOvertimeHoursTimes10 = 0;
    let repDayRate: number | null = null; // highest resolved day-shift rate, for overtime derivation

    for (const row of laborRows) {
      if (row.daysTimes10 > 0) {
        const key = `${row.clientRate ?? "null"}:${row.shiftType}`;
        const bucket = buckets.get(key) || {
          clientRate: row.clientRate,
          shiftType: row.shiftType,
          daysTimes10: 0,
          workerNames: new Set<string>(),
          rateSources: new Set<string>(),
        };
        bucket.daysTimes10 += row.daysTimes10;
        bucket.workerNames.add(row.workerName);
        if (row.clientRateSource) bucket.rateSources.add(row.clientRateSource);
        buckets.set(key, bucket);
      }
      projectOvertimeHoursTimes10 += Math.max(0, row.overtimeHoursTimes10 || 0);
      if (row.shiftType !== "night" && row.clientRate != null) {
        repDayRate = repDayRate == null ? row.clientRate : Math.max(repDayRate, row.clientRate);
      }
    }

    const hasContent = buckets.size > 0 || transportTotal > 0;
    if (!hasContent) continue;

    if (includeHeaders) {
      items.push({
        employeeId: null,
        itemType: "text",
        description: `【${projectName}】`,
        quantity: 0,
        unit: "",
        unitPrice: 0,
        amount: 0,
        itemTaxRate: 0,
        notes: null,
        sortOrder: items.length,
      });
    }

    // Sort: higher unit price first (null/unresolved last), day before night.
    const sortedBuckets = Array.from(buckets.values()).sort((a, b) => {
      const ar = a.clientRate ?? -1;
      const br = b.clientRate ?? -1;
      if (ar !== br) return br - ar;
      return a.shiftType.localeCompare(b.shiftType);
    });

    sortedBuckets.forEach((bucket, index) => {
      const days = bucket.daysTimes10 / 10;
      const unitPrice = bucket.clientRate ?? 0;
      const amount = Math.round(days * unitPrice);
      const letter = bucketLetter(index);
      // Night shift is its own row (separate rate bucket); the 日勤/夜勤 distinction is
      // recorded in the internal memo, not printed on the client-facing line (matches the
      // real invoice, which distinguishes night work by its higher unit price).
      const description = `電気工事業${letter}`;

      if (bucket.clientRate == null) {
        warnings.push(
          `先方請求単価が未設定: ${projectName} / ${description} / 対象: ${Array.from(bucket.workerNames).join("、")}（単価設定後に再生成してください）`
        );
      }
      const sources = Array.from(bucket.rateSources).filter(Boolean);
      internalRateMemoLines.push(
        `${projectName} / ${description} / ${shiftLabel(bucket.shiftType)}${sources.length ? ` / ${sources.join("・")}` : ""} / 単価: ${unitPrice.toLocaleString("ja-JP")}円 / 対象: ${Array.from(bucket.workerNames).join("、")}`
      );

      items.push({
        employeeId: null,
        itemType: "normal",
        description,
        quantity: storedQuantity(days, units.labor),
        unit: units.labor,
        unitPrice,
        amount,
        itemTaxRate: taxRates.labor,
        notes: null,
        sortOrder: items.length,
      });
    });

    // 残業代 — derived from the representative day rate × multiplier. Always verify-warn.
    if (projectOvertimeHoursTimes10 > 0) {
      const hours = projectOvertimeHoursTimes10 / 10;
      const otHourly = repDayRate != null ? Math.round((repDayRate / standardDayHours) * overtimeMultiplier) : 0;
      const amount = Math.round(hours * otHourly);
      if (otHourly === 0) {
        warnings.push(
          `残業代の単価が算出できません（${projectName}：日勤単価が未解決）。残業を請求する場合は単価を入力してください。`
        );
      } else {
        warnings.push(
          `残業代は日勤単価 ${repDayRate!.toLocaleString("ja-JP")}円 ÷${standardDayHours}h ×${overtimeMultiplier} = ${otHourly.toLocaleString("ja-JP")}円/時 で自動算出しました（${projectName}）。契約に合わせて単価をご確認ください。`
        );
      }
      items.push({
        employeeId: null,
        itemType: "normal",
        description: "残業代",
        quantity: storedQuantity(hours, units.overtime),
        unit: units.overtime,
        unitPrice: otHourly,
        amount,
        itemTaxRate: taxRates.overtime,
        notes: null,
        sortOrder: items.length,
      });
    }

    // 交通費 — one 0% line per project (プロジェクト単位).
    if (transportTotal > 0) {
      items.push({
        employeeId: null,
        itemType: "normal",
        description: "交通費",
        quantity: storedQuantity(1, units.transport),
        unit: units.transport,
        unitPrice: transportTotal,
        amount: transportTotal,
        itemTaxRate: taxRates.transport,
        notes: null,
        sortOrder: items.length,
      });
    }
  }

  // Totals — per-bracket tax (matches server recalcInvoiceTotals & pdfInvoice breakdown).
  let subtotal = 0;
  const taxableByRate: Record<string, number> = {};
  for (const item of items) {
    if (item.itemType === "text") continue;
    subtotal += item.amount;
    const key = String(item.itemTaxRate);
    taxableByRate[key] = (taxableByRate[key] || 0) + item.amount;
  }
  let taxAmount = 0;
  for (const [rate, base] of Object.entries(taxableByRate)) {
    taxAmount += Math.round((base * Number(rate)) / 100);
  }
  const withholdingAmount = 0; // client invoice: 源泉は支払い側の話、ここでは適用しない
  const totalAmount = subtotal + taxAmount - withholdingAmount;

  // Re-number sortOrder densely after skips.
  items.forEach((item, index) => (item.sortOrder = index));

  return {
    items,
    subtotal,
    taxAmount,
    totalAmount,
    withholdingAmount,
    taxableByRate,
    internalRateMemo: internalRateMemoLines.length
      ? ["社内メモ: 請求単価の対象者内訳（外部請求書には表示されません）", ...internalRateMemoLines].join("\n")
      : null,
    warnings,
  };
}

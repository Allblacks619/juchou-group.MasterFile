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
 * - 残業代 (overtime) is computed PER 請求単価グループ (A/B/C) using the company rule
 *   (IMG_0293): 残業1時間単価 = 日単価 ÷ 標準時間(既定8) × 割増倍率(既定1.25=時間外). Hours are
 *   summed per rate over the month, then unit price (rounded) × hours (matches the real
 *   invoice: 25,000÷8×1.25=3,906 ×5h=19,530). 深夜割増(22:00–翌5:00, ×1.50) cannot be auto-
 *   detected (attendance has no hour-of-day), so it is NOT auto-applied — every 残業代 line
 *   carries a "verify, add 深夜 if applicable" warning. Multiplier/standard-hours are
 *   parameters, never silent hard-coded business rules.
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
  /** overtime hours × 10 (e.g. 50 = 5.0h)。band分割が無い場合の後方互換（全て時間外扱い）。 */
  overtimeHoursTimes10: number;
  /**
   * 残業のうち時間外(×1.25)分の時間×10。深夜帯自動判定のため日単位でband分けした値。
   * overtimeRegularTimes10 / overtimeLateNightTimes10 のいずれかが指定されていれば、
   * overtimeHoursTimes10 ではなくこちらを使う。
   */
  overtimeRegularTimes10?: number;
  /** 残業のうち深夜帯(×1.50)分の時間×10（夜勤の残業／昼勤で6時間目以降(5時間超)）。 */
  overtimeLateNightTimes10?: number;
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
  /** 深夜帯残業の割増倍率（既定1.50）。夜勤の残業／昼勤で6時間目以降(5時間超)に適用。作業員請求書と同ルール。 */
  lateNightMultiplier?: number;
  /** standard hours in one work-day, used for the overtime derivation. Default 8. */
  standardDayHours?: number;
  /** emit a 【現場名】 text header per project (default: true when >1 project) */
  includeProjectSectionHeaders?: boolean;
  /**
   * 発行者（自社）が適格請求書発行事業者番号（インボイス番号）を登録しているか。
   * インボイス制度: 未登録なら作業費・残業代に消費税10%を適用しない（0%）。既定true。
   * 作業員請求書と同じルール。
   */
  issuerHasQualifiedInvoiceNumber?: boolean;
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
const DEFAULT_LATE_NIGHT_MULTIPLIER = 1.5;
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
  const lateNightMultiplier = input.lateNightMultiplier ?? DEFAULT_LATE_NIGHT_MULTIPLIER;
  const standardDayHours = input.standardDayHours ?? DEFAULT_STANDARD_DAY_HOURS;
  const includeHeaders = input.includeProjectSectionHeaders ?? input.projectOrder.length > 1;
  // インボイス番号未登録の発行者は消費税10%を適用しない（作業費・残業代を0%に落とす。交通費は元々0%）。
  const issuerQualified = input.issuerHasQualifiedInvoiceNumber ?? true;
  const effectiveLaborTax = issuerQualified ? taxRates.labor : 0;
  const effectiveOvertimeTax = issuerQualified ? taxRates.overtime : 0;

  const items: ClientInvoiceItem[] = [];
  const warnings: string[] = [];
  const internalRateMemoLines: string[] = [];
  if (!issuerQualified) {
    warnings.push("自社の適格請求書発行事業者番号（インボイス番号）が未登録のため、消費税10%は適用していません（0%）。会社情報に登録番号を設定すると10%で計算されます。");
  }

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
    // 残業は「電気工事業A/B/Cの請求単価ごと」に計算する（IMG_0293 基本式）。単価ごとに月内合計時間を集計。
    // 深夜帯(×1.50)は日単位でband分けした値（overtimeRegular/LateNight）を積み上げる。作業員請求書と同ルール。
    const regularOtByRate = new Map<number, number>();
    const lateNightOtByRate = new Map<number, number>();
    let overtimeTimes10Unresolved = 0;

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
      // band分割の指定があればそれを使う。無ければ overtimeHoursTimes10 を全て時間外扱い（後方互換）。
      const hasBand = row.overtimeRegularTimes10 != null || row.overtimeLateNightTimes10 != null;
      const reg = hasBand ? Math.max(0, row.overtimeRegularTimes10 || 0) : Math.max(0, row.overtimeHoursTimes10 || 0);
      const late = hasBand ? Math.max(0, row.overtimeLateNightTimes10 || 0) : 0;
      if (reg > 0 || late > 0) {
        if (row.clientRate != null) {
          if (reg > 0) regularOtByRate.set(row.clientRate, (regularOtByRate.get(row.clientRate) || 0) + reg);
          if (late > 0) lateNightOtByRate.set(row.clientRate, (lateNightOtByRate.get(row.clientRate) || 0) + late);
        } else {
          overtimeTimes10Unresolved += reg + late;
        }
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

    // Map each rate to its A/B/C letter so the matching 残業代 line can be labelled.
    const rateToLetter = new Map<number, string>();

    sortedBuckets.forEach((bucket, index) => {
      const days = bucket.daysTimes10 / 10;
      const unitPrice = bucket.clientRate ?? 0;
      const amount = Math.round(days * unitPrice);
      const letter = bucketLetter(index);
      if (bucket.clientRate != null && !rateToLetter.has(bucket.clientRate)) {
        rateToLetter.set(bucket.clientRate, letter);
      }
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
        itemTaxRate: effectiveLaborTax,
        notes: null,
        sortOrder: items.length,
      });
    });

    // 残業代 — per 請求単価グループ (A/B/C): 残業1時間単価 = 日単価 ÷ 標準時間 × 割増倍率。
    // 時間外(×1.25)と深夜帯(×1.50)を別明細で計上（作業員請求書と同ルール）。深夜帯は「夜勤の残業」と
    // 「昼勤で6時間目以降(5時間超)の残業」を日単位で自動判定した値を積み上げている。単価は四捨五入してから時間を掛ける
    // （実物請求書と一致: 25,000÷8×1.25=3,906 ×5h=19,530）。
    const overtimeRates = Array.from(new Set<number>([...Array.from(regularOtByRate.keys()), ...Array.from(lateNightOtByRate.keys())])).sort((a, b) => b - a);
    const multipleOvertimeGroups = overtimeRates.length > 1;
    let anyLateNight = false;
    for (const rate of overtimeRates) {
      const letter = rateToLetter.get(rate);
      const groupSuffix = multipleOvertimeGroups && letter ? `・${letter}` : "";
      const pushOt = (times10: number, multiplier: number, band: string) => {
        const hours = times10 / 10;
        if (hours <= 0) return;
        const otHourly = Math.round((rate / standardDayHours) * multiplier);
        const amount = Math.round(hours * otHourly);
        items.push({
          employeeId: null,
          itemType: "normal",
          description: `残業代（${band}${groupSuffix}）`,
          quantity: storedQuantity(hours, units.overtime),
          unit: units.overtime,
          unitPrice: otHourly,
          amount,
          itemTaxRate: effectiveOvertimeTax,
          notes: null,
          sortOrder: items.length,
        });
      };
      pushOt(regularOtByRate.get(rate) || 0, overtimeMultiplier, "時間外");
      if ((lateNightOtByRate.get(rate) || 0) > 0) anyLateNight = true;
      pushOt(lateNightOtByRate.get(rate) || 0, lateNightMultiplier, "深夜");
    }
    if (overtimeRates.length > 0) {
      warnings.push(
        `残業代は請求単価 ÷${standardDayHours}h ×${overtimeMultiplier}(時間外)${anyLateNight ? `／×${lateNightMultiplier}(深夜)` : ""} で自動算出しました（${projectName}）。` +
          (anyLateNight ? "深夜帯は「夜勤の残業」と「昼勤で6時間目以降(5時間超)の残業」を自動判定しています。時間帯が異なる場合は明細をご確認ください。" : "")
      );
    }
    if (overtimeTimes10Unresolved > 0) {
      warnings.push(
        `残業 ${(overtimeTimes10Unresolved / 10).toLocaleString("ja-JP")}時間の請求単価が未解決のため自動計算できません（${projectName}）。単価設定後に再生成してください。`
      );
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

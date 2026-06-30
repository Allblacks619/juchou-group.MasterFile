import { describe, expect, it } from "vitest";
import {
  computeClientInvoiceDraft,
  type ClientInvoiceComputeInput,
  type ClientInvoiceLaborInput,
} from "./clientInvoiceV2Core";

function labor(p: Partial<ClientInvoiceLaborInput> & { projectId: number; daysTimes10: number }): ClientInvoiceLaborInput {
  return {
    projectId: p.projectId,
    projectName: p.projectName ?? `現場${p.projectId}`,
    workerId: p.workerId ?? 1,
    workerName: p.workerName ?? "作業員",
    shiftType: p.shiftType ?? "day",
    daysTimes10: p.daysTimes10,
    overtimeHoursTimes10: p.overtimeHoursTimes10 ?? 0,
    clientRate: p.clientRate ?? null,
    clientRateSource: p.clientRateSource ?? null,
  };
}

describe("computeClientInvoiceDraft", () => {
  it("buckets labor by client rate into A/B/C rows (highest rate = A) and bills transport as one 0% line", () => {
    const input: ClientInvoiceComputeInput = {
      targetMonth: "2025-05",
      projectOrder: [1],
      projects: [{ projectId: 1, projectName: "読売ランド水族館", transportTotal: 37510 }],
      labor: [
        labor({ projectId: 1, workerId: 1, daysTimes10: 140, clientRate: 25000 }),
        labor({ projectId: 1, workerId: 2, daysTimes10: 20, clientRate: 21000 }),
        labor({ projectId: 1, workerId: 3, daysTimes10: 70, clientRate: 18000 }),
      ],
      includeProjectSectionHeaders: false,
    };
    const out = computeClientInvoiceDraft(input);
    const normal = out.items.filter((i) => i.itemType === "normal");

    // quantity is stored ×10 for unit「日」(140 = 14.0 日); 「式」is literal.
    expect(normal.map((i) => [i.description, i.quantity, i.unit, i.unitPrice, i.amount, i.itemTaxRate])).toEqual([
      ["電気工事業A", 140, "日", 25000, 350000, 10],
      ["電気工事業B", 20, "日", 21000, 42000, 10],
      ["電気工事業C", 70, "日", 18000, 126000, 10],
      ["交通費", 1, "式", 37510, 37510, 0],
    ]);
    // labor 518,000 @10% = 51,800 ; transport 37,510 @0% = 0
    expect(out.subtotal).toBe(555510);
    expect(out.taxAmount).toBe(51800);
    expect(out.totalAmount).toBe(607310);
    expect(out.withholdingAmount).toBe(0); // 源泉は取引先請求書に載せない
  });

  it("puts night shift on its own row marked 夜勤", () => {
    const out = computeClientInvoiceDraft({
      targetMonth: "2025-05",
      projectOrder: [1],
      projects: [{ projectId: 1, projectName: "現場", transportTotal: 0 }],
      labor: [
        labor({ projectId: 1, workerId: 1, shiftType: "day", daysTimes10: 100, clientRate: 25000 }),
        labor({ projectId: 1, workerId: 2, shiftType: "night", daysTimes10: 30, clientRate: 32000 }),
      ],
      includeProjectSectionHeaders: false,
    });
    const descs = out.items.filter((i) => i.itemType === "normal").map((i) => i.description);
    // night (¥32,000) sorts first as A; shift kept in the internal memo, not the printed label
    expect(descs).toEqual(["電気工事業A", "電気工事業B"]);
    expect(out.internalRateMemo).toContain("夜勤");
  });

  it("computes overtime per rate group: 日単価÷8×1.25, rounded unit price × hours, always warns", () => {
    const out = computeClientInvoiceDraft({
      targetMonth: "2025-05",
      projectOrder: [1],
      projects: [{ projectId: 1, projectName: "箱根小涌園ホテル改修工事", transportTotal: 0 }],
      labor: [labor({ projectId: 1, daysTimes10: 20, clientRate: 25000, overtimeHoursTimes10: 50 })],
      overtimeMultiplier: 1.25,
      standardDayHours: 8,
      includeProjectSectionHeaders: false,
    });
    const ot = out.items.find((i) => i.description === "残業代")!;
    // 25000 / 8 * 1.25 = 3906.25 -> 3906 ; × 5h = 19,530 (matches the real freee invoice)
    expect(ot.unit).toBe("時間");
    expect(ot.quantity).toBe(5);
    expect(ot.unitPrice).toBe(3906);
    expect(ot.amount).toBe(19530);
    expect(out.warnings.some((w) => w.includes("残業代") && w.includes("深夜"))).toBe(true);
  });

  it("emits a separate 残業代 line per A/B/C rate when multiple rates have overtime", () => {
    const out = computeClientInvoiceDraft({
      targetMonth: "2025-05",
      projectOrder: [1],
      projects: [{ projectId: 1, projectName: "現場", transportTotal: 0 }],
      labor: [
        labor({ projectId: 1, workerId: 1, daysTimes10: 100, clientRate: 25000, overtimeHoursTimes10: 20 }), // A, 2h OT
        labor({ projectId: 1, workerId: 2, daysTimes10: 100, clientRate: 18000, overtimeHoursTimes10: 30 }), // B, 3h OT
      ],
      overtimeMultiplier: 1.25,
      standardDayHours: 8,
      includeProjectSectionHeaders: false,
    });
    const ot = out.items.filter((i) => i.description.startsWith("残業代"));
    // A: 25000/8*1.25=3906 ×2h=7,812 ; B: 18000/8*1.25=2813 (2812.5→2813) ×3h=8,439
    expect(ot.map((i) => [i.description, i.quantity, i.unitPrice, i.amount])).toEqual([
      ["残業代（A）", 2, 3906, 7812],
      ["残業代（B）", 3, 2813, 8439],
    ]);
  });

  it("emits a ¥0 line + warning when the client rate is missing (no hard fail)", () => {
    const out = computeClientInvoiceDraft({
      targetMonth: "2025-05",
      projectOrder: [1],
      projects: [{ projectId: 1, projectName: "現場", transportTotal: 0 }],
      labor: [labor({ projectId: 1, workerName: "大木充", daysTimes10: 80, clientRate: null })],
      includeProjectSectionHeaders: false,
    });
    const row = out.items.find((i) => i.itemType === "normal")!;
    expect(row.unitPrice).toBe(0);
    expect(row.amount).toBe(0);
    expect(out.warnings.some((w) => w.includes("先方請求単価が未設定"))).toBe(true);
  });

  it("reproduces the real May freee invoice totals (¥965,040 / ¥92,753 / ¥1,057,793)", () => {
    const out = computeClientInvoiceDraft({
      targetMonth: "2025-05",
      projectOrder: [1, 2, 3, 4, 5],
      projects: [
        { projectId: 1, projectName: "読売ランド水族館", transportTotal: 37510 },
        { projectId: 2, projectName: "旧東京山住宅電気設備工事", transportTotal: 0 },
        { projectId: 3, projectName: "旧多摩電気設備工事", transportTotal: 0 },
        { projectId: 4, projectName: "横浜駅改修工事", transportTotal: 0 },
        { projectId: 5, projectName: "箱根小涌園ホテル改修工事", transportTotal: 0 },
      ],
      labor: [
        labor({ projectId: 1, workerId: 1, daysTimes10: 140, clientRate: 25000 }), // 350,000
        labor({ projectId: 1, workerId: 2, daysTimes10: 20, clientRate: 21000 }), //  42,000
        labor({ projectId: 1, workerId: 3, daysTimes10: 70, clientRate: 18000 }), // 126,000
        labor({ projectId: 2, workerId: 4, daysTimes10: 120, clientRate: 21000 }), // 252,000
        labor({ projectId: 3, workerId: 5, daysTimes10: 30, clientRate: 21000 }), //  63,000
        labor({ projectId: 4, workerId: 6, daysTimes10: 10, clientRate: 25000 }), //  25,000
        labor({ projectId: 5, workerId: 7, daysTimes10: 20, clientRate: 25000, overtimeHoursTimes10: 50 }), // 50,000 + OT 19,530
      ],
      overtimeMultiplier: 1.25,
      standardDayHours: 8,
      includeProjectSectionHeaders: true,
    });
    expect(out.subtotal).toBe(965040);
    expect(out.taxAmount).toBe(92753);
    expect(out.totalAmount).toBe(1057793);
    expect(out.taxableByRate["10"]).toBe(927530);
    expect(out.taxableByRate["0"]).toBe(37510);
  });
});

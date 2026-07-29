import { beforeEach, describe, expect, it, vi } from "vitest";

// 取引先請求書の採番レース対策。createInvoiceWithUniqueNumber が
// invoice_number_unique 衝突（重複キー）時に採番からやり直すことを検証する。
vi.mock("./db", () => ({
  getNextInvoiceNumber: vi.fn(),
  createInvoice: vi.fn(),
}));

import * as db from "./db";
import { createInvoiceWithUniqueNumber } from "./routers";

function dupError() {
  return Object.assign(new Error("Duplicate entry 'INV-2026-07-001' for key 'invoice_number_unique'"), { code: "ER_DUP_ENTRY" });
}

describe("createInvoiceWithUniqueNumber（採番レース対策）", () => {
  beforeEach(() => vi.clearAllMocks());

  it("重複キーが出たら採番からやり直して成功する", async () => {
    vi.mocked(db.getNextInvoiceNumber)
      .mockResolvedValueOnce("INV-2026-07-001")
      .mockResolvedValueOnce("INV-2026-07-002");
    vi.mocked(db.createInvoice)
      .mockRejectedValueOnce(dupError())
      .mockImplementationOnce(async (p: any) => ({ id: 5, ...p }));

    const payload: any = { clientId: 1 };
    const invoice = await createInvoiceWithUniqueNumber("2026-07", payload);

    expect(invoice).toMatchObject({ id: 5, invoiceNumber: "INV-2026-07-002" });
    expect(db.getNextInvoiceNumber).toHaveBeenCalledTimes(2);
    expect(db.createInvoice).toHaveBeenCalledTimes(2);
  });

  it("重複でなければ即成功（リトライしない）", async () => {
    vi.mocked(db.getNextInvoiceNumber).mockResolvedValue("INV-2026-07-001");
    vi.mocked(db.createInvoice).mockImplementation(async (p: any) => ({ id: 9, ...p }));

    const invoice = await createInvoiceWithUniqueNumber("2026-07", { clientId: 1 });
    expect(invoice).toMatchObject({ id: 9, invoiceNumber: "INV-2026-07-001" });
    expect(db.createInvoice).toHaveBeenCalledTimes(1);
  });

  it("重複が5回続いたら CONFLICT を投げる", async () => {
    vi.mocked(db.getNextInvoiceNumber).mockResolvedValue("INV-2026-07-001");
    vi.mocked(db.createInvoice).mockRejectedValue(dupError());

    await expect(createInvoiceWithUniqueNumber("2026-07", { clientId: 1 })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(db.createInvoice).toHaveBeenCalledTimes(5);
  });

  it("重複以外のエラーは即座に投げる（リトライしない）", async () => {
    vi.mocked(db.getNextInvoiceNumber).mockResolvedValue("INV-2026-07-001");
    vi.mocked(db.createInvoice).mockRejectedValue(new Error("some other DB error"));

    await expect(createInvoiceWithUniqueNumber("2026-07", { clientId: 1 })).rejects.toThrow("some other DB error");
    expect(db.createInvoice).toHaveBeenCalledTimes(1);
  });
});

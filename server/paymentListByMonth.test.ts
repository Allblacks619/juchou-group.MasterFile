import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";

// payment.listByMonth の N+1 バッチ化（getEmployeePaymentsByClosingIds で一括取得し
// closingId で束ねる）が、現場ごとの集計・順序・構造を変えないことを保証する回帰テスト。
vi.mock("./db", () => ({
  getAllProjects: vi.fn(),
  getAllClients: vi.fn(),
  getProjectClosingsByMonth: vi.fn(),
  getEmployeePaymentsByClosingIds: vi.fn(),
}));

import * as db from "./db";
import { appRouter } from "./routers";

function createCtx(): TrpcContext {
  const user = { id: 1, appRole: "manager", role: "user", companyId: 1 } as unknown as User;
  return { user, req: { protocol: "https", headers: {} } as any, res: { clearCookie: vi.fn() } as any, companyId: 1 };
}

describe("payment.listByMonth の N+1 バッチ化", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("closingId で束ねた集計が現場ごとに正しく、名前順・closing無し現場も一致する", async () => {
    vi.mocked(db.getAllProjects).mockResolvedValue([
      { id: 1, name: "B現場", clientId: 10 },
      { id: 2, name: "A現場", clientId: null },
      { id: 3, name: "C現場", clientId: 10 },
    ] as any);
    vi.mocked(db.getAllClients).mockResolvedValue([{ id: 10, name: "取引先X" }] as any);
    vi.mocked(db.getProjectClosingsByMonth).mockResolvedValue([
      { id: 100, projectId: 1, closingMonth: "2026-07" },
      { id: 200, projectId: 2, closingMonth: "2026-07" },
      // project 3 は closing 無し
    ] as any);
    vi.mocked(db.getEmployeePaymentsByClosingIds).mockResolvedValue([
      { closingId: 100, status: "paid", totalAmount: 1000 },
      { closingId: 100, status: "unpaid", totalAmount: 500 },
      { closingId: 200, status: "confirmed", totalAmount: 300 },
    ] as any);

    const caller = appRouter.createCaller(createCtx());
    const rows = await caller.payment.listByMonth({ closingMonth: "2026-07" });

    // 名前順（A→B→C）でソートされる
    expect(rows.map((r: any) => r.project.name)).toEqual(["A現場", "B現場", "C現場"]);

    const a = rows.find((r: any) => r.project.name === "A現場")!;
    expect(a.closing?.id).toBe(200);
    expect(a.summary).toEqual({ targetCount: 1, paidCount: 0, confirmedCount: 1, unpaidCount: 1, totalAmount: 300 });

    const b = rows.find((r: any) => r.project.name === "B現場")!;
    expect(b.closing?.id).toBe(100);
    expect(b.summary).toEqual({ targetCount: 2, paidCount: 1, confirmedCount: 0, unpaidCount: 1, totalAmount: 1500 });
    expect(b.client?.name).toBe("取引先X");

    // closing 無しの現場は空サマリ
    const c = rows.find((r: any) => r.project.name === "C現場")!;
    expect(c.closing).toBeNull();
    expect(c.summary).toEqual({ targetCount: 0, paidCount: 0, confirmedCount: 0, unpaidCount: 0, totalAmount: 0 });

    // バッチ関数が「該当 closingId のみ」で1回だけ呼ばれる（N+1 でない）
    expect(db.getEmployeePaymentsByClosingIds).toHaveBeenCalledTimes(1);
    expect(db.getEmployeePaymentsByClosingIds).toHaveBeenCalledWith([100, 200]);
  });
});

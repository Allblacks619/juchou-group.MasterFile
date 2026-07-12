import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import type { User } from "../drizzle/schema";
import { MTSIM_GUESTS } from "./mtSimFixture";

/**
 * MTSIM Phase 0 — P2パターンの genba 連動検証:
 * 元請（甲野電設）の職人が guestName 出面として存在するとき、
 * 出面連動の現場名簿（G1: syncSiteRosterFromAttendance）に kind=guest で現れること。
 * genba データは規約どおり Genba_Beta_* のみ使用。
 */

const mockGenbaDb = vi.hoisted(() => ({
  syncSiteRosterFromAttendance: vi.fn(),
  listAssignableUsers: vi.fn(),
}));
vi.mock("./genba/db", async () => ({ ...(await vi.importActual<any>("./genba/db")), ...mockGenbaDb }));

function createUser(o: Partial<User> = {}): User {
  return { id: 1, openId: "o", email: "e", name: "Genba_Beta_MTSIM_User", loginMethod: "manus", role: "user", appRole: "manager" as any, loginId: "u", mustChangePassword: false, employeeId: null, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(), ...o } as User;
}
function ctx(u: User): TrpcContext { return { user: u, req: { protocol: "https", headers: {} } as any, res: { clearCookie: vi.fn() } as any }; }
const caller = () => appRouter.createCaller(ctx(createUser()));

describe("MTSIM P2: 元請職人ゲストの現場名簿連動", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => { delete process.env.GENBA_ENABLED; });

  it("guestName 出面由来の甲野職人が名簿に kind=guest で現れ、乙島従業員は registered で並ぶ", async () => {
    // MTSIM フィクスチャの出面（乙島従業員2名 + 甲野職人ゲスト2名）を sync が返した想定
    mockGenbaDb.syncSiteRosterFromAttendance.mockResolvedValue([
      { siteWorkerId: "Genba_Beta_MTSIM_SW_e1", kind: "registered", userId: 601, employeeId: 601, displayName: "MTSIM 乙島 一郎", appRole: "worker" },
      { siteWorkerId: "Genba_Beta_MTSIM_SW_e2", kind: "registered", userId: 602, employeeId: 602, displayName: "MTSIM 乙島 二郎", appRole: "worker" },
      ...MTSIM_GUESTS.map((g, i) => ({
        siteWorkerId: `Genba_Beta_MTSIM_SW_g${i + 1}`, kind: "guest", userId: null, employeeId: null,
        displayName: g.name, appRole: null,
      })),
    ]);

    const res = await caller().genba.users.siteRoster({ siteId: "Genba_Beta_MTSIM_Site_01" });

    expect(res.linked).toBe(true);
    expect(res.roster).toHaveLength(2 + MTSIM_GUESTS.length);

    const guests = res.roster.filter((r) => r.kind === "guest");
    expect(guests.map((g) => g.displayName)).toEqual(MTSIM_GUESTS.map((g) => g.name));
    // ゲストはアカウントを持たない（Phase 2 で externalCompanyId/CCUS による名寄せに格上げ予定）
    for (const g of guests) {
      expect(g.userId).toBeNull();
      expect(g.employeeId).toBeNull();
    }
    // 出面連動が働いた（全ユーザーへのフォールバックではない）
    expect(mockGenbaDb.listAssignableUsers).not.toHaveBeenCalled();
  });
});

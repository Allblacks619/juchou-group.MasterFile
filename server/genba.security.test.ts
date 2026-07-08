import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import type { User } from "../drizzle/schema";
import { buildShareView, SHARE_SCOPES } from "./genba/share";

/**
 * M5-C 最終セキュリティ監査 (Genba_Beta): 共有トークンで社内メモ・Driveリンク・予算・担当者が
 * 一切漏れないこと、権限境界(予算=admin / 共有管理=field)、R2署名URLが都度発行されることを総合検証。
 * DoD: 「共有トークンで社内メモ・Driveリンク・予算が漏れないテストがある」。
 */

// ── 秘匿情報のセンチネル (出力に絶対現れてはいけない文字列) ──
const SECRETS = {
  memo: "SECRET_MEMO_社内メモ",
  linkUrl: "https://secret.example.com/private-doc",
  issueText: "SECRET_ISSUE_不具合の内部詳細",
  driveUrl: "https://drive.google.com/SECRET_FOLDER",
  romajiMemo: "SECRET",
};

/** オブジェクトを再帰的に走査し、全 string 値と全 key を集める */
function collectStringsAndKeys(v: unknown, keys: Set<string>, strings: string[]) {
  if (v == null) return;
  if (typeof v === "string") { strings.push(v); return; }
  if (typeof v !== "object") return;
  if (Array.isArray(v)) { v.forEach((x) => collectStringsAndKeys(x, keys, strings)); return; }
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    keys.add(k);
    collectStringsAndKeys(val, keys, strings);
  }
}

function buildRichInput(scopes: string[]) {
  return {
    scopes,
    site: { name: "Genba_Beta_現場A" }, // driveUrl は入力に含めない (router が渡さない契約)
    floors: [{ id: "f1", name: "1F", w: 1200, h: 850, imageUrl: "https://signed.example/f1?sig=abc" }],
    zones: [
      { id: "z1", floorId: "f1", parentZoneId: null, name: "1工区", polygon: [{ x: 0, y: 0 }], priority: 1, workStatus: null, color: "#005AFF", fillOpacity: 40 },
    ],
    tasks: [
      {
        id: "t1", zoneId: "z1", parentTaskId: null, name: "配管", romaji: "Haikan",
        status: "issue", percent: 30, dueDate: "2026-08-01",
        // 以下は buildShareView の入力型に無い秘匿フィールドだが、万一混入しても出力に出ないことを担保
        memo: SECRETS.memo, linkUrl: SECRETS.linkUrl, issueText: SECRETS.issueText, byUserId: 42, assigneeIds: [42, 43],
      } as any,
    ],
  };
}

describe("M5-C genba security audit", () => {
  describe("共有ビュー: 全スコープ付与でも秘匿情報ゼロ漏洩 (純関数レベル)", () => {
    it("全スコープ (map/tasks/board/dash) を許可しても memo/linkUrl/issueText/担当者/driveUrl を出力しない", () => {
      const view = buildShareView(buildRichInput([...SHARE_SCOPES]) as any);
      const keys = new Set<string>();
      const strings: string[] = [];
      collectStringsAndKeys(view, keys, strings);

      // 1) センチネル文字列が出力のどこにも無い
      const blob = JSON.stringify(view);
      for (const [label, secret] of Object.entries(SECRETS)) {
        expect(blob, `secret ${label} leaked`).not.toContain(secret);
      }
      // 2) 危険な key が出力に一切現れない
      for (const forbidden of ["memo", "linkUrl", "issueText", "driveUrl", "byUserId", "assigneeIds", "teamIds", "contractAmount", "targetValue"]) {
        expect(keys.has(forbidden), `forbidden key present: ${forbidden}`).toBe(false);
      }
      // 3) tasks は許可フィールドのみ
      const t = view.tasks!.tasks[0] as any;
      expect(Object.keys(t).sort()).toEqual(["dueDate", "id", "name", "parentTaskId", "percent", "romaji", "status", "zoneId"]);
    });

    it("スコープを1つも渡さないと map/tasks/board/dash はすべて undefined", () => {
      const view = buildShareView(buildRichInput([]) as any);
      expect(view.map).toBeUndefined();
      expect(view.tasks).toBeUndefined();
      expect(view.board).toBeUndefined();
      expect(view.dash).toBeUndefined();
      // site 名のみ
      expect(view.site.name).toBe("Genba_Beta_現場A");
    });
  });

  // ── ルーター経由の総合チェック (mock DB) ──
  const mockGenbaDb = vi.hoisted(() => ({
    getGenbaShareByToken: vi.fn(),
    getGenbaSiteById: vi.fn(),
    collectSiteGraph: vi.fn(),
  }));
  const mockStorage = vi.hoisted(() => ({ storageGet: vi.fn() }));
  vi.mock("./genba/db", async () => ({ ...(await vi.importActual<any>("./genba/db")), ...mockGenbaDb }));
  vi.mock("./storage", async () => ({ ...(await vi.importActual<any>("./storage")), ...mockStorage }));

  function createUser(o: Partial<User> = {}): User {
    return { id: 1, openId: "o", email: "e", name: "Genba_Beta_User", loginMethod: "manus", role: "user", appRole: "worker" as any, loginId: "u", mustChangePassword: false, employeeId: null, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(), ...o } as User;
  }
  const ctx = (u: User | null): TrpcContext => ({ user: u, req: { protocol: "https", headers: {} } as any, res: { clearCookie: vi.fn() } as any });
  const anon = () => appRouter.createCaller(ctx(null));
  const worker = () => appRouter.createCaller(ctx(createUser({ appRole: "worker" as any })));
  const leader = () => appRouter.createCaller(ctx(createUser({ appRole: "manager" as any })));

  const SHARE = { id: "Genba_Beta_Share_01", siteId: "Genba_Beta_Site_01", name: "取引先共有", token: "tok_secret_123", scopes: ["map", "tasks", "board", "dash"], expiresAt: null, createdAt: new Date(), updatedAt: new Date() };
  const SITE = { id: "Genba_Beta_Site_01", name: "Genba_Beta_現場A", projectId: null, driveUrl: SECRETS.driveUrl, archived: false, createdAt: new Date(), updatedAt: new Date() };

  beforeEach(() => {
    vi.clearAllMocks();
    mockStorage.storageGet.mockResolvedValue({ url: "https://signed.example/fresh?sig=NEW" });
    mockGenbaDb.collectSiteGraph.mockResolvedValue({
      floors: [{ id: "f1", siteId: SITE.id, name: "1F", imageKey: "genba/f1.jpg", w: 1200, h: 850, sortOrder: 0, createdAt: new Date(), updatedAt: new Date() }],
      zones: [{ id: "z1", floorId: "f1", parentZoneId: null, name: "1工区", polygon: [{ x: 0, y: 0 }], priority: 1, workStatus: null, color: null, fillOpacity: null, createdAt: new Date(), updatedAt: new Date() }],
      tasks: [{ id: "t1", zoneId: "z1", parentTaskId: null, name: "配管", romaji: null, status: "issue", percent: 30, priority: 1, issueText: SECRETS.issueText, startDate: null, dueDate: "2026-08-01", memo: SECRETS.memo, memoVisible: true, linkUrl: SECRETS.linkUrl, sortOrder: 0, createdAt: new Date(), updatedAt: new Date() }],
    });
  });
  afterEach(() => { delete process.env.GENBA_ENABLED; });

  describe("publicView (★非認証・実データ経路)", () => {
    it("トークンで公開ビューを取得しても driveUrl/memo/linkUrl/issueText が漏れない", async () => {
      mockGenbaDb.getGenbaShareByToken.mockResolvedValue(SHARE);
      mockGenbaDb.getGenbaSiteById.mockResolvedValue(SITE);
      const view = await anon().genba.shares.publicView({ token: "tok_secret_123" });
      const blob = JSON.stringify(view);
      expect(blob).not.toContain(SECRETS.driveUrl);
      expect(blob).not.toContain(SECRETS.memo);
      expect(blob).not.toContain(SECRETS.linkUrl);
      expect(blob).not.toContain(SECRETS.issueText);
      // 図面URLは map スコープで署名URL、それも storageGet 由来 (保存URLではない)
      expect(mockStorage.storageGet).toHaveBeenCalledWith("genba/f1.jpg");
      expect(blob).toContain("https://signed.example/fresh?sig=NEW");
    });

    it("R2署名URLは保存値ではなく都度 storageGet で発行される (TTL安全)", async () => {
      mockGenbaDb.getGenbaShareByToken.mockResolvedValue(SHARE);
      mockGenbaDb.getGenbaSiteById.mockResolvedValue(SITE);
      await anon().genba.shares.publicView({ token: "tok_secret_123" });
      // imageKey を渡して署名URLを生成している（保存済みURLの再利用ではない）
      expect(mockStorage.storageGet).toHaveBeenCalledTimes(1);
      expect(mockStorage.storageGet).toHaveBeenCalledWith("genba/f1.jpg");
    });

    it("不正・期限切れ・アーカイブは NOT_FOUND (存在を明かさない)", async () => {
      mockGenbaDb.getGenbaShareByToken.mockResolvedValue(null);
      await expect(anon().genba.shares.publicView({ token: "bad" })).rejects.toMatchObject({ code: "NOT_FOUND" });

      mockGenbaDb.getGenbaShareByToken.mockResolvedValue({ ...SHARE, expiresAt: new Date(Date.now() - 1000) });
      mockGenbaDb.getGenbaSiteById.mockResolvedValue(SITE);
      await expect(anon().genba.shares.publicView({ token: "tok_secret_123" })).rejects.toMatchObject({ code: "NOT_FOUND" });

      mockGenbaDb.getGenbaShareByToken.mockResolvedValue(SHARE);
      mockGenbaDb.getGenbaSiteById.mockResolvedValue({ ...SITE, archived: true });
      await expect(anon().genba.shares.publicView({ token: "tok_secret_123" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("GENBA_ENABLED=false なら公開ビューも遮断", async () => {
      process.env.GENBA_ENABLED = "false";
      mockGenbaDb.getGenbaShareByToken.mockResolvedValue(SHARE);
      await expect(anon().genba.shares.publicView({ token: "tok_secret_123" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
  });

  describe("権限境界の最終確認", () => {
    it("予算トラッカーは admin 専用 (worker/leader は 403)", async () => {
      await expect(worker().genba.budgets.get({ siteId: "Genba_Beta_Site_01" })).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(leader().genba.budgets.get({ siteId: "Genba_Beta_Site_01" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("共有リンク管理 (list/create/revoke) は field 専用 (worker 403)", async () => {
      await expect(worker().genba.shares.list({ siteId: "Genba_Beta_Site_01" })).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(worker().genba.shares.create({ siteId: "Genba_Beta_Site_01", name: "x", scopes: ["map"] })).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(worker().genba.shares.revoke({ id: "Genba_Beta_Share_01" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("未ログインは保護手続きで UNAUTHORIZED (公開ビュー以外)", async () => {
      await expect(anon().genba.sites.list()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
      await expect(anon().genba.budgets.get({ siteId: "Genba_Beta_Site_01" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    });
  });
});

import { TRPCError } from "@trpc/server";
import { nanoid } from "nanoid";
import { z } from "zod";
import { genbaRoleOf } from "../../shared/genba/roles";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import * as db from "../db";
import * as genbaDb from "./db";
import { storageGet, storagePut, storageGetBytes } from "../storage";
import { validateFile } from "../../shared/uploadValidation";
import { computeZoneAggregates } from "./aggregate";
import { computeBoard } from "./board";
import { computeBudget } from "./budget";
import { buildShareView, SHARE_SCOPES } from "./share";
import { computeInsights } from "./insights";
import { CATALOG_LABELS } from "../../shared/genba/catalog";
import { buildTemplateTree, DEFAULT_TEMPLATE_DATA, type TemplateNode, type TemplateTreeNode } from "../../shared/genba/template";

/** テンプレートツリーから新規ゾーン用の作業タスク行を生成 (親子リンク付き) */
function instantiateTemplateTasks(
  nodes: (TemplateTreeNode | TemplateNode)[],
  zoneId: string,
  parentTaskId: string | null,
  out: any[] = [],
): any[] {
  let order = 0;
  for (const node of nodes) {
    const id = nanoid(21);
    out.push({
      id, zoneId, parentTaskId,
      name: node.name,
      romaji: (node as any).romaji ?? null,
      status: "todo" as const,
      sortOrder: order++,
    });
    const children = (node as any).children;
    if (children && children.length) instantiateTemplateTasks(children, zoneId, id, out);
  }
  return out;
}

/** 現在のテンプレート (DB) を取得。無ければ既定テンプレートにフォールバック */
async function currentTemplateForInstantiation(): Promise<(TemplateTreeNode | TemplateNode)[]> {
  const rows = await genbaDb.listGenbaTaskTemplates();
  if (rows.length === 0) return DEFAULT_TEMPLATE_DATA;
  return buildTemplateTree(rows.map((r) => ({ id: r.id, parentId: r.parentId, name: r.name, romaji: r.romaji, sortOrder: r.sortOrder })));
}

/**
 * 現場ビジョン (genba) ルーター — M1骨組み。
 * 既存ルーター/認証には手を加えず、appRouter に `genba` キーとして加算される。
 * 権限は既存 users.appRole から shared/genba/roles.ts で導出する3段階 (admin/leader/worker)。
 */

/** GENBA_ENABLED=false で genba の全手続きを遮断する (default: 有効) */
function assertGenbaEnabled() {
  if ((process.env.GENBA_ENABLED ?? "true") === "false") {
    throw new TRPCError({ code: "FORBIDDEN", message: "現場ビジョンは無効化されています" });
  }
}

const GENBA_ROLES = ["admin", "leader", "worker"] as const;
type GenbaRole = (typeof GENBA_ROLES)[number];

/**
 * genba内の実効役割を解決 (G3): genba_user_roles の上書きが最優先、無ければ appRole から導出。
 * 参照に失敗した場合は worker へフェイルクローズ (権限昇格側に倒さない)。
 */
async function resolveGenbaRole(userId: number, appRole: unknown): Promise<GenbaRole> {
  try {
    const override = await genbaDb.getGenbaUserRole(userId);
    if (override && (GENBA_ROLES as readonly string[]).includes(override.role)) {
      return override.role as GenbaRole;
    }
    return genbaRoleOf(appRole as any);
  } catch (error) {
    console.warn("[genba] role resolve failed (fail-closed to worker):", error);
    return "worker";
  }
}

/** 作業員リンク由来のセッション情報 (ログインの代わりにトークンで認証された場合のみ) */
type GenbaLinkCtx = {
  linkId: string;
  siteId: string;
  siteWorkerId: string;
  /** 登録作業員なら users.id、ゲストは null */
  userId: number | null;
  displayName: string;
  role: "worker" | "leader";
};

/** 作業員リンクから実行できない操作 (現場設定・リンク管理・共有・権限・予算・学習・テンプレ書換) */
const LINK_DENIED_PATH = /^genba\.(sites\.(create|rename|archive|setDriveUrl|setProject|listProjects)|workerLinks\.|shares\.|users\.(setGenbaRole|mySummary)|templates\.saveTree|budgets\.|logs\.)/;

/** 実行主体のユーザーID (ログイン or リンクの登録作業員)。ゲストリンクは null */
function uid(ctx: { user: { id: number } | null; genbaLink?: GenbaLinkCtx | null }): number | null {
  return ctx.user?.id ?? ctx.genbaLink?.userId ?? null;
}

/** 参照ID群 (siteId/floorId/zoneId/taskId/teamId/instructionId) から現場を解決してリンクの現場と照合 */
async function assertLinkRefScope(link: GenbaLinkCtx, raw: Record<string, unknown>): Promise<void> {
  const deny = () => { throw new TRPCError({ code: "FORBIDDEN", message: "この現場のリンクでは操作できません" }); };
  const s = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
  const siteId = s(raw.siteId);
  if (siteId && siteId !== link.siteId) deny();
  const floorId = s(raw.floorId);
  if (floorId) {
    const f = await genbaDb.getGenbaFloorById(floorId);
    if (f && f.siteId !== link.siteId) deny();
  }
  const zoneId = s(raw.zoneId) ?? s(raw.parentZoneId);
  if (zoneId) {
    const z = await genbaDb.getGenbaZoneById(zoneId);
    const f = z ? await genbaDb.getGenbaFloorById(z.floorId) : null;
    if (f && f.siteId !== link.siteId) deny();
  }
  const taskId = s(raw.taskId);
  if (taskId) {
    const t = await genbaDb.getGenbaTaskById(taskId);
    const z = t ? await genbaDb.getGenbaZoneById(t.zoneId) : null;
    const f = z ? await genbaDb.getGenbaFloorById(z.floorId) : null;
    if (f && f.siteId !== link.siteId) deny();
  }
  const teamId = s(raw.teamId);
  if (teamId) {
    const t = await genbaDb.getGenbaTeamById(teamId);
    if (t && t.siteId !== link.siteId) deny();
  }
  const instructionId = s(raw.instructionId);
  if (instructionId) {
    const i = await genbaDb.getGenbaInstructionById(instructionId);
    if (i && i.siteId !== link.siteId) deny();
  }
}

/** リンクセッションで id 系入力しか無い手続き用: 取得済みエンティティの現場と照合 */
function assertLinkSiteId(ctx: { genbaLink?: GenbaLinkCtx | null }, siteId: string | null | undefined): void {
  if (ctx.genbaLink && siteId !== ctx.genbaLink.siteId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "この現場のリンクでは操作できません" });
  }
}

/** タスク→ゾーン→フロアから現場を解決してリンクスコープを照合 */
async function assertLinkTaskScope(ctx: { genbaLink?: GenbaLinkCtx | null }, task: { zoneId: string }): Promise<void> {
  if (!ctx.genbaLink) return;
  const z = await genbaDb.getGenbaZoneById(task.zoneId);
  const f = z ? await genbaDb.getGenbaFloorById(z.floorId) : null;
  assertLinkSiteId(ctx, f?.siteId ?? null);
}

/**
 * ログイン済み または 作業員リンクトークン (x-genba-link ヘッダ) + genba有効。
 * リンクセッションは link.role (worker/leader) を genbaRole とし、自現場のみ操作可。
 * これにより「リンクを開いたら本体アプリをそのまま使う」を実現する (画面は同一、権限で出し分け)。
 */
const genbaProcedure = publicProcedure.use(async ({ ctx, next, path, getRawInput }) => {
  assertGenbaEnabled();
  if (ctx.user) {
    const role = await resolveGenbaRole(ctx.user.id, (ctx.user as any).appRole);
    return next({ ctx: { ...ctx, user: ctx.user as typeof ctx.user | null, genbaRole: role, genbaLink: null as GenbaLinkCtx | null } });
  }
  const header = (ctx.req as any)?.headers?.["x-genba-link"];
  const token = (Array.isArray(header) ? header[0] : header || "").toString().trim();
  if (!token) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "ログインが必要です" });
  }
  const resolved = await resolveWorkerLink(token);
  if (!resolved.ok) {
    const msg = resolved.reason === "disabled"
      ? "このリンクは無効化されています。管理者に確認してください。"
      : resolved.reason === "expired"
        ? "このリンクは有効期限が切れています。管理者に再発行を依頼してください。"
        : "リンクが無効です。URLを確認するか、管理者に問い合わせてください。";
    throw new TRPCError({ code: "UNAUTHORIZED", message: msg });
  }
  if (LINK_DENIED_PATH.test(path)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "この操作は作業員リンクからは行えません" });
  }
  const link: GenbaLinkCtx = {
    linkId: resolved.link.id,
    siteId: resolved.site.id,
    siteWorkerId: resolved.worker.id,
    userId: resolved.worker.userId ?? null,
    displayName: resolved.worker.displayName,
    role: resolved.link.role === "leader" ? "leader" : "worker",
  };
  genbaDb.touchGenbaWorkerLinkAccess(link.linkId).catch(() => { /* 打刻失敗は無視 */ });
  const raw = (await getRawInput()) as Record<string, unknown> | undefined;
  if (raw && typeof raw === "object") await assertLinkRefScope(link, raw);
  return next({ ctx: { ...ctx, user: null as typeof ctx.user | null, genbaRole: link.role, genbaLink: link } });
});

/** 現場の編集操作 (admin / leader)。worker は閲覧・現場入力のみ */
const genbaFieldProcedure = genbaProcedure.use(({ ctx, next }) => {
  if (ctx.genbaRole === "worker") {
    throw new TRPCError({ code: "FORBIDDEN", message: "現場編集権限がありません" });
  }
  return next({ ctx });
});

/** 現場編集のうちログイン必須の操作 (現場設定・共有・リンク管理など)。リンクセッション不可 */
const genbaStaffFieldProcedure = genbaFieldProcedure.use(({ ctx, next }) => {
  const user = ctx.user;
  if (!user) {
    throw new TRPCError({ code: "FORBIDDEN", message: "この操作は作業員リンクからは行えません" });
  }
  return next({ ctx: { ...ctx, user } });
});

/** 予算・アーカイブ等の管理操作 (admin のみ・リンク不可) */
const genbaAdminProcedure = genbaProcedure.use(({ ctx, next }) => {
  const user = ctx.user;
  if (!user || ctx.genbaRole !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "管理者権限が必要です" });
  }
  return next({ ctx: { ...ctx, user, genbaRole: "admin" as const } });
});

/** 監査ログ (既存 auditLogs 流用)。失敗しても本処理は落とさない */
async function safeGenbaAuditLog(userId: number | null | undefined, action: string, meta: { entityId?: string; note?: string | null; payload?: any } = {}) {
  try {
    await db.createAuditLog({
      action,
      entityType: "genba",
      performedBy: userId ?? null,
      note: meta.note ?? null,
      payload: meta.payload ? JSON.stringify({ ...meta.payload, entityId: meta.entityId }) : (meta.entityId ? JSON.stringify({ entityId: meta.entityId }) : null),
    } as any);
  } catch (error) {
    console.warn("[GenbaAuditLog] failed:", error);
  }
}

/** 学習・改善提案用の利用ログ (genba_activity_logs)。失敗しても本処理は落とさない */
async function safeGenbaActivity(type: string, userId: number | null | undefined, payload: unknown) {
  try {
    await genbaDb.addGenbaActivityLog(type, userId ?? null, payload);
  } catch (error) {
    console.warn("[GenbaActivity] failed:", error);
  }
}

// ── 入力スキーマ ──

const genbaIdSchema = z.string().trim().min(1).max(24);
const siteNameSchema = z.string().trim().min(1, "現場名を入力してください").max(120);
const driveUrlSchema = z.string().trim().max(500).refine(
  (v) => v === "" || /^https?:\/\//i.test(v),
  { message: "URLは http:// または https:// で始まる必要があります" },
);

/** M2以降で実装するスタブ用 */
function notImplemented(): never {
  throw new TRPCError({ code: "NOT_IMPLEMENTED", message: "M2以降で実装" });
}

// ── サブルーター (M1で動く実スライス) ──

const sitesRouter = router({
  /** アーカイブ済みを除く現場一覧 */
  list: genbaProcedure.query(async ({ ctx }) => {
    if (ctx.genbaLink) {
      const site = await genbaDb.getGenbaSiteById(ctx.genbaLink.siteId);
      return site && !site.archived ? [site] : [];
    }
    return genbaDb.listGenbaSites();
  }),

  /** アーカイブ済み(削除された)現場の一覧。復元用 (admin のみ・リンク不可)。データは消えていない */
  listArchived: genbaAdminProcedure.query(async () => {
    return genbaDb.listGenbaSitesArchived();
  }),

  create: genbaStaffFieldProcedure
    .input(z.object({
      /** プロトタイプ互換のクライアント生成uid。省略時はサーバー生成 */
      id: genbaIdSchema.optional(),
      name: siteNameSchema,
      projectId: z.number().int().positive().nullish(),
      driveUrl: driveUrlSchema.optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const id = input.id ?? nanoid(21);
      const site = await genbaDb.createGenbaSite({
        id,
        name: input.name,
        projectId: input.projectId ?? null,
        driveUrl: input.driveUrl || null,
      });
      await safeGenbaAuditLog(uid(ctx), "genba.sites.create", { entityId: id, note: `現場を作成: ${input.name}` });
      return site;
    }),

  rename: genbaStaffFieldProcedure
    .input(z.object({ id: genbaIdSchema, name: siteNameSchema }))
    .mutation(async ({ ctx, input }) => {
      const existing = await genbaDb.getGenbaSiteById(input.id);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "現場が見つかりません" });
      const site = await genbaDb.updateGenbaSite(input.id, { name: input.name });
      await safeGenbaAuditLog(uid(ctx), "genba.sites.rename", { entityId: input.id, note: `現場名を変更: ${existing.name} → ${input.name}` });
      return site;
    }),

  /** アーカイブは admin のみ */
  archive: genbaAdminProcedure
    .input(z.object({ id: genbaIdSchema, archived: z.boolean().default(true) }))
    .mutation(async ({ ctx, input }) => {
      const existing = await genbaDb.getGenbaSiteById(input.id);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "現場が見つかりません" });
      const site = await genbaDb.updateGenbaSite(input.id, { archived: input.archived });
      await safeGenbaAuditLog(uid(ctx), "genba.sites.archive", { entityId: input.id, note: `${existing.name} を${input.archived ? "アーカイブ" : "アーカイブ解除"}` });
      return site;
    }),

  setDriveUrl: genbaStaffFieldProcedure
    .input(z.object({ id: genbaIdSchema, driveUrl: driveUrlSchema }))
    .mutation(async ({ ctx, input }) => {
      const existing = await genbaDb.getGenbaSiteById(input.id);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "現場が見つかりません" });
      const site = await genbaDb.updateGenbaSite(input.id, { driveUrl: input.driveUrl || null });
      await safeGenbaAuditLog(uid(ctx), "genba.sites.setDriveUrl", { entityId: input.id, note: `${existing.name} のDriveリンクを更新` });
      return site;
    }),

  /** 連携先の工事案件(projects)一覧。現場↔案件リンクのピッカー用 (field) */
  listProjects: genbaStaffFieldProcedure.query(async () => {
    const rows = await genbaDb.listLinkableProjects();
    return rows.map((p) => ({ id: p.id, name: p.name, status: p.status, startDate: toYmd(p.startDate), endDate: toYmd(p.endDate) }));
  }),

  /** 現場に工事案件をリンク/解除 (field)。リンクすると出面連動・予算project集計・出面担当が有効になる */
  setProject: genbaStaffFieldProcedure
    .input(z.object({ id: genbaIdSchema, projectId: z.number().int().positive().nullable() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await genbaDb.getGenbaSiteById(input.id);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "現場が見つかりません" });
      if (input.projectId != null) {
        const project = await genbaDb.getProjectPeriod(input.projectId);
        if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "工事案件が見つかりません" });
      }
      const site = await genbaDb.updateGenbaSite(input.id, { projectId: input.projectId });
      await safeGenbaAuditLog(uid(ctx), "genba.sites.setProject", { entityId: input.id, note: input.projectId != null ? `案件#${input.projectId} を連携` : "案件連携を解除" });
      return site;
    }),
});

const settingsRouter = router({
  /** color/theme/lang/guideSeen の upsert */
  update: genbaProcedure
    .input(z.object({
      color: z.string().trim().regex(/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/, "色は #RRGGBB / #RRGGBBAA 形式").nullish(),
      theme: z.string().trim().max(24).optional(),
      lang: z.string().trim().max(4).optional(),
      guideSeen: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const patch: Record<string, unknown> = {};
      if (input.color !== undefined) patch.color = input.color;
      if (input.theme !== undefined) patch.theme = input.theme;
      if (input.lang !== undefined) patch.lang = input.lang;
      if (input.guideSeen !== undefined) patch.guideSeen = input.guideSeen;
      const meId = uid(ctx);
      if (meId == null) return null; // ゲストリンク: 設定は端末側 (localStorage) に保存する
      const settings = await genbaDb.upsertGenbaUserSettings(meId, patch);
      return settings;
    }),
});

// ── R2キーの安全化 + 署名URL付与ヘルパ ──

/** R2オブジェクトキーに使えない文字を _ に置換 (既存アップロードと同方針) */
function safeKeyPart(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 80) || "file";
}

/** フロア群に署名付きGET URL (imageUrl) を都度付与して返す。TTL切れを避けるため保存済みURLは使わない */
async function withFloorImageUrls<T extends { imageKey: string | null }>(floors: T[]): Promise<(T & { imageUrl: string | null })[]> {
  return Promise.all(
    floors.map(async (f) => {
      let imageUrl: string | null = null;
      if (f.imageKey) {
        try {
          imageUrl = (await storageGet(f.imageKey)).url;
        } catch (error) {
          console.warn("[genba.floors] signed URL failed:", error);
        }
      }
      return { ...f, imageUrl };
    }),
  );
}

// ── floors (M2) ──

const floorsRouter = router({
  /** 現場のフロア一覧 (署名付き画像URL同梱) */
  list: genbaProcedure.input(z.object({ siteId: genbaIdSchema })).query(async ({ input }) => {
    const floors = await genbaDb.listGenbaFloorsBySite(input.siteId);
    return withFloorImageUrls(floors);
  }),

  /** 図面画像のアップロード: base64 → validateFile → storagePut(R2) → floor作成。DBにはimageKeyのみ保存 */
  create: genbaFieldProcedure
    .input(z.object({
      id: genbaIdSchema.optional(),
      siteId: genbaIdSchema,
      name: z.string().trim().min(1).max(120),
      base64: z.string().min(1),
      mimeType: z.string(),
      fileName: z.string().min(1).max(200),
      w: z.number().int().positive(),
      h: z.number().int().positive(),
      sortOrder: z.number().int().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const site = await genbaDb.getGenbaSiteById(input.siteId);
      if (!site) throw new TRPCError({ code: "NOT_FOUND", message: "現場が見つかりません" });

      const buffer = Buffer.from(input.base64, "base64");
      const validationError = validateFile(input.fileName, input.mimeType, buffer.length);
      if (validationError) throw new TRPCError({ code: "BAD_REQUEST", message: validationError });

      const id = input.id ?? nanoid(21);
      const imageKey = `genba/${input.siteId}/floor-${id}-${safeKeyPart(input.fileName)}`;
      await storagePut(imageKey, buffer, input.mimeType);

      const floor = await genbaDb.createGenbaFloor({
        id,
        siteId: input.siteId,
        name: input.name,
        imageKey,
        w: input.w,
        h: input.h,
        sortOrder: input.sortOrder ?? 0,
      });
      await safeGenbaAuditLog(uid(ctx), "genba.floors.create", { entityId: id, note: `図面を追加: ${input.name} (${site.name})` });
      const [withUrl] = await withFloorImageUrls(floor ? [floor] : []);
      return withUrl ?? null;
    }),

  /** フロア名・並び順の更新 (画像は差し替えず、リネーム/並べ替えのみ) */
  update: genbaFieldProcedure
    .input(z.object({ id: genbaIdSchema, name: z.string().trim().min(1).max(120).optional(), sortOrder: z.number().int().optional() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await genbaDb.getGenbaFloorById(input.id);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "フロアが見つかりません" });
      assertLinkSiteId(ctx, existing.siteId);
      const patch: { name?: string; sortOrder?: number } = {};
      if (input.name !== undefined) patch.name = input.name;
      if (input.sortOrder !== undefined) patch.sortOrder = input.sortOrder;
      const floor = await genbaDb.updateGenbaFloor(input.id, patch);
      await safeGenbaAuditLog(uid(ctx), "genba.floors.update", { entityId: input.id, note: `フロアを更新: ${existing.name}` });
      const [withUrl] = await withFloorImageUrls(floor ? [floor] : []);
      return withUrl ?? null;
    }),

  /** フロア削除 (DB行のみ。R2オブジェクトは既存アップロードと同様に保持) */
  remove: genbaFieldProcedure
    .input(z.object({ id: genbaIdSchema }))
    .mutation(async ({ ctx, input }) => {
      const existing = await genbaDb.getGenbaFloorById(input.id);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "フロアが見つかりません" });
      assertLinkSiteId(ctx, existing.siteId);
      await genbaDb.deleteGenbaFloor(input.id);
      await safeGenbaAuditLog(uid(ctx), "genba.floors.remove", { entityId: input.id, note: `図面を削除: ${existing.name}` });
      return { success: true as const };
    }),

  /**
   * フロア(図面)ごとの共通ファイル = 「全エリア共通」。図面に1度貼れば、その図面上の全エリア・全作業から参照できる。
   * クライアントは常に zoneId を渡し、サーバーが所属フロアを解決する (作業/エリア詳細どちらからでも zoneId しか無いため)。
   * 閲覧は全員 (リンクは自現場のみ)、追加/削除は field(leader+)。作業/エリアファイルと同方式 (R2はキーのみ保存)。
   */
  files: router({
    list: genbaProcedure.input(z.object({ zoneId: genbaIdSchema })).query(async ({ ctx, input }) => {
      const zone = await genbaDb.getGenbaZoneById(input.zoneId);
      if (!zone) throw new TRPCError({ code: "NOT_FOUND", message: "エリアが見つかりません" });
      const floor = await genbaDb.getGenbaFloorById(zone.floorId);
      assertLinkSiteId(ctx, floor?.siteId ?? null);
      const files = await genbaDb.listGenbaFloorFiles(zone.floorId);
      return Promise.all(files.map(async (f) => {
        let url = f.url;
        if (f.kind === "upload" && f.storageKey) {
          try { url = (await storageGet(f.storageKey)).url; } catch { url = null; }
        }
        return { id: f.id, kind: f.kind, title: f.title, fileName: f.fileName, mimeType: f.mimeType, sizeBytes: f.sizeBytes, url, createdAt: f.createdAt };
      }));
    }),

    getBytes: genbaProcedure.input(z.object({ id: genbaIdSchema })).query(async ({ ctx, input }) => {
      const file = await genbaDb.getGenbaFloorFileById(input.id);
      if (!file) throw new TRPCError({ code: "NOT_FOUND", message: "ファイルが見つかりません" });
      const floor = await genbaDb.getGenbaFloorById(file.floorId);
      assertLinkSiteId(ctx, floor?.siteId ?? null);
      if (file.kind !== "upload" || !file.storageKey) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "このファイルは端末保存できません（外部リンク）" });
      }
      const bytes = await storageGetBytes(file.storageKey);
      return { base64: bytes.toString("base64"), mimeType: file.mimeType || "application/octet-stream", fileName: file.fileName || "file" };
    }),

    addLink: genbaFieldProcedure
      .input(z.object({ zoneId: genbaIdSchema, url: z.string().trim().url().max(1000), title: z.string().trim().max(200).optional() }))
      .mutation(async ({ ctx, input }) => {
        if (!/^https?:\/\//i.test(input.url)) throw new TRPCError({ code: "BAD_REQUEST", message: "URLは https:// から入力してください" });
        const zone = await genbaDb.getGenbaZoneById(input.zoneId);
        if (!zone) throw new TRPCError({ code: "NOT_FOUND", message: "エリアが見つかりません" });
        const floor = await genbaDb.getGenbaFloorById(zone.floorId);
        assertLinkSiteId(ctx, floor?.siteId ?? null);
        const file = await genbaDb.createGenbaFloorFile({
          id: nanoid(21), floorId: zone.floorId, kind: "link",
          title: input.title || null, url: input.url, createdByUserId: uid(ctx),
        } as any);
        await safeGenbaAuditLog(uid(ctx), "genba.floors.files.addLink", { entityId: zone.floorId, note: `全エリア共通リンク追加: ${input.title || input.url}` });
        return file;
      }),

    upload: genbaFieldProcedure
      .input(z.object({ zoneId: genbaIdSchema, base64: z.string().min(1), mimeType: z.string(), fileName: z.string().min(1).max(200), title: z.string().trim().max(200).optional() }))
      .mutation(async ({ ctx, input }) => {
        const zone = await genbaDb.getGenbaZoneById(input.zoneId);
        if (!zone) throw new TRPCError({ code: "NOT_FOUND", message: "エリアが見つかりません" });
        const floor = await genbaDb.getGenbaFloorById(zone.floorId);
        assertLinkSiteId(ctx, floor?.siteId ?? null);
        const buffer = Buffer.from(input.base64, "base64");
        const err = validateFile(input.fileName, input.mimeType, buffer.length);
        if (err) throw new TRPCError({ code: "BAD_REQUEST", message: err });
        const storageKey = `genba/floor-${zone.floorId}/file-${nanoid(8)}-${safeKeyPart(input.fileName)}`;
        await storagePut(storageKey, buffer, input.mimeType);
        const file = await genbaDb.createGenbaFloorFile({
          id: nanoid(21), floorId: zone.floorId, kind: "upload",
          title: input.title || null, fileName: input.fileName, storageKey,
          mimeType: input.mimeType, sizeBytes: buffer.length, createdByUserId: uid(ctx),
        } as any);
        await safeGenbaAuditLog(uid(ctx), "genba.floors.files.upload", { entityId: zone.floorId, note: `全エリア共通アップロード: ${input.fileName}` });
        return file;
      }),

    remove: genbaFieldProcedure
      .input(z.object({ id: genbaIdSchema }))
      .mutation(async ({ ctx, input }) => {
        const file = await genbaDb.getGenbaFloorFileById(input.id);
        if (!file) throw new TRPCError({ code: "NOT_FOUND", message: "ファイルが見つかりません" });
        const floor = await genbaDb.getGenbaFloorById(file.floorId);
        assertLinkSiteId(ctx, floor?.siteId ?? null);
        await genbaDb.deleteGenbaFloorFile(input.id);
        await safeGenbaAuditLog(uid(ctx), "genba.floors.files.remove", { entityId: file.floorId, note: `全エリア共通削除: ${file.title || file.fileName || file.url}` });
        return { success: true as const };
      }),
  }),
});

// ── zones (M2-B) ──

const polygonSchema = z.array(z.object({ x: z.number(), y: z.number() })).min(3, "頂点は3点以上必要です");
const zonePrioritySchema = z.number().int().min(1).max(4).nullish();
const zoneWorkStatusSchema = z.union([z.literal("paused"), z.null()]).optional();

const zonesRouter = router({
  /** フロアのエリア一覧 + 進捗/問題数を同梱 (集計はサーバー側 = 全タスクをフロントに流さない) */
  listByFloor: genbaProcedure.input(z.object({ floorId: genbaIdSchema })).query(async ({ input }) => {
    const zones = await genbaDb.listGenbaZonesByFloor(input.floorId);
    const tasks = await genbaDb.listGenbaTasksByZoneIds(zones.map((z) => z.id));
    const agg = computeZoneAggregates(
      zones.map((z) => ({ id: z.id, parentZoneId: z.parentZoneId })),
      tasks.map((t) => ({ id: t.id, zoneId: t.zoneId, parentTaskId: t.parentTaskId, status: t.status, percent: t.percent })),
    );
    return zones.map((z) => {
      const a = agg.get(z.id) ?? { progress: 0, issues: 0 };
      return { ...z, progress: a.progress, issues: a.issues };
    });
  }),

  /** 現場配下の全エリア (フロア横断・急ぎ手配のエリア選択などに使う軽量版) */
  listBySite: genbaProcedure.input(z.object({ siteId: genbaIdSchema })).query(async ({ input }) => {
    const floors = await genbaDb.listGenbaFloorsBySite(input.siteId);
    const floorName = new Map(floors.map((f) => [f.id, f.name]));
    const zones = await genbaDb.listGenbaZonesByFloorIds(floors.map((f) => f.id));
    return zones.map((z) => ({ id: z.id, floorId: z.floorId, floorName: floorName.get(z.floorId) ?? "", name: z.name, parentZoneId: z.parentZoneId, priority: z.priority }));
  }),

  /** エリア(ポリゴン)の作成 + 作業テンプレートの自動適用 (applyTemplate=false で無効化可) */
  create: genbaFieldProcedure
    .input(z.object({
      id: genbaIdSchema.optional(),
      floorId: genbaIdSchema,
      parentZoneId: genbaIdSchema.nullish(),
      name: z.string().trim().min(1).max(120),
      polygon: polygonSchema,
      priority: zonePrioritySchema,
      workStatus: zoneWorkStatusSchema,
      applyTemplate: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const floor = await genbaDb.getGenbaFloorById(input.floorId);
      if (!floor) throw new TRPCError({ code: "NOT_FOUND", message: "フロアが見つかりません" });
      if (input.parentZoneId) {
        const parent = await genbaDb.getGenbaZoneById(input.parentZoneId);
        if (!parent) throw new TRPCError({ code: "NOT_FOUND", message: "親エリアが見つかりません" });
      }
      const id = input.id ?? nanoid(21);
      const zone = await genbaDb.createGenbaZone({
        id,
        floorId: input.floorId,
        parentZoneId: input.parentZoneId ?? null,
        name: input.name,
        polygon: input.polygon,
        priority: input.priority ?? null,
        workStatus: input.workStatus ?? null,
      });
      // 作業テンプレートを自動適用 (プロトタイプ準拠: エリア作成時に標準作業ツリーを展開)
      if (input.applyTemplate !== false) {
        const tree = await currentTemplateForInstantiation();
        const tasks = instantiateTemplateTasks(tree, id, null);
        if (tasks.length) await genbaDb.createGenbaTasksBulk(tasks);
      }
      await safeGenbaAuditLog(uid(ctx), "genba.zones.create", { entityId: id, note: `エリアを作成: ${input.name}` });
      return zone;
    }),

  /** 名前・ポリゴン範囲・優先度・稼働状態・色・塗り不透明度の更新 */
  update: genbaFieldProcedure
    .input(z.object({
      id: genbaIdSchema,
      name: z.string().trim().min(1).max(120).optional(),
      polygon: polygonSchema.optional(),
      priority: zonePrioritySchema,
      workStatus: zoneWorkStatusSchema,
      color: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, "色は #RRGGBB 形式").nullish(),
      fillOpacity: z.number().int().min(0).max(100).nullish(),
    }))
    .mutation(async ({ ctx, input }) => {
      const existing = await genbaDb.getGenbaZoneById(input.id);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "エリアが見つかりません" });
      if (ctx.genbaLink) {
        const f = await genbaDb.getGenbaFloorById(existing.floorId);
        assertLinkSiteId(ctx, f?.siteId ?? null);
      }
      const patch: { name?: string; polygon?: { x: number; y: number }[]; priority?: number | null; workStatus?: "paused" | null; color?: string | null; fillOpacity?: number | null } = {};
      if (input.name !== undefined) patch.name = input.name;
      if (input.polygon !== undefined) patch.polygon = input.polygon;
      if (input.priority !== undefined) patch.priority = input.priority;
      if (input.workStatus !== undefined) patch.workStatus = input.workStatus;
      if (input.color !== undefined) patch.color = input.color;
      if (input.fillOpacity !== undefined) patch.fillOpacity = input.fillOpacity;
      const zone = await genbaDb.updateGenbaZone(input.id, patch);
      await safeGenbaAuditLog(uid(ctx), "genba.zones.update", { entityId: input.id, note: `エリアを更新: ${existing.name}` });
      return zone;
    }),

  /** エリア削除 (サブエリア・配下作業も削除) */
  remove: genbaFieldProcedure
    .input(z.object({ id: genbaIdSchema }))
    .mutation(async ({ ctx, input }) => {
      const existing = await genbaDb.getGenbaZoneById(input.id);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "エリアが見つかりません" });
      if (ctx.genbaLink) {
        const f = await genbaDb.getGenbaFloorById(existing.floorId);
        assertLinkSiteId(ctx, f?.siteId ?? null);
      }
      await genbaDb.deleteGenbaZoneCascade(input.id);
      await safeGenbaAuditLog(uid(ctx), "genba.zones.remove", { entityId: input.id, note: `エリアを削除: ${existing.name}` });
      return { success: true as const };
    }),

  /**
   * エリア(工区)ごとの図面・資料。エリアに一度貼れば配下の全作業から参照でき、作業員はワンタッチで開ける。
   * 閲覧は全員 (リンクは自現場のみ)、追加/削除は field(leader+)。作業ファイルと同方式 (R2はキーのみ保存)。
   */
  files: router({
    list: genbaProcedure.input(z.object({ zoneId: genbaIdSchema })).query(async ({ ctx, input }) => {
      const zone = await genbaDb.getGenbaZoneById(input.zoneId);
      if (!zone) throw new TRPCError({ code: "NOT_FOUND", message: "エリアが見つかりません" });
      const floor = await genbaDb.getGenbaFloorById(zone.floorId);
      assertLinkSiteId(ctx, floor?.siteId ?? null);
      const files = await genbaDb.listGenbaZoneFiles(input.zoneId);
      return Promise.all(files.map(async (f) => {
        let url = f.url;
        if (f.kind === "upload" && f.storageKey) {
          try { url = (await storageGet(f.storageKey)).url; } catch { url = null; }
        }
        return { id: f.id, kind: f.kind, title: f.title, fileName: f.fileName, mimeType: f.mimeType, sizeBytes: f.sizeBytes, url, createdAt: f.createdAt };
      }));
    }),

    getBytes: genbaProcedure.input(z.object({ id: genbaIdSchema })).query(async ({ ctx, input }) => {
      const file = await genbaDb.getGenbaZoneFileById(input.id);
      if (!file) throw new TRPCError({ code: "NOT_FOUND", message: "ファイルが見つかりません" });
      const zone = await genbaDb.getGenbaZoneById(file.zoneId);
      const floor = zone ? await genbaDb.getGenbaFloorById(zone.floorId) : null;
      assertLinkSiteId(ctx, floor?.siteId ?? null);
      if (file.kind !== "upload" || !file.storageKey) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "このファイルは端末保存できません（外部リンク）" });
      }
      const bytes = await storageGetBytes(file.storageKey);
      return { base64: bytes.toString("base64"), mimeType: file.mimeType || "application/octet-stream", fileName: file.fileName || "file" };
    }),

    addLink: genbaFieldProcedure
      .input(z.object({ zoneId: genbaIdSchema, url: z.string().trim().url().max(1000), title: z.string().trim().max(200).optional() }))
      .mutation(async ({ ctx, input }) => {
        if (!/^https?:\/\//i.test(input.url)) throw new TRPCError({ code: "BAD_REQUEST", message: "URLは https:// から入力してください" });
        const zone = await genbaDb.getGenbaZoneById(input.zoneId);
        if (!zone) throw new TRPCError({ code: "NOT_FOUND", message: "エリアが見つかりません" });
        const floor = await genbaDb.getGenbaFloorById(zone.floorId);
        assertLinkSiteId(ctx, floor?.siteId ?? null);
        const file = await genbaDb.createGenbaZoneFile({
          id: nanoid(21), zoneId: input.zoneId, kind: "link",
          title: input.title || null, url: input.url, createdByUserId: uid(ctx),
        } as any);
        await safeGenbaAuditLog(uid(ctx), "genba.zones.files.addLink", { entityId: input.zoneId, note: `エリア図面リンク追加: ${input.title || input.url}` });
        return file;
      }),

    upload: genbaFieldProcedure
      .input(z.object({ zoneId: genbaIdSchema, base64: z.string().min(1), mimeType: z.string(), fileName: z.string().min(1).max(200), title: z.string().trim().max(200).optional() }))
      .mutation(async ({ ctx, input }) => {
        const zone = await genbaDb.getGenbaZoneById(input.zoneId);
        if (!zone) throw new TRPCError({ code: "NOT_FOUND", message: "エリアが見つかりません" });
        const floor = await genbaDb.getGenbaFloorById(zone.floorId);
        assertLinkSiteId(ctx, floor?.siteId ?? null);
        const buffer = Buffer.from(input.base64, "base64");
        const err = validateFile(input.fileName, input.mimeType, buffer.length);
        if (err) throw new TRPCError({ code: "BAD_REQUEST", message: err });
        const storageKey = `genba/zone-${input.zoneId}/file-${nanoid(8)}-${safeKeyPart(input.fileName)}`;
        await storagePut(storageKey, buffer, input.mimeType);
        const file = await genbaDb.createGenbaZoneFile({
          id: nanoid(21), zoneId: input.zoneId, kind: "upload",
          title: input.title || null, fileName: input.fileName, storageKey,
          mimeType: input.mimeType, sizeBytes: buffer.length, createdByUserId: uid(ctx),
        } as any);
        await safeGenbaAuditLog(uid(ctx), "genba.zones.files.upload", { entityId: input.zoneId, note: `エリア図面アップロード: ${input.fileName}` });
        return file;
      }),

    remove: genbaFieldProcedure
      .input(z.object({ id: genbaIdSchema }))
      .mutation(async ({ ctx, input }) => {
        const file = await genbaDb.getGenbaZoneFileById(input.id);
        if (!file) throw new TRPCError({ code: "NOT_FOUND", message: "ファイルが見つかりません" });
        const zone = await genbaDb.getGenbaZoneById(file.zoneId);
        const floor = zone ? await genbaDb.getGenbaFloorById(zone.floorId) : null;
        assertLinkSiteId(ctx, floor?.siteId ?? null);
        await genbaDb.deleteGenbaZoneFile(input.id);
        await safeGenbaAuditLog(uid(ctx), "genba.zones.files.remove", { entityId: file.zoneId, note: `エリア図面削除: ${file.title || file.fileName || file.url}` });
        return { success: true as const };
      }),
  }),
});

const genbaTaskStatusSchema = z.enum(["todo", "progress", "done", "issue"]);
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD形式で入力してください");
const issuePhotoSchema = z.object({ base64: z.string().min(1), mimeType: z.string(), fileName: z.string().min(1).max(200) });

const tasksRouter = router({
  /** ゾーンの作業一覧 (フラット + 担当者/班/ゲスト。ツリー化と親進捗はクライアント側で計算) */
  listByZone: genbaProcedure.input(z.object({ zoneId: genbaIdSchema })).query(async ({ input }) => {
    const tasks = await genbaDb.listGenbaTasksByZone(input.zoneId);
    const ids = tasks.map((t) => t.id);
    const [assignees, taskTeams, guestAssignees] = await Promise.all([
      genbaDb.listTaskAssigneesByTaskIds(ids),
      genbaDb.listTaskTeamsByTaskIds(ids),
      genbaDb.listGuestAssigneesByTaskIds(ids),
    ]);
    const byTaskUsers = new Map<string, number[]>();
    for (const a of assignees) { const arr = byTaskUsers.get(a.taskId) || []; arr.push(a.userId); byTaskUsers.set(a.taskId, arr); }
    const byTaskTeams = new Map<string, string[]>();
    for (const t of taskTeams) { const arr = byTaskTeams.get(t.taskId) || []; arr.push(t.teamId); byTaskTeams.set(t.taskId, arr); }
    const byTaskGuests = new Map<string, string[]>();
    for (const g of guestAssignees) { const arr = byTaskGuests.get(g.taskId) || []; arr.push(g.siteWorkerId); byTaskGuests.set(g.taskId, arr); }
    // 担当者名をサーバで解決 (名簿を持たないゲスト閲覧でも user#ID にならないように)
    const userNameById = await genbaDb.listUserNamesByIds(Array.from(new Set(assignees.map((a) => a.userId))));
    const guestWorkers = await genbaDb.listGenbaSiteWorkersByIds(Array.from(new Set(guestAssignees.map((g) => g.siteWorkerId))));
    const guestNameById = new Map(guestWorkers.map((w) => [w.id, w.displayName]));
    const fileCounts = await genbaDb.countGenbaTaskFilesByTaskIds(ids);
    return tasks.map((t) => {
      const uids = byTaskUsers.get(t.id) || [];
      const gids = byTaskGuests.get(t.id) || [];
      return {
        ...t,
        assigneeIds: uids,
        teamIds: byTaskTeams.get(t.id) || [],
        guestAssigneeIds: gids,
        assigneeNames: Object.fromEntries(uids.map((id) => [id, userNameById.get(id) ?? null])),
        guestNames: Object.fromEntries(gids.map((id) => [id, guestNameById.get(id) ?? null])),
        fileCount: fileCounts.get(t.id) ?? 0,
      };
    });
  }),

  /**
   * 現場の全リーフ作業 (まとめて配置UI用): エリア/フロア名つき。親作業は除外し末端のみ返す。
   * クライアントはこれを使って「エリア一覧」「作業名一覧」を作り、選択に応じた taskId を bulkAssign へ渡す。
   */
  listBySite: genbaProcedure.input(z.object({ siteId: genbaIdSchema })).query(async ({ ctx, input }) => {
    assertLinkSiteId(ctx, input.siteId);
    const { floors, tasks, zoneById } = await loadSiteTaskContext(input.siteId);
    const floorName = new Map(floors.map((f) => [f.id, f.name]));
    const hasChild = new Set(tasks.map((t) => t.parentTaskId).filter((x): x is string => !!x));
    return tasks
      .filter((t) => !hasChild.has(t.id))
      .map((t) => {
        const z = zoneById.get(t.zoneId);
        return {
          id: t.id, name: t.name, romaji: t.romaji,
          zoneId: t.zoneId, zoneName: z?.name ?? "?",
          floorId: z?.floorId ?? null, floorName: z ? (floorName.get(z.floorId) ?? null) : null,
        };
      });
  }),

  /**
   * 自分の担当作業 (G3): 現場内で自分に割り当てられた葉タスク (直接 + 班経由)。
   * 「自分の作業」フィルタとダッシュボード導線に使う。
   */
  listMine: genbaProcedure.input(z.object({ siteId: genbaIdSchema })).query(async ({ ctx, input }) => {
    const { tasks, zoneById } = await loadSiteTaskContext(input.siteId);
    const leafIds = tasks.filter((t) => !tasks.some((x) => x.parentTaskId === t.id)).map((t) => t.id);
    const mine = new Set<string>();
    const meId = uid(ctx);
    if (meId != null) (await genbaDb.listTaskIdsAssignedToUser(leafIds, meId)).forEach((id) => mine.add(id));
    if (ctx.genbaLink) (await genbaDb.listTaskIdsAssignedToGuest(leafIds, ctx.genbaLink.siteWorkerId)).forEach((id) => mine.add(id));
    const myTeams = await myTeamIdsForSite(input.siteId, meId);
    if (myTeams.size) {
      const taskTeams = await genbaDb.listTaskTeamsByTaskIds(leafIds);
      for (const tt of taskTeams) if (myTeams.has(tt.teamId)) mine.add(tt.taskId);
    }
    return tasks
      .filter((t) => mine.has(t.id))
      .map((t) => ({
        id: t.id, zoneId: t.zoneId, zoneName: zoneById.get(t.zoneId)?.name ?? "?",
        name: t.name, romaji: t.romaji, status: t.status, percent: t.percent,
        dueDate: t.dueDate, issueText: t.issueText,
      }))
      .sort((a, b) => a.zoneName.localeCompare(b.zoneName, "ja") || a.name.localeCompare(b.name, "ja"));
  }),

  create: genbaFieldProcedure
    .input(z.object({ id: genbaIdSchema.optional(), zoneId: genbaIdSchema, parentTaskId: genbaIdSchema.nullish(), name: z.string().trim().min(1).max(200), romaji: z.string().max(200).optional() }))
    .mutation(async ({ ctx, input }) => {
      const zone = await genbaDb.getGenbaZoneById(input.zoneId);
      if (!zone) throw new TRPCError({ code: "NOT_FOUND", message: "エリアが見つかりません" });
      const id = input.id ?? nanoid(21);
      const task = await genbaDb.createGenbaTask({
        id, zoneId: input.zoneId, parentTaskId: input.parentTaskId ?? null,
        name: input.name, romaji: input.romaji ?? null, status: "todo",
      });
      await safeGenbaAuditLog(uid(ctx), "genba.tasks.create", { entityId: id, note: `作業を追加: ${input.name}` });
      return task;
    }),

  update: genbaFieldProcedure
    .input(z.object({
      id: genbaIdSchema,
      name: z.string().trim().min(1).max(200).optional(),
      romaji: z.string().max(200).nullish(),
      memo: z.string().nullish(),
      memoVisible: z.boolean().optional(),
      linkUrl: z.string().max(500).nullish(),
      startDate: dateStr.nullish(),
      dueDate: dateStr.nullish(),
      priority: z.number().int().min(1).max(4).nullish(),
      sortOrder: z.number().int().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const existing = await genbaDb.getGenbaTaskById(input.id);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "作業が見つかりません" });
      await assertLinkTaskScope(ctx, existing);
      const patch: Record<string, unknown> = {};
      for (const k of ["name", "romaji", "memo", "memoVisible", "linkUrl", "startDate", "dueDate", "priority", "sortOrder"] as const) {
        if (input[k] !== undefined) patch[k] = input[k];
      }
      const task = await genbaDb.updateGenbaTask(input.id, patch);
      await safeGenbaAuditLog(uid(ctx), "genba.tasks.update", { entityId: input.id, note: `作業を更新: ${existing.name}` });
      return task;
    }),

  /**
   * 作業の移動 (親付け替え): 同じエリア内で parentTaskId を変更する。
   * parentTaskId=null でトップ(親なし)へ。循環(自分自身・自分の子孫を親に)は拒否。
   */
  move: genbaFieldProcedure
    .input(z.object({ id: genbaIdSchema, parentTaskId: genbaIdSchema.nullish() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await genbaDb.getGenbaTaskById(input.id);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "作業が見つかりません" });
      await assertLinkTaskScope(ctx, existing);
      const newParentId = input.parentTaskId ?? null;
      if (newParentId === existing.id) throw new TRPCError({ code: "BAD_REQUEST", message: "自分自身の下には移動できません" });

      const zoneTasks = await genbaDb.listGenbaTasksByZone(existing.zoneId);
      let sortOrder = 0;
      if (newParentId) {
        const parent = zoneTasks.find((t) => t.id === newParentId);
        if (!parent) throw new TRPCError({ code: "BAD_REQUEST", message: "移動先の作業が同じエリアに見つかりません" });
        // 循環防止: 移動先が自分の子孫でないことを確認
        const childrenOf = new Map<string, string[]>();
        for (const t of zoneTasks) { if (t.parentTaskId) { const a = childrenOf.get(t.parentTaskId) || []; a.push(t.id); childrenOf.set(t.parentTaskId, a); } }
        const descendants = new Set<string>();
        const stack = [existing.id];
        while (stack.length) { for (const c of childrenOf.get(stack.pop()!) || []) { if (!descendants.has(c)) { descendants.add(c); stack.push(c); } } }
        if (descendants.has(newParentId)) throw new TRPCError({ code: "BAD_REQUEST", message: "自分の下の作業には移動できません" });
      }
      // 移動先の末尾に置く (兄弟の最大 sortOrder + 1)
      const siblings = zoneTasks.filter((t) => (t.parentTaskId ?? null) === newParentId && t.id !== existing.id);
      sortOrder = siblings.reduce((m, t) => Math.max(m, t.sortOrder), -1) + 1;

      const task = await genbaDb.updateGenbaTask(input.id, { parentTaskId: newParentId, sortOrder });
      await safeGenbaAuditLog(uid(ctx), "genba.tasks.move", { entityId: input.id, note: `作業を移動: ${existing.name}` });
      return task;
    }),

  /**
   * 現場入力: ステータス変更 (worker も可)。
   * 問題報告時は写真を base64 で受け R2 保存し、履歴イベント(task_events)に記録する。
   */
  setStatus: genbaProcedure
    .input(z.object({
      id: genbaIdSchema,
      status: genbaTaskStatusSchema,
      percent: z.number().int().min(0).max(100).nullish(),
      issueText: z.string().optional(),
      photos: z.array(issuePhotoSchema).max(4).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const existing = await genbaDb.getGenbaTaskById(input.id);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "作業が見つかりません" });
      await assertLinkTaskScope(ctx, existing);

      // 作業員リンク (非leader) は自分の担当のみ更新可 (直接/ゲスト割当/班経由)
      if (ctx.genbaLink && ctx.genbaRole !== "leader") {
        const own = new Set<string>();
        (await genbaDb.listTaskIdsAssignedToGuest([input.id], ctx.genbaLink.siteWorkerId)).forEach((id) => own.add(id));
        if (!own.size && ctx.genbaLink.userId != null) {
          (await genbaDb.listTaskIdsAssignedToUser([input.id], ctx.genbaLink.userId)).forEach((id) => own.add(id));
          if (!own.size) {
            const myTeams = await myTeamIdsForSite(ctx.genbaLink.siteId, ctx.genbaLink.userId);
            if (myTeams.size) {
              const tts = await genbaDb.listTaskTeamsByTaskIds([input.id]);
              if (tts.some((tt) => myTeams.has(tt.teamId))) own.add(input.id);
            }
          }
        }
        if (!own.has(input.id)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "この作業はあなたの担当ではありません" });
        }
      }

      // 問題報告: 写真を R2 へ保存しキーを集める (DBには base64 を入れない)
      const photoKeys: string[] = [];
      if (input.status === "issue" && input.photos?.length) {
        for (const p of input.photos) {
          const buffer = Buffer.from(p.base64, "base64");
          const err = validateFile(p.fileName, p.mimeType, buffer.length);
          if (err) throw new TRPCError({ code: "BAD_REQUEST", message: err });
          const key = `genba/task-${input.id}/issue-${nanoid(8)}-${safeKeyPart(p.fileName)}`;
          await storagePut(key, buffer, p.mimeType);
          photoKeys.push(key);
        }
      }

      const percent = input.status === "done" ? 100 : input.status === "todo" ? null : (input.percent ?? existing.percent ?? (input.status === "progress" ? 50 : null));
      const task = await genbaDb.updateGenbaTask(input.id, {
        status: input.status,
        percent,
        issueText: input.status === "issue" ? (input.issueText ?? "") : null,
      });

      // 履歴イベント (status / issue) を記録。id はクライアント生成 varchar
      await genbaDb.createGenbaTaskEvent({
        id: nanoid(21),
        taskId: input.id,
        kind: input.status === "issue" ? "issue" : "status",
        byUserId: uid(ctx),
        text: input.status === "issue" ? (input.issueText ?? "") : `「${input.status}」に変更`,
        photoKeys: photoKeys.length ? photoKeys : null,
      } as any);

      await safeGenbaAuditLog(uid(ctx), "genba.tasks.setStatus", { entityId: input.id, note: `${existing.name}: ${input.status}` });
      // 学習ログ: 完了/問題を記録 (ゾーン単位で現場に紐づく)
      if (input.status === "issue") {
        await safeGenbaActivity("issue", uid(ctx), { taskId: input.id, taskName: existing.name, zoneId: existing.zoneId });
      } else {
        await safeGenbaActivity("status", uid(ctx), { taskId: input.id, taskName: existing.name, zoneId: existing.zoneId, status: input.status });
      }
      return task;
    }),

  /** 作業の履歴・問題イベント (写真は署名URL付き) */
  events: genbaProcedure.input(z.object({ taskId: genbaIdSchema })).query(async ({ input }) => {
    const events = await genbaDb.listGenbaTaskEvents(input.taskId);
    return Promise.all(events.map(async (e) => {
      const keys = Array.isArray(e.photoKeys) ? (e.photoKeys as string[]) : [];
      const photoUrls = await Promise.all(keys.map(async (k) => {
        try { return (await storageGet(k)).url; } catch { return null; }
      }));
      return { ...e, photoUrls: photoUrls.filter((u): u is string => !!u) };
    }));
  }),

  remove: genbaFieldProcedure
    .input(z.object({ id: genbaIdSchema }))
    .mutation(async ({ ctx, input }) => {
      const existing = await genbaDb.getGenbaTaskById(input.id);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "作業が見つかりません" });
      await assertLinkTaskScope(ctx, existing);
      await genbaDb.deleteGenbaTaskCascade(input.id);
      await safeGenbaAuditLog(uid(ctx), "genba.tasks.remove", { entityId: input.id, note: `作業を削除: ${existing.name}` });
      return { success: true as const };
    }),

  /** 作業への担当者(ユーザー)割当のトグル (M3-A) */
  assignUser: genbaFieldProcedure
    .input(z.object({
      taskId: genbaIdSchema,
      userId: z.number().int().positive(),
      on: z.boolean(),
      /** 割当時、サブエリアの同名作業へ自動でも割り当てる (既定 true)。解除は伝播しない */
      propagate: z.boolean().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      const task = await genbaDb.getGenbaTaskById(input.taskId);
      if (!task) throw new TRPCError({ code: "NOT_FOUND", message: "作業が見つかりません" });
      if (input.on) await genbaDb.addTaskAssignee({ id: nanoid(21), taskId: input.taskId, userId: input.userId });
      else await genbaDb.removeTaskAssignee(input.taskId, input.userId);

      // 親エリアで割り当てたら、サブエリア(子ゾーン)の同名作業にも同じ担当を自動付与
      let propagated = 0;
      if (input.on && input.propagate) {
        const zone = await genbaDb.getGenbaZoneById(task.zoneId);
        if (zone) {
          const floorZones = await genbaDb.listGenbaZonesByFloor(zone.floorId);
          const childZones = floorZones.filter((zz) => zz.parentZoneId === task.zoneId);
          for (const cz of childZones) {
            const childTasks = await genbaDb.listGenbaTasksByZone(cz.id);
            for (const t of childTasks.filter((t) => t.name === task.name)) {
              await genbaDb.addTaskAssignee({ id: nanoid(21), taskId: t.id, userId: input.userId });
              propagated++;
            }
          }
        }
      }
      await safeGenbaAuditLog(uid(ctx), "genba.tasks.assignUser", { entityId: input.taskId, note: `担当 ${input.on ? "追加" : "解除"}: user#${input.userId}${propagated ? ` (サブエリア${propagated}件へ伝播)` : ""}` });
      return { success: true as const, propagated };
    }),

  /** 作業へのゲスト(現場名簿)割当のトグル (G1)。名簿行が同じ現場のものかを検証する */
  assignGuest: genbaFieldProcedure
    .input(z.object({ taskId: genbaIdSchema, siteWorkerId: genbaIdSchema, on: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const task = await genbaDb.getGenbaTaskById(input.taskId);
      if (!task) throw new TRPCError({ code: "NOT_FOUND", message: "作業が見つかりません" });
      const worker = await genbaDb.getGenbaSiteWorkerById(input.siteWorkerId);
      if (!worker) throw new TRPCError({ code: "NOT_FOUND", message: "作業員が名簿に見つかりません" });
      // 作業の現場 (zone→floor→site) と名簿の現場が一致することを確認
      const zone = await genbaDb.getGenbaZoneById(task.zoneId);
      const floor = zone ? await genbaDb.getGenbaFloorById(zone.floorId) : null;
      if (!floor || floor.siteId !== worker.siteId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "この現場の名簿に載っていない作業員です" });
      }
      if (input.on) await genbaDb.addGuestAssignee({ id: nanoid(21), taskId: input.taskId, siteWorkerId: input.siteWorkerId });
      else await genbaDb.removeGuestAssignee(input.taskId, input.siteWorkerId);
      await safeGenbaAuditLog(uid(ctx), "genba.tasks.assignGuest", { entityId: input.taskId, note: `ゲスト担当 ${input.on ? "追加" : "解除"}: ${worker.displayName}` });
      return { success: true as const };
    }),

  /** 作業への班割当のトグル (M3-A) */
  assignTeam: genbaFieldProcedure
    .input(z.object({ taskId: genbaIdSchema, teamId: genbaIdSchema, on: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const task = await genbaDb.getGenbaTaskById(input.taskId);
      if (!task) throw new TRPCError({ code: "NOT_FOUND", message: "作業が見つかりません" });
      if (input.on) await genbaDb.addTaskTeam({ id: nanoid(21), taskId: input.taskId, teamId: input.teamId });
      else await genbaDb.removeTaskTeam(input.taskId, input.teamId);
      await safeGenbaAuditLog(uid(ctx), "genba.tasks.assignTeam", { entityId: input.taskId, note: `班 ${input.on ? "追加" : "解除"}: ${input.teamId}` });
      return { success: true as const };
    }),

  /**
   * 複数作業への一括割当 (まとめて配置)。userId / teamId / siteWorkerId のいずれか1つを、
   * taskIds 全件へ on/off する。全作業が同一現場に属することを検証し、リンクセッションは自現場のみ。
   * 「複数エリアへまとめて配置」も「特定作業を複数エリアへ配置」も、クライアントが対象 taskId を
   * 列挙してここへ渡すことで実現する。監査ログは集約1件。add* は重複挿入しないので二重割当にならない。
   */
  bulkAssign: genbaFieldProcedure
    .input(z.object({
      taskIds: z.array(genbaIdSchema).min(1).max(500),
      userId: z.number().int().positive().optional(),
      teamId: genbaIdSchema.optional(),
      siteWorkerId: genbaIdSchema.optional(),
      on: z.boolean(),
    }).refine(
      (v) => [v.userId, v.teamId, v.siteWorkerId].filter((x) => x != null).length === 1,
      { message: "userId / teamId / siteWorkerId のいずれか1つを指定してください" },
    ))
    .mutation(async ({ ctx, input }) => {
      const kind = input.userId != null ? "user" : input.teamId != null ? "team" : "guest";
      // 全作業の存在確認 + 同一現場チェック (重複IDは除外)
      const uniqueIds = Array.from(new Set(input.taskIds));
      const tasks: { id: string; zoneId: string; name: string }[] = [];
      let siteId: string | null = null;
      for (const taskId of uniqueIds) {
        const task = await genbaDb.getGenbaTaskById(taskId);
        if (!task) throw new TRPCError({ code: "NOT_FOUND", message: "対象の作業が見つかりません" });
        const zone = await genbaDb.getGenbaZoneById(task.zoneId);
        const floor = zone ? await genbaDb.getGenbaFloorById(zone.floorId) : null;
        if (!floor) throw new TRPCError({ code: "NOT_FOUND", message: "作業のエリアが見つかりません" });
        if (siteId == null) siteId = floor.siteId;
        else if (siteId !== floor.siteId) throw new TRPCError({ code: "BAD_REQUEST", message: "複数の現場の作業は一括で配置できません" });
        tasks.push(task);
      }
      // リンクセッションは自現場のみ
      assertLinkSiteId(ctx, siteId);

      // 割当対象の妥当性 (現場一致) を検証しつつ、監査ログ用ラベルを作る
      let label: string;
      if (kind === "guest") {
        const worker = await genbaDb.getGenbaSiteWorkerById(input.siteWorkerId!);
        if (!worker) throw new TRPCError({ code: "NOT_FOUND", message: "作業員が名簿に見つかりません" });
        if (worker.siteId !== siteId) throw new TRPCError({ code: "BAD_REQUEST", message: "この現場の名簿に載っていない作業員です" });
        label = `ゲスト ${worker.displayName}`;
      } else if (kind === "team") {
        const team = await genbaDb.getGenbaTeamById(input.teamId!);
        if (!team || team.siteId !== siteId) throw new TRPCError({ code: "BAD_REQUEST", message: "この現場の班ではありません" });
        label = `班 ${team.name}`;
      } else {
        label = `user#${input.userId}`;
      }

      // 適用 (add* は既存を検出して二重挿入しない)
      for (const task of tasks) {
        if (kind === "user") {
          if (input.on) await genbaDb.addTaskAssignee({ id: nanoid(21), taskId: task.id, userId: input.userId! });
          else await genbaDb.removeTaskAssignee(task.id, input.userId!);
        } else if (kind === "team") {
          if (input.on) await genbaDb.addTaskTeam({ id: nanoid(21), taskId: task.id, teamId: input.teamId! });
          else await genbaDb.removeTaskTeam(task.id, input.teamId!);
        } else {
          if (input.on) await genbaDb.addGuestAssignee({ id: nanoid(21), taskId: task.id, siteWorkerId: input.siteWorkerId! });
          else await genbaDb.removeGuestAssignee(task.id, input.siteWorkerId!);
        }
      }
      await safeGenbaAuditLog(uid(ctx), "genba.tasks.bulkAssign", {
        note: `${tasks.length}件の作業へ${input.on ? "一括割当" : "一括解除"}: ${label}`,
        payload: { taskIds: uniqueIds, on: input.on },
      });
      return { success: true as const, count: tasks.length };
    }),

  /**
   * 引き継ぎ (M3-B, worker も可): 担当を相手に付け替え、履歴イベント(handover)を残し、
   * 相手宛ての指示を自動生成する。指示の siteId はゾーン→フロア→現場から解決する。
   */
  handover: genbaProcedure
    .input(z.object({ taskId: genbaIdSchema, toUserId: z.number().int().positive(), note: z.string().max(500).optional() }))
    .mutation(async ({ ctx, input }) => {
      const task = await genbaDb.getGenbaTaskById(input.taskId);
      if (!task) throw new TRPCError({ code: "NOT_FOUND", message: "作業が見つかりません" });
      if (input.toUserId === uid(ctx)) throw new TRPCError({ code: "BAD_REQUEST", message: "自分自身には引き継げません" });

      const meId = uid(ctx);
      if (meId == null) throw new TRPCError({ code: "FORBIDDEN", message: "ゲストリンクからは引き継ぎできません" });
      // 担当の付け替え: 相手を追加し、自分を外す
      await genbaDb.addTaskAssignee({ id: nanoid(21), taskId: input.taskId, userId: input.toUserId });
      await genbaDb.removeTaskAssignee(input.taskId, meId);

      // 履歴イベント (handover)
      const note = input.note?.trim();
      await genbaDb.createGenbaTaskEvent({
        id: nanoid(21), taskId: input.taskId, kind: "handover", byUserId: uid(ctx),
        text: `引き継ぎ${note ? " — " + note : ""}`, photoKeys: null,
      } as any);

      // 相手宛ての指示を自動生成 (現場は zone→floor→site で解決)
      const zone = await genbaDb.getGenbaZoneById(task.zoneId);
      const floor = zone ? await genbaDb.getGenbaFloorById(zone.floorId) : null;
      if (floor) {
        await genbaDb.createGenbaInstruction({
          id: nanoid(21), siteId: floor.siteId,
          text: `🤝 引き継ぎ: 「${task.name}」を引き継ぎました。${note ? "\n申し送り: " + note : ""}`,
          targetKind: "worker", targetId: String(input.toUserId), zoneId: task.zoneId, byUserId: uid(ctx),
        });
      }
      await safeGenbaAuditLog(uid(ctx), "genba.tasks.handover", { entityId: input.taskId, note: `${task.name} を user#${input.toUserId} へ引き継ぎ` });
      return { success: true as const };
    }),

  /**
   * 作業ファイル (図面・資料)。閲覧は全員 (リンクセッション=自現場のみ)、追加/削除は field(leader+)。
   * kind=link は外部URL、kind=upload は R2 に保存しキーのみDB。表示時に署名URLを都度発行する。
   */
  files: router({
    list: genbaProcedure.input(z.object({ taskId: genbaIdSchema })).query(async ({ ctx, input }) => {
      const task = await genbaDb.getGenbaTaskById(input.taskId);
      if (!task) throw new TRPCError({ code: "NOT_FOUND", message: "作業が見つかりません" });
      await assertLinkTaskScope(ctx, task);
      const files = await genbaDb.listGenbaTaskFiles(input.taskId);
      return Promise.all(files.map(async (f) => {
        let url = f.url;
        if (f.kind === "upload" && f.storageKey) {
          try { url = (await storageGet(f.storageKey)).url; } catch { url = null; }
        }
        return {
          id: f.id, kind: f.kind, title: f.title, fileName: f.fileName,
          mimeType: f.mimeType, sizeBytes: f.sizeBytes, url, createdAt: f.createdAt,
        };
      }));
    }),

    /**
     * アップロードファイルの実体を同一オリジンで取得 (オフライン保存用)。
     * R2署名URLはクロスオリジン+失効するため、端末にキャッシュするにはここを経由する。
     * 閲覧権限と同じ (誰でも・リンクは自現場のみ)。kind=link は対象外 (外部URLのため)。
     */
    getBytes: genbaProcedure.input(z.object({ id: genbaIdSchema })).query(async ({ ctx, input }) => {
      const file = await genbaDb.getGenbaTaskFileById(input.id);
      if (!file) throw new TRPCError({ code: "NOT_FOUND", message: "ファイルが見つかりません" });
      const task = await genbaDb.getGenbaTaskById(file.taskId);
      if (task) await assertLinkTaskScope(ctx, task);
      if (file.kind !== "upload" || !file.storageKey) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "このファイルは端末保存できません（外部リンク）" });
      }
      const bytes = await storageGetBytes(file.storageKey);
      return { base64: bytes.toString("base64"), mimeType: file.mimeType || "application/octet-stream", fileName: file.fileName || "file" };
    }),

    addLink: genbaFieldProcedure
      .input(z.object({ taskId: genbaIdSchema, url: z.string().trim().url().max(1000), title: z.string().trim().max(200).optional() }))
      .mutation(async ({ ctx, input }) => {
        if (!/^https?:\/\//i.test(input.url)) throw new TRPCError({ code: "BAD_REQUEST", message: "URLは https:// から入力してください" });
        const task = await genbaDb.getGenbaTaskById(input.taskId);
        if (!task) throw new TRPCError({ code: "NOT_FOUND", message: "作業が見つかりません" });
        await assertLinkTaskScope(ctx, task);
        const file = await genbaDb.createGenbaTaskFile({
          id: nanoid(21), taskId: input.taskId, kind: "link",
          title: input.title || null, url: input.url, createdByUserId: uid(ctx),
        } as any);
        await safeGenbaAuditLog(uid(ctx), "genba.tasks.files.addLink", { entityId: input.taskId, note: `ファイルリンク追加: ${input.title || input.url}` });
        return file;
      }),

    upload: genbaFieldProcedure
      .input(z.object({
        taskId: genbaIdSchema,
        base64: z.string().min(1),
        mimeType: z.string(),
        fileName: z.string().min(1).max(200),
        title: z.string().trim().max(200).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const task = await genbaDb.getGenbaTaskById(input.taskId);
        if (!task) throw new TRPCError({ code: "NOT_FOUND", message: "作業が見つかりません" });
        await assertLinkTaskScope(ctx, task);
        const buffer = Buffer.from(input.base64, "base64");
        const err = validateFile(input.fileName, input.mimeType, buffer.length);
        if (err) throw new TRPCError({ code: "BAD_REQUEST", message: err });
        const storageKey = `genba/task-${input.taskId}/file-${nanoid(8)}-${safeKeyPart(input.fileName)}`;
        await storagePut(storageKey, buffer, input.mimeType);
        const file = await genbaDb.createGenbaTaskFile({
          id: nanoid(21), taskId: input.taskId, kind: "upload",
          title: input.title || null, fileName: input.fileName, storageKey,
          mimeType: input.mimeType, sizeBytes: buffer.length, createdByUserId: uid(ctx),
        } as any);
        await safeGenbaAuditLog(uid(ctx), "genba.tasks.files.upload", { entityId: input.taskId, note: `ファイルアップロード: ${input.fileName}` });
        return file;
      }),

    remove: genbaFieldProcedure
      .input(z.object({ id: genbaIdSchema }))
      .mutation(async ({ ctx, input }) => {
        const file = await genbaDb.getGenbaTaskFileById(input.id);
        if (!file) throw new TRPCError({ code: "NOT_FOUND", message: "ファイルが見つかりません" });
        const task = await genbaDb.getGenbaTaskById(file.taskId);
        if (task) await assertLinkTaskScope(ctx, task);
        await genbaDb.deleteGenbaTaskFile(input.id);
        await safeGenbaAuditLog(uid(ctx), "genba.tasks.files.remove", { entityId: file.taskId, note: `ファイル削除: ${file.title || file.fileName || file.url}` });
        return { success: true as const };
      }),
  }),
});

// ── teams (M3-A) ──

const teamsRouter = router({
  /** 現場の班一覧 (メンバーの userId 配列を同梱) */
  listBySite: genbaProcedure.input(z.object({ siteId: genbaIdSchema })).query(async ({ input }) => {
    const teams = await genbaDb.listGenbaTeamsBySite(input.siteId);
    const members = await genbaDb.listGenbaTeamMembers(teams.map((t) => t.id));
    const byTeam = new Map<string, number[]>();
    for (const m of members) { const arr = byTeam.get(m.teamId) || []; arr.push(m.userId); byTeam.set(m.teamId, arr); }
    return teams.map((t) => ({ ...t, memberIds: byTeam.get(t.id) || [] }));
  }),

  create: genbaFieldProcedure
    .input(z.object({ id: genbaIdSchema.optional(), siteId: genbaIdSchema, name: z.string().trim().min(1).max(120) }))
    .mutation(async ({ ctx, input }) => {
      const site = await genbaDb.getGenbaSiteById(input.siteId);
      if (!site) throw new TRPCError({ code: "NOT_FOUND", message: "現場が見つかりません" });
      const id = input.id ?? nanoid(21);
      const team = await genbaDb.createGenbaTeam({ id, siteId: input.siteId, name: input.name });
      await safeGenbaAuditLog(uid(ctx), "genba.teams.create", { entityId: id, note: `班を作成: ${input.name}` });
      return team;
    }),

  rename: genbaFieldProcedure
    .input(z.object({ id: genbaIdSchema, name: z.string().trim().min(1).max(120) }))
    .mutation(async ({ ctx, input }) => {
      const existing = await genbaDb.getGenbaTeamById(input.id);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "班が見つかりません" });
      assertLinkSiteId(ctx, existing.siteId);
      const team = await genbaDb.updateGenbaTeam(input.id, { name: input.name });
      await safeGenbaAuditLog(uid(ctx), "genba.teams.rename", { entityId: input.id, note: `班名を変更: ${existing.name} → ${input.name}` });
      return team;
    }),

  remove: genbaFieldProcedure
    .input(z.object({ id: genbaIdSchema }))
    .mutation(async ({ ctx, input }) => {
      const existing = await genbaDb.getGenbaTeamById(input.id);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "班が見つかりません" });
      assertLinkSiteId(ctx, existing.siteId);
      await genbaDb.deleteGenbaTeamCascade(input.id);
      await safeGenbaAuditLog(uid(ctx), "genba.teams.remove", { entityId: input.id, note: `班を削除: ${existing.name}` });
      return { success: true as const };
    }),

  /** 班メンバーのトグル */
  setMember: genbaFieldProcedure
    .input(z.object({ teamId: genbaIdSchema, userId: z.number().int().positive(), on: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const team = await genbaDb.getGenbaTeamById(input.teamId);
      if (!team) throw new TRPCError({ code: "NOT_FOUND", message: "班が見つかりません" });
      if (input.on) await genbaDb.addGenbaTeamMember({ id: nanoid(21), teamId: input.teamId, userId: input.userId });
      else await genbaDb.removeGenbaTeamMember(input.teamId, input.userId);
      await safeGenbaAuditLog(uid(ctx), "genba.teams.setMember", { entityId: input.teamId, note: `メンバー ${input.on ? "追加" : "解除"}: user#${input.userId}` });
      return { success: true as const };
    }),
});

// ── users (M3-A): 割り当て可能ユーザー一覧 (既存 users を読み取り専用) ──

const usersRouter = router({
  /** 割当可能な作業員。siteId 指定かつ案件リンク時は出面登録メンバーのみ */
  listAssignable: genbaProcedure
    .input(z.object({ siteId: genbaIdSchema }).optional())
    .query(async ({ ctx, input }) => {
      return genbaDb.listAssignableUsers(ctx.genbaLink ? ctx.genbaLink.siteId : input?.siteId);
    }),

  /**
   * 現場名簿 (G1): 出面(attendance)からゲスト・アカウント無し従業員も含めて導出し、
   * genba_site_workers へ安定IDを付与して返す。案件未連携の現場は全ユーザーへ
   * フォールバック (linked=false)。連携時は出面に載っている人だけが候補になる。
   */
  siteRoster: genbaProcedure
    .input(z.object({ siteId: genbaIdSchema }))
    .query(async ({ input }) => {
      // genba内上書きを実効役割として同梱 (G3)。UI の種別ラベル/権限selectに使う
      const overrides = new Map((await genbaDb.listGenbaUserRoles()).map((r) => [r.userId, r.role]));
      const effective = (userId: number | null, appRole: string | null) => {
        if (userId == null) return null;
        const ov = overrides.get(userId);
        if (ov && (GENBA_ROLES as readonly string[]).includes(ov)) return ov as GenbaRole;
        return genbaRoleOf(appRole as any);
      };
      const roster = await genbaDb.syncSiteRosterFromAttendance(input.siteId, () => nanoid(21));
      if (roster !== null) {
        return {
          linked: true as const,
          roster: roster.map((r) => ({ ...r, genbaRole: effective(r.userId, r.appRole), roleOverridden: r.userId != null && overrides.has(r.userId) })),
        };
      }
      const all = await genbaDb.listAssignableUsers();
      return {
        linked: false as const,
        roster: all.map((u) => ({
          siteWorkerId: null,
          kind: "registered" as const,
          userId: u.id,
          employeeId: null,
          displayName: u.name || `user#${u.id}`,
          appRole: u.appRole,
          workerRole: "worker",
          genbaRole: effective(u.id, u.appRole),
          roleOverridden: overrides.has(u.id),
        })),
      };
    }),

  /**
   * ダッシュボード用サマリ (G3): 自分が配置されている現場と担当作業数 (未完了/問題)。
   * 担当ゼロの現場は返さない。
   */
  mySummary: genbaProcedure.query(async ({ ctx }) => {
    const sites = await genbaDb.listGenbaSites();
    const result: { siteId: string; siteName: string; taskCount: number; issueCount: number }[] = [];
    for (const site of sites) {
      const { tasks } = await loadSiteTaskContext(site.id);
      const leafIds = tasks.filter((t) => !tasks.some((x) => x.parentTaskId === t.id)).map((t) => t.id);
      const mine = new Set<string>();
      const meId = uid(ctx);
      if (meId == null) continue;
      (await genbaDb.listTaskIdsAssignedToUser(leafIds, meId)).forEach((id) => mine.add(id));
      const myTeams = await myTeamIdsForSite(site.id, meId);
      if (myTeams.size) {
        const taskTeams = await genbaDb.listTaskTeamsByTaskIds(leafIds);
        for (const tt of taskTeams) if (myTeams.has(tt.teamId)) mine.add(tt.taskId);
      }
      const myActive = tasks.filter((t) => mine.has(t.id) && t.status !== "done");
      if (myActive.length === 0) continue;
      result.push({
        siteId: site.id,
        siteName: site.name,
        taskCount: myActive.length,
        issueCount: myActive.filter((t) => t.status === "issue").length,
      });
    }
    return result;
  }),

  /**
   * genba内役割の上書き (G3, admin専用)。role=null で上書き解除 (appRole由来に戻る)。
   * システム全体の権限 (users.appRole) は変更しない。最後の管理者は降格できない。
   */
  setGenbaRole: genbaAdminProcedure
    .input(z.object({ userId: z.number().int().positive(), role: z.enum(["admin", "leader", "worker"]).nullable() }))
    .mutation(async ({ ctx, input }) => {
      // オーナー(appRole=super_admin)の権限は誰からも変更・消去できない
      const targetAppRole = await genbaDb.getUserAppRoleById(input.userId);
      if (targetAppRole === "super_admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "オーナーの権限は変更できません" });
      }
      const countAdmins = async () => {
        const appAdminIds = await genbaDb.listAppAdminUserIds();
        const overrides = new Map((await genbaDb.listGenbaUserRoles()).map((r) => [r.userId, r.role]));
        const set = new Set<number>();
        for (const id of appAdminIds) { const ov = overrides.get(id); if (!ov || ov === "admin") set.add(id); }
        overrides.forEach((role, id) => { if (role === "admin") set.add(id); });
        return set;
      };

      // 事前チェック: 実効adminを降格すると誰も残らない場合は拒否
      const before = await countAdmins();
      const demoting = before.has(input.userId) && input.role !== "admin" && !(input.role === null && (await genbaDb.listAppAdminUserIds()).includes(input.userId));
      if (demoting && before.size <= 1) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "最後の管理者は降格できません" });
      }

      if (input.role === null) await genbaDb.deleteGenbaUserRole(input.userId);
      else await genbaDb.setGenbaUserRole(input.userId, input.role, ctx.user.id);

      // 書き込み後の再チェック (同時降格レース対策): admin が0になっていたら復旧して拒否
      const after = await countAdmins();
      if (after.size === 0) {
        await genbaDb.setGenbaUserRole(input.userId, "admin", ctx.user.id);
        throw new TRPCError({ code: "BAD_REQUEST", message: "最後の管理者は降格できません" });
      }

      await safeGenbaAuditLog(uid(ctx), "genba.users.setGenbaRole", { note: `genba役割を変更: user#${input.userId} → ${input.role ?? "上書き解除"}` });
      return { success: true as const };
    }),
});

// ── board (M3-C): 現在の割当から人別/エリア別を自動生成 ──

const boardRouter = router({
  get: genbaProcedure.input(z.object({ siteId: genbaIdSchema })).query(async ({ input }) => {
    const floors = await genbaDb.listGenbaFloorsBySite(input.siteId);
    const zones = await genbaDb.listGenbaZonesByFloorIds(floors.map((f) => f.id));
    const tasks = await genbaDb.listGenbaTasksByZoneIds(zones.map((z) => z.id));
    const taskIds = tasks.map((t) => t.id);
    const [assignees, taskTeams, teams, users, guestAssignees, siteWorkers] = await Promise.all([
      genbaDb.listTaskAssigneesByTaskIds(taskIds),
      genbaDb.listTaskTeamsByTaskIds(taskIds),
      genbaDb.listGenbaTeamsBySite(input.siteId),
      genbaDb.listAssignableUsers(),
      genbaDb.listGuestAssigneesByTaskIds(taskIds),
      genbaDb.listGenbaSiteWorkersBySite(input.siteId),
    ]);
    const members = await genbaDb.listGenbaTeamMembers(teams.map((t) => t.id));
    return computeBoard({
      floors: floors.map((f) => ({ id: f.id, name: f.name })),
      zones: zones.map((z) => ({ id: z.id, floorId: z.floorId, name: z.name, priority: z.priority, workStatus: z.workStatus })),
      tasks: tasks.map((t) => ({ id: t.id, zoneId: t.zoneId, parentTaskId: t.parentTaskId, name: t.name, romaji: t.romaji, status: t.status })),
      assignees: assignees.map((a) => ({ taskId: a.taskId, userId: a.userId })),
      taskTeams: taskTeams.map((t) => ({ taskId: t.taskId, teamId: t.teamId })),
      members: members.map((m) => ({ teamId: m.teamId, userId: m.userId })),
      users: users.map((u) => ({ id: u.id, name: u.name, appRole: u.appRole })),
      guests: siteWorkers.map((w) => ({ id: w.id, name: w.displayName })),
      guestAssignees: guestAssignees.map((g) => ({ taskId: g.taskId, guestId: g.siteWorkerId })),
    });
  }),
});

// ── instructions (M3-B) ──

/** 指定ユーザーが所属する現場の班IDセット */
async function myTeamIdsForSite(siteId: string, userId: number | null): Promise<Set<string>> {
  if (userId == null) return new Set();
  const teams = await genbaDb.listGenbaTeamsBySite(siteId);
  const members = await genbaDb.listGenbaTeamMembers(teams.map((t) => t.id));
  return new Set(members.filter((m) => m.userId === userId).map((m) => m.teamId));
}

/** 指示が自分宛てか (all / 自分の班 / 自分個人) */
function instructionTargetedTo(inst: { targetKind: string; targetId: string | null }, userId: number | null, myTeamIds: Set<string>): boolean {
  if (userId == null) return inst.targetKind === "all";
  if (inst.targetKind === "all") return true;
  if (inst.targetKind === "team") return !!inst.targetId && myTeamIds.has(inst.targetId);
  if (inst.targetKind === "worker") return inst.targetId === String(userId);
  return false;
}

const instructionsRouter = router({
  /** 自分宛ての指示一覧 (field は全件)。既読フラグ・既読者ID付き */
  listForMe: genbaProcedure.input(z.object({ siteId: genbaIdSchema })).query(async ({ ctx, input }) => {
    const all = await genbaDb.listGenbaInstructionsBySite(input.siteId);
    const myTeamIds = await myTeamIdsForSite(input.siteId, uid(ctx));
    const visible = ctx.genbaRole === "worker"
      ? all.filter((i) => instructionTargetedTo(i, uid(ctx), myTeamIds))
      : all;
    const reads = await genbaDb.listGenbaInstructionReads(visible.map((i) => i.id));
    const readersByInst = new Map<string, number[]>();
    for (const r of reads) { const arr = readersByInst.get(r.instructionId) || []; arr.push(r.userId); readersByInst.set(r.instructionId, arr); }
    return visible
      .map((i) => {
        const readerIds = readersByInst.get(i.id) || [];
        const meId = uid(ctx);
        return { ...i, readerIds, read: meId == null ? true : readerIds.includes(meId), mine: instructionTargetedTo(i, meId, myTeamIds) };
      })
      .reverse(); // 新しい順
  }),

  /** 自分宛ての未読件数 */
  unreadCount: genbaProcedure.input(z.object({ siteId: genbaIdSchema })).query(async ({ ctx, input }) => {
    if (uid(ctx) == null) return 0; // ゲストリンク: 既読を保持できないためバッジは出さない
    const all = await genbaDb.listGenbaInstructionsBySite(input.siteId);
    const myTeamIds = await myTeamIdsForSite(input.siteId, uid(ctx));
    const mine = all.filter((i) => instructionTargetedTo(i, uid(ctx), myTeamIds));
    const reads = await genbaDb.listGenbaInstructionReads(mine.map((i) => i.id));
    const readSet = new Set(reads.filter((r) => r.userId === uid(ctx)).map((r) => r.instructionId));
    return mine.filter((i) => !readSet.has(i.id)).length;
  }),

  create: genbaFieldProcedure
    .input(z.object({
      id: genbaIdSchema.optional(),
      siteId: genbaIdSchema,
      text: z.string().trim().min(1),
      targetKind: z.enum(["all", "team", "worker"]).default("all"),
      targetId: z.string().trim().max(24).nullish(),
      zoneId: genbaIdSchema.nullish(),
    }))
    .mutation(async ({ ctx, input }) => {
      if ((input.targetKind === "team" || input.targetKind === "worker") && !input.targetId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "対象を指定してください" });
      }
      const id = input.id ?? nanoid(21);
      const inst = await genbaDb.createGenbaInstruction({
        id, siteId: input.siteId, text: input.text,
        targetKind: input.targetKind, targetId: input.targetId ?? null,
        zoneId: input.zoneId ?? null, byUserId: uid(ctx),
      });
      await safeGenbaAuditLog(uid(ctx), "genba.instructions.create", { entityId: id, note: `指示を送信 (${input.targetKind})` });
      return inst;
    }),

  /** 現場入力: 既読は worker も可 */
  markRead: genbaProcedure.input(z.object({ instructionId: genbaIdSchema })).mutation(async ({ ctx, input }) => {
    const inst = await genbaDb.getGenbaInstructionById(input.instructionId);
    if (!inst) throw new TRPCError({ code: "NOT_FOUND", message: "指示が見つかりません" });
    const meId = uid(ctx);
    if (meId == null) return { success: true as const }; // ゲストは既読を保持しない
    await genbaDb.addGenbaInstructionRead({ id: nanoid(21), instructionId: input.instructionId, userId: meId });
    return { success: true as const };
  }),
});

/** Σ集計の期間境界を求める (today=本日0時 / week=今週月曜0時 / all=null) */
function materialAggBoundary(period: "today" | "week" | "all"): Date | null {
  if (period === "all") return null;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  if (period === "week") start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return start;
}

const materialsRouter = router({
  /** 依頼一覧 (明細を items として同梱, 新しい順) */
  listRequests: genbaProcedure.input(z.object({ siteId: genbaIdSchema })).query(async ({ input }) => {
    const requests = await genbaDb.listGenbaMaterialRequestsBySite(input.siteId);
    const items = await genbaDb.listGenbaMaterialRequestItems(requests.map((r) => r.id));
    const byReq = new Map<string, typeof items>();
    for (const it of items) { const arr = byReq.get(it.requestId) || []; arr.push(it); byReq.set(it.requestId, arr); }
    return requests.map((r) => ({
      ...r,
      items: (byReq.get(r.id) || []).map((it) => ({ id: it.id, name: it.name, qty: it.qty, unit: it.unit })),
    }));
  }),

  /** 現場入力: 資材依頼は worker も可 */
  createRequest: genbaProcedure
    .input(z.object({
      id: genbaIdSchema.optional(),
      siteId: genbaIdSchema,
      note: z.string().max(500).optional(),
      items: z.array(z.object({
        name: z.string().trim().min(1).max(200),
        qty: z.number().int().positive(),
        unit: z.string().max(8).optional(),
      })).min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const site = await genbaDb.getGenbaSiteById(input.siteId);
      if (!site) throw new TRPCError({ code: "NOT_FOUND", message: "現場が見つかりません" });
      const id = input.id ?? nanoid(21);
      const items = input.items.map((it) => ({
        id: nanoid(21),
        requestId: id,
        name: it.name,
        qty: it.qty,
        unit: it.unit || "個",
      }));
      const request = await genbaDb.createGenbaMaterialRequest(
        { id, siteId: input.siteId, byUserId: uid(ctx), status: "pending", note: input.note?.trim() || null },
        items,
      );
      await safeGenbaAuditLog(uid(ctx), "genba.materials.createRequest", { entityId: id, note: `資材依頼 (${items.length}品目, ${site.name})` });
      // 学習ログ: カタログ外(自由入力)判定して記録
      for (const it of items) {
        await safeGenbaActivity("material", uid(ctx), { siteId: input.siteId, name: it.name, qty: it.qty, unit: it.unit, freeInput: !CATALOG_LABELS.has(it.name) });
      }
      return request ? { ...request, items: items.map((it) => ({ id: it.id, name: it.name, qty: it.qty, unit: it.unit })) } : null;
    }),

  /** ステータス進行 (依頼中→発注済→納品済)。orderedAt/deliveredAt を打刻 */
  updateRequestStatus: genbaFieldProcedure
    .input(z.object({ id: genbaIdSchema, status: z.enum(["pending", "ordered", "delivered"]) }))
    .mutation(async ({ ctx, input }) => {
      const existing = await genbaDb.getGenbaMaterialRequestById(input.id);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "依頼が見つかりません" });
      assertLinkSiteId(ctx, existing.siteId);
      const now = new Date();
      const patch: { status: "pending" | "ordered" | "delivered"; orderedAt?: Date; deliveredAt?: Date } = { status: input.status };
      if (input.status === "ordered" && !existing.orderedAt) patch.orderedAt = now;
      if (input.status === "delivered" && !existing.deliveredAt) patch.deliveredAt = now;
      const request = await genbaDb.updateGenbaMaterialRequest(input.id, patch);
      await safeGenbaAuditLog(uid(ctx), "genba.materials.updateStatus", { entityId: input.id, note: `資材依頼を${input.status}に変更` });
      return request;
    }),

  /** 依頼の取り消し: 自分の依頼中のみ (field は任意の依頼を取り消せる) */
  cancelRequest: genbaProcedure
    .input(z.object({ id: genbaIdSchema }))
    .mutation(async ({ ctx, input }) => {
      const existing = await genbaDb.getGenbaMaterialRequestById(input.id);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "依頼が見つかりません" });
      assertLinkSiteId(ctx, existing.siteId);
      const isField = ctx.genbaRole !== "worker";
      const meId = uid(ctx);
      if (!isField && !(meId != null && existing.byUserId === meId && existing.status === "pending")) {
        throw new TRPCError({ code: "FORBIDDEN", message: "この依頼は取り消せません" });
      }
      await genbaDb.deleteGenbaMaterialRequestCascade(input.id);
      await safeGenbaAuditLog(uid(ctx), "genba.materials.cancelRequest", { entityId: input.id, note: "資材依頼を取り消し" });
      return { success: true as const };
    }),

  /** Σ集計 (発注用・field): name×unit で数量合計。DB側 GROUP BY */
  aggregate: genbaFieldProcedure
    .input(z.object({ siteId: genbaIdSchema, period: z.enum(["today", "week", "all"]).default("week"), pendingOnly: z.boolean().default(true) }))
    .query(async ({ input }) => {
      const rows = await genbaDb.aggregateGenbaMaterials(input.siteId, materialAggBoundary(input.period), input.pendingOnly);
      return { period: input.period, pendingOnly: input.pendingOnly, rows };
    }),

  /** プリセット一覧 (siteId 指定で 共通(null)+その現場) */
  listPresets: genbaProcedure.input(z.object({ siteId: genbaIdSchema.nullish() }).optional()).query(async ({ input }) => {
    return genbaDb.listGenbaMaterialPresets(input?.siteId ?? null);
  }),

  /** プリセットの作成/更新 (id 指定で更新) */
  savePreset: genbaFieldProcedure
    .input(z.object({
      id: genbaIdSchema.optional(),
      siteId: genbaIdSchema.nullish(),
      workName: z.string().trim().min(1).max(120),
      parts: z.array(z.string().trim().min(1).max(200)).min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      if (input.id) {
        const existing = await genbaDb.getGenbaMaterialPresetById(input.id);
        if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "プリセットが見つかりません" });
        assertLinkSiteId(ctx, existing.siteId);
        const preset = await genbaDb.updateGenbaMaterialPreset(input.id, { workName: input.workName, parts: input.parts });
        await safeGenbaAuditLog(uid(ctx), "genba.materials.savePreset", { entityId: input.id, note: `プリセットを更新: ${input.workName}` });
        return preset;
      }
      if (ctx.genbaLink && (input.siteId ?? null) !== ctx.genbaLink.siteId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "この現場のリンクでは操作できません" });
      }
      const id = nanoid(21);
      const preset = await genbaDb.createGenbaMaterialPreset({ id, siteId: input.siteId ?? null, workName: input.workName, parts: input.parts });
      await safeGenbaAuditLog(uid(ctx), "genba.materials.savePreset", { entityId: id, note: `プリセットを作成: ${input.workName}` });
      return preset;
    }),

  removePreset: genbaFieldProcedure
    .input(z.object({ id: genbaIdSchema }))
    .mutation(async ({ ctx, input }) => {
      const existing = await genbaDb.getGenbaMaterialPresetById(input.id);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "プリセットが見つかりません" });
      assertLinkSiteId(ctx, existing.siteId);
      await genbaDb.deleteGenbaMaterialPreset(input.id);
      await safeGenbaAuditLog(uid(ctx), "genba.materials.removePreset", { entityId: input.id, note: `プリセットを削除: ${existing.workName}` });
      return { success: true as const };
    }),
});

// 作業テンプレートのツリー入力 (最大3階層)
const templateNodeSchema: z.ZodType<{ name: string; romaji?: string; children?: any[] }> = z.lazy(() =>
  z.object({
    name: z.string().trim().min(1).max(200),
    romaji: z.string().max(200).optional(),
    children: z.array(templateNodeSchema).optional(),
  }),
);

function flattenTemplateTree(nodes: { name: string; romaji?: string; children?: any[] }[], parentId: string | null, out: any[] = []): any[] {
  let order = 0;
  for (const n of nodes) {
    const id = nanoid(21);
    out.push({ id, parentId, name: n.name, romaji: n.romaji ?? null, sortOrder: order++ });
    if (n.children?.length) flattenTemplateTree(n.children, id, out);
  }
  return out;
}

const templatesRouter = router({
  /** 現在の作業テンプレート (ツリー)。未設定なら既定テンプレートを返す */
  get: genbaProcedure.query(async () => {
    const rows = await genbaDb.listGenbaTaskTemplates();
    if (rows.length === 0) return { tree: DEFAULT_TEMPLATE_DATA, isDefault: true as const };
    return {
      tree: buildTemplateTree(rows.map((r) => ({ id: r.id, parentId: r.parentId, name: r.name, romaji: r.romaji, sortOrder: r.sortOrder }))),
      isDefault: false as const,
    };
  }),

  /** テンプレートツリーを丸ごと保存 (置き換え) */
  saveTree: genbaStaffFieldProcedure
    .input(z.object({ tree: z.array(templateNodeSchema) }))
    .mutation(async ({ ctx, input }) => {
      const rows = flattenTemplateTree(input.tree, null);
      await genbaDb.replaceGenbaTaskTemplates(rows);
      await safeGenbaAuditLog(uid(ctx), "genba.templates.saveTree", { note: `テンプレートを更新 (${rows.length}項目)` });
      return { success: true as const, count: rows.length };
    }),
});

const shareScopesSchema = z.array(z.enum(SHARE_SCOPES)).min(1, "公開範囲を1つ以上選択してください");

const sharesRouter = router({
  /** 共有リンク一覧 (field)。token を含むので URL 生成に使える */
  list: genbaStaffFieldProcedure.input(z.object({ siteId: genbaIdSchema })).query(async ({ input }) => {
    return genbaDb.listGenbaSharesBySite(input.siteId);
  }),

  /** 共有リンク作成 (field)。token を生成し、scopes/expiresAt を保存 */
  create: genbaStaffFieldProcedure
    .input(z.object({
      siteId: genbaIdSchema,
      name: z.string().trim().min(1).max(120),
      scopes: shareScopesSchema,
      expiresAt: z.string().datetime().nullish(),
    }))
    .mutation(async ({ ctx, input }) => {
      const site = await genbaDb.getGenbaSiteById(input.siteId);
      if (!site) throw new TRPCError({ code: "NOT_FOUND", message: "現場が見つかりません" });
      const id = nanoid(21);
      const token = nanoid(32);
      const share = await genbaDb.createGenbaShare({
        id, siteId: input.siteId, name: input.name, token,
        scopes: input.scopes,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      });
      await safeGenbaAuditLog(uid(ctx), "genba.shares.create", { entityId: id, note: `共有リンクを作成: ${input.name} [${input.scopes.join(",")}]` });
      return share;
    }),

  /** 共有リンクの失効 (field) */
  revoke: genbaStaffFieldProcedure
    .input(z.object({ id: genbaIdSchema }))
    .mutation(async ({ ctx, input }) => {
      const existing = await genbaDb.getGenbaShareById(input.id);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "共有リンクが見つかりません" });
      await genbaDb.deleteGenbaShare(input.id);
      await safeGenbaAuditLog(uid(ctx), "genba.shares.revoke", { entityId: input.id, note: `共有リンクを失効: ${existing.name}` });
      return { success: true as const };
    }),

  /**
   * ★非認証★ 公開ビュー。token のみでアクセス可能 (ログイン不要)。
   * 期限切れ・不正 token は NOT_FOUND (存在を明かさない)。
   * 返すデータは buildShareView がホワイトリストでサニタイズ (社内メモ/Drive/予算/担当者を含めない)。
   */
  publicView: publicProcedure
    .input(z.object({ token: z.string().min(1).max(64) }))
    .query(async ({ input }) => {
      assertGenbaEnabled();
      const notFound = () => new TRPCError({ code: "NOT_FOUND", message: "共有リンクが見つからないか、期限切れです" });
      const share = await genbaDb.getGenbaShareByToken(input.token);
      if (!share) throw notFound();
      if (share.expiresAt && new Date(share.expiresAt).getTime() < Date.now()) throw notFound();
      const site = await genbaDb.getGenbaSiteById(share.siteId);
      if (!site || site.archived) throw notFound();

      const graph = await genbaDb.collectSiteGraph(share.siteId);
      const scopes = share.scopes;
      // 図面画像は map スコープのときだけ署名 URL を付与
      const floors = scopes.includes("map")
        ? await withFloorImageUrls(graph.floors)
        : graph.floors.map((f) => ({ ...f, imageUrl: null }));

      return buildShareView({
        scopes,
        site: { name: site.name }, // driveUrl は渡さない
        floors: floors.map((f) => ({ id: f.id, name: f.name, w: f.w, h: f.h, imageUrl: (f as any).imageUrl ?? null })),
        zones: graph.zones.map((z) => ({ id: z.id, floorId: z.floorId, parentZoneId: z.parentZoneId, name: z.name, polygon: z.polygon, priority: z.priority, workStatus: z.workStatus })),
        tasks: graph.tasks.map((t) => ({ id: t.id, zoneId: t.zoneId, parentTaskId: t.parentTaskId, name: t.name, romaji: t.romaji, status: t.status, percent: t.percent, dueDate: t.dueDate })),
      });
    }),
});

const ymdSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日付は YYYY-MM-DD 形式");

/** timestamp を YYYY-MM-DD へ (工期初期値の提案用) */
function toYmd(d: Date | null): string | null {
  if (!d) return null;
  const t = new Date(d);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

const budgetsRouter = router({
  /** 予算トラッカーは admin 専用。予算行 + 連携プロジェクトの工期ヒントを返す */
  get: genbaAdminProcedure.input(z.object({ siteId: genbaIdSchema })).query(async ({ input }) => {
    const site = await genbaDb.getGenbaSiteById(input.siteId);
    if (!site) throw new TRPCError({ code: "NOT_FOUND", message: "現場が見つかりません" });
    const budget = await genbaDb.getGenbaBudget(input.siteId);
    let project: { id: number; name: string; startDate: string | null; endDate: string | null } | null = null;
    if (site.projectId) {
      const p = await genbaDb.getProjectPeriod(site.projectId);
      if (p) project = { id: p.id, name: p.name, startDate: toYmd(p.startDate), endDate: toYmd(p.endDate) };
    }
    return { budget, projectId: site.projectId ?? null, project };
  }),

  /** 予算設定の保存 (upsert) */
  save: genbaAdminProcedure
    .input(z.object({
      siteId: genbaIdSchema,
      enabled: z.boolean().optional(),
      contractAmount: z.number().int().min(0).optional(),
      targetType: z.enum(["percent", "amount"]).optional(),
      targetValue: z.number().int().min(0).optional(),
      costPerManDay: z.number().int().min(0).optional(),
      monthlyExpense: z.number().int().min(0).optional(),
      periodStart: ymdSchema.nullish(),
      periodEnd: ymdSchema.nullish(),
      preManDays: z.number().min(0).optional(),
      attendanceSource: z.enum(["manual", "project"]).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const site = await genbaDb.getGenbaSiteById(input.siteId);
      if (!site) throw new TRPCError({ code: "NOT_FOUND", message: "現場が見つかりません" });
      const patch: Record<string, unknown> = {};
      for (const k of ["enabled", "contractAmount", "targetType", "targetValue", "costPerManDay", "monthlyExpense", "attendanceSource"] as const) {
        if (input[k] !== undefined) patch[k] = input[k];
      }
      if (input.periodStart !== undefined) patch.periodStart = input.periodStart;
      if (input.periodEnd !== undefined) patch.periodEnd = input.periodEnd;
      // decimal 列は文字列で保存 (drizzle decimal)
      if (input.preManDays !== undefined) patch.preManDays = input.preManDays.toFixed(1);
      const budget = await genbaDb.upsertGenbaBudget(input.siteId, patch);
      await safeGenbaAuditLog(uid(ctx), "genba.budgets.save", { entityId: input.siteId, note: `予算設定を保存 (${site.name})` });
      return budget;
    }),

  /** 手入力の出面 (人工) を1件追加 */
  addManualAttendance: genbaAdminProcedure
    .input(z.object({ siteId: genbaIdSchema, date: ymdSchema, manDays: z.number().min(0) }))
    .mutation(async ({ ctx, input }) => {
      const id = nanoid(21);
      const row = await genbaDb.addGenbaBudgetAttendance({ id, siteId: input.siteId, date: input.date, manDays: input.manDays.toFixed(1) });
      await safeGenbaAuditLog(uid(ctx), "genba.budgets.addManualAttendance", { entityId: id, note: `出面 ${input.date}: ${input.manDays}人工` });
      return row ? { ...row, manDays: Number(row.manDays) } : null;
    }),

  removeManualAttendance: genbaAdminProcedure
    .input(z.object({ id: genbaIdSchema }))
    .mutation(async ({ ctx, input }) => {
      const existing = await genbaDb.getGenbaBudgetAttendanceById(input.id);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "出面記録が見つかりません" });
      await genbaDb.deleteGenbaBudgetAttendance(input.id);
      await safeGenbaAuditLog(uid(ctx), "genba.budgets.removeManualAttendance", { entityId: input.id, note: "出面記録を削除" });
      return { success: true as const };
    }),

  listManualAttendance: genbaAdminProcedure.input(z.object({ siteId: genbaIdSchema })).query(async ({ input }) => {
    return genbaDb.listGenbaBudgetAttendance(input.siteId);
  }),

  /**
   * 予算サマリー計算。attendanceSource=project かつ 現場に projectId があれば
   * 既存 attendance を SUM(hoursWorked)/80.0 で集計、それ以外は手入力を集計。
   */
  summary: genbaAdminProcedure.input(z.object({ siteId: genbaIdSchema })).query(async ({ input }) => {
    const site = await genbaDb.getGenbaSiteById(input.siteId);
    if (!site) throw new TRPCError({ code: "NOT_FOUND", message: "現場が見つかりません" });
    const budget = await genbaDb.getGenbaBudget(input.siteId);
    if (!budget || !budget.enabled) {
      return { enabled: false as const, source: budget?.attendanceSource ?? "manual", attendanceManDays: 0, calc: null, budget, effectivePeriodStart: null, effectivePeriodEnd: null, periodFromProject: false };
    }
    // 連携案件の工期を工期のフォールバックに使う (予算側の工期が未入力でも「連携」で逆算できるように)。
    // 出面(project集計)も同じ実効工期で集計する。
    let projStart: string | null = null, projEnd: string | null = null;
    if (site.projectId) {
      const p = await genbaDb.getProjectPeriod(site.projectId);
      if (p) { projStart = toYmd(p.startDate); projEnd = toYmd(p.endDate); }
    }
    const effStart = budget.periodStart || projStart;
    const effEnd = budget.periodEnd || projEnd;
    const periodFromProject = (!budget.periodStart && !!projStart) || (!budget.periodEnd && !!projEnd);
    const useProject = budget.attendanceSource === "project" && !!site.projectId;
    const attendanceManDays = useProject
      ? await genbaDb.sumProjectAttendanceManDays(site.projectId!, effStart, effEnd)
      : await genbaDb.sumManualBudgetManDays(input.siteId);
    const calc = computeBudget({
      contractAmount: budget.contractAmount,
      targetType: budget.targetType,
      targetValue: budget.targetValue,
      costPerManDay: budget.costPerManDay,
      monthlyExpense: budget.monthlyExpense,
      periodStart: effStart,
      periodEnd: effEnd,
      preManDays: budget.preManDays,
      attendanceManDays,
      now: new Date(),
    });
    return { enabled: true as const, source: useProject ? "project" as const : "manual" as const, attendanceManDays, calc, budget, effectivePeriodStart: effStart, effectivePeriodEnd: effEnd, periodFromProject };
  }),
});

const logsRouter = router({
  /** 利用ログの一覧 (field・直近 limit 件) */
  list: genbaFieldProcedure
    .input(z.object({ type: z.string().max(24).optional(), limit: z.number().int().min(1).max(200).default(50) }).optional())
    .query(async ({ input }) => {
      return genbaDb.listGenbaActivityLogs(input?.type, input?.limit ?? 50);
    }),

  /** 学習と改善提案 (field)。利用ログ + 現場のタスク/テンプレ/ゾーン/プリセットから集計 */
  insights: genbaFieldProcedure
    .input(z.object({ siteId: genbaIdSchema }))
    .query(async ({ input }) => {
      const logs = await genbaDb.listGenbaActivityLogs(undefined, 1000);
      const graph = await genbaDb.collectSiteGraph(input.siteId);
      const templateRows = await genbaDb.listGenbaTaskTemplates();
      const parentIds = new Set(templateRows.map((r) => r.parentId).filter((p): p is string => !!p));
      const templateLeafNames = templateRows.filter((r) => !parentIds.has(r.id)).map((r) => r.name);
      const presets = await genbaDb.listGenbaMaterialPresets(input.siteId);
      return computeInsights({
        logs: logs.map((l) => ({ type: l.type, payload: l.payload })),
        taskNames: graph.tasks.map((t) => t.name),
        templateLeafNames,
        zones: graph.zones.map((z) => ({ id: z.id, name: z.name })),
        presetLabels: presets.flatMap((p) => p.parts),
        siteId: input.siteId,
      });
    }),
});

// ── dispatches (今日の急ぎ手配): エリア→作業→作業員→メモ ──

const ymdOptSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日付は YYYY-MM-DD 形式");

const dispatchesRouter = router({
  /** 現場の急ぎ手配一覧 (date 指定でその日のみ)。エリア名・作業名・担当を同梱 */
  list: genbaProcedure
    .input(z.object({ siteId: genbaIdSchema, date: ymdOptSchema.optional() }))
    .query(async ({ input }) => {
      const dispatches = await genbaDb.listGenbaDispatchesBySite(input.siteId, input.date);
      const assignees = await genbaDb.listGenbaDispatchAssignees(dispatches.map((d) => d.id));
      const byDispatch = new Map<string, number[]>();
      for (const a of assignees) { const arr = byDispatch.get(a.dispatchId) || []; arr.push(a.userId); byDispatch.set(a.dispatchId, arr); }
      // エリア名・作業名を解決
      const floors = await genbaDb.listGenbaFloorsBySite(input.siteId);
      const zones = await genbaDb.listGenbaZonesByFloorIds(floors.map((f) => f.id));
      const zoneName = new Map(zones.map((z) => [z.id, z.name]));
      const tasks = await genbaDb.listGenbaTasksByZoneIds(zones.map((z) => z.id));
      const taskName = new Map(tasks.map((t) => [t.id, t.name]));
      return dispatches.map((d) => ({
        id: d.id, siteId: d.siteId, zoneId: d.zoneId, taskId: d.taskId, date: d.date,
        memo: d.memo, byUserId: d.byUserId, done: d.done, createdAt: d.createdAt,
        zoneName: zoneName.get(d.zoneId) ?? "?", taskName: taskName.get(d.taskId) ?? "?",
        assigneeIds: byDispatch.get(d.id) || [],
      }));
    }),

  /** 急ぎ手配を作成 (field): エリア・作業・担当作業員・メモ・対象日 */
  create: genbaFieldProcedure
    .input(z.object({
      siteId: genbaIdSchema,
      zoneId: genbaIdSchema,
      taskId: genbaIdSchema,
      date: ymdOptSchema.optional(),
      memo: z.string().max(1000).optional(),
      userIds: z.array(z.number().int().positive()).min(1, "作業員を1名以上選択してください"),
    }))
    .mutation(async ({ ctx, input }) => {
      const site = await genbaDb.getGenbaSiteById(input.siteId);
      if (!site) throw new TRPCError({ code: "NOT_FOUND", message: "現場が見つかりません" });
      const task = await genbaDb.getGenbaTaskById(input.taskId);
      if (!task || task.zoneId !== input.zoneId) throw new TRPCError({ code: "BAD_REQUEST", message: "作業とエリアが一致しません" });
      const id = nanoid(21);
      const date = input.date ?? toYmd(new Date())!;
      const uniqueIds = Array.from(new Set(input.userIds));
      const assignees = uniqueIds.map((userId) => ({ id: nanoid(21), dispatchId: id, userId }));
      const dispatch = await genbaDb.createGenbaDispatch(
        { id, siteId: input.siteId, zoneId: input.zoneId, taskId: input.taskId, date, memo: input.memo?.trim() || null, byUserId: uid(ctx), done: false },
        assignees,
      );
      await safeGenbaAuditLog(uid(ctx), "genba.dispatches.create", { entityId: id, note: `急ぎ手配 ${date}: ${task.name} → ${uniqueIds.length}名` });
      return dispatch ? { ...dispatch, assigneeIds: uniqueIds } : null;
    }),

  /** 対応済み/未対応のトグル (field または担当作業員本人) */
  setDone: genbaProcedure
    .input(z.object({ id: genbaIdSchema, done: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await genbaDb.getGenbaDispatchById(input.id);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "手配が見つかりません" });
      assertLinkSiteId(ctx, existing.siteId);
      if (ctx.genbaRole === "worker") {
        const assignees = await genbaDb.listGenbaDispatchAssignees([input.id]);
        if (!assignees.some((a) => a.userId === uid(ctx))) {
          throw new TRPCError({ code: "FORBIDDEN", message: "自分の手配のみ更新できます" });
        }
      }
      const dispatch = await genbaDb.updateGenbaDispatch(input.id, { done: input.done });
      await safeGenbaAuditLog(uid(ctx), "genba.dispatches.setDone", { entityId: input.id, note: input.done ? "対応済み" : "未対応へ戻す" });
      return dispatch;
    }),

  /** 手配の削除 (field) */
  remove: genbaFieldProcedure
    .input(z.object({ id: genbaIdSchema }))
    .mutation(async ({ ctx, input }) => {
      const existing = await genbaDb.getGenbaDispatchById(input.id);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "手配が見つかりません" });
      assertLinkSiteId(ctx, existing.siteId);
      await genbaDb.deleteGenbaDispatchCascade(input.id);
      await safeGenbaAuditLog(uid(ctx), "genba.dispatches.remove", { entityId: input.id, note: "急ぎ手配を削除" });
      return { success: true as const };
    }),
});

// ── worker links (G2 作業員専用リンク) ──

type ResolvedWorkerLink =
  | { ok: false; reason: "invalid" | "disabled" | "expired" }
  | { ok: true; link: NonNullable<Awaited<ReturnType<typeof genbaDb.getGenbaWorkerLinkByToken>>>; worker: NonNullable<Awaited<ReturnType<typeof genbaDb.getGenbaSiteWorkerById>>>; site: NonNullable<Awaited<ReturnType<typeof genbaDb.getGenbaSiteById>>> };

/** トークン→リンク解決。無効化(ソフト)は disabled、期限切れは expired、それ以外の不備は invalid */
async function resolveWorkerLink(token: string): Promise<ResolvedWorkerLink> {
  const link = await genbaDb.getGenbaWorkerLinkByToken(token);
  if (!link) return { ok: false, reason: "invalid" };
  if (!link.active) return { ok: false, reason: "disabled" };
  if (link.expiresAt && link.expiresAt.getTime() < Date.now()) return { ok: false, reason: "expired" };
  const worker = await genbaDb.getGenbaSiteWorkerById(link.siteWorkerId);
  const site = worker ? await genbaDb.getGenbaSiteById(worker.siteId) : null;
  if (!worker || !site || site.archived) return { ok: false, reason: "invalid" };
  return { ok: true, link, worker, site };
}

/** リンク主体が更新できるタスクID集合 (worker=自分の担当のみ / leader=現場全葉タスク) */
async function workerLinkEditableTaskIds(
  resolved: Extract<ResolvedWorkerLink, { ok: true }>,
  siteTasks: { id: string; parentTaskId: string | null }[],
): Promise<Set<string>> {
  const leafIds = siteTasks.filter((t) => !siteTasks.some((x) => x.parentTaskId === t.id)).map((t) => t.id);
  if (resolved.link.role === "leader") return new Set(leafIds);
  const own = new Set<string>();
  const guestSet = await genbaDb.listTaskIdsAssignedToGuest(leafIds, resolved.worker.id);
  guestSet.forEach((id) => own.add(id));
  if (resolved.worker.userId != null) {
    const direct = await genbaDb.listTaskIdsAssignedToUser(leafIds, resolved.worker.userId);
    direct.forEach((id) => own.add(id));
    const myTeams = await myTeamIdsForSite(resolved.site.id, resolved.worker.userId);
    if (myTeams.size) {
      const taskTeams = await genbaDb.listTaskTeamsByTaskIds(leafIds);
      for (const tt of taskTeams) if (myTeams.has(tt.teamId)) own.add(tt.taskId);
    }
  }
  return own;
}

/** 現場の全タスク (フロア→ゾーン→タスク) とゾーン索引をまとめて取得 */
async function loadSiteTaskContext(siteId: string) {
  const floors = await genbaDb.listGenbaFloorsBySite(siteId);
  const zones = await genbaDb.listGenbaZonesByFloorIds(floors.map((f) => f.id));
  const tasks = await genbaDb.listGenbaTasksByZoneIds(zones.map((z) => z.id));
  const zoneById = new Map(zones.map((z) => [z.id, z]));
  return { floors, zones, tasks, zoneById };
}

/** 管理: リンクの発行/一覧/失効/有効化/再発行/削除 (field=リーダー以上) */
const workerLinksRouter = router({
  /** 現場のリンク一覧 (名簿情報つき)。token も返す (管理画面のコピー用) */
  list: genbaStaffFieldProcedure.input(z.object({ siteId: genbaIdSchema })).query(async ({ input }) => {
    const links = await genbaDb.listGenbaWorkerLinksBySite(input.siteId);
    const workers = await genbaDb.listGenbaSiteWorkersByIds(links.map((l) => l.siteWorkerId));
    const byId = new Map(workers.map((w) => [w.id, w]));
    return links.map((l) => {
      const w = byId.get(l.siteWorkerId);
      return {
        id: l.id, siteWorkerId: l.siteWorkerId, token: l.token, role: l.role, active: l.active,
        expiresAt: l.expiresAt, lastAccessAt: l.lastAccessAt, createdAt: l.createdAt,
        displayName: w?.displayName ?? "?", kind: w?.kind ?? "guest", userId: w?.userId ?? null,
      };
    });
  }),

  /** 発行/再発行: 名簿行に1本。既存があれば token を差し替えて有効化 (旧URLは即無効) */
  issue: genbaStaffFieldProcedure
    .input(z.object({
      siteWorkerId: genbaIdSchema,
      role: z.enum(["worker", "leader"]).optional(),
      /** 有効期限 (日数)。null/省略で無期限 */
      expiresDays: z.number().int().min(1).max(365).nullish(),
    }))
    .mutation(async ({ ctx, input }) => {
      const worker = await genbaDb.getGenbaSiteWorkerById(input.siteWorkerId);
      if (!worker) throw new TRPCError({ code: "NOT_FOUND", message: "作業員が名簿に見つかりません" });
      const existing = await genbaDb.getGenbaWorkerLinkBySiteWorker(input.siteWorkerId);
      // 権限の変更は admin のみ。それ以外は既存リンク or 名簿の役割を引き継ぐ (再発行で権限が変わらない)
      const fallback = (existing?.role === "leader" || (worker as any).role === "leader") ? "leader" as const : "worker" as const;
      const role = ctx.genbaRole === "admin" && input.role ? input.role : fallback;
      const token = nanoid(32);
      const expiresAt = input.expiresDays ? new Date(Date.now() + input.expiresDays * 86400000) : null;
      let link;
      if (existing) {
        link = await genbaDb.updateGenbaWorkerLink(existing.id, { token, role, active: true, expiresAt });
      } else {
        link = await genbaDb.createGenbaWorkerLink({
          id: nanoid(21), siteId: worker.siteId, siteWorkerId: worker.id,
          token, role, active: true, expiresAt, createdByUserId: uid(ctx),
        });
      }
      await safeGenbaAuditLog(uid(ctx), "genba.workerLinks.issue", { entityId: link?.id, note: `作業員リンクを${existing ? "再発行" : "発行"}: ${worker.displayName} (${role})` });
      return link;
    }),

  /** 名簿の役割変更 (admin専用): ゲスト等の現場内役割。既存リンクの権限も同期する */
  setWorkerRole: genbaAdminProcedure
    .input(z.object({ siteWorkerId: genbaIdSchema, role: z.enum(["worker", "leader"]) }))
    .mutation(async ({ ctx, input }) => {
      const worker = await genbaDb.getGenbaSiteWorkerById(input.siteWorkerId);
      if (!worker) throw new TRPCError({ code: "NOT_FOUND", message: "作業員が名簿に見つかりません" });
      await genbaDb.updateGenbaSiteWorkerRole(input.siteWorkerId, input.role);
      const link = await genbaDb.getGenbaWorkerLinkBySiteWorker(input.siteWorkerId);
      if (link) await genbaDb.updateGenbaWorkerLink(link.id, { role: input.role });
      await safeGenbaAuditLog(ctx.user.id, "genba.workerLinks.setWorkerRole", { entityId: input.siteWorkerId, note: `現場内役割を変更: ${worker.displayName} → ${input.role}` });
      return { success: true as const };
    }),

  /** ゲスト(現場名簿)の表示名を修正 (打ち間違い訂正用, field=leader+)。ゲストのみ対象 */
  renameWorker: genbaStaffFieldProcedure
    .input(z.object({ siteWorkerId: genbaIdSchema, displayName: z.string().trim().min(1).max(128) }))
    .mutation(async ({ ctx, input }) => {
      const worker = await genbaDb.getGenbaSiteWorkerById(input.siteWorkerId);
      if (!worker) throw new TRPCError({ code: "NOT_FOUND", message: "作業員が名簿に見つかりません" });
      if (worker.kind !== "guest") throw new TRPCError({ code: "BAD_REQUEST", message: "登録アカウントの氏名はここでは変更できません（ゲストのみ）" });
      await genbaDb.updateGenbaSiteWorkerName(input.siteWorkerId, input.displayName);
      await safeGenbaAuditLog(ctx.user.id, "genba.workerLinks.renameWorker", { entityId: input.siteWorkerId, note: `ゲスト名を修正: ${worker.displayName} → ${input.displayName}` });
      return { success: true as const };
    }),

  /** 無効化 / 有効化 (ソフト。トークンはそのまま) */
  setActive: genbaStaffFieldProcedure
    .input(z.object({ id: genbaIdSchema, active: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await genbaDb.getGenbaWorkerLinkById(input.id);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "リンクが見つかりません" });
      const link = await genbaDb.updateGenbaWorkerLink(input.id, { active: input.active });
      const worker = await genbaDb.getGenbaSiteWorkerById(existing.siteWorkerId);
      await safeGenbaAuditLog(uid(ctx), "genba.workerLinks.setActive", { entityId: input.id, note: `作業員リンクを${input.active ? "有効化" : "無効化"}: ${worker?.displayName ?? existing.siteWorkerId}` });
      return link;
    }),

  /** リンク権限の変更 (worker/leader, admin専用)。名簿の役割も同期して再発行時に維持する */
  setRole: genbaAdminProcedure
    .input(z.object({ id: genbaIdSchema, role: z.enum(["worker", "leader"]) }))
    .mutation(async ({ ctx, input }) => {
      const existing = await genbaDb.getGenbaWorkerLinkById(input.id);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "リンクが見つかりません" });
      const link = await genbaDb.updateGenbaWorkerLink(input.id, { role: input.role });
      await genbaDb.updateGenbaSiteWorkerRole(existing.siteWorkerId, input.role);
      await safeGenbaAuditLog(uid(ctx), "genba.workerLinks.setRole", { entityId: input.id, note: `作業員リンクの権限を${input.role}へ変更` });
      return link;
    }),

  /** リストから完全消去 (物理削除) */
  remove: genbaStaffFieldProcedure
    .input(z.object({ id: genbaIdSchema }))
    .mutation(async ({ ctx, input }) => {
      const existing = await genbaDb.getGenbaWorkerLinkById(input.id);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "リンクが見つかりません" });
      const worker = await genbaDb.getGenbaSiteWorkerById(existing.siteWorkerId);
      await genbaDb.deleteGenbaWorkerLink(input.id);
      await safeGenbaAuditLog(uid(ctx), "genba.workerLinks.remove", { entityId: input.id, note: `作業員リンクを削除: ${worker?.displayName ?? existing.siteWorkerId}` });
      return { success: true as const };
    }),

  /**
   * 名簿から不要なゲスト作業員を削除 (field=leader+)。名簿行 + 専用リンク + 全作業への割当をまとめて消す。
   * 登録アカウント(kind=user)は出面表(attendance)から自動取り込みされるため、ここでは削除不可
   * (削除しても次回同期で復活する)。ゲストのみ対象。
   */
  deleteWorker: genbaStaffFieldProcedure
    .input(z.object({ siteWorkerId: genbaIdSchema }))
    .mutation(async ({ ctx, input }) => {
      const worker = await genbaDb.getGenbaSiteWorkerById(input.siteWorkerId);
      if (!worker) throw new TRPCError({ code: "NOT_FOUND", message: "作業員が名簿に見つかりません" });
      if (worker.kind !== "guest") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "登録作業員は出面表から自動取り込みされるため、ここでは削除できません（ゲストのみ削除可）" });
      }
      // 割当 → 専用リンク → 名簿行 の順で後始末
      await genbaDb.deleteGuestAssigneesBySiteWorker(input.siteWorkerId);
      const link = await genbaDb.getGenbaWorkerLinkBySiteWorker(input.siteWorkerId);
      if (link) await genbaDb.deleteGenbaWorkerLink(link.id);
      await genbaDb.deleteGenbaSiteWorker(input.siteWorkerId);
      await safeGenbaAuditLog(uid(ctx), "genba.workerLinks.deleteWorker", { entityId: input.siteWorkerId, note: `名簿からゲストを削除: ${worker.displayName}` });
      return { success: true as const };
    }),
});

/** 公開: 作業員専用リンク (トークン認証・ログイン不要)。閲覧+自分の担当のステータス更新 */
const workerLinkRouter = router({
  /**
   * リンクの表示ペイロード。ホワイトリスト払い出し (メモ・Driveリンク・図面リンク・
   * 他人の担当情報・予算等は返さない)。アクセスごとに lastAccessAt を打刻。
   */
  view: publicProcedure.input(z.object({ token: z.string().trim().min(8).max(64) })).query(async ({ input }) => {
    assertGenbaEnabled();
    const resolved = await resolveWorkerLink(input.token);
    if (!resolved.ok) return { ok: false as const, reason: resolved.reason };
    const { link, worker, site } = resolved;
    try { await genbaDb.touchGenbaWorkerLinkAccess(link.id); } catch { /* 打刻失敗は無視 */ }

    const { floors, zones, tasks, zoneById } = await loadSiteTaskContext(site.id);
    const editable = await workerLinkEditableTaskIds(resolved, tasks);
    const zoneName = (id: string) => zoneById.get(id)?.name ?? "?";
    const myTasks = tasks
      .filter((t) => editable.has(t.id))
      .map((t) => ({
        id: t.id, zoneId: t.zoneId, zoneName: zoneName(t.zoneId),
        name: t.name, romaji: t.romaji, status: t.status, percent: t.percent,
        dueDate: t.dueDate, issueText: t.issueText,
        // 作業員向けメモ (memoVisible のときだけ公開。非公開メモは返さない)
        memo: t.memoVisible ? t.memo : null,
      }))
      .sort((a, b) => a.zoneName.localeCompare(b.zoneName, "ja") || a.name.localeCompare(b.name, "ja"));

    // 図面 (署名URL)。ゾーンはアプリ内と同様に全体を返し、自分の担当エリアは mine で示す
    const floorsWithUrls = await withFloorImageUrls(floors);
    const myZoneIds = new Set(myTasks.map((t) => t.zoneId));

    // 指示: 全員宛て + (登録作業員なら) 自分/自分の班宛て
    const allInst = await genbaDb.listGenbaInstructionsBySite(site.id);
    const myTeams = worker.userId != null ? await myTeamIdsForSite(site.id, worker.userId) : new Set<string>();
    const myInst = allInst
      .filter((i) => worker.userId != null ? instructionTargetedTo(i, worker.userId, myTeams) : i.targetKind === "all")
      .map((i) => ({ id: i.id, text: i.text, createdAt: i.createdAt }))
      .reverse();

    return {
      ok: true as const,
      site: { name: site.name },
      me: { displayName: worker.displayName, kind: worker.kind, role: link.role },
      floors: floorsWithUrls.map((f) => ({ id: f.id, name: f.name, imageUrl: f.imageUrl, w: f.w, h: f.h })),
      zones: zones
        .map((z) => ({
          id: z.id, floorId: z.floorId, parentZoneId: z.parentZoneId, name: z.name, polygon: z.polygon,
          priority: z.priority, color: (z as any).color ?? null, fillOpacity: (z as any).fillOpacity ?? null,
          mine: link.role === "leader" || myZoneIds.has(z.id) || (!!z.parentZoneId && myZoneIds.has(z.parentZoneId)),
        })),
      myTasks,
      instructions: myInst,
    };
  }),

  /** ステータス更新 (worker=自分の担当のみ / leader=現場の全葉タスク)。写真はR2キーのみDB */
  setStatus: publicProcedure
    .input(z.object({
      token: z.string().trim().min(8).max(64),
      taskId: genbaIdSchema,
      status: genbaTaskStatusSchema,
      percent: z.number().int().min(0).max(100).nullish(),
      issueText: z.string().max(2000).optional(),
      photos: z.array(issuePhotoSchema).max(4).optional(),
    }))
    .mutation(async ({ input }) => {
      assertGenbaEnabled();
      const resolved = await resolveWorkerLink(input.token);
      if (!resolved.ok) throw new TRPCError({ code: "FORBIDDEN", message: "このリンクは無効です。管理者に確認してください。" });
      const { worker, site } = resolved;

      const existing = await genbaDb.getGenbaTaskById(input.taskId);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "作業が見つかりません" });
      const { tasks } = await loadSiteTaskContext(site.id);
      const editable = await workerLinkEditableTaskIds(resolved, tasks);
      if (!editable.has(input.taskId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "この作業はあなたの担当ではありません" });
      }

      const photoKeys: string[] = [];
      if (input.status === "issue" && input.photos?.length) {
        for (const p of input.photos) {
          const buffer = Buffer.from(p.base64, "base64");
          const err = validateFile(p.fileName, p.mimeType, buffer.length);
          if (err) throw new TRPCError({ code: "BAD_REQUEST", message: err });
          const key = `genba/task-${input.taskId}/issue-${nanoid(8)}-${safeKeyPart(p.fileName)}`;
          await storagePut(key, buffer, p.mimeType);
          photoKeys.push(key);
        }
      }

      const percent = input.status === "done" ? 100 : input.status === "todo" ? null : (input.percent ?? existing.percent ?? (input.status === "progress" ? 50 : null));
      const task = await genbaDb.updateGenbaTask(input.taskId, {
        status: input.status,
        percent,
        issueText: input.status === "issue" ? (input.issueText ?? "") : null,
      });

      // 履歴イベント: ゲストは byUserId を持たないため、記名は text に含める
      const signature = worker.userId != null ? "" : `（${worker.displayName}・リンク入力）`;
      await genbaDb.createGenbaTaskEvent({
        id: nanoid(21),
        taskId: input.taskId,
        kind: input.status === "issue" ? "issue" : "status",
        byUserId: worker.userId ?? null,
        text: (input.status === "issue" ? (input.issueText ?? "") : `「${input.status}」に変更`) + signature,
        photoKeys: photoKeys.length ? photoKeys : null,
      } as any);

      await safeGenbaAuditLog(worker.userId ?? null, "genba.workerLink.setStatus", { entityId: input.taskId, note: `${existing.name}: ${input.status} (リンク: ${worker.displayName})` });
      await safeGenbaActivity(input.status === "issue" ? "issue" : "status", worker.userId ?? null, { taskId: input.taskId, taskName: existing.name, zoneId: existing.zoneId, status: input.status, viaWorkerLink: true });
      return task;
    }),

  /** コメント (返信イベント)。スコープは setStatus と同じ */
  reply: publicProcedure
    .input(z.object({ token: z.string().trim().min(8).max(64), taskId: genbaIdSchema, text: z.string().trim().min(1).max(2000) }))
    .mutation(async ({ input }) => {
      assertGenbaEnabled();
      const resolved = await resolveWorkerLink(input.token);
      if (!resolved.ok) throw new TRPCError({ code: "FORBIDDEN", message: "このリンクは無効です。管理者に確認してください。" });
      const { worker, site } = resolved;
      const existing = await genbaDb.getGenbaTaskById(input.taskId);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "作業が見つかりません" });
      const { tasks } = await loadSiteTaskContext(site.id);
      const editable = await workerLinkEditableTaskIds(resolved, tasks);
      if (!editable.has(input.taskId)) throw new TRPCError({ code: "FORBIDDEN", message: "この作業はあなたの担当ではありません" });
      const signature = worker.userId != null ? "" : `（${worker.displayName}・リンク入力）`;
      await genbaDb.createGenbaTaskEvent({
        id: nanoid(21), taskId: input.taskId, kind: "reply",
        byUserId: worker.userId ?? null, text: input.text + signature, photoKeys: null,
      } as any);
      await safeGenbaAuditLog(worker.userId ?? null, "genba.workerLink.reply", { entityId: input.taskId, note: `コメント (リンク: ${worker.displayName})` });
      return { success: true as const };
    }),
});

// ── genbaRouter 本体 ──

export const genbaRouter = router({
  /** ログインユーザーの genba 上のプロフィール + 個人設定 */
  me: genbaProcedure.query(async ({ ctx }) => {
    if (ctx.genbaLink) {
      const meId = uid(ctx);
      const settings = meId != null ? await genbaDb.getGenbaUserSettings(meId) : null;
      return {
        userId: meId,
        name: ctx.genbaLink.displayName,
        genbaRole: ctx.genbaRole,
        settings: settings ?? { userId: meId ?? 0, ...genbaDb.GENBA_DEFAULT_USER_SETTINGS },
        link: { siteId: ctx.genbaLink.siteId, kind: meId != null ? "registered" as const : "guest" as const },
      };
    }
    let settings = await genbaDb.getGenbaUserSettings(uid(ctx) as number);
    if (!settings) {
      // 無ければデフォルト生成 (DB未接続時はデフォルト値のみ返す)
      try {
        settings = await genbaDb.upsertGenbaUserSettings(uid(ctx) as number, {});
      } catch {
        settings = null;
      }
    }
    return {
      userId: uid(ctx),
      name: ctx.user?.name ?? null,
      genbaRole: ctx.genbaRole,
      settings: settings ?? { userId: uid(ctx) ?? 0, ...genbaDb.GENBA_DEFAULT_USER_SETTINGS },
      link: null,
    };
  }),

  sites: sitesRouter,
  settings: settingsRouter,

  // M2以降 (typed スタブ)
  floors: floorsRouter,
  zones: zonesRouter,
  tasks: tasksRouter,
  teams: teamsRouter,
  users: usersRouter,
  board: boardRouter,
  instructions: instructionsRouter,
  materials: materialsRouter,
  templates: templatesRouter,
  shares: sharesRouter,
  budgets: budgetsRouter,
  logs: logsRouter,
  dispatches: dispatchesRouter,
  workerLinks: workerLinksRouter,
  workerLink: workerLinkRouter,
});

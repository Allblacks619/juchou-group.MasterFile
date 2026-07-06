import { TRPCError } from "@trpc/server";
import { nanoid } from "nanoid";
import { z } from "zod";
import { genbaRoleOf } from "../../shared/genba/roles";
import { protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";
import * as genbaDb from "./db";

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

/** ログイン済み + genba有効。ctx.genbaRole を付与 */
const genbaProcedure = protectedProcedure.use(({ ctx, next }) => {
  assertGenbaEnabled();
  const role = genbaRoleOf((ctx.user as any).appRole);
  return next({ ctx: { ...ctx, genbaRole: role } });
});

/** 現場の編集操作 (admin / leader)。worker は閲覧・現場入力のみ */
const genbaFieldProcedure = genbaProcedure.use(({ ctx, next }) => {
  if (ctx.genbaRole === "worker") {
    throw new TRPCError({ code: "FORBIDDEN", message: "現場編集権限がありません" });
  }
  return next({ ctx });
});

/** 予算・アーカイブ等の管理操作 (admin のみ) */
const genbaAdminProcedure = genbaProcedure.use(({ ctx, next }) => {
  if (ctx.genbaRole !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "管理者権限が必要です" });
  }
  return next({ ctx: { ...ctx, genbaRole: "admin" as const } });
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
  list: genbaProcedure.query(async () => {
    return genbaDb.listGenbaSites();
  }),

  create: genbaFieldProcedure
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
      await safeGenbaAuditLog(ctx.user.id, "genba.sites.create", { entityId: id, note: `現場を作成: ${input.name}` });
      return site;
    }),

  rename: genbaFieldProcedure
    .input(z.object({ id: genbaIdSchema, name: siteNameSchema }))
    .mutation(async ({ ctx, input }) => {
      const existing = await genbaDb.getGenbaSiteById(input.id);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "現場が見つかりません" });
      const site = await genbaDb.updateGenbaSite(input.id, { name: input.name });
      await safeGenbaAuditLog(ctx.user.id, "genba.sites.rename", { entityId: input.id, note: `現場名を変更: ${existing.name} → ${input.name}` });
      return site;
    }),

  /** アーカイブは admin のみ */
  archive: genbaAdminProcedure
    .input(z.object({ id: genbaIdSchema, archived: z.boolean().default(true) }))
    .mutation(async ({ ctx, input }) => {
      const existing = await genbaDb.getGenbaSiteById(input.id);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "現場が見つかりません" });
      const site = await genbaDb.updateGenbaSite(input.id, { archived: input.archived });
      await safeGenbaAuditLog(ctx.user.id, "genba.sites.archive", { entityId: input.id, note: `${existing.name} を${input.archived ? "アーカイブ" : "アーカイブ解除"}` });
      return site;
    }),

  setDriveUrl: genbaFieldProcedure
    .input(z.object({ id: genbaIdSchema, driveUrl: driveUrlSchema }))
    .mutation(async ({ ctx, input }) => {
      const existing = await genbaDb.getGenbaSiteById(input.id);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "現場が見つかりません" });
      const site = await genbaDb.updateGenbaSite(input.id, { driveUrl: input.driveUrl || null });
      await safeGenbaAuditLog(ctx.user.id, "genba.sites.setDriveUrl", { entityId: input.id, note: `${existing.name} のDriveリンクを更新` });
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
      const settings = await genbaDb.upsertGenbaUserSettings(ctx.user.id, patch);
      return settings;
    }),
});

// ── サブルーター (M2以降: typed スタブ) ──

const floorsRouter = router({
  list: genbaProcedure.input(z.object({ siteId: genbaIdSchema })).query(notImplemented),
  create: genbaFieldProcedure.input(z.object({ id: genbaIdSchema.optional(), siteId: genbaIdSchema, name: z.string().trim().min(1).max(120), imageKey: z.string().max(200).optional(), w: z.number().int().positive().optional(), h: z.number().int().positive().optional() })).mutation(notImplemented),
  update: genbaFieldProcedure.input(z.object({ id: genbaIdSchema, name: z.string().trim().min(1).max(120).optional(), imageKey: z.string().max(200).nullish(), w: z.number().int().positive().nullish(), h: z.number().int().positive().nullish(), sortOrder: z.number().int().optional() })).mutation(notImplemented),
  remove: genbaFieldProcedure.input(z.object({ id: genbaIdSchema })).mutation(notImplemented),
});

const zonesRouter = router({
  listByFloor: genbaProcedure.input(z.object({ floorId: genbaIdSchema })).query(notImplemented),
  create: genbaFieldProcedure.input(z.object({ id: genbaIdSchema.optional(), floorId: genbaIdSchema, parentZoneId: genbaIdSchema.nullish(), name: z.string().trim().min(1).max(120), polygon: z.array(z.object({ x: z.number(), y: z.number() })).optional() })).mutation(notImplemented),
  update: genbaFieldProcedure.input(z.object({ id: genbaIdSchema, name: z.string().trim().min(1).max(120).optional(), polygon: z.array(z.object({ x: z.number(), y: z.number() })).optional(), priority: z.number().int().nullish(), workStatus: z.string().max(16).nullish() })).mutation(notImplemented),
  remove: genbaFieldProcedure.input(z.object({ id: genbaIdSchema })).mutation(notImplemented),
});

const genbaTaskStatusSchema = z.enum(["todo", "progress", "done", "issue"]);

const tasksRouter = router({
  listByZone: genbaProcedure.input(z.object({ zoneId: genbaIdSchema })).query(notImplemented),
  create: genbaFieldProcedure.input(z.object({ id: genbaIdSchema.optional(), zoneId: genbaIdSchema, parentTaskId: genbaIdSchema.nullish(), name: z.string().trim().min(1).max(200), romaji: z.string().max(200).optional() })).mutation(notImplemented),
  update: genbaFieldProcedure.input(z.object({ id: genbaIdSchema, name: z.string().trim().min(1).max(200).optional(), memo: z.string().optional(), memoVisible: z.boolean().optional(), linkUrl: z.string().max(500).optional(), startDate: z.string().length(10).nullish(), dueDate: z.string().length(10).nullish(), priority: z.number().int().nullish(), sortOrder: z.number().int().optional() })).mutation(notImplemented),
  /** 現場入力: ステータス変更は worker も可 */
  setStatus: genbaProcedure.input(z.object({ id: genbaIdSchema, status: genbaTaskStatusSchema, percent: z.number().int().min(0).max(100).nullish(), issueText: z.string().optional() })).mutation(notImplemented),
  remove: genbaFieldProcedure.input(z.object({ id: genbaIdSchema })).mutation(notImplemented),
});

const instructionsRouter = router({
  list: genbaProcedure.input(z.object({ siteId: genbaIdSchema })).query(notImplemented),
  create: genbaFieldProcedure.input(z.object({ id: genbaIdSchema.optional(), siteId: genbaIdSchema, text: z.string().trim().min(1), targetKind: z.enum(["all", "team", "worker"]).default("all"), targetId: genbaIdSchema.nullish(), zoneId: genbaIdSchema.nullish() })).mutation(notImplemented),
  /** 現場入力: 既読は worker も可 */
  markRead: genbaProcedure.input(z.object({ instructionId: genbaIdSchema })).mutation(notImplemented),
});

const materialsRouter = router({
  listRequests: genbaProcedure.input(z.object({ siteId: genbaIdSchema })).query(notImplemented),
  /** 現場入力: 資材依頼は worker も可 */
  createRequest: genbaProcedure.input(z.object({ id: genbaIdSchema.optional(), siteId: genbaIdSchema, note: z.string().optional(), items: z.array(z.object({ name: z.string().trim().min(1).max(200), qty: z.number().int().positive(), unit: z.string().max(8).optional() })).min(1) })).mutation(notImplemented),
  updateRequestStatus: genbaFieldProcedure.input(z.object({ id: genbaIdSchema, status: z.enum(["pending", "ordered", "delivered"]) })).mutation(notImplemented),
  listPresets: genbaProcedure.input(z.object({ siteId: genbaIdSchema.nullish() }).optional()).query(notImplemented),
  savePreset: genbaFieldProcedure.input(z.object({ id: genbaIdSchema.optional(), siteId: genbaIdSchema.nullish(), workName: z.string().trim().min(1).max(120), parts: z.array(z.string().trim().min(1)) })).mutation(notImplemented),
});

const templatesRouter = router({
  list: genbaProcedure.query(notImplemented),
  save: genbaFieldProcedure.input(z.object({ id: genbaIdSchema.optional(), parentId: genbaIdSchema.nullish(), name: z.string().trim().min(1).max(200), romaji: z.string().max(200).optional(), sortOrder: z.number().int().optional() })).mutation(notImplemented),
  remove: genbaFieldProcedure.input(z.object({ id: genbaIdSchema })).mutation(notImplemented),
});

const sharesRouter = router({
  list: genbaProcedure.input(z.object({ siteId: genbaIdSchema })).query(notImplemented),
  create: genbaFieldProcedure.input(z.object({ siteId: genbaIdSchema, name: z.string().trim().min(1).max(120), scopes: z.array(z.string()).optional(), expiresAt: z.string().nullish() })).mutation(notImplemented),
  revoke: genbaFieldProcedure.input(z.object({ id: genbaIdSchema })).mutation(notImplemented),
});

const budgetsRouter = router({
  /** 予算トラッカーは admin 専用 */
  get: genbaAdminProcedure.input(z.object({ siteId: genbaIdSchema })).query(notImplemented),
  save: genbaAdminProcedure.input(z.object({ siteId: genbaIdSchema, enabled: z.boolean().optional(), contractAmount: z.number().int().min(0).optional(), targetType: z.enum(["percent", "amount"]).optional(), targetValue: z.number().int().min(0).optional(), costPerManDay: z.number().int().min(0).optional(), monthlyExpense: z.number().int().min(0).optional(), periodStart: z.string().length(10).nullish(), periodEnd: z.string().length(10).nullish(), preManDays: z.number().min(0).optional(), attendanceSource: z.enum(["manual", "project"]).optional() })).mutation(notImplemented),
  addManualAttendance: genbaAdminProcedure.input(z.object({ siteId: genbaIdSchema, date: z.string().length(10), manDays: z.number().min(0) })).mutation(notImplemented),
  /** attendanceSource=project のとき既存 attendance から SUM(hoursWorked)/80.0 を projectId×期間で集計 (M4) */
  summary: genbaAdminProcedure.input(z.object({ siteId: genbaIdSchema })).query(notImplemented),
});

const logsRouter = router({
  list: genbaProcedure.input(z.object({ type: z.string().max(24).optional(), limit: z.number().int().min(1).max(200).default(50) }).optional()).query(notImplemented),
});

// ── genbaRouter 本体 ──

export const genbaRouter = router({
  /** ログインユーザーの genba 上のプロフィール + 個人設定 */
  me: genbaProcedure.query(async ({ ctx }) => {
    let settings = await genbaDb.getGenbaUserSettings(ctx.user.id);
    if (!settings) {
      // 無ければデフォルト生成 (DB未接続時はデフォルト値のみ返す)
      try {
        settings = await genbaDb.upsertGenbaUserSettings(ctx.user.id, {});
      } catch {
        settings = null;
      }
    }
    return {
      userId: ctx.user.id,
      name: ctx.user.name ?? null,
      genbaRole: ctx.genbaRole,
      settings: settings ?? { userId: ctx.user.id, ...genbaDb.GENBA_DEFAULT_USER_SETTINGS },
    };
  }),

  sites: sitesRouter,
  settings: settingsRouter,

  // M2以降 (typed スタブ)
  floors: floorsRouter,
  zones: zonesRouter,
  tasks: tasksRouter,
  instructions: instructionsRouter,
  materials: materialsRouter,
  templates: templatesRouter,
  shares: sharesRouter,
  budgets: budgetsRouter,
  logs: logsRouter,
});

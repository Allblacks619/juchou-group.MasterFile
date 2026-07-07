import { TRPCError } from "@trpc/server";
import { nanoid } from "nanoid";
import { z } from "zod";
import { genbaRoleOf } from "../../shared/genba/roles";
import { protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";
import * as genbaDb from "./db";
import { storageGet, storagePut } from "../storage";
import { validateFile } from "../../shared/uploadValidation";
import { computeZoneAggregates } from "./aggregate";

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
      await safeGenbaAuditLog(ctx.user.id, "genba.floors.create", { entityId: id, note: `図面を追加: ${input.name} (${site.name})` });
      const [withUrl] = await withFloorImageUrls(floor ? [floor] : []);
      return withUrl ?? null;
    }),

  /** フロア名・並び順の更新 (画像は差し替えず、リネーム/並べ替えのみ) */
  update: genbaFieldProcedure
    .input(z.object({ id: genbaIdSchema, name: z.string().trim().min(1).max(120).optional(), sortOrder: z.number().int().optional() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await genbaDb.getGenbaFloorById(input.id);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "フロアが見つかりません" });
      const patch: { name?: string; sortOrder?: number } = {};
      if (input.name !== undefined) patch.name = input.name;
      if (input.sortOrder !== undefined) patch.sortOrder = input.sortOrder;
      const floor = await genbaDb.updateGenbaFloor(input.id, patch);
      await safeGenbaAuditLog(ctx.user.id, "genba.floors.update", { entityId: input.id, note: `フロアを更新: ${existing.name}` });
      const [withUrl] = await withFloorImageUrls(floor ? [floor] : []);
      return withUrl ?? null;
    }),

  /** フロア削除 (DB行のみ。R2オブジェクトは既存アップロードと同様に保持) */
  remove: genbaFieldProcedure
    .input(z.object({ id: genbaIdSchema }))
    .mutation(async ({ ctx, input }) => {
      const existing = await genbaDb.getGenbaFloorById(input.id);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "フロアが見つかりません" });
      await genbaDb.deleteGenbaFloor(input.id);
      await safeGenbaAuditLog(ctx.user.id, "genba.floors.remove", { entityId: input.id, note: `図面を削除: ${existing.name}` });
      return { success: true as const };
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

  /** エリア(ポリゴン)の作成。作業テンプレートの自動適用は M2-C で追加する */
  create: genbaFieldProcedure
    .input(z.object({
      id: genbaIdSchema.optional(),
      floorId: genbaIdSchema,
      parentZoneId: genbaIdSchema.nullish(),
      name: z.string().trim().min(1).max(120),
      polygon: polygonSchema,
      priority: zonePrioritySchema,
      workStatus: zoneWorkStatusSchema,
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
      await safeGenbaAuditLog(ctx.user.id, "genba.zones.create", { entityId: id, note: `エリアを作成: ${input.name}` });
      return zone;
    }),

  /** 名前・ポリゴン範囲・優先度・稼働状態の更新 */
  update: genbaFieldProcedure
    .input(z.object({
      id: genbaIdSchema,
      name: z.string().trim().min(1).max(120).optional(),
      polygon: polygonSchema.optional(),
      priority: zonePrioritySchema,
      workStatus: zoneWorkStatusSchema,
    }))
    .mutation(async ({ ctx, input }) => {
      const existing = await genbaDb.getGenbaZoneById(input.id);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "エリアが見つかりません" });
      const patch: { name?: string; polygon?: { x: number; y: number }[]; priority?: number | null; workStatus?: "paused" | null } = {};
      if (input.name !== undefined) patch.name = input.name;
      if (input.polygon !== undefined) patch.polygon = input.polygon;
      if (input.priority !== undefined) patch.priority = input.priority;
      if (input.workStatus !== undefined) patch.workStatus = input.workStatus;
      const zone = await genbaDb.updateGenbaZone(input.id, patch);
      await safeGenbaAuditLog(ctx.user.id, "genba.zones.update", { entityId: input.id, note: `エリアを更新: ${existing.name}` });
      return zone;
    }),

  /** エリア削除 (サブエリア・配下作業も削除) */
  remove: genbaFieldProcedure
    .input(z.object({ id: genbaIdSchema }))
    .mutation(async ({ ctx, input }) => {
      const existing = await genbaDb.getGenbaZoneById(input.id);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "エリアが見つかりません" });
      await genbaDb.deleteGenbaZoneCascade(input.id);
      await safeGenbaAuditLog(ctx.user.id, "genba.zones.remove", { entityId: input.id, note: `エリアを削除: ${existing.name}` });
      return { success: true as const };
    }),
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

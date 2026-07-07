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
import { computeBoard } from "./board";
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
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD形式で入力してください");
const issuePhotoSchema = z.object({ base64: z.string().min(1), mimeType: z.string(), fileName: z.string().min(1).max(200) });

const tasksRouter = router({
  /** ゾーンの作業一覧 (フラット + 担当者/班。ツリー化と親進捗はクライアント側で計算) */
  listByZone: genbaProcedure.input(z.object({ zoneId: genbaIdSchema })).query(async ({ input }) => {
    const tasks = await genbaDb.listGenbaTasksByZone(input.zoneId);
    const ids = tasks.map((t) => t.id);
    const [assignees, taskTeams] = await Promise.all([
      genbaDb.listTaskAssigneesByTaskIds(ids),
      genbaDb.listTaskTeamsByTaskIds(ids),
    ]);
    const byTaskUsers = new Map<string, number[]>();
    for (const a of assignees) { const arr = byTaskUsers.get(a.taskId) || []; arr.push(a.userId); byTaskUsers.set(a.taskId, arr); }
    const byTaskTeams = new Map<string, string[]>();
    for (const t of taskTeams) { const arr = byTaskTeams.get(t.taskId) || []; arr.push(t.teamId); byTaskTeams.set(t.taskId, arr); }
    return tasks.map((t) => ({ ...t, assigneeIds: byTaskUsers.get(t.id) || [], teamIds: byTaskTeams.get(t.id) || [] }));
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
      await safeGenbaAuditLog(ctx.user.id, "genba.tasks.create", { entityId: id, note: `作業を追加: ${input.name}` });
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
      const patch: Record<string, unknown> = {};
      for (const k of ["name", "romaji", "memo", "memoVisible", "linkUrl", "startDate", "dueDate", "priority", "sortOrder"] as const) {
        if (input[k] !== undefined) patch[k] = input[k];
      }
      const task = await genbaDb.updateGenbaTask(input.id, patch);
      await safeGenbaAuditLog(ctx.user.id, "genba.tasks.update", { entityId: input.id, note: `作業を更新: ${existing.name}` });
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
        byUserId: ctx.user.id,
        text: input.status === "issue" ? (input.issueText ?? "") : `「${input.status}」に変更`,
        photoKeys: photoKeys.length ? photoKeys : null,
      } as any);

      await safeGenbaAuditLog(ctx.user.id, "genba.tasks.setStatus", { entityId: input.id, note: `${existing.name}: ${input.status}` });
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
      await genbaDb.deleteGenbaTaskCascade(input.id);
      await safeGenbaAuditLog(ctx.user.id, "genba.tasks.remove", { entityId: input.id, note: `作業を削除: ${existing.name}` });
      return { success: true as const };
    }),

  /** 作業への担当者(ユーザー)割当のトグル (M3-A) */
  assignUser: genbaFieldProcedure
    .input(z.object({ taskId: genbaIdSchema, userId: z.number().int().positive(), on: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const task = await genbaDb.getGenbaTaskById(input.taskId);
      if (!task) throw new TRPCError({ code: "NOT_FOUND", message: "作業が見つかりません" });
      if (input.on) await genbaDb.addTaskAssignee({ id: nanoid(21), taskId: input.taskId, userId: input.userId });
      else await genbaDb.removeTaskAssignee(input.taskId, input.userId);
      await safeGenbaAuditLog(ctx.user.id, "genba.tasks.assignUser", { entityId: input.taskId, note: `担当 ${input.on ? "追加" : "解除"}: user#${input.userId}` });
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
      await safeGenbaAuditLog(ctx.user.id, "genba.tasks.assignTeam", { entityId: input.taskId, note: `班 ${input.on ? "追加" : "解除"}: ${input.teamId}` });
      return { success: true as const };
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
      if (input.toUserId === ctx.user.id) throw new TRPCError({ code: "BAD_REQUEST", message: "自分自身には引き継げません" });

      // 担当の付け替え: 相手を追加し、自分を外す
      await genbaDb.addTaskAssignee({ id: nanoid(21), taskId: input.taskId, userId: input.toUserId });
      await genbaDb.removeTaskAssignee(input.taskId, ctx.user.id);

      // 履歴イベント (handover)
      const note = input.note?.trim();
      await genbaDb.createGenbaTaskEvent({
        id: nanoid(21), taskId: input.taskId, kind: "handover", byUserId: ctx.user.id,
        text: `引き継ぎ${note ? " — " + note : ""}`, photoKeys: null,
      } as any);

      // 相手宛ての指示を自動生成 (現場は zone→floor→site で解決)
      const zone = await genbaDb.getGenbaZoneById(task.zoneId);
      const floor = zone ? await genbaDb.getGenbaFloorById(zone.floorId) : null;
      if (floor) {
        await genbaDb.createGenbaInstruction({
          id: nanoid(21), siteId: floor.siteId,
          text: `🤝 引き継ぎ: 「${task.name}」を引き継ぎました。${note ? "\n申し送り: " + note : ""}`,
          targetKind: "worker", targetId: String(input.toUserId), zoneId: task.zoneId, byUserId: ctx.user.id,
        });
      }
      await safeGenbaAuditLog(ctx.user.id, "genba.tasks.handover", { entityId: input.taskId, note: `${task.name} を user#${input.toUserId} へ引き継ぎ` });
      return { success: true as const };
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
      await safeGenbaAuditLog(ctx.user.id, "genba.teams.create", { entityId: id, note: `班を作成: ${input.name}` });
      return team;
    }),

  rename: genbaFieldProcedure
    .input(z.object({ id: genbaIdSchema, name: z.string().trim().min(1).max(120) }))
    .mutation(async ({ ctx, input }) => {
      const existing = await genbaDb.getGenbaTeamById(input.id);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "班が見つかりません" });
      const team = await genbaDb.updateGenbaTeam(input.id, { name: input.name });
      await safeGenbaAuditLog(ctx.user.id, "genba.teams.rename", { entityId: input.id, note: `班名を変更: ${existing.name} → ${input.name}` });
      return team;
    }),

  remove: genbaFieldProcedure
    .input(z.object({ id: genbaIdSchema }))
    .mutation(async ({ ctx, input }) => {
      const existing = await genbaDb.getGenbaTeamById(input.id);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "班が見つかりません" });
      await genbaDb.deleteGenbaTeamCascade(input.id);
      await safeGenbaAuditLog(ctx.user.id, "genba.teams.remove", { entityId: input.id, note: `班を削除: ${existing.name}` });
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
      await safeGenbaAuditLog(ctx.user.id, "genba.teams.setMember", { entityId: input.teamId, note: `メンバー ${input.on ? "追加" : "解除"}: user#${input.userId}` });
      return { success: true as const };
    }),
});

// ── users (M3-A): 割り当て可能ユーザー一覧 (既存 users を読み取り専用) ──

const usersRouter = router({
  listAssignable: genbaProcedure.query(async () => {
    return genbaDb.listAssignableUsers();
  }),
});

// ── board (M3-C): 現在の割当から人別/エリア別を自動生成 ──

const boardRouter = router({
  get: genbaProcedure.input(z.object({ siteId: genbaIdSchema })).query(async ({ input }) => {
    const floors = await genbaDb.listGenbaFloorsBySite(input.siteId);
    const zones = await genbaDb.listGenbaZonesByFloorIds(floors.map((f) => f.id));
    const tasks = await genbaDb.listGenbaTasksByZoneIds(zones.map((z) => z.id));
    const taskIds = tasks.map((t) => t.id);
    const [assignees, taskTeams, teams, users] = await Promise.all([
      genbaDb.listTaskAssigneesByTaskIds(taskIds),
      genbaDb.listTaskTeamsByTaskIds(taskIds),
      genbaDb.listGenbaTeamsBySite(input.siteId),
      genbaDb.listAssignableUsers(),
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
    });
  }),
});

// ── instructions (M3-B) ──

/** 指定ユーザーが所属する現場の班IDセット */
async function myTeamIdsForSite(siteId: string, userId: number): Promise<Set<string>> {
  const teams = await genbaDb.listGenbaTeamsBySite(siteId);
  const members = await genbaDb.listGenbaTeamMembers(teams.map((t) => t.id));
  return new Set(members.filter((m) => m.userId === userId).map((m) => m.teamId));
}

/** 指示が自分宛てか (all / 自分の班 / 自分個人) */
function instructionTargetedTo(inst: { targetKind: string; targetId: string | null }, userId: number, myTeamIds: Set<string>): boolean {
  if (inst.targetKind === "all") return true;
  if (inst.targetKind === "team") return !!inst.targetId && myTeamIds.has(inst.targetId);
  if (inst.targetKind === "worker") return inst.targetId === String(userId);
  return false;
}

const instructionsRouter = router({
  /** 自分宛ての指示一覧 (field は全件)。既読フラグ・既読者ID付き */
  listForMe: genbaProcedure.input(z.object({ siteId: genbaIdSchema })).query(async ({ ctx, input }) => {
    const all = await genbaDb.listGenbaInstructionsBySite(input.siteId);
    const myTeamIds = await myTeamIdsForSite(input.siteId, ctx.user.id);
    const visible = ctx.genbaRole === "worker"
      ? all.filter((i) => instructionTargetedTo(i, ctx.user.id, myTeamIds))
      : all;
    const reads = await genbaDb.listGenbaInstructionReads(visible.map((i) => i.id));
    const readersByInst = new Map<string, number[]>();
    for (const r of reads) { const arr = readersByInst.get(r.instructionId) || []; arr.push(r.userId); readersByInst.set(r.instructionId, arr); }
    return visible
      .map((i) => {
        const readerIds = readersByInst.get(i.id) || [];
        return { ...i, readerIds, read: readerIds.includes(ctx.user.id), mine: instructionTargetedTo(i, ctx.user.id, myTeamIds) };
      })
      .reverse(); // 新しい順
  }),

  /** 自分宛ての未読件数 */
  unreadCount: genbaProcedure.input(z.object({ siteId: genbaIdSchema })).query(async ({ ctx, input }) => {
    const all = await genbaDb.listGenbaInstructionsBySite(input.siteId);
    const myTeamIds = await myTeamIdsForSite(input.siteId, ctx.user.id);
    const mine = all.filter((i) => instructionTargetedTo(i, ctx.user.id, myTeamIds));
    const reads = await genbaDb.listGenbaInstructionReads(mine.map((i) => i.id));
    const readSet = new Set(reads.filter((r) => r.userId === ctx.user.id).map((r) => r.instructionId));
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
        zoneId: input.zoneId ?? null, byUserId: ctx.user.id,
      });
      await safeGenbaAuditLog(ctx.user.id, "genba.instructions.create", { entityId: id, note: `指示を送信 (${input.targetKind})` });
      return inst;
    }),

  /** 現場入力: 既読は worker も可 */
  markRead: genbaProcedure.input(z.object({ instructionId: genbaIdSchema })).mutation(async ({ ctx, input }) => {
    const inst = await genbaDb.getGenbaInstructionById(input.instructionId);
    if (!inst) throw new TRPCError({ code: "NOT_FOUND", message: "指示が見つかりません" });
    await genbaDb.addGenbaInstructionRead({ id: nanoid(21), instructionId: input.instructionId, userId: ctx.user.id });
    return { success: true as const };
  }),
});

const materialsRouter = router({
  listRequests: genbaProcedure.input(z.object({ siteId: genbaIdSchema })).query(notImplemented),
  /** 現場入力: 資材依頼は worker も可 */
  createRequest: genbaProcedure.input(z.object({ id: genbaIdSchema.optional(), siteId: genbaIdSchema, note: z.string().optional(), items: z.array(z.object({ name: z.string().trim().min(1).max(200), qty: z.number().int().positive(), unit: z.string().max(8).optional() })).min(1) })).mutation(notImplemented),
  updateRequestStatus: genbaFieldProcedure.input(z.object({ id: genbaIdSchema, status: z.enum(["pending", "ordered", "delivered"]) })).mutation(notImplemented),
  listPresets: genbaProcedure.input(z.object({ siteId: genbaIdSchema.nullish() }).optional()).query(notImplemented),
  savePreset: genbaFieldProcedure.input(z.object({ id: genbaIdSchema.optional(), siteId: genbaIdSchema.nullish(), workName: z.string().trim().min(1).max(120), parts: z.array(z.string().trim().min(1)) })).mutation(notImplemented),
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
  saveTree: genbaFieldProcedure
    .input(z.object({ tree: z.array(templateNodeSchema) }))
    .mutation(async ({ ctx, input }) => {
      const rows = flattenTemplateTree(input.tree, null);
      await genbaDb.replaceGenbaTaskTemplates(rows);
      await safeGenbaAuditLog(ctx.user.id, "genba.templates.saveTree", { note: `テンプレートを更新 (${rows.length}項目)` });
      return { success: true as const, count: rows.length };
    }),
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
  teams: teamsRouter,
  users: usersRouter,
  board: boardRouter,
  instructions: instructionsRouter,
  materials: materialsRouter,
  templates: templatesRouter,
  shares: sharesRouter,
  budgets: budgetsRouter,
  logs: logsRouter,
});

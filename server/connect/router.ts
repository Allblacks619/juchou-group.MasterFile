import { TRPCError } from "@trpc/server";
import { nanoid } from "nanoid";
import { z } from "zod";
import { protectedProcedure, router, isAdminLike, isManagerLike } from "../_core/trpc";
import * as db from "../db";
import * as genbaDb from "../genba/db";
import * as connectDb from "./db";
import { isMultiTenantEnabled } from "../tenancy";
import { buildRosterWorkerDto, matchRosterWorker, RosterWorkerDto } from "./roster";
import { buildInvoiceSnapshotDto, compareAttendance, computeApprovedAmount, AttendanceRowDto, InvoiceSnapshotDto } from "./invoice";

/**
 * コネクト層 (会社間連携) ルーター — Phase 2 (PLAN_v1.md §2.3-§2.6)。
 *
 * 全手続きは MULTI_TENANT フラグ配下（off の間は FORBIDDEN）＝本番挙動に影響しない。
 * 会社間のやり取りは partner_links（相互承認）を必ず経由し、提出物はホワイトリストDTOの
 * スナップショットとして不変保存する。
 */

const connectProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!isMultiTenantEnabled()) {
    throw new TRPCError({ code: "FORBIDDEN", message: "会社間連携はまだ有効化されていません" });
  }
  const companyId = (ctx as any).companyId as number | undefined;
  if (companyId == null) {
    throw new TRPCError({ code: "FORBIDDEN", message: "会社情報を解決できません（再ログインしてください）" });
  }
  return next({ ctx: { ...ctx, companyId } });
});

/** 取引先連携の管理（招待/承認/停止）は管理者のみ */
const connectAdminProcedure = connectProcedure.use(({ ctx, next }) => {
  if (!isAdminLike((ctx.user as any).appRole)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "管理者権限が必要です" });
  }
  return next({ ctx });
});

/** 名簿の提出・確認は manager 以上 */
const connectManagerProcedure = connectProcedure.use(({ ctx, next }) => {
  const role = (ctx.user as any).appRole;
  if (!isManagerLike(role) && !isAdminLike(role)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "責任者以上の権限が必要です" });
  }
  return next({ ctx });
});

async function safeConnectAuditLog(userId: number | null, action: string, note: string, payload?: unknown) {
  try {
    await db.createAuditLog({
      action, entityType: "connect", performedBy: userId,
      note, payload: payload ? JSON.stringify(payload) : null,
    } as any);
  } catch { /* 監査失敗で本処理を落とさない */ }
}

/** リンクの当事者であることを検証し、相手会社IDを返す */
function otherPartyOf(link: { requesterCompanyId: number; addresseeCompanyId: number | null }, companyId: number): number {
  if (link.requesterCompanyId === companyId) {
    if (link.addresseeCompanyId == null) throw new TRPCError({ code: "BAD_REQUEST", message: "相手会社が未承諾のリンクです" });
    return link.addresseeCompanyId;
  }
  if (link.addresseeCompanyId === companyId) return link.requesterCompanyId;
  throw new TRPCError({ code: "NOT_FOUND", message: "連携が見つかりません" });
}

const partnerRouter = router({
  /** 取引先マスタの1行を「システム連携」に招待する。承諾用トークンを発行 */
  invite: connectAdminProcedure
    .input(z.object({ clientId: z.number().int().positive(), notes: z.string().max(1000).optional() }))
    .mutation(async ({ ctx, input }) => {
      const client = await db.getClientById(input.clientId);
      if (!client) throw new TRPCError({ code: "NOT_FOUND", message: "取引先が見つかりません" });
      if ((client as any).companyId != null && (client as any).companyId !== ctx.companyId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "取引先が見つかりません" });
      }
      const token = nanoid(32);
      const link = await connectDb.createPartnerLink({
        requesterCompanyId: ctx.companyId,
        token,
        invitedBy: ctx.user.id,
        notes: input.notes ?? null,
      } as any);
      if (!link) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "リンク作成に失敗しました" });
      await connectDb.addPartnerLinkClientMap({ partnerLinkId: link.id, companyId: ctx.companyId, clientId: input.clientId });
      await safeConnectAuditLog(ctx.user.id, "connect.partner.invite", `連携招待を発行: ${String((client as any).name)}`);
      return { linkId: link.id, token, inviteUrl: `__ORIGIN__/app/connect/accept/${token}` };
    }),

  /** 招待トークンで連携を承諾（相手会社の管理者が実行）。自社の取引先行を任意で対応付け */
  accept: connectAdminProcedure
    .input(z.object({ token: z.string().min(1).max(64), clientId: z.number().int().positive().optional() }))
    .mutation(async ({ ctx, input }) => {
      const link = await connectDb.getPartnerLinkByToken(input.token);
      if (!link || link.status !== "invited") {
        throw new TRPCError({ code: "NOT_FOUND", message: "有効な招待が見つかりません" });
      }
      if (link.requesterCompanyId === ctx.companyId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "自社の招待は承諾できません" });
      }
      const existing = await connectDb.findPartnerLinkBetween(link.requesterCompanyId, ctx.companyId);
      if (existing && existing.id !== link.id && existing.status === "accepted") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "この会社とは既に連携済みです" });
      }
      const lo = Math.min(link.requesterCompanyId, ctx.companyId);
      const hi = Math.max(link.requesterCompanyId, ctx.companyId);
      await connectDb.updatePartnerLink(link.id, {
        addresseeCompanyId: ctx.companyId,
        pairMinCompanyId: lo,
        pairMaxCompanyId: hi,
        status: "accepted",
        acceptedBy: ctx.user.id,
        acceptedAt: new Date(),
      } as any);
      if (input.clientId != null) {
        const client = await db.getClientById(input.clientId);
        if (client && ((client as any).companyId == null || (client as any).companyId === ctx.companyId)) {
          await connectDb.addPartnerLinkClientMap({ partnerLinkId: link.id, companyId: ctx.companyId, clientId: input.clientId });
        }
      }
      await safeConnectAuditLog(ctx.user.id, "connect.partner.accept", `連携を承諾: link#${link.id}`);
      return { linkId: link.id, status: "accepted" as const };
    }),

  /** 招待を辞退 */
  reject: connectAdminProcedure
    .input(z.object({ token: z.string().min(1).max(64) }))
    .mutation(async ({ ctx, input }) => {
      const link = await connectDb.getPartnerLinkByToken(input.token);
      if (!link || link.status !== "invited" || link.requesterCompanyId === ctx.companyId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "有効な招待が見つかりません" });
      }
      await connectDb.updatePartnerLink(link.id, { status: "rejected" } as any);
      await safeConnectAuditLog(ctx.user.id, "connect.partner.reject", `連携招待を辞退: link#${link.id}`);
      return { success: true as const };
    }),

  /** 連携を停止（既存 submission は証跡として双方閲覧可のまま） */
  suspend: connectAdminProcedure
    .input(z.object({ linkId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const link = await connectDb.getPartnerLinkById(input.linkId);
      if (!link) throw new TRPCError({ code: "NOT_FOUND", message: "連携が見つかりません" });
      otherPartyOf(link, ctx.companyId); // 当事者検証
      await connectDb.updatePartnerLink(link.id, { status: "suspended", suspendedAt: new Date() } as any);
      await safeConnectAuditLog(ctx.user.id, "connect.partner.suspend", `連携を停止: link#${link.id}`);
      return { success: true as const };
    }),

  /** 自社が関係する連携の一覧 */
  list: connectManagerProcedure.query(async ({ ctx }) => {
    const links = await connectDb.listPartnerLinksByCompany(ctx.companyId);
    return Promise.all(links.map(async (l) => ({
      id: l.id,
      status: l.status,
      isRequester: l.requesterCompanyId === ctx.companyId,
      counterpartyCompanyId: l.requesterCompanyId === ctx.companyId ? l.addresseeCompanyId : l.requesterCompanyId,
      clientMaps: (await connectDb.listPartnerLinkClientMaps(l.id)).filter((m) => m.companyId === ctx.companyId),
      createdAt: l.createdAt,
      acceptedAt: l.acceptedAt,
    })));
  }),
});

const rosterRouter = router({
  /** 作業員名簿・資格書を連携先へ提出（ホワイトリストDTOで凍結） */
  submit: connectManagerProcedure
    .input(z.object({
      partnerLinkId: z.number().int().positive(),
      employeeIds: z.array(z.number().int().positive()).min(1).max(100),
      projectRef: z.string().max(256).optional(),
      toGenbaSiteId: z.string().max(24).optional(),
      pdfKeys: z.array(z.string().max(512)).max(50).optional(),
      supersedesId: z.number().int().positive().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const link = await connectDb.getPartnerLinkById(input.partnerLinkId);
      if (!link || link.status !== "accepted") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "承諾済みの連携ではありません" });
      }
      const toCompanyId = otherPartyOf(link, ctx.companyId);

      // 自社従業員のみ提出可（他社 employeeId は NOT_FOUND）
      const workers: RosterWorkerDto[] = [];
      for (const employeeId of input.employeeIds) {
        const emp = await db.getEmployeeById(employeeId);
        if (!emp || ((emp as any).companyId != null && (emp as any).companyId !== ctx.companyId)) {
          throw new TRPCError({ code: "NOT_FOUND", message: `従業員が見つかりません (id=${employeeId})` });
        }
        const [quals, docs] = await Promise.all([
          db.getQualificationsByEmployee(employeeId),
          db.getDocumentsByEmployee(employeeId),
        ]);
        workers.push(buildRosterWorkerDto(emp as any, quals as any[], docs as any[]));
      }

      // 再提出（イミュータブル: 旧版は superseded にするが行は保全）
      let version = 1;
      if (input.supersedesId != null) {
        const prev = await connectDb.getRosterSubmissionById(input.supersedesId);
        if (!prev || prev.fromCompanyId !== ctx.companyId || prev.partnerLinkId !== link.id) {
          throw new TRPCError({ code: "NOT_FOUND", message: "再提出元が見つかりません" });
        }
        version = prev.version + 1;
        await connectDb.updateRosterSubmission(prev.id, { status: "superseded" } as any);
      }

      const submission = await connectDb.createRosterSubmission({
        partnerLinkId: link.id,
        fromCompanyId: ctx.companyId,
        toCompanyId,
        projectRef: input.projectRef ?? null,
        toGenbaSiteId: input.toGenbaSiteId ?? null,
        version,
        supersedesId: input.supersedesId ?? null,
        status: "submitted",
        workerSetJson: workers,
        pdfKeysJson: input.pdfKeys ?? null,
        submittedBy: ctx.user.id,
      } as any);
      if (!submission) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "提出に失敗しました" });
      for (const w of workers) {
        await connectDb.addRosterWorker({
          submissionId: submission.id,
          employeeRef: w.employeeRef,
          displayName: w.nameKanji,
          ccusNumber: w.ccusNumber,
          status: "pending",
        } as any);
      }
      await safeConnectAuditLog(ctx.user.id, "connect.roster.submit",
        `名簿を提出: ${workers.length}名 → company#${toCompanyId}`, { submissionId: submission.id });
      return { submissionId: submission.id, workerCount: workers.length, version };
    }),

  /** 受領箱（自社宛て提出の一覧） */
  inbox: connectManagerProcedure.query(async ({ ctx }) => {
    const subs = await connectDb.listRosterInbox(ctx.companyId);
    return Promise.all(subs.map(async (s) => ({ ...s, workers: await connectDb.listRosterWorkers(s.id) })));
  }),

  /** 提出箱（自社発の一覧） */
  outbox: connectManagerProcedure.query(async ({ ctx }) => {
    const subs = await connectDb.listRosterOutbox(ctx.companyId);
    return Promise.all(subs.map(async (s) => ({ ...s, workers: await connectDb.listRosterWorkers(s.id) })));
  }),

  /** 受領（確認開始）を記録 */
  markReceived: connectManagerProcedure
    .input(z.object({ submissionId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const sub = await connectDb.getRosterSubmissionById(input.submissionId);
      if (!sub || sub.toCompanyId !== ctx.companyId) throw new TRPCError({ code: "NOT_FOUND", message: "提出が見つかりません" });
      if (sub.status === "submitted") {
        await connectDb.updateRosterSubmission(sub.id, { status: "received", reviewedBy: ctx.user.id, reviewedAt: new Date() } as any);
      }
      return { success: true as const };
    }),

  /** genba 名簿との名寄せ候補（受領側の自社現場のみ） */
  matchCandidates: connectManagerProcedure
    .input(z.object({ submissionId: z.number().int().positive(), siteId: z.string().min(1).max(24) }))
    .query(async ({ ctx, input }) => {
      const sub = await connectDb.getRosterSubmissionById(input.submissionId);
      if (!sub || sub.toCompanyId !== ctx.companyId) throw new TRPCError({ code: "NOT_FOUND", message: "提出が見つかりません" });
      const site = await genbaDb.getGenbaSiteById(input.siteId);
      if (!site || ((site as any).companyId != null && (site as any).companyId !== ctx.companyId)) {
        throw new TRPCError({ code: "NOT_FOUND", message: "現場が見つかりません" });
      }
      const siteWorkers = await genbaDb.listGenbaSiteWorkersBySite(input.siteId);
      const workers = await connectDb.listRosterWorkers(input.submissionId);
      return workers.map((w) => ({
        rosterWorkerId: w.id,
        displayName: w.displayName,
        ccusNumber: w.ccusNumber,
        candidates: matchRosterWorker(
          { displayName: w.displayName, ccusNumber: w.ccusNumber },
          siteWorkers.map((sw) => ({ id: sw.id, guestName: sw.guestName, displayName: sw.displayName, ccusNumber: (sw as any).ccusNumber ?? null })),
        ),
      }));
    }),

  /** 作業員単位の受理/差戻し。受理時は genba 名簿行へ名寄せ結果を反映できる */
  reviewWorker: connectManagerProcedure
    .input(z.object({
      rosterWorkerId: z.number().int().positive(),
      action: z.enum(["registered", "returned"]),
      returnReason: z.string().max(1000).optional(),
      matchSiteWorkerId: z.string().max(24).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const worker = await connectDb.getRosterWorkerById(input.rosterWorkerId);
      if (!worker) throw new TRPCError({ code: "NOT_FOUND", message: "対象が見つかりません" });
      const sub = await connectDb.getRosterSubmissionById(worker.submissionId);
      if (!sub || sub.toCompanyId !== ctx.companyId) throw new TRPCError({ code: "NOT_FOUND", message: "提出が見つかりません" });
      if (input.action === "returned" && !input.returnReason) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "差戻し理由は必須です" });
      }

      let matchedSiteWorkerId: string | null = null;
      if (input.action === "registered" && input.matchSiteWorkerId) {
        const sw = await genbaDb.getGenbaSiteWorkerById(input.matchSiteWorkerId);
        if (sw) {
          const site = await genbaDb.getGenbaSiteById(sw.siteId);
          if (!site || ((site as any).companyId != null && (site as any).companyId !== ctx.companyId)) {
            throw new TRPCError({ code: "NOT_FOUND", message: "現場が見つかりません" });
          }
          await genbaDb.updateGenbaSiteWorkerExternalRef(sw.id, {
            externalCompanyId: sub.fromCompanyId,
            externalEmployeeRef: worker.employeeRef,
            ccusNumber: worker.ccusNumber ?? null,
          });
          matchedSiteWorkerId = sw.id;
        }
      }

      await connectDb.updateRosterWorker(worker.id, {
        status: input.action,
        returnReason: input.action === "returned" ? input.returnReason : null,
        matchedSiteWorkerId,
        reviewedBy: ctx.user.id,
        reviewedAt: new Date(),
      } as any);

      // submission ステータスを作業員ステータスから導出
      const all = await connectDb.listRosterWorkers(worker.submissionId);
      const updated = all.map((w) => (w.id === worker.id ? { ...w, status: input.action } : w));
      const anyReturned = updated.some((w) => w.status === "returned");
      const allRegistered = updated.every((w) => w.status === "registered");
      const nextStatus = allRegistered ? "registered" : anyReturned ? "returned" : "received";
      if (sub.status !== nextStatus && sub.status !== "superseded") {
        await connectDb.updateRosterSubmission(sub.id, { status: nextStatus, reviewedBy: ctx.user.id, reviewedAt: new Date() } as any);
      }
      await safeConnectAuditLog(ctx.user.id, "connect.roster.reviewWorker",
        `名簿作業員を${input.action === "registered" ? "受理" : "差戻し"}: ${worker.displayName}`,
        { submissionId: sub.id, rosterWorkerId: worker.id, matchedSiteWorkerId });
      return { success: true as const, submissionStatus: nextStatus, matchedSiteWorkerId };
    }),
});

/** 出面行に作業員名を付けて DTO 行へ変換（自社の従業員名簿で解決。ゲストは guestName） */
async function buildAttendanceRows(
  companyId: number,
  projectId: number | null,
  periodFrom: string,
  periodTo: string,
): Promise<AttendanceRowDto[]> {
  if (projectId == null) return [];
  const start = new Date(`${periodFrom}T00:00:00.000Z`);
  const end = new Date(`${periodTo}T23:59:59.999Z`);
  const rows = await db.getAttendanceByDateRange(start, end, projectId, companyId);
  const employees = await db.getAllEmployees(companyId);
  const nameById = new Map<number, string>((employees as any[]).map((e) => [Number(e.id), String(e.nameKanji ?? "")]));
  return (rows as any[])
    .filter((a) => a.workType !== "absence" && a.workType !== "day_off")
    .map((a) => ({
      workerName: a.employeeId != null ? (nameById.get(Number(a.employeeId)) ?? `従業員#${a.employeeId}`) : String(a.guestName ?? "ゲスト"),
      workDate: new Date(a.workDate).toISOString().slice(0, 10),
      shiftType: String(a.shiftType ?? "day"),
      hoursWorkedTimes10: Number(a.hoursWorked ?? 0),
      overtimeHoursTimes10: Number(a.overtimeHours ?? 0),
    }));
}

const invoiceSubmissionRouter = router({
  /** 取引先請求書を連携先へ提出（スナップショット凍結）。差戻し後の再提出は supersedesId 指定 */
  submit: connectManagerProcedure
    .input(z.object({
      partnerLinkId: z.number().int().positive(),
      invoiceId: z.number().int().positive(),
      periodFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      periodTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      pdfKeys: z.array(z.string().max(512)).max(50).optional(),
      supersedesId: z.number().int().positive().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const link = await connectDb.getPartnerLinkById(input.partnerLinkId);
      if (!link || link.status !== "accepted") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "承諾済みの連携ではありません" });
      }
      const toCompanyId = otherPartyOf(link, ctx.companyId);

      const invoice = await db.getInvoiceById(input.invoiceId);
      if (!invoice || ((invoice as any).companyId != null && (invoice as any).companyId !== ctx.companyId)) {
        throw new TRPCError({ code: "NOT_FOUND", message: "請求書が見つかりません" });
      }
      const items = await db.getInvoiceItemsByInvoice(input.invoiceId);

      const periodFrom = input.periodFrom ?? new Date((invoice as any).periodStart).toISOString().slice(0, 10);
      const periodTo = input.periodTo ?? new Date((invoice as any).periodEnd).toISOString().slice(0, 10);
      const attendanceRows = await buildAttendanceRows(ctx.companyId, (invoice as any).projectId ?? null, periodFrom, periodTo);

      // ホワイトリストDTOで凍結（内部メモ・単価メモは構造的に含まれない）
      const snapshot = buildInvoiceSnapshotDto(invoice as any, items as any[], attendanceRows);

      let version = 1;
      if (input.supersedesId != null) {
        const prev = await connectDb.getInvoiceSubmissionById(input.supersedesId);
        if (!prev || prev.fromCompanyId !== ctx.companyId || prev.partnerLinkId !== link.id) {
          throw new TRPCError({ code: "NOT_FOUND", message: "再提出元が見つかりません" });
        }
        if (prev.status === "approved" || prev.status === "superseded") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "承認済み/旧版の提出は差し替えできません" });
        }
        version = prev.version + 1;
        await connectDb.updateInvoiceSubmission(prev.id, { status: "superseded" } as any);
      }

      const submission = await connectDb.createInvoiceSubmission({
        partnerLinkId: link.id,
        fromCompanyId: ctx.companyId,
        toCompanyId,
        invoiceRef: input.invoiceId,
        version,
        supersedesId: input.supersedesId ?? null,
        billingPeriodFrom: periodFrom,
        billingPeriodTo: periodTo,
        status: "submitted",
        snapshotJson: snapshot,
        submittedAmount: Number((invoice as any).totalAmount ?? 0),
        pdfKeysJson: input.pdfKeys ?? null,
        submittedBy: ctx.user.id,
      } as any);
      if (!submission) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "提出に失敗しました" });
      await safeConnectAuditLog(ctx.user.id, "connect.invoice.submit",
        `請求書を提出: ${snapshot.invoiceNumber}（¥${snapshot.totalAmount.toLocaleString()}）→ company#${toCompanyId}`,
        { submissionId: submission.id });
      return { submissionId: submission.id, version, submittedAmount: submission.submittedAmount };
    }),

  inbox: connectManagerProcedure.query(async ({ ctx }) => {
    return connectDb.listInvoiceInbox(ctx.companyId);
  }),

  outbox: connectManagerProcedure.query(async ({ ctx }) => {
    const subs = await connectDb.listInvoiceOutbox(ctx.companyId);
    // 相手側の支払状況（買掛）を提出側にも表示（対称性・強制同期はしない）
    return Promise.all(subs.map(async (s) => ({
      ...s,
      payableStatus: (await connectDb.getPartnerPayableBySubmission(s.id))?.status ?? null,
    })));
  }),

  markReceived: connectManagerProcedure
    .input(z.object({ submissionId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const sub = await connectDb.getInvoiceSubmissionById(input.submissionId);
      if (!sub || sub.toCompanyId !== ctx.companyId) throw new TRPCError({ code: "NOT_FOUND", message: "提出が見つかりません" });
      if (sub.status === "submitted") {
        await connectDb.updateInvoiceSubmission(sub.id, { status: "received", reviewedBy: ctx.user.id, reviewedAt: new Date() } as any);
      }
      return { success: true as const };
    }),

  /** 出面突合: 提出スナップショットの出面 vs 受領側の自社出面（氏名×日付・不一致は明示） */
  attendanceComparison: connectManagerProcedure
    .input(z.object({
      submissionId: z.number().int().positive(),
      projectId: z.number().int().positive(),
    }))
    .query(async ({ ctx, input }) => {
      const sub = await connectDb.getInvoiceSubmissionById(input.submissionId);
      if (!sub || sub.toCompanyId !== ctx.companyId) throw new TRPCError({ code: "NOT_FOUND", message: "提出が見つかりません" });
      const project = await db.getProjectById(input.projectId);
      if (!project || ((project as any).companyId != null && (project as any).companyId !== ctx.companyId)) {
        throw new TRPCError({ code: "NOT_FOUND", message: "現場が見つかりません" });
      }
      const snapshot = sub.snapshotJson as unknown as InvoiceSnapshotDto;
      const receiverRows = await buildAttendanceRows(
        ctx.companyId, input.projectId,
        sub.billingPeriodFrom ?? snapshot.periodStart ?? "1970-01-01",
        sub.billingPeriodTo ?? snapshot.periodEnd ?? "2999-12-31",
      );
      return compareAttendance(snapshot.attendance ?? [], receiverRows);
    }),

  /** 査定・減額つき承認（審議#3）。承認額 = 申告額 - Σ控除。買掛を承認額で自動起票 */
  approve: connectManagerProcedure
    .input(z.object({
      submissionId: z.number().int().positive(),
      adjustments: z.array(z.object({ label: z.string().min(1).max(100), amount: z.number().int() })).max(20).optional(),
      memo: z.string().max(1000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const sub = await connectDb.getInvoiceSubmissionById(input.submissionId);
      if (!sub || sub.toCompanyId !== ctx.companyId) throw new TRPCError({ code: "NOT_FOUND", message: "提出が見つかりません" });
      if (!["submitted", "received", "under_review"].includes(sub.status)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `この状態では承認できません（${sub.status}）` });
      }
      const adjustments = input.adjustments ?? [];
      const approvedAmount = computeApprovedAmount(sub.submittedAmount, adjustments);
      if (approvedAmount < 0) throw new TRPCError({ code: "BAD_REQUEST", message: "控除額が申告額を超えています" });

      await connectDb.updateInvoiceSubmission(sub.id, {
        status: "approved", approvedAmount, adjustmentsJson: adjustments,
        reviewedBy: ctx.user.id, reviewedAt: new Date(),
      } as any);
      await connectDb.createPartnerPayable({
        submissionId: sub.id,
        companyId: ctx.companyId,
        counterpartyCompanyId: sub.fromCompanyId,
        amount: approvedAmount,
        status: "unpaid",
        memo: input.memo ?? null,
      } as any);
      await safeConnectAuditLog(ctx.user.id, "connect.invoice.approve",
        `請求を承認: submission#${sub.id} 申告¥${sub.submittedAmount.toLocaleString()} → 承認¥${approvedAmount.toLocaleString()}`,
        { adjustments });
      return { success: true as const, approvedAmount };
    }),

  /** 差戻し（理由必須） */
  returnSubmission: connectManagerProcedure
    .input(z.object({ submissionId: z.number().int().positive(), reason: z.string().min(1).max(1000) }))
    .mutation(async ({ ctx, input }) => {
      const sub = await connectDb.getInvoiceSubmissionById(input.submissionId);
      if (!sub || sub.toCompanyId !== ctx.companyId) throw new TRPCError({ code: "NOT_FOUND", message: "提出が見つかりません" });
      if (!["submitted", "received", "under_review"].includes(sub.status)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `この状態では差戻しできません（${sub.status}）` });
      }
      await connectDb.updateInvoiceSubmission(sub.id, {
        status: "returned", returnReason: input.reason, reviewedBy: ctx.user.id, reviewedAt: new Date(),
      } as any);
      await safeConnectAuditLog(ctx.user.id, "connect.invoice.return", `請求を差戻し: submission#${sub.id}`, { reason: input.reason });
      return { success: true as const };
    }),

  /**
   * 承認済み受領請求を自社請求書の明細行として取り込む（多段チェーン §2.4-4 / Phase 4）。
   * 承認額をそのまま1行（税率0%）で追加し、税の再計算はしない（審議#10 の1円ズレ防止）。
   * 同一 submission の同一請求書への二重取り込みは notes マーカーで拒否する。
   */
  importCostReference: connectManagerProcedure
    .input(z.object({
      submissionId: z.number().int().positive(),
      invoiceId: z.number().int().positive(),
    }))
    .mutation(async ({ ctx, input }) => {
      const sub = await connectDb.getInvoiceSubmissionById(input.submissionId);
      if (!sub || sub.toCompanyId !== ctx.companyId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "受領請求が見つかりません" });
      }
      if (sub.status !== "approved") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "承認済みの受領請求のみ取り込めます" });
      }
      const invoice = await db.getInvoiceById(input.invoiceId);
      if (!invoice || ((invoice as any).companyId != null && (invoice as any).companyId !== ctx.companyId)) {
        throw new TRPCError({ code: "NOT_FOUND", message: "請求書が見つかりません" });
      }

      const marker = `connect:costRef:${sub.id}`;
      const items = await db.getInvoiceItemsByInvoice(input.invoiceId);
      if ((items as any[]).some((i) => i.notes === marker)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "この受領請求は既にこの請求書へ取り込み済みです" });
      }

      const snap = sub.snapshotJson as unknown as InvoiceSnapshotDto;
      const costAmount = sub.approvedAmount ?? sub.submittedAmount;
      const maxSort = (items as any[]).reduce((m, i) => Math.max(m, Number(i.sortOrder ?? 0)), 0);
      await db.createInvoiceItem({
        invoiceId: input.invoiceId,
        itemType: "normal",
        description: `外注費 ${snap?.invoiceNumber ?? `受領請求#${sub.id}`}（承認額・税込参照）`,
        quantity: 10, // 1.0式（×10表現）
        unit: "式",
        unitPrice: costAmount,
        amount: costAmount,
        itemTaxRate: 0, // 承認額（税込）をそのまま参照。税の再計算はしない
        sortOrder: maxSort + 1,
        notes: marker,
      } as any);

      // 合計再計算（routers.ts の recalcInvoiceTotals と同一ロジック。循環importを避けるため複製）
      const after = await db.getInvoiceItemsByInvoice(input.invoiceId);
      let subtotal = 0;
      const taxByRate = new Map<number, number>();
      for (const item of after as any[]) {
        if (item.itemType === "text") continue;
        subtotal += item.amount;
        taxByRate.set(item.itemTaxRate, (taxByRate.get(item.itemTaxRate) || 0) + item.amount);
      }
      let totalTax = 0;
      for (const [rate, base] of Array.from(taxByRate.entries())) {
        totalTax += Math.round((base * rate) / 100);
      }
      await db.updateInvoice(input.invoiceId, { subtotal, taxAmount: totalTax, totalAmount: subtotal + totalTax } as any);

      await safeConnectAuditLog(ctx.user.id, "connect.invoice.importCostReference",
        `原価参照を取り込み: submission#${sub.id}（¥${costAmount.toLocaleString()}）→ invoice#${input.invoiceId}`);
      return { success: true as const, costAmount };
    }),

  /**
   * 多段チェーンの原価参照（§2.4-4）: 承認済み受領請求の一覧。
   * 上位への請求に取り込む際は承認額をそのまま参照し、税の再計算はしない（1円ズレ防止）。
   */
  costReferences: connectManagerProcedure.query(async ({ ctx }) => {
    const subs = await connectDb.listApprovedInvoiceSubmissions(ctx.companyId);
    return subs.map((s) => {
      const snap = s.snapshotJson as unknown as InvoiceSnapshotDto;
      return {
        submissionId: s.id,
        fromCompanyId: s.fromCompanyId,
        invoiceNumber: snap?.invoiceNumber ?? "",
        billingPeriodFrom: s.billingPeriodFrom,
        billingPeriodTo: s.billingPeriodTo,
        /** 原価参照額 = 承認額（税再計算なし） */
        costAmount: s.approvedAmount ?? s.submittedAmount,
      };
    });
  }),
});

const payableRouter = router({
  /** 自社の買掛（承認済み受領請求の支払予定）一覧 */
  list: connectManagerProcedure.query(async ({ ctx }) => {
    return connectDb.listPartnerPayables(ctx.companyId);
  }),

  /** 支払状況の更新（unpaid/scheduled/paid）。相手側の提出箱に表示される */
  setStatus: connectManagerProcedure
    .input(z.object({
      payableId: z.number().int().positive(),
      status: z.enum(["unpaid", "scheduled", "paid"]),
      scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const payables = await connectDb.listPartnerPayables(ctx.companyId);
      const payable = payables.find((p) => p.id === input.payableId);
      if (!payable) throw new TRPCError({ code: "NOT_FOUND", message: "買掛が見つかりません" });
      await connectDb.updatePartnerPayable(payable.id, {
        status: input.status,
        scheduledDate: input.scheduledDate ?? payable.scheduledDate,
        paidAt: input.status === "paid" ? new Date() : null,
        paidBy: input.status === "paid" ? ctx.user.id : null,
      } as any);
      await safeConnectAuditLog(ctx.user.id, "connect.payable.setStatus", `買掛#${payable.id} を ${input.status} に更新`);
      return { success: true as const };
    }),
});

export const connectRouter = router({
  /** 会社間連携が有効か（UIのメニュー表示制御用。off でも FORBIDDEN を投げない） */
  status: protectedProcedure.query(() => ({ enabled: isMultiTenantEnabled() })),
  partner: partnerRouter,
  roster: rosterRouter,
  invoice: invoiceSubmissionRouter,
  payable: payableRouter,
});

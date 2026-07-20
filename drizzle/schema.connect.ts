import { index, int, json, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

/**
 * コネクト層 (会社間連携) — マルチテナント化 Phase 2 (docs/multitenant/PLAN_v1.md §2.3-§2.6)
 *
 * 加算専用スキーマ。既存 schema.ts / schema.genba.ts のテーブルには手を加えない。
 * 会社間のやり取りは必ずこの層を経由し、提出物はホワイトリストDTOのスナップショットとして
 * 不変保存する（相手のDBの生データを覗く方式は採らない）。
 * 全機能は MULTI_TENANT フラグ配下（off の間はルーターが FORBIDDEN）で本番挙動に影響しない。
 */

/**
 * 取引関係リンク（§2.3）。会社ペアの相互承認。
 * - 対等リンク（方向を持たない）。submission が方向を持つ。
 * - 重複防止は無順序ペア (pairMinCompanyId, pairMaxCompanyId) の unique（審議#6）。
 * - suspended（解除）後も既存 submission は双方から閲覧可（証跡保全）。
 */
export const partnerLinks = mysqlTable("partner_links", {
  id: int("id").autoincrement().primaryKey(),
  /** 招待した会社 */
  requesterCompanyId: int("requesterCompanyId").notNull(),
  /** 招待された会社（承諾時に確定。招待段階では想定先＝clients 行のみで null 可） */
  addresseeCompanyId: int("addresseeCompanyId"),
  /** 無順序ペア unique 用（承諾時に確定） */
  pairMinCompanyId: int("pairMinCompanyId"),
  pairMaxCompanyId: int("pairMaxCompanyId"),
  status: mysqlEnum("partnerLinkStatus", ["invited", "accepted", "rejected", "suspended"]).default("invited").notNull(),
  /** 承諾用トークン（genbaShares 方式。nanoid(32)） */
  token: varchar("token", { length: 64 }).notNull(),
  invitedBy: int("invitedBy"),
  acceptedBy: int("acceptedBy"),
  acceptedAt: timestamp("acceptedAt"),
  suspendedAt: timestamp("suspendedAt"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ([
  uniqueIndex("partner_links_token").on(table.token),
  uniqueIndex("partner_links_pair_unique").on(table.pairMinCompanyId, table.pairMaxCompanyId),
  index("partner_links_requester_idx").on(table.requesterCompanyId),
  index("partner_links_addressee_idx").on(table.addresseeCompanyId),
]));

export type PartnerLink = typeof partnerLinks.$inferSelect;
export type InsertPartnerLink = typeof partnerLinks.$inferInsert;

/**
 * リンク⇔取引先マスタ行の対応（審議#6: 同じ相手が売上先/仕入先で別マスタ行になるため 1:N 許容）。
 * companyId = clients 行を所有する会社。既存 clients テーブルは変更しない。
 */
export const partnerLinkClientMaps = mysqlTable("partner_link_client_maps", {
  id: int("id").autoincrement().primaryKey(),
  partnerLinkId: int("partnerLinkId").notNull(),
  /** clients 行を所有する会社 */
  companyId: int("companyId").notNull(),
  /** その会社の clients.id */
  clientId: int("clientId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ([
  uniqueIndex("partner_link_client_maps_unique").on(table.partnerLinkId, table.companyId, table.clientId),
  index("partner_link_client_maps_company_idx").on(table.companyId, table.clientId),
]));

export type PartnerLinkClientMap = typeof partnerLinkClientMaps.$inferSelect;
export type InsertPartnerLinkClientMap = typeof partnerLinkClientMaps.$inferInsert;

/**
 * 作業員名簿・資格書の提出（§2.5 第1弾-b）。
 * - workerSetJson はホワイトリストDTO（単価・支払情報・内部メモを構造的に含めない）の凍結コピー。
 * - 再提出はイミュータブル新行 + supersedesId（審議#4）。
 * - ファイルは R2 キーのみ（pdfKeysJson）。
 */
export const partnerRosterSubmissions = mysqlTable("partner_roster_submissions", {
  id: int("id").autoincrement().primaryKey(),
  partnerLinkId: int("partnerLinkId").notNull(),
  fromCompanyId: int("fromCompanyId").notNull(),
  toCompanyId: int("toCompanyId").notNull(),
  /** 提出先の現場名（相手テナントの projectId 連携は将来。まずは表示名） */
  projectRef: varchar("projectRef", { length: 256 }),
  /** 受領側 genba 現場への任意リンク（名寄せ用） */
  toGenbaSiteId: varchar("toGenbaSiteId", { length: 24 }),
  version: int("version").default(1).notNull(),
  /** 再提出時に置き換えた旧版 submission.id（旧版は superseded になるが行は不変保存） */
  supersedesId: int("supersedesId"),
  status: mysqlEnum("rosterSubmissionStatus", ["submitted", "received", "registered", "returned", "superseded"]).default("submitted").notNull(),
  /** ホワイトリストDTOの凍結コピー（作業員配列） */
  workerSetJson: json("workerSetJson").notNull(),
  /** 名簿PDF・資格証書などの R2 キー配列 */
  pdfKeysJson: json("pdfKeysJson"),
  returnReason: text("returnReason"),
  submittedBy: int("submittedBy"),
  reviewedBy: int("reviewedBy"),
  reviewedAt: timestamp("reviewedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ([
  index("partner_roster_submissions_link_idx").on(table.partnerLinkId),
  index("partner_roster_submissions_from_idx").on(table.fromCompanyId, table.status),
  index("partner_roster_submissions_to_idx").on(table.toCompanyId, table.status),
]));

export type PartnerRosterSubmission = typeof partnerRosterSubmissions.$inferSelect;
export type InsertPartnerRosterSubmission = typeof partnerRosterSubmissions.$inferInsert;

/**
 * 提出名簿の作業員単位ステータス（審議#14: JSONでなく子テーブル。差戻し・受理を作業員単位で扱う）。
 * employeeRef は提出元テナントの employees.id（受領側からは直接参照できない「写しのID」）。
 */
export const partnerRosterWorkers = mysqlTable("partner_roster_workers", {
  id: int("id").autoincrement().primaryKey(),
  submissionId: int("submissionId").notNull(),
  /** 提出元テナントの employees.id（写し） */
  employeeRef: int("employeeRef").notNull(),
  displayName: varchar("displayName", { length: 128 }).notNull(),
  /** CCUS番号（会社横断の名寄せキー。§2.6） */
  ccusNumber: varchar("ccusNumber", { length: 64 }),
  status: mysqlEnum("rosterWorkerStatus", ["pending", "registered", "returned"]).default("pending").notNull(),
  returnReason: text("returnReason"),
  /** 受理時に紐付けた受領側 genba_site_workers.id（名寄せ結果） */
  matchedSiteWorkerId: varchar("matchedSiteWorkerId", { length: 24 }),
  reviewedBy: int("reviewedBy"),
  reviewedAt: timestamp("reviewedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ([
  uniqueIndex("partner_roster_workers_unique").on(table.submissionId, table.employeeRef),
  index("partner_roster_workers_submission_idx").on(table.submissionId, table.status),
]));

export type PartnerRosterWorker = typeof partnerRosterWorkers.$inferSelect;
export type InsertPartnerRosterWorker = typeof partnerRosterWorkers.$inferInsert;

/**
 * 会社間 請求書提出（§2.4 第1弾-a / Phase 3）。
 * - snapshotJson はホワイトリストDTO（内部メモ・単価メモを構造的に含めない）の凍結コピー。
 * - 再提出はイミュータブル新行 + supersedesId（審議#4）。approved は supersede 不可。
 * - 査定・減額承認（審議#3）: approvedAmount + adjustmentsJson（控除明細）。
 * - billingPeriod を明示（審議#7: 締め日ズレ対応。突合は期間の部分重複前提）。
 */
export const partnerInvoiceSubmissions = mysqlTable("partner_invoice_submissions", {
  id: int("id").autoincrement().primaryKey(),
  partnerLinkId: int("partnerLinkId").notNull(),
  fromCompanyId: int("fromCompanyId").notNull(),
  toCompanyId: int("toCompanyId").notNull(),
  /** 提出元テナントの invoices.id（写し） */
  invoiceRef: int("invoiceRef").notNull(),
  version: int("version").default(1).notNull(),
  supersedesId: int("supersedesId"),
  /** 請求対象期間 YYYY-MM-DD */
  billingPeriodFrom: varchar("billingPeriodFrom", { length: 10 }),
  billingPeriodTo: varchar("billingPeriodTo", { length: 10 }),
  status: mysqlEnum("invoiceSubmissionStatus", ["submitted", "received", "under_review", "approved", "returned", "superseded"]).default("submitted").notNull(),
  /** ホワイトリストDTO凍結コピー（請求書ヘッダ+明細+出面明細） */
  snapshotJson: json("snapshotJson").notNull(),
  /** 申告額（提出時の請求総額） */
  submittedAmount: int("submittedAmount").notNull(),
  /** 承認額（査定後。承認まで null）。買掛はこの額で起票する */
  approvedAmount: int("approvedAmount"),
  /** 控除明細 [{label, amount}]（協力会費・安全協力費など。申告額-Σ控除=承認額） */
  adjustmentsJson: json("adjustmentsJson"),
  /** 名簿PDF等の R2 キー配列 */
  pdfKeysJson: json("pdfKeysJson"),
  returnReason: text("returnReason"),
  submittedBy: int("submittedBy"),
  reviewedBy: int("reviewedBy"),
  reviewedAt: timestamp("reviewedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ([
  index("partner_invoice_submissions_link_idx").on(table.partnerLinkId),
  index("partner_invoice_submissions_from_idx").on(table.fromCompanyId, table.status),
  index("partner_invoice_submissions_to_idx").on(table.toCompanyId, table.status),
]));

export type PartnerInvoiceSubmission = typeof partnerInvoiceSubmissions.$inferSelect;
export type InsertPartnerInvoiceSubmission = typeof partnerInvoiceSubmissions.$inferInsert;

/**
 * 受領側の買掛（支払予定）— 審議#8。承認と同時に承認額で自動起票され、
 * 「A社の入金 = B社の支払」の対称性をコネクト層で表現する（片方の操作は相手に表示のみ・強制同期しない）。
 */
export const partnerPayables = mysqlTable("partner_payables", {
  id: int("id").autoincrement().primaryKey(),
  /** 対応する請求提出（1:1） */
  submissionId: int("submissionId").notNull(),
  /** 買掛を負う会社（=受領側） */
  companyId: int("companyId").notNull(),
  counterpartyCompanyId: int("counterpartyCompanyId").notNull(),
  /** 承認額 */
  amount: int("amount").notNull(),
  status: mysqlEnum("partnerPayableStatus", ["unpaid", "scheduled", "paid"]).default("unpaid").notNull(),
  scheduledDate: varchar("scheduledDate", { length: 10 }),
  paidAt: timestamp("paidAt"),
  paidBy: int("paidBy"),
  memo: text("memo"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ([
  uniqueIndex("partner_payables_submission_unique").on(table.submissionId),
  index("partner_payables_company_idx").on(table.companyId, table.status),
]));

export type PartnerPayable = typeof partnerPayables.$inferSelect;
export type InsertPartnerPayable = typeof partnerPayables.$inferInsert;

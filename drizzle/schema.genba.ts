import { boolean, decimal, index, int, json, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

/**
 * 現場ビジョン (genba) — 加算専用スキーマ。
 * 既存 schema.ts のテーブルには一切手を加えない。
 * 主キーはプロトタイプ (GenbaAppV18) 互換の varchar(24) クライアント生成uid。
 * 高頻度追記の genba_activity_logs のみ autoincrement。
 * FK制約は既存慣習どおり張らず、indexで担保する。
 */

/** 現場 (サイト) */
export const genbaSites = mysqlTable("genba_sites", {
  id: varchar("id", { length: 24 }).primaryKey(),
  /** 現場名 */
  name: varchar("name", { length: 120 }).notNull(),
  /** 既存 projects への任意リンク (人工集計・工期連携用) */
  projectId: int("projectId"),
  /** Google Drive 等の共有フォルダURL */
  driveUrl: varchar("driveUrl", { length: 500 }),
  archived: boolean("archived").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ([
  index("genba_sites_project_idx").on(table.projectId),
  index("genba_sites_archived_idx").on(table.archived),
]));

export type GenbaSite = typeof genbaSites.$inferSelect;
export type InsertGenbaSite = typeof genbaSites.$inferInsert;

/** フロア (図面1枚 = 1フロア) */
export const genbaFloors = mysqlTable("genba_floors", {
  id: varchar("id", { length: 24 }).primaryKey(),
  siteId: varchar("siteId", { length: 24 }).notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  /** R2オブジェクトキーのみ格納 (base64禁止) */
  imageKey: varchar("imageKey", { length: 200 }),
  /** 図面画像の元サイズ (px) */
  w: int("w"),
  h: int("h"),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ([
  index("genba_floors_site_idx").on(table.siteId),
]));

export type GenbaFloor = typeof genbaFloors.$inferSelect;
export type InsertGenbaFloor = typeof genbaFloors.$inferInsert;

/** ゾーン (図面上のポリゴン領域。parentZoneId で入れ子) */
export const genbaZones = mysqlTable("genba_zones", {
  id: varchar("id", { length: 24 }).primaryKey(),
  floorId: varchar("floorId", { length: 24 }).notNull(),
  /** 自己参照 (サブゾーン) */
  parentZoneId: varchar("parentZoneId", { length: 24 }),
  name: varchar("name", { length: 120 }).notNull(),
  /** ポリゴン頂点配列 [{x,y}, ...] */
  polygon: json("polygon"),
  priority: int("priority"),
  workStatus: varchar("workStatus", { length: 16 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ([
  index("genba_zones_floor_idx").on(table.floorId),
  index("genba_zones_parent_idx").on(table.parentZoneId),
]));

export type GenbaZone = typeof genbaZones.$inferSelect;
export type InsertGenbaZone = typeof genbaZones.$inferInsert;

/** タスク (parentTaskId で入れ子) */
export const genbaTasks = mysqlTable("genba_tasks", {
  id: varchar("id", { length: 24 }).primaryKey(),
  zoneId: varchar("zoneId", { length: 24 }).notNull(),
  /** 自己参照 (サブタスク) */
  parentTaskId: varchar("parentTaskId", { length: 24 }),
  name: varchar("name", { length: 200 }).notNull(),
  romaji: varchar("romaji", { length: 200 }),
  status: mysqlEnum("genbaTaskStatus", ["todo", "progress", "done", "issue"]).default("todo").notNull(),
  /** 進捗% (0-100, null=未設定) */
  percent: int("percent"),
  priority: int("priority"),
  issueText: text("issueText"),
  /** YYYY-MM-DD */
  startDate: varchar("startDate", { length: 10 }),
  /** YYYY-MM-DD */
  dueDate: varchar("dueDate", { length: 10 }),
  memo: text("memo"),
  memoVisible: boolean("memoVisible").default(false).notNull(),
  linkUrl: varchar("linkUrl", { length: 500 }),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ([
  index("genba_tasks_zone_idx").on(table.zoneId),
  index("genba_tasks_parent_idx").on(table.parentTaskId),
]));

export type GenbaTask = typeof genbaTasks.$inferSelect;
export type InsertGenbaTask = typeof genbaTasks.$inferInsert;

/** タスク担当者 (既存 users.id への参照) */
export const genbaTaskAssignees = mysqlTable("genba_task_assignees", {
  id: varchar("id", { length: 24 }).primaryKey(),
  taskId: varchar("taskId", { length: 24 }).notNull(),
  userId: int("userId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ([
  uniqueIndex("genba_task_assignees_task_user").on(table.taskId, table.userId),
  index("genba_task_assignees_user_idx").on(table.userId),
]));

export type GenbaTaskAssignee = typeof genbaTaskAssignees.$inferSelect;
export type InsertGenbaTaskAssignee = typeof genbaTaskAssignees.$inferInsert;

/** タスク×チーム割り当て */
export const genbaTaskTeams = mysqlTable("genba_task_teams", {
  id: varchar("id", { length: 24 }).primaryKey(),
  taskId: varchar("taskId", { length: 24 }).notNull(),
  teamId: varchar("teamId", { length: 24 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ([
  uniqueIndex("genba_task_teams_task_team").on(table.taskId, table.teamId),
  index("genba_task_teams_team_idx").on(table.teamId),
]));

export type GenbaTaskTeam = typeof genbaTaskTeams.$inferSelect;
export type InsertGenbaTaskTeam = typeof genbaTaskTeams.$inferInsert;

/** チーム (現場単位) */
export const genbaTeams = mysqlTable("genba_teams", {
  id: varchar("id", { length: 24 }).primaryKey(),
  siteId: varchar("siteId", { length: 24 }).notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ([
  index("genba_teams_site_idx").on(table.siteId),
]));

export type GenbaTeam = typeof genbaTeams.$inferSelect;
export type InsertGenbaTeam = typeof genbaTeams.$inferInsert;

/** チームメンバー (既存 users.id への参照) */
export const genbaTeamMembers = mysqlTable("genba_team_members", {
  id: varchar("id", { length: 24 }).primaryKey(),
  teamId: varchar("teamId", { length: 24 }).notNull(),
  userId: int("userId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ([
  uniqueIndex("genba_team_members_team_user").on(table.teamId, table.userId),
  index("genba_team_members_user_idx").on(table.userId),
]));

export type GenbaTeamMember = typeof genbaTeamMembers.$inferSelect;
export type InsertGenbaTeamMember = typeof genbaTeamMembers.$inferInsert;

/** 指示 (対象: 全員 / チーム / 作業員個人) */
export const genbaInstructions = mysqlTable("genba_instructions", {
  id: varchar("id", { length: 24 }).primaryKey(),
  siteId: varchar("siteId", { length: 24 }).notNull(),
  text: text("text").notNull(),
  targetKind: mysqlEnum("genbaInstructionTargetKind", ["all", "team", "worker"]).default("all").notNull(),
  /** targetKind=team のとき genba_teams.id、worker のとき users.id (文字列化) */
  targetId: varchar("targetId", { length: 24 }),
  zoneId: varchar("zoneId", { length: 24 }),
  byUserId: int("byUserId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ([
  index("genba_instructions_site_idx").on(table.siteId),
]));

export type GenbaInstruction = typeof genbaInstructions.$inferSelect;
export type InsertGenbaInstruction = typeof genbaInstructions.$inferInsert;

/** 指示の既読 */
export const genbaInstructionReads = mysqlTable("genba_instruction_reads", {
  id: varchar("id", { length: 24 }).primaryKey(),
  instructionId: varchar("instructionId", { length: 24 }).notNull(),
  userId: int("userId").notNull(),
  readAt: timestamp("readAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ([
  uniqueIndex("genba_instruction_reads_inst_user").on(table.instructionId, table.userId),
]));

export type GenbaInstructionRead = typeof genbaInstructionReads.$inferSelect;
export type InsertGenbaInstructionRead = typeof genbaInstructionReads.$inferInsert;

/** タスクイベント (ステータス変更履歴・問題報告・返信・引き継ぎを集約) */
export const genbaTaskEvents = mysqlTable("genba_task_events", {
  id: varchar("id", { length: 24 }).primaryKey(),
  taskId: varchar("taskId", { length: 24 }).notNull(),
  kind: mysqlEnum("genbaTaskEventKind", ["status", "issue", "reply", "handover"]).notNull(),
  byUserId: int("byUserId"),
  text: text("text"),
  /** 添付写真のR2キー配列 */
  photoKeys: json("photoKeys"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ([
  index("genba_task_events_task_idx").on(table.taskId, table.createdAt),
]));

export type GenbaTaskEvent = typeof genbaTaskEvents.$inferSelect;
export type InsertGenbaTaskEvent = typeof genbaTaskEvents.$inferInsert;

/** 資材プリセット (工事名 → 部材名リスト) */
export const genbaMaterialPresets = mysqlTable("genba_material_presets", {
  id: varchar("id", { length: 24 }).primaryKey(),
  /** null = 全現場共通プリセット */
  siteId: varchar("siteId", { length: 24 }),
  workName: varchar("workName", { length: 120 }).notNull(),
  /** 部材名の文字列配列 */
  parts: json("parts"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ([
  index("genba_material_presets_site_idx").on(table.siteId),
]));

export type GenbaMaterialPreset = typeof genbaMaterialPresets.$inferSelect;
export type InsertGenbaMaterialPreset = typeof genbaMaterialPresets.$inferInsert;

/** 資材依頼 */
export const genbaMaterialRequests = mysqlTable("genba_material_requests", {
  id: varchar("id", { length: 24 }).primaryKey(),
  siteId: varchar("siteId", { length: 24 }).notNull(),
  byUserId: int("byUserId"),
  status: mysqlEnum("genbaMaterialRequestStatus", ["pending", "ordered", "delivered"]).default("pending").notNull(),
  note: text("note"),
  orderedAt: timestamp("orderedAt"),
  deliveredAt: timestamp("deliveredAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ([
  index("genba_material_requests_site_idx").on(table.siteId),
]));

export type GenbaMaterialRequest = typeof genbaMaterialRequests.$inferSelect;
export type InsertGenbaMaterialRequest = typeof genbaMaterialRequests.$inferInsert;

/** 資材依頼の明細 */
export const genbaMaterialRequestItems = mysqlTable("genba_material_request_items", {
  id: varchar("id", { length: 24 }).primaryKey(),
  requestId: varchar("requestId", { length: 24 }).notNull(),
  name: varchar("name", { length: 200 }).notNull(),
  qty: int("qty").default(1).notNull(),
  unit: varchar("unit", { length: 8 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ([
  index("genba_material_request_items_req_idx").on(table.requestId),
]));

export type GenbaMaterialRequestItem = typeof genbaMaterialRequestItems.$inferSelect;
export type InsertGenbaMaterialRequestItem = typeof genbaMaterialRequestItems.$inferInsert;

/** タスクテンプレート (自己参照ツリー) */
export const genbaTaskTemplates = mysqlTable("genba_task_templates", {
  id: varchar("id", { length: 24 }).primaryKey(),
  parentId: varchar("parentId", { length: 24 }),
  name: varchar("name", { length: 200 }).notNull(),
  romaji: varchar("romaji", { length: 200 }),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ([
  index("genba_task_templates_parent_idx").on(table.parentId),
]));

export type GenbaTaskTemplate = typeof genbaTaskTemplates.$inferSelect;
export type InsertGenbaTaskTemplate = typeof genbaTaskTemplates.$inferInsert;

/** 共有リンク (トークンによる限定公開) */
export const genbaShares = mysqlTable("genba_shares", {
  id: varchar("id", { length: 24 }).primaryKey(),
  siteId: varchar("siteId", { length: 24 }).notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  token: varchar("token", { length: 64 }).notNull(),
  /** 公開範囲スコープの配列 */
  scopes: json("scopes"),
  expiresAt: timestamp("expiresAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ([
  uniqueIndex("genba_shares_token").on(table.token),
  index("genba_shares_site_idx").on(table.siteId),
]));

export type GenbaShare = typeof genbaShares.$inferSelect;
export type InsertGenbaShare = typeof genbaShares.$inferInsert;

/** 予算トラッカー (現場ごとに1行 = siteId PK) */
export const genbaBudgets = mysqlTable("genba_budgets", {
  siteId: varchar("siteId", { length: 24 }).primaryKey(),
  enabled: boolean("enabled").default(false).notNull(),
  /** 請負金額 (円) */
  contractAmount: int("contractAmount").default(0).notNull(),
  targetType: mysqlEnum("genbaBudgetTargetType", ["percent", "amount"]).default("percent").notNull(),
  targetValue: int("targetValue").default(0).notNull(),
  /** 1人工あたり原価 (円) */
  costPerManDay: int("costPerManDay").default(0).notNull(),
  /** 月次経費 (円) */
  monthlyExpense: int("monthlyExpense").default(0).notNull(),
  /** YYYY-MM-DD */
  periodStart: varchar("periodStart", { length: 10 }),
  /** YYYY-MM-DD */
  periodEnd: varchar("periodEnd", { length: 10 }),
  /** 集計開始前の人工補正値 (manual/project 両モード共通) */
  preManDays: decimal("preManDays", { precision: 8, scale: 1 }).default("0.0").notNull(),
  /** manual: genba_budget_attendance を集計 / project: 既存 attendance を projectId×期間で SUM(hoursWorked)/80.0 */
  attendanceSource: mysqlEnum("genbaBudgetAttendanceSource", ["manual", "project"]).default("manual").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type GenbaBudget = typeof genbaBudgets.$inferSelect;
export type InsertGenbaBudget = typeof genbaBudgets.$inferInsert;

/** 予算トラッカー用の手入力人工 */
export const genbaBudgetAttendance = mysqlTable("genba_budget_attendance", {
  id: varchar("id", { length: 24 }).primaryKey(),
  siteId: varchar("siteId", { length: 24 }).notNull(),
  /** YYYY-MM-DD */
  date: varchar("date", { length: 10 }).notNull(),
  manDays: decimal("manDays", { precision: 6, scale: 1 }).default("0.0").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ([
  index("genba_budget_attendance_site_date_idx").on(table.siteId, table.date),
]));

export type GenbaBudgetAttendance = typeof genbaBudgetAttendance.$inferSelect;
export type InsertGenbaBudgetAttendance = typeof genbaBudgetAttendance.$inferInsert;

/** 個人設定 (端末をまたぐ。既存 users.id が主キー) */
export const genbaUserSettings = mysqlTable("genba_user_settings", {
  userId: int("userId").primaryKey(),
  /** 表示色 #RRGGBB / #RRGGBBAA */
  color: varchar("color", { length: 9 }),
  theme: varchar("theme", { length: 24 }),
  lang: varchar("lang", { length: 4 }),
  guideSeen: boolean("guideSeen").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type GenbaUserSettings = typeof genbaUserSettings.$inferSelect;
export type InsertGenbaUserSettings = typeof genbaUserSettings.$inferInsert;

/** アクティビティログ (高頻度追記のため autoincrement PK) */
export const genbaActivityLogs = mysqlTable("genba_activity_logs", {
  id: int("id").autoincrement().primaryKey(),
  type: varchar("type", { length: 24 }).notNull(),
  byUserId: int("byUserId"),
  payload: json("payload"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ([
  index("genba_activity_logs_type_created_idx").on(table.type, table.createdAt),
]));

export type GenbaActivityLog = typeof genbaActivityLogs.$inferSelect;
export type InsertGenbaActivityLog = typeof genbaActivityLogs.$inferInsert;

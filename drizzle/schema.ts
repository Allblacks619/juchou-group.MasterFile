import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, boolean, json, uniqueIndex } from "drizzle-orm/mysql-core";
/**
 * Core user table backing auth flow.
 * Extended with role hierarchy: admin (統合管理者), leader (責任者), worker (作業員)
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  /** App-level role: admin=統合管理者, leader=責任者, worker=作業員 */
  appRole: mysqlEnum("appRole", ["admin", "leader", "worker"]).default("worker").notNull(),
  /** Login ID (romaji name) for invitation-based login */
  loginId: varchar("loginId", { length: 128 }).unique(),
  /** Hashed password (bcrypt) */
  passwordHash: varchar("passwordHash", { length: 256 }),
  /** Must change password on first login */
  mustChangePassword: boolean("mustChangePassword").default(false).notNull(),
  /** Linked employee profile ID */
  employeeId: int("employeeId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Invitation links for user registration
 */
export const invitations = mysqlTable("invitations", {
  id: int("id").autoincrement().primaryKey(),
  /** Unique token for the invitation link */
  token: varchar("token", { length: 128 }).notNull().unique(),
  /** Login ID (romaji name) assigned to the invitee */
  loginId: varchar("loginId", { length: 128 }).notNull(),
  /** Temporary password */
  tempPassword: varchar("tempPassword", { length: 256 }).notNull(),
  /** Role to assign: admin, leader, worker */
  assignedRole: mysqlEnum("assignedRole", ["admin", "leader", "worker"]).default("worker").notNull(),
  /** Optional email to send invitation to */
  recipientEmail: varchar("recipientEmail", { length: 320 }),
  /** Invitation status */
  status: mysqlEnum("status", ["pending", "used", "expired"]).default("pending").notNull(),
  /** Whether invitation email was sent */
  emailSent: boolean("emailSent").default(false).notNull(),
  /** Created by user ID */
  createdBy: int("createdBy"),
  /** Expiry timestamp */
  expiresAt: timestamp("expiresAt").notNull(),
  /** Used at timestamp */
  usedAt: timestamp("usedAt"),
  /** Used by user ID */
  usedBy: int("usedBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Invitation = typeof invitations.$inferSelect;
export type InsertInvitation = typeof invitations.$inferInsert;

/**
 * Company profile (会社情報)
 */
export const companyProfile = mysqlTable("company_profile", {
  id: int("id").autoincrement().primaryKey(),
  /** Company name */
  companyName: varchar("companyName", { length: 256 }).notNull(),
  /** Postal code */
  postalCode: varchar("postalCode", { length: 16 }),
  /** Address */
  address: text("address"),
  /** Phone number */
  phone: varchar("phone", { length: 32 }),
  /** Email */
  email: varchar("email", { length: 320 }),
  /** Registration number */
  registrationNumber: varchar("registrationNumber", { length: 64 }),
  /** Qualified invoice issuer number (適格請求事業者番号) */
  invoiceIssuerNumber: varchar("invoiceIssuerNumber", { length: 64 }),
  /** Bank name */
  bankName: varchar("bankName", { length: 128 }),
  /** Branch name */
  branchName: varchar("branchName", { length: 128 }),
  /** Account type */
  accountType: mysqlEnum("accountType", ["ordinary", "checking"]).default("ordinary"),
  /** Account number */
  accountNumber: varchar("accountNumber", { length: 32 }),
  /** Account holder name */
  accountHolder: varchar("accountHolder", { length: 128 }),
  /** Logo URL (S3) */
  logoUrl: text("logoUrl"),
  /** Seal URL (S3) */
  sealUrl: text("sealUrl"),
  /** Watermark URL (S3) */
  watermarkUrl: text("watermarkUrl"),
  /** Seal position/size settings as JSON */
  sealSettings: json("sealSettings"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CompanyProfile = typeof companyProfile.$inferSelect;
export type InsertCompanyProfile = typeof companyProfile.$inferInsert;

/**
 * Employee profiles
 */
export const employees = mysqlTable("employees", {
  id: int("id").autoincrement().primaryKey(),
  /** Linked user ID (nullable for guest workers) */
  userId: int("userId"),

  // ── Basic info ──
  /** Name in katakana */
  nameKana: varchar("nameKana", { length: 128 }),
  /** Name in kanji */
  nameKanji: varchar("nameKanji", { length: 128 }).notNull(),
  /** Name in romaji */
  nameRomaji: varchar("nameRomaji", { length: 128 }),
  /** Years of experience */
  experienceYears: int("experienceYears"),
  /** Date of birth (stored as timestamp) */
  dateOfBirth: timestamp("dateOfBirth"),
  /** Blood type */
  bloodType: mysqlEnum("bloodType", ["A", "B", "AB", "O"]),
  /** Gender */
  gender: mysqlEnum("gender", ["male", "female"]),
  /** Profile photo URL (S3) */
  photoUrl: text("photoUrl"),
  /** 建設キャリアアップCCUS番号 (moved to basic info) */
  careerUpNumber: varchar("careerUpNumber", { length: 64 }),

  // ── Nationality & Residence ──
  /** Nationality */
  nationality: varchar("nationality", { length: 64 }).default("日本").notNull(),
  /** Residence status (在留資格) - only for non-Japanese */
  residenceStatus: varchar("residenceStatus", { length: 128 }),
  /** Residence card number */
  residenceCardNumber: varchar("residenceCardNumber", { length: 32 }),
  /** Residence card expiry */
  residenceCardExpiry: timestamp("residenceCardExpiry"),
  /** Passport number */
  passportNumber: varchar("passportNumber", { length: 32 }),
  /** Passport expiry */
  passportExpiry: timestamp("passportExpiry"),

  // ── Address & Contact ──
  /** Postal code */
  postalCode: varchar("postalCode", { length: 16 }),
  /** Address */
  address: text("address"),
  /** Phone number */
  phone: varchar("phone", { length: 32 }),
  /** Email */
  email: varchar("email", { length: 320 }),

  // ── Insurance & Admin ──
  /** Health check date */
  healthCheckDate: timestamp("healthCheckDate"),
  /** Health insurance number */
  healthInsuranceNumber: varchar("healthInsuranceNumber", { length: 64 }),
  /** Insurance type */
  insuranceType: mysqlEnum("insuranceType", ["national", "social", "construction"]),
  /** Insurance number type: workers_comp (労災保険) or employment (雇用保険) - selectable */
  insuranceNumberType: mysqlEnum("insuranceNumberType", ["workers_comp", "employment"]),
  /** Workers' compensation insurance number (労災保険番号) */
  workersCompNumber: varchar("workersCompNumber", { length: 64 }),
  /** Basic pension number */
  pensionNumber: varchar("pensionNumber", { length: 64 }),
  /** Employment type */
  employmentType: mysqlEnum("employmentType", ["sole_proprietor", "employee", "other"]),
  /** Employment insurance number (雇用保険番号) */
  employmentInsuranceNumber: varchar("employmentInsuranceNumber", { length: 64 }),

  // ── Emergency contact ──
  /** Emergency contact name (kana) */
  emergencyNameKana: varchar("emergencyNameKana", { length: 128 }),
  /** Emergency contact name (kanji) */
  emergencyNameKanji: varchar("emergencyNameKanji", { length: 128 }),
  /** Emergency contact relationship */
  emergencyRelationship: varchar("emergencyRelationship", { length: 64 }),
  /** Emergency contact postal code */
  emergencyPostalCode: varchar("emergencyPostalCode", { length: 16 }),
  /** Emergency contact address */
  emergencyAddress: text("emergencyAddress"),
  /** Emergency contact phone */
  emergencyPhone: varchar("emergencyPhone", { length: 32 }),

  // ── Bank info (visible to self and admin only) ──
  /** Bank name */
  bankName: varchar("bankName", { length: 128 }),
  /** Branch name */
  branchName: varchar("branchName", { length: 128 }),
  /** Account type */
  accountType: mysqlEnum("empAccountType", ["ordinary", "checking"]).default("ordinary"),
  /** Account number */
  accountNumber: varchar("accountNumber", { length: 32 }),
  /** Account holder name */
  accountHolder: varchar("accountHolder", { length: 128 }),

  // ── Invoice related ──
  /** Qualified invoice issuer: true = 対応, false = 非対応 */
  isInvoiceIssuer: boolean("isInvoiceIssuer").default(false).notNull(),
  /** Qualified invoice issuer number (T + 13 digits) */
  invoiceIssuerNumber: varchar("invoiceIssuerNumber", { length: 32 }),
  /** Personal stamp image URL (S3) */
  stampUrl: text("stampUrl"),

  // ── Health check ──
  /** Blood pressure (systolic) */
  bloodPressureHigh: int("bloodPressureHigh"),
  /** Blood pressure (diastolic) */
  bloodPressureLow: int("bloodPressureLow"),
  /** Health insurance insured number (被保険者番号) - kept for backward compat but hidden in UI */
  insuredNumber: varchar("insuredNumber", { length: 64 }),

  // ── Height / Weight (kept for backward compat but hidden in UI) ──
  height: int("height"),
  weight: int("weight"),

  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Employee = typeof employees.$inferSelect;
export type InsertEmployee = typeof employees.$inferInsert;

/**
 * Employee qualifications (multiple per employee)
 */
export const qualifications = mysqlTable("qualifications", {
  id: int("id").autoincrement().primaryKey(),
  /** Employee ID */
  employeeId: int("employeeId").notNull(),
  /** Qualification name */
  name: varchar("name", { length: 256 }).notNull(),
  /** Date obtained */
  obtainedDate: timestamp("obtainedDate"),
  /** Certificate number */
  certificateNumber: varchar("certificateNumber", { length: 128 }),
  /** Certificate file URL (S3) - uploaded when adding qualification */
  certificateFileUrl: text("certificateFileUrl"),
  /** Certificate file key (S3) */
  certificateFileKey: varchar("certificateFileKey", { length: 512 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Qualification = typeof qualifications.$inferSelect;
export type InsertQualification = typeof qualifications.$inferInsert;

/**
 * Documents uploaded by/for employees
 * Extended with more document types for front/back uploads
 */
export const documents = mysqlTable("documents", {
  id: int("id").autoincrement().primaryKey(),
  /** Employee ID */
  employeeId: int("employeeId").notNull(),
  /** Document type - extended with front/back variants and new types */
  documentType: mysqlEnum("documentType", [
    "drivers_license",
    "residence_card",
    "passport",
    "health_check",
    "qualification_cert",
    "id_document",
    "stamp",
    "invoice",
    "receipt",
    "other",
    // New types for front/back uploads
    "residence_card_front",
    "residence_card_back",
    "drivers_license_front",
    "drivers_license_back",
    // New types for insurance/pension/CCUS
    "insurance_card",
    "pension_book",
    "ccus_card",
  ]).notNull(),
  /** Original filename */
  fileName: varchar("fileName", { length: 512 }).notNull(),
  /** S3 file URL */
  fileUrl: text("fileUrl").notNull(),
  /** S3 file key */
  fileKey: varchar("fileKey", { length: 512 }).notNull(),
  /** MIME type */
  mimeType: varchar("mimeType", { length: 128 }),
  /** File size in bytes */
  fileSize: int("fileSize"),
  /** Expiry date for documents with expiration */
  expiryDate: timestamp("expiryDate"),
  /** Document status */
  docStatus: mysqlEnum("docStatus", ["valid", "renewing", "renewed", "expired"]).default("valid").notNull(),
  /** Notes */
  notes: text("notes"),
  /** Uploaded by user ID */
  uploadedBy: int("uploadedBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Document = typeof documents.$inferSelect;
export type InsertDocument = typeof documents.$inferInsert;

/**
 * Clients (取引先) - companies that hire us
 */
export const clients = mysqlTable("clients", {
  id: int("id").autoincrement().primaryKey(),
  /** Client company name */
  name: varchar("name", { length: 256 }).notNull(),
  /** Postal code */
  postalCode: varchar("postalCode", { length: 16 }),
  /** Address */
  address: text("address"),
  /** Phone number */
  phone: varchar("phone", { length: 32 }),
  /** Email */
  email: varchar("email", { length: 320 }),
  /** Contact person name */
  contactPerson: varchar("contactPerson", { length: 128 }),
  /** Notes */
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Client = typeof clients.$inferSelect;
export type InsertClient = typeof clients.$inferInsert;

/**
 * Projects (現場) - work sites / construction projects
 */
export const projects = mysqlTable("projects", {
  id: int("id").autoincrement().primaryKey(),
  /** Project name / site name */
  name: varchar("name", { length: 256 }).notNull(),
  /** Client ID */
  clientId: int("clientId"),
  /** Site address */
  address: text("address"),
  /** Project status */
  status: mysqlEnum("projectStatus", ["active", "completed", "cancelled"]).default("active").notNull(),
  /** Start date */
  startDate: timestamp("startDate"),
  /** End date */
  endDate: timestamp("endDate"),
  /** Notes */
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Project = typeof projects.$inferSelect;
export type InsertProject = typeof projects.$inferInsert;

/**
 * Project members (現場作業員割り当て)
 * Links employees to projects for attendance management
 */
export const projectMembers = mysqlTable("project_members", {
  id: int("id").autoincrement().primaryKey(),
  /** Project ID */
  projectId: int("projectId").notNull(),
  /** Employee ID */
  employeeId: int("employeeId").notNull(),
  /** Role in project */
  projectRole: varchar("projectRole", { length: 64 }),
  /** Active flag */
  isActive: boolean("isActive").default(true).notNull(),
  /** Added by user ID */
  addedBy: int("addedBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ProjectMember = typeof projectMembers.$inferSelect;
export type InsertProjectMember = typeof projectMembers.$inferInsert;

/**
 * Employee rates per project (単価管理)
 * Tracks both the rate charged to the client (先方単価) and the rate paid to the worker (支払単価)
 */
export const employeeRates = mysqlTable("employee_rates", {
  id: int("id").autoincrement().primaryKey(),
  /** Scope type: project or client */
  scopeType: mysqlEnum("rateScopeType", ["project", "client"]).default("project").notNull(),
  /** Employee ID (null = project-wide default rate) */
  employeeId: int("employeeId"),
  /** Project ID */
  projectId: int("projectId"),
  /** Client ID (used when scopeType=client) */
  clientId: int("clientId"),
  /** Shift type: day or night */
  shiftType: mysqlEnum("shiftType", ["day", "night"]).default("day").notNull(),
  /** Rate charged to client per day (先方単価/日) in yen */
  clientRate: int("clientRate").notNull(),
  /** Rate paid to worker per day (支払単価/日) in yen */
  workerRate: int("workerRate").notNull(),
  /** Effective from date */
  effectiveFrom: timestamp("effectiveFrom"),
  /** Effective until date (null = still active) */
  effectiveUntil: timestamp("effectiveUntil"),
  /** Notes */
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type EmployeeRate = typeof employeeRates.$inferSelect;
export type InsertEmployeeRate = typeof employeeRates.$inferInsert;

/**
 * Worker fixed base rates (従業員固定支払単価)
 * Used when there is no project-specific worker rate.
 */
export const workerBaseRates = mysqlTable("worker_base_rates", {
  id: int("id").autoincrement().primaryKey(),
  /** Employee ID */
  employeeId: int("employeeId").notNull(),
  /** Shift type: day or night */
  shiftType: mysqlEnum("workerBaseRateShiftType", ["day", "night"]).default("day").notNull(),
  /** Fixed worker payment rate per day */
  workerRate: int("workerRate").notNull(),
  /** Effective from date */
  effectiveFrom: timestamp("effectiveFrom"),
  /** Effective until date */
  effectiveUntil: timestamp("effectiveUntil"),
  /** Notes */
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ([
  uniqueIndex("worker_base_rate_lookup").on(table.employeeId, table.shiftType, table.effectiveFrom),
]));

export type WorkerBaseRate = typeof workerBaseRates.$inferSelect;
export type InsertWorkerBaseRate = typeof workerBaseRates.$inferInsert;

/**
 * Attendance records (出面表 / 出勤管理)
 * One record per employee per day per project
 */
export const attendance = mysqlTable("attendance", {
  id: int("id").autoincrement().primaryKey(),
  /** Employee ID (null for guest workers) */
  employeeId: int("employeeId"),
  /** Guest worker name (when employeeId is null) */
  guestName: varchar("guestName", { length: 128 }),
  /** Project ID */
  projectId: int("projectId").notNull(),
  /** Work date (stored as timestamp, use date part only) */
  workDate: timestamp("workDate").notNull(),
  /** Hours worked (e.g. 8.0, 4.5 for half day). Stored as int * 10 to avoid float issues (80 = 8.0h) */
  hoursWorked: int("hoursWorked").default(80).notNull(),
  /** Overtime hours * 10 (e.g. 15 = 1.5h) */
  overtimeHours: int("overtimeHours").default(0).notNull(),
  /** Work type: normal, half_day, overtime, holiday, absence */
  workType: mysqlEnum("workType", ["normal", "half_day", "overtime", "holiday", "absence", "day_off"]).default("normal").notNull(),
  /** Shift type: day or night */
  shiftType: mysqlEnum("attendanceShiftType", ["day", "night"]).default("day").notNull(),
  /** Notes */
  notes: text("notes"),
  /** Entered by user ID */
  enteredBy: int("enteredBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ([
  uniqueIndex("attendance_emp_proj_date").on(table.employeeId, table.projectId, table.workDate),
  uniqueIndex("attendance_guest_proj_date").on(table.guestName, table.projectId, table.workDate),
]));

export type Attendance = typeof attendance.$inferSelect;
export type InsertAttendance = typeof attendance.$inferInsert;

/**
 * Invoices (請求書)
 * One invoice per client per month (or per project)
 */
export const invoices = mysqlTable("invoices", {
  id: int("id").autoincrement().primaryKey(),
  /** Invoice number (e.g. INV-2026-04-001) */
  invoiceNumber: varchar("invoiceNumber", { length: 64 }).notNull(),
  /** Client ID */
  clientId: int("clientId").notNull(),
  /** Project ID (optional, can be per-project or per-client) */
  projectId: int("projectId"),
  /** Billing period start */
  periodStart: timestamp("periodStart").notNull(),
  /** Billing period end */
  periodEnd: timestamp("periodEnd").notNull(),
  /** Issue date */
  issueDate: timestamp("issueDate").notNull(),
  /** Due date */
  dueDate: timestamp("dueDate"),
  /** Subtotal (before tax, stored as integer yen) */
  subtotal: int("subtotal").default(0).notNull(),
  /** Tax amount */
  taxAmount: int("taxAmount").default(0).notNull(),
  /** Total amount */
  totalAmount: int("totalAmount").default(0).notNull(),
  /** Tax rate (e.g. 10 for 10%) - default/fallback rate */
  taxRate: int("taxRate").default(10).notNull(),
  /** Status */
  status: mysqlEnum("status", ["draft", "sent", "paid", "overdue", "cancelled"]).default("draft").notNull(),
  /** Notes / 備考 */
  notes: text("notes"),
  /** Internal memo / 社内メモ */
  internalMemo: text("internalMemo"),
  /** PDF URL (generated) */
  pdfUrl: text("pdfUrl"),
  /** Received amount from client */
  receivedAmount: int("receivedAmount").default(0).notNull(),
  /** Received date */
  receivedAt: timestamp("receivedAt"),
  /** Received by user ID */
  receivedBy: int("receivedBy"),
  /** Payment memo / 入金メモ */
  paymentMemo: text("paymentMemo"),
  /** Created by user ID */
  createdBy: int("createdBy"),
  /** Honorific for client name (御中, 様, etc.) */
  honorific: varchar("honorific", { length: 16 }).default("御中"),
  /** Sub-number / 枝番 */
  subNumber: varchar("subNumber", { length: 32 }),
  /** Payment method */
  paymentMethod: varchar("paymentMethod", { length: 64 }).default("口座振込"),
  /** Subject / 件名 (e.g. "11月分請求書 藤沢いすゞ新築工場") */
  subject: text("subject"),
  /** Show company seal on PDF */
  showSeal: boolean("showSeal").default(true).notNull(),
  /** Show company logo on PDF */
  showLogo: boolean("showLogo").default(true).notNull(),
  /** Withholding tax ON/OFF */
  withholding: boolean("withholding").default(false).notNull(),
  /** Withholding tax amount */
  withholdingAmount: int("withholdingAmount").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ([
  uniqueIndex("invoice_number_unique").on(table.invoiceNumber),
]));

export type Invoice = typeof invoices.$inferSelect;
export type InsertInvoice = typeof invoices.$inferInsert;

/**
 * Invoice line items (請求書明細)
 * Enhanced with per-item tax rate, description rows, and sort order
 */
export const invoiceItems = mysqlTable("invoice_items", {
  id: int("id").autoincrement().primaryKey(),
  /** Invoice ID */
  invoiceId: int("invoiceId").notNull(),
  /** Employee ID (optional, for auto-generated items) */
  employeeId: int("employeeId"),
  /** Item type: normal = 通常行, text = テキスト行(説明のみ) */
  itemType: mysqlEnum("itemType", ["normal", "text"]).default("normal").notNull(),
  /** Description (e.g. worker name + project, or free text) */
  description: text("description").notNull(),
  /** Quantity (e.g. number of days * 10, so 200 = 20.0 days) */
  quantity: int("quantity").default(0).notNull(),
  /** Unit label */
  unit: varchar("unit", { length: 32 }).default("日"),
  /** Unit price (yen) */
  unitPrice: int("unitPrice").default(0).notNull(),
  /** Amount (quantity/10 * unitPrice) */
  amount: int("amount").default(0).notNull(),
  /** Tax rate for this item (10, 8, 0) - percentage */
  itemTaxRate: int("itemTaxRate").default(10).notNull(),
  /** Sort order within the invoice */
  sortOrder: int("sortOrder").default(0).notNull(),
  /** Notes / 備考 */
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type InvoiceItem = typeof invoiceItems.$inferSelect;
export type InsertInvoiceItem = typeof invoiceItems.$inferInsert;

/**
 * Project closings (案件月締め)
 * One row per project per closing month (YYYY-MM)
 */
export const projectClosings = mysqlTable("project_closings", {
  id: int("id").autoincrement().primaryKey(),
  /** Project ID */
  projectId: int("projectId").notNull(),
  /** Closing month in YYYY-MM format */
  closingMonth: varchar("closingMonth", { length: 7 }).notNull(),
  /** Closing status */
  status: mysqlEnum("closingStatus", ["open", "ready", "closed", "locked"]).default("open").notNull(),
  /** Optional notes */
  notes: text("notes"),
  /** Closed at */
  closedAt: timestamp("closedAt"),
  /** Closed by user ID */
  closedBy: int("closedBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ([
  uniqueIndex("project_closing_unique").on(table.projectId, table.closingMonth),
]));

export type ProjectClosing = typeof projectClosings.$inferSelect;
export type InsertProjectClosing = typeof projectClosings.$inferInsert;

/**
 * Closing submissions (従業員の締め提出状況)
 * One row per employee per project closing month
 */
export const closingSubmissions = mysqlTable("closing_submissions", {
  id: int("id").autoincrement().primaryKey(),
  /** Project closing ID */
  closingId: int("closingId").notNull(),
  /** Employee ID */
  employeeId: int("employeeId").notNull(),
  /** Submission status */
  status: mysqlEnum("submissionStatus", ["not_required", "pending", "submitted", "approved", "rejected"]).default("pending").notNull(),
  /** Transportation amount in yen */
  transportAmount: int("transportAmount").default(0).notNull(),
  /** Expense amount in yen */
  expenseAmount: int("expenseAmount").default(0).notNull(),
  /** Whether receipt is required */
  receiptRequired: boolean("receiptRequired").default(false).notNull(),
  /** Whether receipt has been uploaded/confirmed */
  receiptUploaded: boolean("receiptUploaded").default(false).notNull(),
  /** Receipt file URL */
  receiptFileUrl: text("receiptFileUrl"),
  /** Receipt original filename */
  receiptFileName: varchar("receiptFileName", { length: 512 }),
  /** Receipt file key */
  receiptFileKey: varchar("receiptFileKey", { length: 512 }),
  /** Receipt MIME type */
  receiptMimeType: varchar("receiptMimeType", { length: 128 }),
  /** Submitted at */
  submittedAt: timestamp("submittedAt"),
  /** Approved at */
  approvedAt: timestamp("approvedAt"),
  /** Reviewed by user ID */
  reviewedBy: int("reviewedBy"),
  /** Notes */
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ([
  uniqueIndex("closing_submission_unique").on(table.closingId, table.employeeId),
]));

export type ClosingSubmission = typeof closingSubmissions.$inferSelect;
export type InsertClosingSubmission = typeof closingSubmissions.$inferInsert;


/**
 * Employee payments (従業員支払管理)
 * One row per employee per project closing month
 */
export const employeePayments = mysqlTable("employee_payments", {
  id: int("id").autoincrement().primaryKey(),
  /** Project closing ID */
  closingId: int("closingId").notNull(),
  /** Employee ID */
  employeeId: int("employeeId").notNull(),
  /** Payment status */
  status: mysqlEnum("paymentStatus", ["pending", "confirmed", "paid"]).default("pending").notNull(),
  /** Total worked days ×10 */
  baseDaysTimes10: int("baseDaysTimes10").default(0).notNull(),
  /** Base worker payment amount */
  baseAmount: int("baseAmount").default(0).notNull(),
  /** Transportation amount */
  transportAmount: int("transportAmount").default(0).notNull(),
  /** Expense amount */
  expenseAmount: int("expenseAmount").default(0).notNull(),
  /** Manual adjustment amount (+/-) */
  adjustmentAmount: int("adjustmentAmount").default(0).notNull(),
  /** Final total amount */
  totalAmount: int("totalAmount").default(0).notNull(),
  /** Paid at */
  paidAt: timestamp("paidAt"),
  /** Paid by user ID */
  paidBy: int("paidBy"),
  /** Notes */
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ([
  uniqueIndex("employee_payment_unique").on(table.closingId, table.employeeId),
]));

export type EmployeePayment = typeof employeePayments.$inferSelect;
export type InsertEmployeePayment = typeof employeePayments.$inferInsert;


/**
 * Audit logs (監査ログ)
 * Records important admin/leader/worker actions for traceability
 */
export const auditLogs = mysqlTable("audit_logs", {
  id: int("id").autoincrement().primaryKey(),
  /** Action key (e.g. closing.markReady, payment.markPaid) */
  action: varchar("action", { length: 128 }).notNull(),
  /** Entity type */
  entityType: varchar("entityType", { length: 64 }).notNull(),
  /** Generic entity id */
  entityId: int("entityId"),
  /** Related project */
  projectId: int("projectId"),
  /** Related closing */
  closingId: int("closingId"),
  /** Related invoice */
  invoiceId: int("invoiceId"),
  /** Related employee */
  employeeId: int("employeeId"),
  /** Performed by user id */
  performedBy: int("performedBy"),
  /** Short note */
  note: text("note"),
  /** JSON payload string */
  payload: text("payload"),
  performedAt: timestamp("performedAt").defaultNow().notNull(),
});

export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = typeof auditLogs.$inferInsert;

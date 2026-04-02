import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, boolean, json } from "drizzle-orm/mysql-core";

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
  /** Who created this invitation */
  createdBy: int("createdBy").notNull(),
  /** When the invitation expires (1 hour from creation) */
  expiresAt: timestamp("expiresAt").notNull(),
  /** When the invitation was used */
  usedAt: timestamp("usedAt"),
  /** User ID of the person who used the invitation */
  usedBy: int("usedBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Invitation = typeof invitations.$inferSelect;
export type InsertInvitation = typeof invitations.$inferInsert;

/**
 * Company profile - single row for company settings
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
  /** Qualified invoice issuer number (T + 13 digits) */
  invoiceIssuerNumber: varchar("invoiceIssuerNumber", { length: 32 }),
  /** Representative name */
  representativeName: varchar("representativeName", { length: 128 }),
  /** Bank name */
  bankName: varchar("bankName", { length: 128 }),
  /** Branch name */
  branchName: varchar("branchName", { length: 128 }),
  /** Account type: 普通/当座 */
  accountType: mysqlEnum("accountType", ["ordinary", "checking"]).default("ordinary"),
  /** Account number */
  accountNumber: varchar("accountNumber", { length: 32 }),
  /** Account holder name */
  accountHolder: varchar("accountHolder", { length: 128 }),
  /** Logo image URL (S3) */
  logoUrl: text("logoUrl"),
  /** Company seal image URL (S3) */
  sealUrl: text("sealUrl"),
  /** Watermark image URL (S3) */
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
  /** Workers' compensation insurance number */
  workersCompNumber: varchar("workersCompNumber", { length: 64 }),
  /** Basic pension number */
  pensionNumber: varchar("pensionNumber", { length: 64 }),
  /** Career-up number */
  careerUpNumber: varchar("careerUpNumber", { length: 64 }),
  /** Employment type */
  employmentType: mysqlEnum("employmentType", ["sole_proprietor", "employee", "other"]),

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

  // ── Height / Weight (for worker roster) ──
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
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Qualification = typeof qualifications.$inferSelect;
export type InsertQualification = typeof qualifications.$inferInsert;

/**
 * Documents uploaded by/for employees
 */
export const documents = mysqlTable("documents", {
  id: int("id").autoincrement().primaryKey(),
  /** Employee ID */
  employeeId: int("employeeId").notNull(),
  /** Document type */
  documentType: mysqlEnum("documentType", [
    "residence_card",
    "passport",
    "health_check",
    "qualification_cert",
    "id_document",
    "stamp",
    "invoice",
    "receipt",
    "other",
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
 * Employee rates per project (単価管理)
 * Tracks both the rate charged to the client (先方単価) and the rate paid to the worker (支払単価)
 */
export const employeeRates = mysqlTable("employee_rates", {
  id: int("id").autoincrement().primaryKey(),
  /** Employee ID */
  employeeId: int("employeeId").notNull(),
  /** Project ID */
  projectId: int("projectId").notNull(),
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

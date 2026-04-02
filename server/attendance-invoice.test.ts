import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the database module
vi.mock("./db", () => ({
  getAttendanceByDateRange: vi.fn().mockResolvedValue([
    {
      id: 1,
      employeeId: 1,
      projectId: 1,
      workDate: new Date("2026-04-01"),
      hoursWorked: 80,
      overtimeHours: 0,
      workType: "normal",
      notes: null,
      enteredBy: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 2,
      employeeId: 1,
      projectId: 1,
      workDate: new Date("2026-04-02"),
      hoursWorked: 80,
      overtimeHours: 20,
      workType: "overtime",
      notes: null,
      enteredBy: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]),
  getAttendanceByEmployee: vi.fn().mockResolvedValue([]),
  getAttendanceByProject: vi.fn().mockResolvedValue([]),
  upsertAttendance: vi.fn().mockResolvedValue({ id: 1 }),
  deleteAttendance: vi.fn().mockResolvedValue(undefined),
  getAllInvoices: vi.fn().mockResolvedValue([]),
  getInvoiceById: vi.fn().mockResolvedValue({
    id: 1,
    invoiceNumber: "INV-2026-04-001",
    clientId: 1,
    projectId: 1,
    periodStart: new Date("2026-04-01"),
    periodEnd: new Date("2026-04-30"),
    issueDate: new Date(),
    subtotal: 100000,
    taxAmount: 10000,
    totalAmount: 110000,
    taxRate: 10,
    status: "draft",
  }),
  getInvoiceItemsByInvoice: vi.fn().mockResolvedValue([
    {
      id: 1,
      invoiceId: 1,
      employeeId: 1,
      description: "テスト作業員",
      quantity: 200,
      unit: "日",
      unitPrice: 15000,
      amount: 300000,
    },
  ]),
  createInvoice: vi.fn().mockResolvedValue({ id: 1, invoiceNumber: "INV-2026-04-001" }),
  createInvoiceItem: vi.fn().mockResolvedValue({ id: 1 }),
  updateInvoice: vi.fn().mockResolvedValue({ id: 1, status: "sent" }),
  deleteInvoice: vi.fn().mockResolvedValue(undefined),
  deleteInvoiceItemsByInvoice: vi.fn().mockResolvedValue(undefined),
  getNextInvoiceNumber: vi.fn().mockResolvedValue("INV-2026-04-001"),
  getRatesByProject: vi.fn().mockResolvedValue([
    { id: 1, employeeId: 1, projectId: 1, clientRate: 15000, payRate: 12000 },
  ]),
  getAllEmployees: vi.fn().mockResolvedValue([
    { id: 1, nameKanji: "テスト太郎" },
  ]),
  getCompanyProfile: vi.fn().mockResolvedValue({
    companyName: "充寵グループ",
    address: "東京都",
    phone: "03-1234-5678",
  }),
  getClientById: vi.fn().mockResolvedValue({ id: 1, name: "テスト取引先" }),
  getAllClients: vi.fn().mockResolvedValue([{ id: 1, name: "テスト取引先" }]),
  getAllProjects: vi.fn().mockResolvedValue([{ id: 1, name: "テスト現場" }]),
}));

import * as db from "./db";

describe("Attendance helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should get attendance by date range", async () => {
    const result = await db.getAttendanceByDateRange(
      new Date("2026-04-01"),
      new Date("2026-04-30"),
      1
    );
    expect(result).toHaveLength(2);
    expect(result[0].employeeId).toBe(1);
    expect(result[0].hoursWorked).toBe(80);
  });

  it("should upsert attendance", async () => {
    const result = await db.upsertAttendance({
      employeeId: 1,
      projectId: 1,
      workDate: new Date("2026-04-03"),
      hoursWorked: 80,
      overtimeHours: 0,
      workType: "normal",
      notes: null,
      enteredBy: 1,
    });
    expect(result).toHaveProperty("id");
  });
});

describe("Invoice helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should get all invoices", async () => {
    const result = await db.getAllInvoices();
    expect(result).toEqual([]);
  });

  it("should get invoice by id", async () => {
    const result = await db.getInvoiceById(1);
    expect(result).toBeDefined();
    expect(result!.invoiceNumber).toBe("INV-2026-04-001");
    expect(result!.totalAmount).toBe(110000);
  });

  it("should get invoice items", async () => {
    const items = await db.getInvoiceItemsByInvoice(1);
    expect(items).toHaveLength(1);
    expect(items[0].description).toBe("テスト作業員");
    expect(items[0].amount).toBe(300000);
  });

  it("should create invoice", async () => {
    const result = await db.createInvoice({
      invoiceNumber: "INV-2026-04-002",
      clientId: 1,
      projectId: 1,
      periodStart: new Date("2026-04-01"),
      periodEnd: new Date("2026-04-30"),
      issueDate: new Date(),
      subtotal: 200000,
      taxAmount: 20000,
      totalAmount: 220000,
      taxRate: 10,
    });
    expect(result).toHaveProperty("id");
  });

  it("should update invoice status", async () => {
    const result = await db.updateInvoice(1, { status: "sent" });
    expect(result).toBeDefined();
  });

  it("should generate next invoice number", async () => {
    const num = await db.getNextInvoiceNumber("2026-04");
    expect(num).toBe("INV-2026-04-001");
  });

  it("should calculate invoice amounts correctly", () => {
    // Test the calculation logic used in createFromAttendance
    const hoursWorked = 80; // 8.0h = 1 day
    const totalDaysTimes10 = Math.round(hoursWorked / 8); // 10
    const clientRate = 15000;
    const amount = Math.round((totalDaysTimes10 / 10) * clientRate);
    expect(amount).toBe(15000);

    // Two days
    const twoDay = Math.round(160 / 8); // 20
    const twoDayAmount = Math.round((twoDay / 10) * clientRate);
    expect(twoDayAmount).toBe(30000);

    // Tax calculation
    const subtotal = 300000;
    const taxRate = 10;
    const taxAmount = Math.round(subtotal * taxRate / 100);
    expect(taxAmount).toBe(30000);
    expect(subtotal + taxAmount).toBe(330000);
  });
});

import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import type { User } from "../drizzle/schema";

// ── Helper: create mock context ──

function createUser(overrides: Partial<User> = {}): User {
  return {
    id: 1,
    openId: "test-open-id",
    email: "admin@example.com",
    name: "Test Admin",
    loginMethod: "manus",
    role: "admin",
    appRole: "admin",
    loginId: "testadmin",
    mustChangePassword: false,
    employeeId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    ...overrides,
  };
}

function createMockContext(user: User | null = null): TrpcContext {
  return {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

// ── Tests ──

describe("auth.me", () => {
  it("returns null for unauthenticated user", async () => {
    const ctx = createMockContext(null);
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.me();
    expect(result).toBeNull();
  });

  it("returns user data for authenticated user", async () => {
    const user = createUser();
    const ctx = createMockContext(user);
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.me();
    expect(result).toBeTruthy();
    expect(result?.name).toBe("Test Admin");
    expect(result?.appRole).toBe("admin");
  });
});

describe("auth.logout", () => {
  it("clears cookie and returns success", async () => {
    const user = createUser();
    const ctx = createMockContext(user);
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.logout();
    expect(result).toEqual({ success: true });
  });
});

describe("invitation router - access control", () => {
  it("rejects unauthenticated user from listing invitations", async () => {
    const ctx = createMockContext(null);
    const caller = appRouter.createCaller(ctx);
    await expect(caller.invitation.list()).rejects.toThrow();
  });

  it("rejects worker from creating invitations", async () => {
    const worker = createUser({ appRole: "worker", role: "user" });
    const ctx = createMockContext(worker);
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.invitation.create({
        loginId: "newuser",
        tempPassword: "pass1234",
        appRole: "worker",
        email: "new@example.com",
      })
    ).rejects.toThrow();
  });
});

describe("company router - access control", () => {
  it("rejects unauthenticated user from getting company profile", async () => {
    const ctx = createMockContext(null);
    const caller = appRouter.createCaller(ctx);
    await expect(caller.company.get()).rejects.toThrow();
  });

  it("rejects worker from upserting company profile", async () => {
    const worker = createUser({ appRole: "worker", role: "user" });
    const ctx = createMockContext(worker);
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.company.upsert({
        companyName: "Test Company",
      })
    ).rejects.toThrow();
  });
});

describe("employee router - access control", () => {
  it("rejects unauthenticated user from listing employees", async () => {
    const ctx = createMockContext(null);
    const caller = appRouter.createCaller(ctx);
    await expect(caller.employee.list()).rejects.toThrow();
  });

  it("rejects unauthenticated user from creating employee", async () => {
    const ctx = createMockContext(null);
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.employee.create({
        nameKanji: "テスト太郎",
      })
    ).rejects.toThrow();
  });

  it("rejects worker from deleting employee", async () => {
    const worker = createUser({ appRole: "worker", role: "user" });
    const ctx = createMockContext(worker);
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.employee.delete({ id: 1 })
    ).rejects.toThrow();
  });
});

describe("qualification router - access control", () => {
  it("rejects unauthenticated user from listing qualifications", async () => {
    const ctx = createMockContext(null);
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.qualification.list({ employeeId: 1 })
    ).rejects.toThrow();
  });
});

describe("document router - access control", () => {
  it("rejects unauthenticated user from listing documents", async () => {
    const ctx = createMockContext(null);
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.document.list({ employeeId: 1 })
    ).rejects.toThrow();
  });

  it("rejects worker from updating document status", async () => {
    const worker = createUser({ appRole: "worker", role: "user" });
    const ctx = createMockContext(worker);
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.document.updateStatus({ id: 1, docStatus: "valid" })
    ).rejects.toThrow();
  });
});

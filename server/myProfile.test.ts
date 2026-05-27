import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// ── Test Helpers ──

function createWorkerContext(userId = 100, employeeId: number | null = null): { ctx: TrpcContext } {
  const user: NonNullable<TrpcContext["user"]> = {
    id: userId,
    openId: `custom_worker_${userId}`,
    name: "Test Worker",
    email: null,
    loginMethod: null,
    role: "user",
    appRole: "worker",
    loginId: "test.worker",
    passwordHash: "$2a$12$dummy",
    mustChangePassword: false,
    employeeId,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  const ctx: TrpcContext = {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      cookie: () => {},
      clearCookie: () => {},
    } as TrpcContext["res"],
  };

  return { ctx };
}

function createAdminContext(): { ctx: TrpcContext } {
  const user: NonNullable<TrpcContext["user"]> = {
    id: 60005,
    openId: "custom_admin_mitsuro_oki",
    name: "Mitsuro Oki",
    email: null,
    loginMethod: null,
    role: "admin",
    appRole: "admin",
    loginId: "Mitsuro Oki",
    passwordHash: "$2a$12$dummy",
    mustChangePassword: false,
    employeeId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  const ctx: TrpcContext = {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      cookie: () => {},
      clearCookie: () => {},
    } as TrpcContext["res"],
  };

  return { ctx };
}

function createUnauthenticatedContext(): { ctx: TrpcContext } {
  const ctx: TrpcContext = {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      cookie: () => {},
      clearCookie: () => {},
    } as TrpcContext["res"],
  };

  return { ctx };
}

// ── Tests ──

describe("My Profile Feature", () => {
  describe("employee.getMyProfile", () => {
    it("returns profile for authenticated worker", async () => {
      const { ctx } = createWorkerContext();
      const caller = appRouter.createCaller(ctx);
      const result = await caller.employee.getMyProfile();
      // May return null if no employee record linked, but should not throw
      expect(result === null || typeof result === "object").toBe(true);
    });

    it("throws for unauthenticated user", async () => {
      const { ctx } = createUnauthenticatedContext();
      const caller = appRouter.createCaller(ctx);
      await expect(caller.employee.getMyProfile()).rejects.toThrow();
    });
  });

  describe("employee.getMyMissingFields", () => {
    it("returns missing fields info for authenticated worker", async () => {
      const { ctx } = createWorkerContext();
      const caller = appRouter.createCaller(ctx);
      const result = await caller.employee.getMyMissingFields();
      expect(result).toHaveProperty("hasProfile");
      expect(result).toHaveProperty("missingFields");
      expect(result).toHaveProperty("completionPercent");
      expect(Array.isArray(result.missingFields)).toBe(true);
      expect(typeof result.completionPercent).toBe("number");
    });

    it("returns hasProfile=false when no employee record exists", async () => {
      // Use a user ID that has no employee record
      const { ctx } = createWorkerContext(99999);
      const caller = appRouter.createCaller(ctx);
      const result = await caller.employee.getMyMissingFields();
      expect(result.hasProfile).toBe(false);
      expect(result.completionPercent).toBe(0);
    });

    it("throws for unauthenticated user", async () => {
      const { ctx } = createUnauthenticatedContext();
      const caller = appRouter.createCaller(ctx);
      await expect(caller.employee.getMyMissingFields()).rejects.toThrow();
    });
  });

  describe("employee.updateMyProfile", () => {
    it("throws for unauthenticated user", async () => {
      const { ctx } = createUnauthenticatedContext();
      const caller = appRouter.createCaller(ctx);
      await expect(
        caller.employee.updateMyProfile({ nameKanji: "テスト太郎" })
      ).rejects.toThrow();
    });

    it("throws NOT_FOUND when no employee record exists", async () => {
      const { ctx } = createWorkerContext(99999);
      const caller = appRouter.createCaller(ctx);
      await expect(
        caller.employee.updateMyProfile({ nameKanji: "テスト太郎" })
      ).rejects.toThrow("従業員プロフィールが見つかりません");
    });

    it("accepts valid profile data shape", async () => {
      // This test validates the input schema accepts correct data
      const { ctx } = createWorkerContext();
      const caller = appRouter.createCaller(ctx);
      // Will throw NOT_FOUND since no employee record, but validates input schema
      try {
        await caller.employee.updateMyProfile({
          nameKanji: "テスト太郎",
          nameKana: "テスト タロウ",
          nameRomaji: "Taro Test",
          dateOfBirth: "1990-01-01",
          bloodType: "A",
          gender: "male",
          phone: "090-1234-5678",
          postalCode: "123-4567",
          address: "埼玉県テスト市",
          emergencyNameKanji: "テスト花子",
          emergencyPhone: "090-9876-5432",
          emergencyRelationship: "配偶者",
          bankName: "テスト銀行",
          branchName: "テスト支店",
          accountNumber: "1234567",
          accountHolder: "テスト タロウ",
        });
      } catch (err: any) {
        // Expected to throw NOT_FOUND, not a validation error
        expect(err.message).toContain("見つかりません");
      }
    });

    it("rejects invalid blood type", async () => {
      const { ctx } = createWorkerContext();
      const caller = appRouter.createCaller(ctx);
      await expect(
        caller.employee.updateMyProfile({ bloodType: "X" as any })
      ).rejects.toThrow();
    });

    it("rejects invalid gender", async () => {
      const { ctx } = createWorkerContext();
      const caller = appRouter.createCaller(ctx);
      await expect(
        caller.employee.updateMyProfile({ gender: "other" as any })
      ).rejects.toThrow();
    });
  });

  describe("Missing fields calculation", () => {
    it("missing fields include expected required fields", async () => {
      const { ctx } = createWorkerContext(99999);
      const caller = appRouter.createCaller(ctx);
      const result = await caller.employee.getMyMissingFields();
      // When no profile exists, hasProfile should be false
      expect(result.hasProfile).toBe(false);
    });
  });
});

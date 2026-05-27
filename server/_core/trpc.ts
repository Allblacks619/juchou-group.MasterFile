import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

export type AppRole =
  | "super_admin"
  | "admin"
  | "manager"
  | "leader" // backward-compat alias
  | "worker"
  | "guest";

export function normalizeAppRole(role?: string | null): AppRole {
  if (!role) return "worker";
  if (role === "leader") return "manager";
  if (role === "super_admin" || role === "admin" || role === "manager" || role === "worker" || role === "guest") return role;
  return "worker";
}

export function isSuperAdmin(role?: string | null) {
  return normalizeAppRole(role) === "super_admin";
}

export function isAdminLike(role?: string | null) {
  const normalized = normalizeAppRole(role);
  return normalized === "super_admin" || normalized === "admin";
}

export function isManagerLike(role?: string | null) {
  const normalized = normalizeAppRole(role);
  return normalized === "super_admin" || normalized === "admin" || normalized === "manager";
}

export function isGuestRole(role?: string | null) {
  return normalizeAppRole(role) === "guest";
}

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || !isAdminLike((ctx.user as any).appRole || ctx.user.role)) {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);

export const superAdminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;
    if (!ctx.user || !isSuperAdmin((ctx.user as any).appRole)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "統括管理者権限が必要です" });
    }
    return next({ ctx: { ...ctx, user: ctx.user } });
  }),
);

import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { ReactNode, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import type { PermissionArea } from "@shared/permissionAreas";

// appRole の実値に合わせる（"leader" はサーバー側で worker 扱いになる旧名のため許可リストに使わない）
type AllowedRole = "super_admin" | "admin" | "manager" | "worker";

interface RoleGuardProps {
  /** Roles allowed to access this route（area 未指定時に使用） */
  allowed?: AllowedRole[];
  /** 個人別 表示/ブロック設定のエリアで判定する。指定時は allowed より優先し permission.my で判定 */
  area?: PermissionArea;
  /** Fallback redirect path (default: /app) */
  redirectTo?: string;
  children: ReactNode;
}

/**
 * Route-level guard.
 * - area 指定時: permission.my の該当エリアで判定（ロード中は null 表示、拒否は redirect）。
 * - area 未指定時: 従来どおり appRole が `allowed` に含まれるかで判定。
 */
export default function RoleGuard({ allowed, area, redirectTo = "/app", children }: RoleGuardProps) {
  const { user, loading } = useAuth();
  const [, navigate] = useLocation();

  const appRole = (user as any)?.appRole || "worker";

  // エリア指定時のみ permission.my を取得（未指定・未ログイン時は無効化してロール判定にフォールバック）
  const permQuery = trpc.permission.my.useQuery(undefined, { enabled: !!area && !!user });

  // 判定: null=判定中（loading相当・null表示）, true=許可, false=拒否（redirect）
  let decision: boolean | null;
  if (area) {
    decision = !user ? null : permQuery.data ? !!permQuery.data.areas[area] : null;
  } else {
    decision = (allowed ?? []).includes(appRole);
  }

  useEffect(() => {
    if (!loading && user && decision === false) {
      navigate(redirectTo, { replace: true });
    }
  }, [loading, user, decision, redirectTo, navigate]);

  if (loading) return null;
  if (!user) return null;
  if (decision === null) return null;
  if (!decision) return null;

  return <>{children}</>;
}

import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { ReactNode, useEffect } from "react";

type AllowedRole = "admin" | "leader" | "worker";

interface RoleGuardProps {
  /** Roles allowed to access this route */
  allowed: AllowedRole[];
  /** Fallback redirect path (default: /app) */
  redirectTo?: string;
  children: ReactNode;
}

/**
 * Route-level role guard.
 * If the user's appRole is not in `allowed`, redirect immediately.
 */
export default function RoleGuard({ allowed, redirectTo = "/app", children }: RoleGuardProps) {
  const { user, loading } = useAuth();
  const [, navigate] = useLocation();

  const appRole = (user as any)?.appRole || "worker";

  useEffect(() => {
    if (!loading && user && !allowed.includes(appRole)) {
      navigate(redirectTo, { replace: true });
    }
  }, [loading, user, appRole, allowed, redirectTo, navigate]);

  if (loading) return null;
  if (!user) return null;
  if (!allowed.includes(appRole)) return null;

  return <>{children}</>;
}

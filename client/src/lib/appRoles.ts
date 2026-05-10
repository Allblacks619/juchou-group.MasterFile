export function isManagerLikeAppRole(role?: string | null) {
  return role === "super_admin" || role === "admin" || role === "manager" || role === "leader";
}

// サーバー側 isManagerLike（server/_core/trpc.ts）と同じ集合にすること。
// "leader" はサーバーで worker 扱いになる旧名のため含めない（含めるとメニューだけ見えて全API 403になる）。
export function isManagerLikeAppRole(role?: string | null) {
  return role === "super_admin" || role === "admin" || role === "manager";
}

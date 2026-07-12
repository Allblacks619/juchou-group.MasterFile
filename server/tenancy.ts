/**
 * テナント解決 — マルチテナント化 Phase 1a (docs/multitenant/PLAN_v1.md)
 *
 * MULTI_TENANT フラグ（既定 off）の間は常に既定会社(=1)を返し、現行の
 * シングルテナント動作と完全互換。フラグを有効化した時のみユーザーの
 * 所属会社(users.companyId)がテナント境界として効き始める。
 *
 * 注意（審議 #5）: companyId 未設定セッションの既定会社フォールバックは
 * 「テナントが1社しか存在しない間」の時限措置。2社目のテナント作成は
 * 全セッション失効 + companyId 必須化とセットで行うこと。
 */

export const DEFAULT_COMPANY_ID = 1;

export function isMultiTenantEnabled(): boolean {
  const v = process.env.MULTI_TENANT;
  return v === "true" || v === "1";
}

export function resolveCompanyId(
  user: { companyId?: number | null } | null | undefined
): number {
  if (!isMultiTenantEnabled()) return DEFAULT_COMPANY_ID;
  const cid = user?.companyId;
  return typeof cid === "number" && cid > 0 ? cid : DEFAULT_COMPANY_ID;
}

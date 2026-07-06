export type GenbaRole = "admin" | "leader" | "worker";

/** 既存 appRole → 現場ビジョン権限のマッピング */
export function genbaRoleOf(appRole: string): GenbaRole {
  switch (appRole) {
    case "super_admin":
    case "admin":
      return "admin";        // 全機能(予算トラッカー含む)
    case "manager":
    case "leader":
      return "leader";       // 予算・システム設定以外
    default:
      return "worker";       // worker / guest: 現場入力のみ
  }
}

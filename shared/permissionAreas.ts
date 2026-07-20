/**
 * 個人別 表示/ブロック設定（エリア別権限オーバーライド）
 *
 * ロール（users.appRole）を土台に、個人単位で機能エリアごとの「許可 / ブロック」を
 * 上書きできる仕組み。従業員管理画面から選択式で設定する。
 *
 * ルール:
 * - super_admin / admin は常に全エリア可（設定する側のため、オーバーライドは適用されない）
 * - manager はロール既定=全エリア可。"deny" で個別にブロックできる
 * - worker / guest / 旧leader はロール既定=全エリア不可。"allow" で個別に見せられる
 * - 未設定（キーなし）はロール既定
 *
 * 保存形式: users.permissionOverrides に JSON 文字列
 *   例) {"finance":"deny","attendance":"allow"}
 */

export const PERMISSION_AREAS = {
  finance: {
    label: "財務",
    description: "請求書管理・入金管理・支払管理・前借り台帳",
  },
  rates: {
    label: "単価管理",
    description: "取引先請求単価・作業員支払単価の閲覧と設定",
  },
  employees: {
    label: "従業員管理",
    description: "全従業員の個人情報（口座・在留カード等）・名簿PDF",
  },
  projects: {
    label: "現場・取引先",
    description: "現場管理・取引先管理・現場メンバー",
  },
  attendance: {
    label: "出面表管理",
    description: "全員の出面表の閲覧・編集・PDF/Excel、全員の作業日報",
  },
  closing: {
    label: "月締め管理",
    description: "月締めV2・締め管理・作業員請求書の承認/差戻し・月締め代行",
  },
  company: {
    label: "会社設定・招待",
    description: "会社情報（銀行口座等）の閲覧、招待の発行",
  },
} as const;

export type PermissionArea = keyof typeof PERMISSION_AREAS;
export type PermissionOverrideValue = "allow" | "deny";
export type PermissionOverrides = Partial<Record<PermissionArea, PermissionOverrideValue>>;

export const PERMISSION_AREA_KEYS = Object.keys(PERMISSION_AREAS) as PermissionArea[];

/** users.permissionOverrides の生JSONを安全にパースする（不正値・未知キーは捨てる） */
export function parsePermissionOverrides(raw: unknown): PermissionOverrides {
  if (!raw) return {};
  let obj: unknown = raw;
  if (typeof raw === "string") {
    try {
      obj = JSON.parse(raw);
    } catch {
      return {};
    }
  }
  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) return {};
  const out: PermissionOverrides = {};
  for (const key of PERMISSION_AREA_KEYS) {
    const value = (obj as Record<string, unknown>)[key];
    if (value === "allow" || value === "deny") out[key] = value;
  }
  return out;
}

function normalizeRoleForAreas(role?: string | null): "super_admin" | "admin" | "manager" | "worker" | "guest" {
  if (role === "super_admin" || role === "admin" || role === "manager" || role === "guest") return role;
  // "leader" やその他未知値はサーバー実効（worker扱い）に合わせる
  return "worker";
}

/** 対象ユーザーがそのエリアを使えるか（ロール既定＋個人オーバーライド） */
export function resolveAreaPermission(
  user: { appRole?: string | null; permissionOverrides?: string | null } | null | undefined,
  area: PermissionArea,
): boolean {
  if (!user) return false;
  const role = normalizeRoleForAreas(user.appRole);
  if (role === "super_admin" || role === "admin") return true;
  const overrides = parsePermissionOverrides(user.permissionOverrides);
  const override = overrides[area];
  if (override === "allow") return true;
  if (override === "deny") return false;
  return role === "manager";
}

/** 全エリアの実効権限をまとめて返す（ナビ表示・設定ダイアログ用） */
export function resolveAllAreaPermissions(
  user: { appRole?: string | null; permissionOverrides?: string | null } | null | undefined,
): Record<PermissionArea, boolean> {
  const out = {} as Record<PermissionArea, boolean>;
  for (const area of PERMISSION_AREA_KEYS) out[area] = resolveAreaPermission(user, area);
  return out;
}

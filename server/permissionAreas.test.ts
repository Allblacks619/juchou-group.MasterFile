import { describe, expect, it } from "vitest";
import {
  PERMISSION_AREA_KEYS,
  parsePermissionOverrides,
  resolveAreaPermission,
  resolveAllAreaPermissions,
} from "@shared/permissionAreas";

describe("permissionAreas: 個人別 表示/ブロック設定の解決", () => {
  it("super_admin / admin はオーバーライドに関係なく常に全エリア可", () => {
    for (const role of ["super_admin", "admin"] as const) {
      const denyAll = JSON.stringify(Object.fromEntries(PERMISSION_AREA_KEYS.map((k) => [k, "deny"])));
      const user = { appRole: role, permissionOverrides: denyAll };
      for (const area of PERMISSION_AREA_KEYS) {
        expect(resolveAreaPermission(user, area)).toBe(true);
      }
    }
  });

  it("manager は取引先請求(billing)以外は既定可、deny で個別にブロックできる", () => {
    const user = { appRole: "manager", permissionOverrides: '{"payments":"deny"}' };
    expect(resolveAreaPermission(user, "payments")).toBe(false);
    expect(resolveAreaPermission(user, "rates")).toBe(true);
    expect(resolveAreaPermission(user, "closing")).toBe(true);
  });

  it("取引先請求(billing)は manager でも既定ブロック、allow で個別に見せられる", () => {
    expect(resolveAreaPermission({ appRole: "manager", permissionOverrides: null }, "billing")).toBe(false);
    expect(resolveAreaPermission({ appRole: "manager", permissionOverrides: '{"billing":"allow"}' }, "billing")).toBe(true);
    expect(resolveAreaPermission({ appRole: "admin", permissionOverrides: null }, "billing")).toBe(true);
  });

  it("worker / guest は既定で全エリア不可、allow で個別に見せられる", () => {
    const worker = { appRole: "worker", permissionOverrides: '{"attendance":"allow"}' };
    expect(resolveAreaPermission(worker, "attendance")).toBe(true);
    expect(resolveAreaPermission(worker, "billing")).toBe(false);
    const guest = { appRole: "guest", permissionOverrides: null };
    for (const area of PERMISSION_AREA_KEYS) {
      expect(resolveAreaPermission(guest, area)).toBe(false);
    }
  });

  it("旧 leader はサーバー実効どおり worker 扱い（既定不可・allow 付与可）", () => {
    expect(resolveAreaPermission({ appRole: "leader", permissionOverrides: null }, "closing")).toBe(false);
    expect(resolveAreaPermission({ appRole: "leader", permissionOverrides: '{"closing":"allow"}' }, "closing")).toBe(true);
  });

  it("parsePermissionOverrides は不正JSON・未知キー・不正値を安全に無視する", () => {
    expect(parsePermissionOverrides(null)).toEqual({});
    expect(parsePermissionOverrides("not-json")).toEqual({});
    expect(parsePermissionOverrides('{"billing":"deny","unknown":"allow","rates":"maybe"}')).toEqual({ billing: "deny" });
    expect(parsePermissionOverrides('["finance"]')).toEqual({});
  });

  it("resolveAllAreaPermissions は全キーを返す", () => {
    const areas = resolveAllAreaPermissions({ appRole: "worker", permissionOverrides: '{"projects":"allow"}' });
    expect(Object.keys(areas).sort()).toEqual([...PERMISSION_AREA_KEYS].sort());
    expect(areas.projects).toBe(true);
    expect(areas.billing).toBe(false);
  });

  it("未ログイン（user なし）は全エリア不可", () => {
    expect(resolveAreaPermission(null, "billing")).toBe(false);
    expect(resolveAreaPermission(undefined, "attendance")).toBe(false);
  });
});

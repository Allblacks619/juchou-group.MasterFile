import { describe, expect, it } from "vitest";
import { isManagerLikeAppRole } from "@/lib/appRoles";

describe("frontend app role helpers", () => {
  it("treats super_admin, admin, manager as manager-like (server の isManagerLike と同じ集合)", () => {
    expect(isManagerLikeAppRole("super_admin")).toBe(true);
    expect(isManagerLikeAppRole("admin")).toBe(true);
    expect(isManagerLikeAppRole("manager")).toBe(true);
    // "leader" はサーバー側で worker に正規化される旧名。クライアントだけ manager 扱いにすると
    // メニューは見えるのに全APIが403になるため、manager-like に含めない。
    expect(isManagerLikeAppRole("leader")).toBe(false);
    expect(isManagerLikeAppRole("worker")).toBe(false);
    expect(isManagerLikeAppRole("guest")).toBe(false);
    expect(isManagerLikeAppRole(undefined)).toBe(false);
  });
});

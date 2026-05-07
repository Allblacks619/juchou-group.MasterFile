import { describe, expect, it } from "vitest";
import { isManagerLikeAppRole } from "@/lib/appRoles";

describe("frontend app role helpers", () => {
  it("treats super_admin, admin, manager, and legacy leader as manager-like", () => {
    expect(isManagerLikeAppRole("super_admin")).toBe(true);
    expect(isManagerLikeAppRole("admin")).toBe(true);
    expect(isManagerLikeAppRole("manager")).toBe(true);
    expect(isManagerLikeAppRole("leader")).toBe(true);
    expect(isManagerLikeAppRole("worker")).toBe(false);
    expect(isManagerLikeAppRole("guest")).toBe(false);
    expect(isManagerLikeAppRole(undefined)).toBe(false);
  });
});

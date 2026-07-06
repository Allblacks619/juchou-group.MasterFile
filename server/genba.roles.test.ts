import { describe, it, expect } from "vitest";
import { genbaRoleOf } from "../shared/genba/roles";

describe("genbaRoleOf: appRole → 現場ビジョン権限マッピング", () => {
  it("super_admin は admin", () => {
    expect(genbaRoleOf("super_admin")).toBe("admin");
  });

  it("admin は admin", () => {
    expect(genbaRoleOf("admin")).toBe("admin");
  });

  it("manager は leader", () => {
    expect(genbaRoleOf("manager")).toBe("leader");
  });

  it("leader (後方互換エイリアス) は leader", () => {
    expect(genbaRoleOf("leader")).toBe("leader");
  });

  it("worker は worker", () => {
    expect(genbaRoleOf("worker")).toBe("worker");
  });

  it("guest は worker", () => {
    expect(genbaRoleOf("guest")).toBe("worker");
  });

  it("未知のロールは worker にフォールバックする", () => {
    expect(genbaRoleOf("")).toBe("worker");
    expect(genbaRoleOf("unknown_role")).toBe("worker");
  });
});

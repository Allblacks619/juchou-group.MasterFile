import { describe, expect, it } from "vitest";
import { isManagerLike, normalizeAppRole } from "./_core/trpc";

describe("TRPC role backward compatibility", () => {
  it("keeps legacy leader readable and manager-like", () => {
    expect(normalizeAppRole("leader")).toBe("manager");
    expect(isManagerLike("leader")).toBe(true);
  });
});

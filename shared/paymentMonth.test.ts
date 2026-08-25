import { describe, expect, it } from "vitest";
import { paymentMonthToClosingMonth } from "./paymentMonth";

describe("paymentMonthToClosingMonth", () => {
  it("10月支払は8月締めの出面を参照する", () => {
    expect(paymentMonthToClosingMonth("2026-10")).toBe("2026-08");
  });

  it("年跨ぎでも2か月前を返す", () => {
    expect(paymentMonthToClosingMonth("2026-01")).toBe("2025-11");
    expect(paymentMonthToClosingMonth("2026-02")).toBe("2025-12");
  });
});

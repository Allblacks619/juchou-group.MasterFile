// CI は UTC で走るため、日本時間を明示しないと「UTCだと前日になる」条件を再現できない
process.env.TZ = "Asia/Tokyo";

import { describe, it, expect, vi, afterEach } from "vitest";
import { todayStr } from "./genbaTask";

describe("todayStr", () => {
  afterEach(() => vi.useRealTimers());

  it("UTCではなく端末のローカル日付を返す (朝礼の時間帯に前日にならない)", () => {
    vi.useFakeTimers();
    // JST 2026-07-31 07:30 = UTC 2026-07-30 22:30。UTC基準だと前日になる時刻
    vi.setSystemTime(new Date("2026-07-30T22:30:00Z"));
    expect(todayStr()).toBe("2026-07-31");
  });

  it("月日を2桁ゼロ埋めする", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-05T03:00:00Z"));
    expect(todayStr()).toBe("2026-01-05");
  });
});

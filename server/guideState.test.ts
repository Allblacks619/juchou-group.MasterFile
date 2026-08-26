import { describe, expect, it } from "vitest";
import { DEFAULT_GUIDE_STATE, mergeGuideState, parseGuideState } from "./guideState";

describe("guide state", () => {
  it("returns defaults for empty or invalid JSON", () => {
    expect(parseGuideState(null)).toEqual(DEFAULT_GUIDE_STATE);
    expect(parseGuideState("{bad")).toEqual(DEFAULT_GUIDE_STATE);
  });

  it("parses saved preferences safely", () => {
    expect(parseGuideState(JSON.stringify({
      onboardingSeenVersion: 2,
      onboardingAutoShow: false,
      updatesAutoShow: false,
      lastSeenUpdateId: "abc",
    }))).toEqual({
      onboardingSeenVersion: 2,
      onboardingAutoShow: false,
      updatesAutoShow: false,
      lastSeenUpdateId: "abc",
    });
  });

  it("merges a partial update without losing other preferences", () => {
    const current = parseGuideState(JSON.stringify({ onboardingSeenVersion: 1, lastSeenUpdateId: "old" }));
    expect(mergeGuideState(current, { updatesAutoShow: false })).toEqual({
      onboardingSeenVersion: 1,
      onboardingAutoShow: true,
      updatesAutoShow: false,
      lastSeenUpdateId: "old",
    });
  });
});

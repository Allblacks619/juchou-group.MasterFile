export const ONBOARDING_VERSION = 1;

export type GuideState = {
  onboardingSeenVersion: number;
  onboardingAutoShow: boolean;
  updatesAutoShow: boolean;
  lastSeenUpdateId: string | null;
};

export const DEFAULT_GUIDE_STATE: GuideState = {
  onboardingSeenVersion: 0,
  onboardingAutoShow: true,
  updatesAutoShow: true,
  lastSeenUpdateId: null,
};

export function parseGuideState(raw: unknown): GuideState {
  if (typeof raw !== "string" || !raw.trim()) return { ...DEFAULT_GUIDE_STATE };
  try {
    const parsed = JSON.parse(raw) as Partial<GuideState>;
    return {
      onboardingSeenVersion:
        Number.isInteger(parsed.onboardingSeenVersion) && Number(parsed.onboardingSeenVersion) >= 0
          ? Number(parsed.onboardingSeenVersion)
          : 0,
      onboardingAutoShow: parsed.onboardingAutoShow !== false,
      updatesAutoShow: parsed.updatesAutoShow !== false,
      lastSeenUpdateId:
        typeof parsed.lastSeenUpdateId === "string" && parsed.lastSeenUpdateId.length > 0
          ? parsed.lastSeenUpdateId.slice(0, 64)
          : null,
    };
  } catch {
    return { ...DEFAULT_GUIDE_STATE };
  }
}

export function mergeGuideState(current: GuideState, patch: Partial<GuideState>): GuideState {
  return {
    onboardingSeenVersion:
      patch.onboardingSeenVersion == null
        ? current.onboardingSeenVersion
        : Math.max(0, Math.trunc(patch.onboardingSeenVersion)),
    onboardingAutoShow:
      patch.onboardingAutoShow == null ? current.onboardingAutoShow : !!patch.onboardingAutoShow,
    updatesAutoShow: patch.updatesAutoShow == null ? current.updatesAutoShow : !!patch.updatesAutoShow,
    lastSeenUpdateId:
      patch.lastSeenUpdateId === undefined
        ? current.lastSeenUpdateId
        : patch.lastSeenUpdateId
          ? String(patch.lastSeenUpdateId).slice(0, 64)
          : null,
  };
}

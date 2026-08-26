import fs from "node:fs";

function replaceOnce(path, from, to, label) {
  let text = fs.readFileSync(path, "utf8");
  if (!text.includes(from)) throw new Error(`${path}: pattern not found (${label})`);
  text = text.replace(from, to);
  fs.writeFileSync(path, text);
}

// 1) User persistence field
replaceOnce(
  "drizzle/schema.ts",
  '  permissionOverrides: text("permissionOverrides"),\n  /** テナント(会社)ID。マルチテナント化 Phase 1a — 既存データは既定会社=1 */',
  '  permissionOverrides: text("permissionOverrides"),\n  /** 初回ガイド・新機能通知の個人別既読/自動表示設定(JSON) */\n  guideState: text("guideState"),\n  /** テナント(会社)ID。マルチテナント化 Phase 1a — 既存データは既定会社=1 */',
  "users.guideState",
);

// 2) Server guide state helpers share the onboarding version with the client
replaceOnce(
  "server/guideState.ts",
  'export const ONBOARDING_VERSION = 1;\n\n',
  'export { ONBOARDING_VERSION } from "@shared/appGuide";\n\n',
  "shared onboarding version",
);

// 3) Router imports
replaceOnce(
  "server/routers.ts",
  'import { reflectSubmitterPaymentStatus } from "./connect/paymentSync";\n',
  'import { reflectSubmitterPaymentStatus } from "./connect/paymentSync";\nimport { mergeGuideState, ONBOARDING_VERSION, parseGuideState } from "./guideState";\n',
  "guide imports",
);

// 4) Protected guide API, persisted per user/account
replaceOnce(
  "server/routers.ts",
  'export const appRouter = router({\n  system: systemRouter,\n',
  `export const appRouter = router({\n  system: systemRouter,\n\n  // ── 初回ガイド / 新機能・仕様変更のお知らせ ──\n  guide: router({\n    state: protectedProcedure.query(async ({ ctx }) => {\n      const database = await db.getDb();\n      if (!database) return { ...parseGuideState(null), onboardingVersion: ONBOARDING_VERSION };\n      const rows = await database\n        .select({ guideState: schema.users.guideState })\n        .from(schema.users)\n        .where(eq(schema.users.id, Number(ctx.user.id)))\n        .limit(1);\n      return { ...parseGuideState(rows[0]?.guideState), onboardingVersion: ONBOARDING_VERSION };\n    }),\n\n    saveState: protectedProcedure\n      .input(z.object({\n        onboardingSeenVersion: z.number().int().min(0).optional(),\n        onboardingAutoShow: z.boolean().optional(),\n        updatesAutoShow: z.boolean().optional(),\n        lastSeenUpdateId: z.string().max(64).nullable().optional(),\n      }))\n      .mutation(async ({ ctx, input }) => {\n        const database = await db.getDb();\n        if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });\n        const rows = await database\n          .select({ guideState: schema.users.guideState })\n          .from(schema.users)\n          .where(eq(schema.users.id, Number(ctx.user.id)))\n          .limit(1);\n        const next = mergeGuideState(parseGuideState(rows[0]?.guideState), input);\n        await database\n          .update(schema.users)\n          .set({ guideState: JSON.stringify(next) })\n          .where(eq(schema.users.id, Number(ctx.user.id)));\n        return { ...next, onboardingVersion: ONBOARDING_VERSION };\n      }),\n  }),\n`,
  "guide router",
);

// 5) Mount guide center in authenticated top bar
replaceOnce(
  "client/src/components/AppLayout.tsx",
  'import type { PermissionArea } from "@shared/permissionAreas";\n',
  'import type { PermissionArea } from "@shared/permissionAreas";\nimport AppGuideCenter from "./AppGuideCenter";\n',
  "AppGuideCenter import",
);
replaceOnce(
  "client/src/components/AppLayout.tsx",
  '          <div className="flex-1" />\n        </header>',
  '          <div className="flex-1" />\n          <AppGuideCenter appRole={appRole} />\n        </header>',
  "AppGuideCenter mount",
);

// 6) Client uses the shared guide version and prevents auto-dialog reopen races
replaceOnce(
  "client/src/components/AppGuideCenter.tsx",
  'import { APP_UPDATES, type AppUpdate } from "@/generated/appUpdates";\n\nconst ONBOARDING_VERSION = 1;\n',
  'import { APP_UPDATES, type AppUpdate } from "@/generated/appUpdates";\nimport { ONBOARDING_VERSION } from "@shared/appGuide";\n',
  "client shared onboarding version",
);
replaceOnce(
  "client/src/components/AppGuideCenter.tsx",
  '  const [disableAutoUpdates, setDisableAutoUpdates] = useState(false);\n\n  const relevantUpdates',
  '  const [disableAutoUpdates, setDisableAutoUpdates] = useState(false);\n  const [autoHandled, setAutoHandled] = useState(false);\n\n  const relevantUpdates',
  "autoHandled state",
);
replaceOnce(
  "client/src/components/AppGuideCenter.tsx",
  '    if (!state || mode) return;\n    if (state.onboardingAutoShow && state.onboardingSeenVersion < ONBOARDING_VERSION) {',
  '    if (!state || mode || autoHandled) return;\n    if (state.onboardingAutoShow && state.onboardingSeenVersion < ONBOARDING_VERSION) {\n      setAutoHandled(true);',
  "onboarding auto guard",
);
replaceOnce(
  "client/src/components/AppGuideCenter.tsx",
  '    if (state.updatesAutoShow && unseenUpdates.length > 0) {\n      setDisableAutoUpdates(false);',
  '    if (state.updatesAutoShow && unseenUpdates.length > 0) {\n      setAutoHandled(true);\n      setDisableAutoUpdates(false);',
  "update auto guard",
);
replaceOnce(
  "client/src/components/AppGuideCenter.tsx",
  '  }, [stateQuery.data, unseenUpdates.length, mode]);',
  '  }, [stateQuery.data, unseenUpdates.length, mode, autoHandled]);',
  "auto guard deps",
);

// 7) Make future coding agents maintain the guide without owner prompting
const claudePath = "CLAUDE.md";
let claude = fs.readFileSync(claudePath, "utf8");
if (!claude.includes("## In-app onboarding / change guide (MANDATORY)")) {
  claude += `\n\n## In-app onboarding / change guide (MANDATORY)\n\nThe authenticated business app has a role-based onboarding and change-notification system. This is part of the product contract, not optional documentation.\n\nWhenever a user-facing feature, specification, navigation item, calculation meaning, or workflow changes:\n\n1. Update the affected manager/worker explanation in \`client/src/components/AppGuideCenter.tsx\` when the normal workflow or feature usage changed. Do this proactively; do not wait for an owner request.\n2. Bump \`ONBOARDING_VERSION\` in \`shared/appGuide.ts\` only when the onboarding content/workflow materially changed and existing users should be shown the refreshed guide once.\n3. Keep Japanese and Portuguese guide copy aligned.\n4. Do not rename/remove the automatic feed files \`scripts/update-app-guide-feed.mjs\`, \`.github/workflows/app-guide-feed.yml\`, or \`client/src/generated/appUpdates.ts\` without replacing their behavior. The workflow automatically publishes a concise in-app change notice after qualifying main-branch changes.\n5. Internal refactors/tests/docs-only changes should not create user-facing announcements.\n`;
  fs.writeFileSync(claudePath, claude);
}

console.log("onboarding guide v1 patch applied");

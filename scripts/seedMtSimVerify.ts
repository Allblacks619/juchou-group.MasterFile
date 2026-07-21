import "dotenv/config";
import bcrypt from "bcryptjs";
import * as db from "../server/db";
import { seedMtSimFixture, MTSIM_COMPANIES, MTSIM_MONTH } from "../server/mtSimFixture";

/**
 * マルチテナント検証環境シーダー (Phase 5 前倒し / docs/multitenant/VERIFICATION.md)
 *
 * 本番では実行しないこと。検証用DB (MULTI_TENANT=true のインスタンス) に対して:
 * - 会社2=甲野電設 / 会社3=丙田工業 をテナント台帳に作成
 * - 会社1(乙島役=自社) の出面・締め・請求データ一式 (mtSimFixture) をシード
 * - 両社のログインアカウント (mtsim-otsu-admin / mtsim-kono-admin) を作成
 * - 甲野側の受入現場と出面 (突合デモ用: 2/10 の残業をわざと不一致・2/17 を甲野側のみ) をシード
 *
 * 実行: DATABASE_URL=... npx tsx scripts/seedMtSimVerify.ts
 * 冪等: 何度実行しても安全 (名前/loginId で find-or-create)。
 */

const OTSU_LOGIN = "mtsim-otsu-admin";
const KONO_LOGIN = "mtsim-kono-admin";
const PASSWORD = "Mtsim#2025";

const KONO_PROJECT = "MTSIM 甲野側受入現場（甲野タワー新築）";

async function findOrCreateCompany(name: string): Promise<number> {
  const all = await db.getAllCompanies();
  const found = (all as any[]).find((c) => c.name === name);
  if (found) return Number(found.id);
  const created = await db.createCompany({ name, notes: "MTSIM 検証用テナント（本番データではありません）" } as any);
  return Number((created as any).id);
}

async function findOrCreateAdminUser(loginId: string, name: string, companyId: number): Promise<void> {
  const existing = await db.getUserByLoginId(loginId);
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  if (existing) {
    await db.upsertUser({ openId: existing.openId, companyId, passwordHash } as any);
    return;
  }
  await db.upsertUser({
    openId: `custom_mtsim_${loginId.replace(/-/g, "_")}`,
    name,
    loginId,
    passwordHash,
    role: "admin",
    appRole: "admin",
    mustChangePassword: false,
    companyId,
    lastSignedIn: new Date(),
  } as any);
}

export async function seedMtSimVerify() {
  console.log("[mtsim-verify] 検証シードを開始します（本番DBに対しては実行しないこと）");

  // 1) テナント台帳（会社1=既定会社は migration 0037 で作成済み）
  const konoId = await findOrCreateCompany(MTSIM_COMPANIES.KONO.name);
  const heidaId = await findOrCreateCompany(MTSIM_COMPANIES.HEIDA.name);
  console.log(`[mtsim-verify] 会社: 乙島(自社役)=1 / 甲野=${konoId} / 丙田=${heidaId}`);

  // 2) 乙島（会社1）の一式: 取引先(甲野)・現場・従業員2名・ゲスト出面・締め (companyId は既定=1)
  const sim = await seedMtSimFixture();
  console.log(`[mtsim-verify] 乙島データ: project#${sim.projectId} / 従業員 ${sim.workers.length}名 / 出面 ${sim.attendanceRecords + sim.guestAttendanceRecords}件 (${MTSIM_MONTH})`);

  // 3) ログインアカウント
  await findOrCreateAdminUser(OTSU_LOGIN, "MTSIM 乙島 管理者", 1);
  await findOrCreateAdminUser(KONO_LOGIN, "MTSIM 甲野 管理者", konoId);

  // 4) 甲野側の受入現場 + 突合デモ出面（乙島の申告と 2/10 が不一致・2/17 は甲野側にのみ存在）
  const projects = await db.getAllProjects(konoId);
  let konoProject = (projects as any[]).find((p) => p.name === KONO_PROJECT);
  if (!konoProject) {
    konoProject = await db.createProject({ name: KONO_PROJECT, status: "active", companyId: konoId, notes: "MTSIM 検証用（突合デモ）" } as any);
  }
  const konoProjectId = Number(konoProject.id);
  const rows: { d: number; ot: number }[] = [
    { d: 3, ot: 0 },
    { d: 10, ot: 40 }, // 乙島申告は 6.0h(60) → わざと 4.0h(40) で不一致デモ
    { d: 17, ot: 0 },  // 甲野側にのみ存在（missing_in_submitter デモ）
  ];
  for (const r of rows) {
    await db.upsertAttendance({
      employeeId: null,
      guestName: "MTSIM 乙島 一郎",
      projectId: konoProjectId,
      workDate: new Date(`${MTSIM_MONTH}-${String(r.d).padStart(2, "0")}T00:00:00.000Z`),
      hoursWorked: 80,
      overtimeHours: r.ot,
      workType: "normal",
      shiftType: "day",
      companyId: konoId,
    } as any);
  }
  console.log(`[mtsim-verify] 甲野側: project#${konoProjectId} に突合デモ出面3件`);

  console.log("\n[mtsim-verify] 完了。ログイン情報:");
  console.log(`  乙島（自社役・会社1）: loginId=${OTSU_LOGIN} / password=${PASSWORD}`);
  console.log(`  甲野（元請役・会社${konoId}）: loginId=${KONO_LOGIN} / password=${PASSWORD}`);
  console.log("  ウォークスルー台本: docs/multitenant/VERIFICATION.md");
  return { konoId, heidaId, konoProjectId };
}

// 直接実行時のみ走らせる（テストからは seedMtSimVerify() を import して使う）
if (process.argv[1]?.includes("seedMtSimVerify")) {
  if (!process.env.DATABASE_URL) {
    console.error("[mtsim-verify] Fatal: DATABASE_URL is required（検証用DBを指定してください）");
    process.exit(1);
  }
  seedMtSimVerify()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("[mtsim-verify] Fatal:", err);
      process.exit(1);
    });
}

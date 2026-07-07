/**
 * 現場ビジョン: 学習と改善提案の集計 (サーバー側・純粋関数)。
 * プロトタイプ InsightsCard のロジックを移植。利用ログ(genba_activity_logs)と
 * 現在のタスク/テンプレート/ゾーンから、改善のヒントと利用統計を自動生成する。
 */

import { CATALOG_LABELS } from "../../shared/genba/catalog";

export type ActivityLog = { type: string; payload: any };

export type InsightsInput = {
  logs: ActivityLog[];
  /** 現在この現場に存在するタスク名 (未使用テンプレ判定用) */
  taskNames: string[];
  /** テンプレートの葉ノード名 */
  templateLeafNames: string[];
  /** この現場のゾーン (id→name) */
  zones: { id: string; name: string }[];
  /** 既存プリセットに登録済みの部材名 (昇格候補の除外用) */
  presetLabels: string[];
  /** 集計対象の現場 id (material ログの絞り込み) */
  siteId: string;
};

export type Insights = {
  promoteCandidates: { name: string; count: number }[];
  unusedTemplates: string[];
  stats: { doneCount: number; issueCount: number; materialCount: number };
  topMaterials: { name: string; qty: number }[];
  topIssueZones: { zoneId: string; name: string; count: number }[];
  totalSuggestions: number;
};

export function computeInsights(input: InsightsInput): Insights {
  const presetSet = new Set(input.presetLabels);
  const zoneNameById = new Map(input.zones.map((z) => [z.id, z.name]));
  const zoneIds = new Set(input.zones.map((z) => z.id));

  const materialLogs = input.logs.filter((l) => l.type === "material" && l.payload?.siteId === input.siteId);
  // ゾーンで現場に紐づく status/issue ログ
  const statusLogs = input.logs.filter((l) => l.type === "status" && zoneIds.has(l.payload?.zoneId));
  const issueLogs = input.logs.filter((l) => l.type === "issue" && zoneIds.has(l.payload?.zoneId));

  // 提案1: 手入力材料(カタログ外)を2回以上 → プリセット昇格候補
  const freeCounts = new Map<string, number>();
  for (const l of materialLogs) {
    if (!l.payload?.freeInput) continue;
    const name = l.payload?.name;
    if (!name) continue;
    freeCounts.set(name, (freeCounts.get(name) || 0) + 1);
  }
  const promoteCandidates = Array.from(freeCounts.entries())
    .filter(([name, c]) => c >= 2 && !CATALOG_LABELS.has(name) && !presetSet.has(name))
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }));

  // 提案2: 未使用の作業テンプレート (葉のうち現場のタスク名に無いもの)
  const usedNames = new Set(input.taskNames);
  const unusedTemplates = Array.from(new Set(input.templateLeafNames)).filter((n) => !usedNames.has(n));

  // 統計
  const doneCount = statusLogs.filter((l) => l.payload?.status === "done").length;
  const issueCount = issueLogs.length;
  const materialCount = materialLogs.length;

  const matQty = new Map<string, number>();
  for (const l of materialLogs) {
    const name = l.payload?.name;
    if (!name) continue;
    matQty.set(name, (matQty.get(name) || 0) + (Number(l.payload?.qty) || 1));
  }
  const topMaterials = Array.from(matQty.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, qty]) => ({ name, qty }));

  const issueByZone = new Map<string, number>();
  for (const l of issueLogs) {
    const zid = l.payload?.zoneId;
    if (!zid) continue;
    issueByZone.set(zid, (issueByZone.get(zid) || 0) + 1);
  }
  const topIssueZones = Array.from(issueByZone.entries())
    .map(([zoneId, count]) => ({ zoneId, name: zoneNameById.get(zoneId) || "?", count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  const totalSuggestions = promoteCandidates.length + (unusedTemplates.length > 0 ? 1 : 0);

  return { promoteCandidates, unusedTemplates, stats: { doneCount, issueCount, materialCount }, topMaterials, topIssueZones, totalSuggestions };
}

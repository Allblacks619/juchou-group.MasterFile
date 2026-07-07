import { describe, it, expect } from "vitest";
import { computeInsights } from "./insights";

/** 学習と改善提案 (利用ログ集計)。Genba_Beta 相当の合成ログで検証 */
describe("computeInsights", () => {
  const base = {
    siteId: "Genba_Beta_Site_01",
    zones: [{ id: "z1", name: "1工区" }, { id: "z2", name: "2工区" }],
    taskNames: ["配管", "配線"],
    templateLeafNames: ["配管", "配線", "貫通処理", "結線"],
    presetLabels: ["ビニテ 黒"],
    logs: [
      // 自由入力材料 (カタログ外) を2回 → 昇格候補
      { type: "material", payload: { siteId: "Genba_Beta_Site_01", name: "アイボルト M10", qty: 20, unit: "個", freeInput: true } },
      { type: "material", payload: { siteId: "Genba_Beta_Site_01", name: "アイボルト M10", qty: 15, unit: "個", freeInput: true } },
      // カタログ内 (freeInput=false) は昇格候補にしない
      { type: "material", payload: { siteId: "Genba_Beta_Site_01", name: "IV1.6 黒(300m束)", qty: 5, unit: "束", freeInput: false } },
      // 別現場のログは無視
      { type: "material", payload: { siteId: "OTHER_SITE", name: "他現場材料", qty: 99, unit: "個", freeInput: true } },
      // ステータス/問題
      { type: "status", payload: { zoneId: "z1", status: "done" } },
      { type: "status", payload: { zoneId: "z1", status: "done" } },
      { type: "issue", payload: { zoneId: "z1" } },
      { type: "issue", payload: { zoneId: "z1" } },
      { type: "issue", payload: { zoneId: "z2" } },
      // 現場外ゾーンの issue は無視
      { type: "issue", payload: { zoneId: "zX" } },
    ],
  };

  it("昇格候補: 自由入力2回以上・カタログ/プリセット外のみ・別現場除外", () => {
    const r = computeInsights(base);
    expect(r.promoteCandidates).toEqual([{ name: "アイボルト M10", count: 2 }]);
  });

  it("未使用テンプレート: 現場タスクに無い葉を挙げる", () => {
    const r = computeInsights(base);
    expect(r.unusedTemplates.sort()).toEqual(["結線", "貫通処理"]);
  });

  it("統計: 完了数/問題数/材料品目数 (現場ゾーンに紐づくもの)", () => {
    const r = computeInsights(base);
    expect(r.stats.doneCount).toBe(2);
    expect(r.stats.issueCount).toBe(3); // z1×2 + z2×1 (zX は現場外で除外)
    expect(r.stats.materialCount).toBe(3); // 現場の material ログ3件 (他現場除外)
  });

  it("TOP材料: 数量合計の降順", () => {
    const r = computeInsights(base);
    expect(r.topMaterials[0]).toEqual({ name: "アイボルト M10", qty: 35 });
  });

  it("問題の多いエリア: 件数降順・ゾーン名解決", () => {
    const r = computeInsights(base);
    expect(r.topIssueZones[0]).toEqual({ zoneId: "z1", name: "1工区", count: 2 });
    expect(r.topIssueZones.find((z) => z.zoneId === "zX")).toBeUndefined();
  });

  it("提案が無ければ totalSuggestions=0", () => {
    const r = computeInsights({ ...base, logs: [], templateLeafNames: ["配管", "配線"], taskNames: ["配管", "配線"] });
    expect(r.totalSuggestions).toBe(0);
    expect(r.promoteCandidates).toEqual([]);
    expect(r.unusedTemplates).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import {
  INSTRUMENT_TYPES,
  PF_AVG_DEFAULT_M,
  PF_AVG_MAX_M,
  PF_AVG_MIN_M,
  PF_ROLL_LENGTH_M,
  REN_TYPES,
  calcPartition,
  parseNonNegative,
  type PartitionCard,
  type PartitionOptions,
  type RenType,
} from "@shared/genba/tools/partition";

const card = (count: number, opts: Partial<Omit<PartitionCard, "count">> = {}): PartitionCard => ({
  type: "コンセント",
  ren: "1連",
  count,
  pf16: 0,
  pf22: 0,
  ...opts,
});

const OPTS: PartitionOptions = { pfEnabled: true, pf16AvgM: 5, pf22AvgM: 5, useMagnet: false };

describe("定数（仕様書からの転記）", () => {
  it("器具種類6種", () => {
    expect(INSTRUMENT_TYPES).toEqual(["コンセント", "スイッチ", "LAN", "TV", "マルチ", "その他"]);
  });
  it("塗代カバー連数3種", () => {
    expect(REN_TYPES).toEqual(["1連", "2連", "3連"]);
  });
  it("平均使用長 初期値5m・範囲1〜99m", () => {
    expect(PF_AVG_DEFAULT_M).toBe(5);
    expect(PF_AVG_MIN_M).toBe(1);
    expect(PF_AVG_MAX_M).toBe(99);
  });
  it("PF管 1巻=50m（PF16/PF22 共通）", () => {
    expect(PF_ROLL_LENGTH_M).toBe(50);
  });
});

describe("calcPartition（代表ケース）", () => {
  it("コンセント2連×3カ所 PF16×2本: BOX3・2連カバー3・PF16総30m→1巻・コネクタ6・金物3", () => {
    const r = calcPartition([card(3, { ren: "2連", pf16: 2 })], OPTS);
    expect(r.boxes).toBe(3);
    expect(r.covers).toEqual({ "1連": 0, "2連": 3, "3連": 0 });
    expect(r.pf16TotalM).toBe(30); // 3×2×5
    expect(r.pf16Rolls).toBe(1); // ceil(30/50)
    expect(r.pf16Connectors).toBe(6); // 3×2
    expect(r.pf22TotalM).toBe(0);
    expect(r.pf22Rolls).toBe(0);
    expect(r.pf22Connectors).toBe(0);
    expect(r.brackets).toBe(3);
    expect(r.magnets).toBe(0);
  });

  it("複数カード集計: 連数ごとにカバーを集計、BOX=金物=箇所数合計", () => {
    const r = calcPartition(
      [
        card(2, { ren: "1連", pf16: 1 }),
        card(4, { ren: "2連", pf22: 1 }),
        card(1, { ren: "3連", pf16: 2, pf22: 1 }),
        card(3, { ren: "1連" }),
      ],
      OPTS,
    );
    expect(r.boxes).toBe(10);
    expect(r.brackets).toBe(10);
    expect(r.covers).toEqual({ "1連": 5, "2連": 4, "3連": 1 });
    expect(r.pf16TotalM).toBe(20); // 2×1×5 + 1×2×5
    expect(r.pf22TotalM).toBe(25); // 4×1×5 + 1×1×5
    expect(r.pf16Connectors).toBe(4); // 2+2
    expect(r.pf22Connectors).toBe(5); // 4+1
  });

  it("マグネットON: BOX と同数を計上", () => {
    const r = calcPartition([card(4), card(3, { ren: "2連" })], { ...OPTS, useMagnet: true });
    expect(r.boxes).toBe(7);
    expect(r.magnets).toBe(7);
  });

  it("平均使用長の反映: PF16=3m/PF22=8m", () => {
    const r = calcPartition([card(2, { pf16: 1, pf22: 2 })], { ...OPTS, pf16AvgM: 3, pf22AvgM: 8 });
    expect(r.pf16TotalM).toBe(6); // 2×1×3
    expect(r.pf22TotalM).toBe(32); // 2×2×8
  });

  it("器具種類は集計に影響しない", () => {
    const a = calcPartition([card(2, { type: "コンセント", pf16: 1 })], OPTS);
    const b = calcPartition([card(2, { type: "その他", pf16: 1 })], OPTS);
    expect(b).toEqual(a);
  });
});

describe("calcPartition（境界値）", () => {
  it("カード0枚: すべて0", () => {
    const r = calcPartition([], { ...OPTS, useMagnet: true });
    expect(r).toEqual({
      boxes: 0,
      covers: { "1連": 0, "2連": 0, "3連": 0 },
      pf16TotalM: 0,
      pf22TotalM: 0,
      pf16Rolls: 0,
      pf22Rolls: 0,
      pf16Connectors: 0,
      pf22Connectors: 0,
      brackets: 0,
      magnets: 0,
    });
  });

  it("巻数の切り上げ: 総50mちょうどで1巻、50.0001m超（51m）で2巻", () => {
    // 10カ所×1本×5m = 50m
    expect(calcPartition([card(10, { pf16: 1 })], OPTS).pf16Rolls).toBe(1);
    // 51カ所×1本×1m = 51m
    expect(calcPartition([card(51, { pf16: 1 })], { ...OPTS, pf16AvgM: 1 }).pf16Rolls).toBe(2);
    // 100カ所×1本×1m = 100m → 2巻
    expect(calcPartition([card(100, { pf16: 1 })], { ...OPTS, pf16AvgM: 1 }).pf16Rolls).toBe(2);
  });

  it("極小: 1カ所×1本×1m → 1巻に切り上げ", () => {
    const r = calcPartition([card(1, { pf22: 1 })], { ...OPTS, pf22AvgM: 1 });
    expect(r.pf22TotalM).toBe(1);
    expect(r.pf22Rolls).toBe(1);
  });

  it("箇所数0のカード: BOX・カバー・PF すべて計上されない", () => {
    const r = calcPartition([card(0, { ren: "2連", pf16: 3, pf22: 3 })], OPTS);
    expect(r.boxes).toBe(0);
    expect(r.covers["2連"]).toBe(0);
    expect(r.pf16TotalM).toBe(0);
    expect(r.pf16Connectors).toBe(0);
  });

  it("PF計算OFF: 総長・巻数は0だがコネクタ集計は継続、BOX系は不変", () => {
    const cards = [card(3, { pf16: 2, pf22: 1 })];
    const r = calcPartition(cards, { ...OPTS, pfEnabled: false });
    expect(r.pf16TotalM).toBe(0);
    expect(r.pf22TotalM).toBe(0);
    expect(r.pf16Rolls).toBe(0);
    expect(r.pf22Rolls).toBe(0);
    expect(r.pf16Connectors).toBe(6);
    expect(r.pf22Connectors).toBe(3);
    expect(r.boxes).toBe(3);
    expect(r.brackets).toBe(3);
  });
});

describe("parseNonNegative", () => {
  it("数値文字列・小数はそのまま", () => {
    expect(parseNonNegative("5")).toBe(5);
    expect(parseNonNegative("2.5")).toBe(2.5);
    expect(parseNonNegative("0")).toBe(0);
  });
  it("空文字・非数値・負値は0扱い", () => {
    expect(parseNonNegative("")).toBe(0);
    expect(parseNonNegative("abc")).toBe(0);
    expect(parseNonNegative("-3")).toBe(0);
  });
});

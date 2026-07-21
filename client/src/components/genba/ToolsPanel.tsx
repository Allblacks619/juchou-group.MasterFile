import { useState, type ComponentType } from "react";
import {
  ArrowLeft,
  Anchor,
  Cable,
  CircleDot,
  Cylinder,
  Drill,
  Flame,
  Layers,
  Package,
  PanelsTopLeft,
  Percent,
  Ruler,
  Zap,
} from "lucide-react";
import PipeOuterDiameterTool from "./tools/PipeOuterDiameterTool";
import HolePunchTool from "./tools/HolePunchTool";
import SupportSpanTool from "./tools/SupportSpanTool";
import PilotHoleTool from "./tools/PilotHoleTool";
import ConnectorPickTool from "./tools/ConnectorPickTool";
import FirestopTool from "./tools/FirestopTool";
import MetalConduitTool from "./tools/MetalConduitTool";
import CableRackTool from "./tools/CableRackTool";
import PartitionTool from "./tools/PartitionTool";
import ConduitFillTool from "./tools/ConduitFillTool";
import WiringCalcTool from "./tools/WiringCalcTool";
import VvfOrderTool from "./tools/VvfOrderTool";

type ToolDef = {
  key: string;
  name: string;
  desc: string;
  icon: ComponentType<{ className?: string }>;
  component: ComponentType;
};

type Category = { title: string; tools: ToolDef[] };

const CATEGORIES: Category[] = [
  {
    title: "検索・早見",
    tools: [
      { key: "pipe-od", name: "配管外径 早見", desc: "配管種別と呼び径から外径をすぐ確認", icon: Ruler, component: PipeOuterDiameterTool },
      { key: "hole-punch", name: "抜き径・貫通穴 検索", desc: "配管に必要な貫通穴サイズと工具を検索", icon: CircleDot, component: HolePunchTool },
      { key: "support-span", name: "支持間隔 早見", desc: "電材ごとの支持・固定間隔の目安を確認", icon: Anchor, component: SupportSpanTool },
      { key: "pilot-hole", name: "下穴径 早見", desc: "タップ・コネクタの下穴径をすぐ確認", icon: Drill, component: PilotHoleTool },
      { key: "connector-pick", name: "接続材 選定", desc: "配管の組み合わせから接続材を選定", icon: Cable, component: ConnectorPickTool },
      { key: "firestop", name: "耐火区画貫通 ガイド", desc: "区画貫通の処理工法をガイドで確認", icon: Flame, component: FirestopTool },
    ],
  },
  {
    title: "計算・拾い出し",
    tools: [
      { key: "metal-conduit", name: "金属管 拾い出し", desc: "金属管ルートの材料数量を拾い出し", icon: Cylinder, component: MetalConduitTool },
      { key: "cable-rack", name: "ケーブルラック 材料計算", desc: "ラック本体・付属品の必要数を計算", icon: Layers, component: CableRackTool },
      { key: "partition", name: "間仕切り 仕込み材 拾い出し", desc: "間仕切り工事の仕込み材を拾い出し", icon: PanelsTopLeft, component: PartitionTool },
      { key: "conduit-fill", name: "占積率 計算", desc: "管内の電線占積率を計算してチェック", icon: Percent, component: ConduitFillTool },
      { key: "wiring-calc", name: "配線 計算", desc: "電圧降下・幹線・接地線などの配線計算", icon: Zap, component: WiringCalcTool },
      { key: "vvf-order", name: "VVF 発注計算", desc: "回路入力からロス込みの巻数・ドラム数を計算", icon: Package, component: VvfOrderTool },
    ],
  },
];

/**
 * 現場ツールボックス: 現場で使う検索・計算ツールのポータル。
 * カテゴリ別カード一覧 → タップで各ツール画面へ（完全クライアント完結・サーバー通信なし）。
 */
export default function ToolsPanel() {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const selected = selectedKey
    ? CATEGORIES.flatMap((c) => c.tools).find((t) => t.key === selectedKey) ?? null
    : null;

  if (selected) {
    const ToolComponent = selected.component;
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSelectedKey(null)}
            className="inline-flex items-center gap-1 rounded-lg border border-border bg-card/50 px-2.5 py-1.5 text-sm font-bold text-muted-foreground"
          >
            <ArrowLeft className="w-4 h-4" /> 戻る
          </button>
          <span className="text-sm font-bold truncate">{selected.name}</span>
        </div>
        <ToolComponent />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-base font-bold px-1">現場ツールボックス</h2>
      {CATEGORIES.map((cat) => (
        <div key={cat.title} className="space-y-2">
          <div className="text-xs font-bold text-muted-foreground px-1">{cat.title}</div>
          <div className="grid grid-cols-2 gap-2">
            {cat.tools.map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setSelectedKey(t.key)}
                  className="rounded-2xl border border-border bg-card/70 p-3 text-left active:opacity-70 transition-opacity"
                >
                  <Icon className="w-5 h-5 text-muted-foreground" />
                  <div className="mt-1.5 text-sm font-bold leading-tight">{t.name}</div>
                  <div className="mt-1 text-[11px] text-muted-foreground leading-snug">{t.desc}</div>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

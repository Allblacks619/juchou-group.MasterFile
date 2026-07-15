import { useEffect, useState } from "react";
import { PRIORITY, ZONE_COLORS, zoneFillStyle } from "@/lib/genbaMap";
import { Button } from "@/components/ui/button";
import { X, Pencil, Trash2, Plus, ChevronLeft, ZoomIn } from "lucide-react";
import TaskTree from "./TaskTree";
import TaskFilesSection from "./TaskFilesSection";
import { dispName } from "@/lib/genbaRomaji";

export type ZoneWithAgg = {
  id: string;
  floorId: string;
  parentZoneId: string | null;
  name: string;
  polygon: unknown;
  priority: number | null;
  workStatus: string | null;
  color: string | null;
  fillOpacity: number | null;
  progress: number;
  issues: number;
};

/**
 * エリア詳細シート (M2-B): 優先度・稼働状態・リネーム・範囲編集・削除・サブエリア追加・子エリアナビ。
 * 作業ツリー(タスク)は M2-C で追加する。
 */
export default function ZoneSheet({
  zone, children, parent, canEdit, siteId, meUserId,
  onClose, onSelectZone, onSetPriority, onTogglePaused, onRename, onStartEditRange, onAddSubArea, onDelete, onTasksChanged,
  onSetStyle, onFocus,
}: {
  zone: ZoneWithAgg;
  children: ZoneWithAgg[];
  parent: ZoneWithAgg | null;
  canEdit: boolean;
  siteId: string;
  meUserId: number | null;
  onClose: () => void;
  onSelectZone: (id: string) => void;
  onSetPriority: (priority: number | null) => void;
  onTogglePaused: () => void;
  onRename: () => void;
  onStartEditRange: () => void;
  onAddSubArea: () => void;
  onDelete: () => void;
  onTasksChanged: () => void;
  onSetStyle: (patch: { color?: string | null; fillOpacity?: number | null }) => void;
  onFocus: () => void;
}) {
  // 透明度スライダーはローカル値で滑らかに動かし、離した時に保存する
  const currentOpacity = Math.round(zoneFillStyle(zone).opacity * 100);
  const [op, setOp] = useState(currentOpacity);
  useEffect(() => { setOp(currentOpacity); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [zone.id, zone.fillOpacity, zone.color, zone.priority]);

  return (
    <div className="rounded-xl border border-border bg-card p-3 space-y-3">
      <div className="flex items-center gap-2">
        {parent && (
          <Button variant="ghost" size="sm" className="px-1" onClick={() => onSelectZone(parent.id)}>
            <ChevronLeft className="h-4 w-4" /> {dispName(parent.name)}
          </Button>
        )}
        <strong className="text-base truncate">{zone.workStatus === "paused" ? "⏸ " : ""}{dispName(zone.name)}</strong>
        {canEdit && (
          <Button variant="ghost" size="sm" className="px-1" title="名前を変更" onClick={onRename}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        )}
        <span className="text-sm text-muted-foreground tabular-nums">{Math.round(zone.progress)}%</span>
        {zone.issues > 0 && (
          <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-[#FF4B00]/15 text-[#FF4B00]">⚠ {zone.issues}</span>
        )}
        <Button variant="ghost" size="sm" className="ml-auto px-1.5" title="このエリアを拡大表示 (内側だけ見やすく)" onClick={onFocus}>
          <ZoomIn className="h-4 w-4 mr-0.5" /> <span className="text-xs">拡大</span>
        </Button>
        <Button variant="ghost" size="sm" className="px-1" onClick={onClose}><X className="h-4 w-4" /></Button>
      </div>

      {canEdit && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">優先度:</span>
          {Object.entries(PRIORITY).map(([k, v]) => {
            const active = zone.priority === Number(k);
            return (
              <button
                key={k}
                onClick={() => onSetPriority(active ? null : Number(k))}
                className="text-xs font-medium px-2 py-1 rounded border"
                style={{
                  background: active ? v.color : "transparent",
                  color: active ? v.text : undefined,
                  borderColor: v.color,
                }}
              >
                {v.label}
              </button>
            );
          })}
          <button
            onClick={onStartEditRange}
            className="text-xs font-medium px-2 py-1 rounded border border-[#005AFF] text-[#005AFF]"
          >
            ✏ 範囲を編集
          </button>
          <button
            onClick={onTogglePaused}
            className="text-xs font-medium px-2 py-1 rounded border"
            style={{
              borderColor: "#64748b",
              background: zone.workStatus === "paused" ? "#64748b" : "transparent",
              color: zone.workStatus === "paused" ? "#fff" : undefined,
            }}
          >
            {zone.workStatus === "paused" ? "⏸ 予定なし" : "▶ 稼働中"}
          </button>
          <Button variant="ghost" size="sm" className="ml-auto text-destructive hover:text-destructive px-2" onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5 mr-1" /> 削除
          </Button>
        </div>
      )}

      {/* 塗りつぶし色・不透明度 (優先度色とは独立にエリアの見た目を調整できる) */}
      {canEdit && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">色:</span>
          <button
            onClick={() => onSetStyle({ color: null })}
            title="自動 (優先度色に従う)"
            className={`text-xs px-2 py-1 rounded border ${!zone.color ? "border-foreground font-bold" : "border-border text-muted-foreground"}`}
          >
            自動
          </button>
          {ZONE_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => onSetStyle({ color: zone.color === c ? null : c })}
              title={c}
              className="w-6 h-6 rounded-md border"
              style={{
                background: c,
                borderColor: zone.color === c ? "#0f172a" : "transparent",
                outline: zone.color === c ? "2px solid #0f172a" : undefined,
                outlineOffset: 1,
              }}
            />
          ))}
          <span className="text-xs text-muted-foreground ml-2">塗り:</span>
          <input
            type="range" min={0} max={100} step={5} value={op}
            onChange={(e) => setOp(Number(e.target.value))}
            onMouseUp={() => onSetStyle({ fillOpacity: op })}
            onTouchEnd={() => onSetStyle({ fillOpacity: op })}
            className="w-28 accent-current"
            style={{ accentColor: zoneFillStyle(zone).color }}
          />
          <span className="text-xs tabular-nums w-9">{op}%</span>
          {(zone.color || zone.fillOpacity != null) && (
            <button className="text-xs text-muted-foreground hover:text-foreground" title="色と塗りを既定に戻す"
              onClick={() => onSetStyle({ color: null, fillOpacity: null })}>↺ 既定</button>
          )}
        </div>
      )}

      {children.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {children.map((c) => (
            <button
              key={c.id}
              onClick={() => onSelectZone(c.id)}
              className="text-xs px-2 py-1 rounded-lg border border-border hover:bg-muted/50"
            >
              {dispName(c.name)} <span className="tabular-nums text-muted-foreground">{Math.round(c.progress)}%</span>
            </button>
          ))}
        </div>
      )}

      {canEdit && (
        <Button variant="outline" size="sm" className="w-full" onClick={onAddSubArea}>
          <Plus className="h-4 w-4 mr-1" /> サブエリアを追加
        </Button>
      )}

      {/* エリアの図面 (工区に貼れば配下の全作業に共通表示・作業員ワンタッチ) */}
      <div className="border-t border-border pt-2">
        <TaskFilesSection zoneId={zone.id} canEdit={canEdit} label="📐 このエリアの図面（全作業共通）" />
      </div>

      {/* 作業ツリー (M2-C) + 担当割当 (M3-A) */}
      <div className="border-t border-border pt-2">
        <TaskTree zoneId={zone.id} siteId={siteId} meUserId={meUserId} canEdit={canEdit} onChanged={onTasksChanged} />
      </div>
    </div>
  );
}

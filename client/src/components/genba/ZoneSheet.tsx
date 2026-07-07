import { PRIORITY } from "@/lib/genbaMap";
import { Button } from "@/components/ui/button";
import { X, Pencil, Trash2, Plus, ChevronLeft } from "lucide-react";
import TaskTree from "./TaskTree";

export type ZoneWithAgg = {
  id: string;
  floorId: string;
  parentZoneId: string | null;
  name: string;
  polygon: unknown;
  priority: number | null;
  workStatus: string | null;
  progress: number;
  issues: number;
};

/**
 * エリア詳細シート (M2-B): 優先度・稼働状態・リネーム・範囲編集・削除・サブエリア追加・子エリアナビ。
 * 作業ツリー(タスク)は M2-C で追加する。
 */
export default function ZoneSheet({
  zone, children, parent, canEdit,
  onClose, onSelectZone, onSetPriority, onTogglePaused, onRename, onStartEditRange, onAddSubArea, onDelete, onTasksChanged,
}: {
  zone: ZoneWithAgg;
  children: ZoneWithAgg[];
  parent: ZoneWithAgg | null;
  canEdit: boolean;
  onClose: () => void;
  onSelectZone: (id: string) => void;
  onSetPriority: (priority: number | null) => void;
  onTogglePaused: () => void;
  onRename: () => void;
  onStartEditRange: () => void;
  onAddSubArea: () => void;
  onDelete: () => void;
  onTasksChanged: () => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-3 space-y-3">
      <div className="flex items-center gap-2">
        {parent && (
          <Button variant="ghost" size="sm" className="px-1" onClick={() => onSelectZone(parent.id)}>
            <ChevronLeft className="h-4 w-4" /> {parent.name}
          </Button>
        )}
        <strong className="text-base truncate">{zone.workStatus === "paused" ? "⏸ " : ""}{zone.name}</strong>
        {canEdit && (
          <Button variant="ghost" size="sm" className="px-1" title="名前を変更" onClick={onRename}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        )}
        <span className="text-sm text-muted-foreground tabular-nums">{Math.round(zone.progress)}%</span>
        {zone.issues > 0 && (
          <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-[#FF4B00]/15 text-[#FF4B00]">⚠ {zone.issues}</span>
        )}
        <Button variant="ghost" size="sm" className="ml-auto px-1" onClick={onClose}><X className="h-4 w-4" /></Button>
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

      {children.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {children.map((c) => (
            <button
              key={c.id}
              onClick={() => onSelectZone(c.id)}
              className="text-xs px-2 py-1 rounded-lg border border-border hover:bg-muted/50"
            >
              {c.name} <span className="tabular-nums text-muted-foreground">{Math.round(c.progress)}%</span>
            </button>
          ))}
        </div>
      )}

      {canEdit && (
        <Button variant="outline" size="sm" className="w-full" onClick={onAddSubArea}>
          <Plus className="h-4 w-4 mr-1" /> サブエリアを追加
        </Button>
      )}

      {/* 作業ツリー (M2-C) */}
      <div className="border-t border-border pt-2">
        <TaskTree zoneId={zone.id} canEdit={canEdit} onChanged={onTasksChanged} />
      </div>
    </div>
  );
}

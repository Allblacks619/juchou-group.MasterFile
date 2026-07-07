import { useState } from "react";
import { colorForKey } from "@/lib/genbaTeamColor";

export type AssignUser = { id: number; name: string | null; appRole: string };
export type AssignTeam = { id: string; name: string; memberIds: number[] };

/** 作業への担当者/班の割当ピッカー (プロトタイプ AssignPicker 移植) */
export default function AssignPicker({
  assigneeIds, teamIds, users, teams, onToggleUser, onToggleTeam,
}: {
  assigneeIds: number[];
  teamIds: string[];
  users: AssignUser[];
  teams: AssignTeam[];
  onToggleUser: (userId: number, on: boolean) => void;
  onToggleTeam: (teamId: string, on: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const n = assigneeIds.length + teamIds.length;

  return (
    <div className="relative">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className="text-xs rounded border border-border px-1.5 py-1 bg-background hover:bg-muted/50"
        title="担当を割り当て"
      >
        👤{n || ""}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setOpen(false); }} />
          <div className="absolute right-0 z-50 mt-1 w-48 max-h-72 overflow-y-auto rounded-lg border border-border bg-card shadow-lg p-1.5 space-y-1" onClick={(e) => e.stopPropagation()}>
            {teams.length > 0 && <div className="text-[10px] text-muted-foreground px-1">班</div>}
            {teams.map((g) => {
              const on = teamIds.includes(g.id);
              return (
                <button key={g.id}
                  className="w-full text-left text-xs rounded px-2 py-1 font-bold"
                  style={{ background: on ? colorForKey(g.id) : "transparent", color: on ? "#fff" : undefined }}
                  onClick={(e) => { e.stopPropagation(); onToggleTeam(g.id, !on); }}>
                  {on ? "✓ " : ""}{g.name}（{g.memberIds.length}名）
                </button>
              );
            })}
            <div className="text-[10px] text-muted-foreground px-1">個人</div>
            {users.map((w) => {
              const on = assigneeIds.includes(w.id);
              return (
                <button key={w.id}
                  className="w-full text-left text-xs rounded px-2 py-1"
                  style={{ background: on ? colorForKey(w.id) : "transparent", color: on ? "#fff" : undefined }}
                  onClick={(e) => { e.stopPropagation(); onToggleUser(w.id, !on); }}>
                  {on ? "✓ " : ""}{w.name || `user#${w.id}`}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

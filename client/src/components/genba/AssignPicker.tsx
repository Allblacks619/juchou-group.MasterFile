import { useState } from "react";
import { colorForKey } from "@/lib/genbaTeamColor";
import { useGenbaT } from "@/lib/genbaLang";

export type AssignTeam = { id: string; name: string; memberIds: number[] };
/** 現場名簿エントリ (genba.users.siteRoster)。登録作業員は userId、ゲスト/アカウント無し従業員は siteWorkerId で割当 */
export type RosterEntry = {
  siteWorkerId: string | null;
  kind: "registered" | "guest";
  userId: number | null;
  employeeId: number | null;
  displayName: string;
  appRole: string | null;
};

/** appRole → 種別ラベル (プロトタイプの3段階に合わせる) */
export function rosterKindLabel(e: Pick<RosterEntry, "kind" | "appRole">): { label: string; cls: string } {
  if (e.kind === "guest") return { label: "ゲスト", cls: "bg-[#F6AA00]/15 text-[#8a5a00] border-[#F6AA00]/40" };
  if (e.appRole === "super_admin" || e.appRole === "admin") return { label: "管理者", cls: "bg-[#FF4B00]/10 text-[#FF4B00] border-[#FF4B00]/30" };
  if (e.appRole === "manager" || e.appRole === "leader") return { label: "リーダー", cls: "bg-[#005AFF]/10 text-[#005AFF] border-[#005AFF]/30" };
  return { label: "登録作業員", cls: "bg-muted text-muted-foreground border-border" };
}

/**
 * 作業への担当者/班の割当ピッカー (プロトタイプ AssignPicker 移植 + G1 名簿対応)。
 * 案件連携中の現場では出面に載っている人 (登録作業員/ゲスト) だけが候補に出る。
 */
export default function AssignPicker({
  assigneeIds, teamIds, guestIds, roster, teams, linked, onToggleUser, onToggleTeam, onToggleGuest,
}: {
  assigneeIds: number[];
  teamIds: string[];
  /** 割当済みゲストの siteWorkerId */
  guestIds: string[];
  roster: RosterEntry[];
  teams: AssignTeam[];
  /** 案件連携済み (=出面フィルタ有効) か */
  linked: boolean;
  onToggleUser: (userId: number, on: boolean) => void;
  onToggleTeam: (teamId: string, on: boolean) => void;
  onToggleGuest: (siteWorkerId: string, on: boolean) => void;
}) {
  const t = useGenbaT();
  const [open, setOpen] = useState(false);
  const n = assigneeIds.length + teamIds.length + guestIds.length;

  return (
    <div className="relative">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className="text-xs rounded border border-border px-1.5 py-1 bg-background hover:bg-muted/50"
        title={t("担当を割り当て")}
      >
        👤{n || ""}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setOpen(false); }} />
          <div className="absolute right-0 z-50 mt-1 w-56 max-h-72 overflow-y-auto rounded-lg border border-border bg-card shadow-lg p-1.5 space-y-1" onClick={(e) => e.stopPropagation()}>
            {teams.length > 0 && <div className="text-[10px] text-muted-foreground px-1">{t("班")}</div>}
            {teams.map((g) => {
              const on = teamIds.includes(g.id);
              return (
                <button key={g.id}
                  className="w-full flex items-center gap-1 text-xs rounded px-2 py-1 font-bold"
                  style={{ background: on ? colorForKey(g.id) : "transparent", color: on ? "#fff" : undefined }}
                  title={on ? t("タップで解除") : t("タップで割当")}
                  onClick={(e) => { e.stopPropagation(); onToggleTeam(g.id, !on); }}>
                  <span className="flex-1 text-left truncate">{on ? "✓ " : ""}{g.name}（{g.memberIds.length}{t("名")}）</span>
                  {on && <span className="opacity-90">✕</span>}
                </button>
              );
            })}
            <div className="text-[10px] text-muted-foreground px-1">{t("個人")}{linked ? t("（出面に登録された人のみ）") : ""}</div>
            {roster.length === 0 && (
              <div className="text-[11px] text-muted-foreground px-2 py-1.5 leading-snug">
                {t("割当可能な作業員がいません。案件連携中は出面表に登録された作業員のみ表示されます（設定→この現場）。")}
              </div>
            )}
            {roster.map((w) => {
              // 登録作業員 (users.id あり) は assignUser、ゲスト/アカウント無し従業員は assignGuest
              const useUser = w.userId != null;
              const on = useUser ? assigneeIds.includes(w.userId as number) : (w.siteWorkerId != null && guestIds.includes(w.siteWorkerId));
              const key = useUser ? `u${w.userId}` : `g${w.siteWorkerId}`;
              const colorKey = useUser ? (w.userId as number) : (w.siteWorkerId || "?");
              const kind = rosterKindLabel(w);
              return (
                <button key={key}
                  className="w-full flex items-center gap-1 text-xs rounded px-2 py-1"
                  style={{ background: on ? colorForKey(colorKey) : "transparent", color: on ? "#fff" : undefined }}
                  title={on ? t("タップで解除") : t("タップで割当")}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (useUser) onToggleUser(w.userId as number, !on);
                    else if (w.siteWorkerId) onToggleGuest(w.siteWorkerId, !on);
                  }}>
                  <span className="flex-1 text-left truncate">{on ? "✓ " : ""}{w.displayName}</span>
                  <span className={`shrink-0 text-[9px] px-1 py-0.5 rounded border leading-none ${on ? "border-white/50 text-white/90 bg-transparent" : kind.cls}`}>{t(kind.label)}</span>
                  {on && <span className="opacity-90">✕</span>}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

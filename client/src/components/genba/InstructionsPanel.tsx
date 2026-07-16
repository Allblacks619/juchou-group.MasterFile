import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { MapPin, X } from "lucide-react";
import { dispName } from "@/lib/genbaRomaji";
import ZoneMapPicker from "./ZoneMapPicker";

/** 指示パネル (プロトタイプ InstructionsTab 移植): 作成(field)・一覧・未読・既読状況 */
export default function InstructionsPanel({
  siteId, canEdit, open, onOpenChange, onReadChanged, embedded,
}: {
  siteId: string;
  canEdit: boolean;
  open?: boolean;
  onOpenChange?: (v: boolean) => void;
  onReadChanged: () => void;
  embedded?: boolean;
}) {
  const utils = trpc.useUtils();
  const active = embedded || !!open;
  const { data: list } = trpc.genba.instructions.listForMe.useQuery({ siteId }, { enabled: active, retry: false });
  const { data: teams } = trpc.genba.teams.listBySite.useQuery({ siteId }, { enabled: active, retry: false });
  const { data: users } = trpc.genba.users.listAssignable.useQuery(undefined, { enabled: active, retry: false });
  const { data: zones } = trpc.genba.zones.listBySite.useQuery({ siteId }, { enabled: active, retry: false });

  const [text, setText] = useState("");
  const [target, setTarget] = useState("all");
  const [zoneId, setZoneId] = useState("");
  const [showZonePicker, setShowZonePicker] = useState(false);

  const teamList = (teams || []) as { id: string; name: string; memberIds: number[] }[];
  const userList = (users || []) as { id: number; name: string | null }[];
  const zoneList = (zones || []) as { id: string; name: string; floorId: string | null; floorName: string | null }[];
  const items = (list || []) as any[];
  const zoneName = (id: string) => zoneList.find((z) => z.id === id)?.name || "エリア";

  const markRead = trpc.genba.instructions.markRead.useMutation();
  const create = trpc.genba.instructions.create.useMutation({
    onSuccess: () => { utils.genba.instructions.listForMe.invalidate({ siteId }); setText(""); setZoneId(""); toast.success("指示を送信しました"); onReadChanged(); },
    onError: (e) => toast.error(e.message),
  });

  // パネルを開いたら自分宛ての未読を既読化 (プロトタイプ準拠: 閲覧=既読)
  useEffect(() => {
    if (!active || !items.length) return;
    const unread = items.filter((i) => i.mine && !i.read);
    if (unread.length === 0) return;
    Promise.all(unread.map((i) => markRead.mutateAsync({ instructionId: i.id }).catch(() => {})))
      .then(() => { utils.genba.instructions.listForMe.invalidate({ siteId }); onReadChanged(); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, items.length]);

  const userName = useMemo(() => (id: number) => userList.find((u) => u.id === id)?.name || `user#${id}`, [userList]);
  const targetLabel = (i: any) => {
    if (i.targetKind === "all") return "全員";
    if (i.targetKind === "team") return teamList.find((t) => t.id === i.targetId)?.name || "班";
    return userName(Number(i.targetId));
  };

  function send() {
    const t = text.trim();
    if (!t) { toast.error("指示の内容を入力してください"); return; }
    let targetKind: "all" | "team" | "worker" = "all";
    let targetId: string | undefined;
    if (target.startsWith("team:")) { targetKind = "team"; targetId = target.slice(5); }
    else if (target.startsWith("worker:")) { targetKind = "worker"; targetId = target.slice(7); }
    create.mutate({ siteId, text: t, targetKind, targetId, zoneId: zoneId || undefined });
  }

  const inner = (
      <>
        {!embedded && <DialogHeader><DialogTitle>📣 指示</DialogTitle></DialogHeader>}

        {canEdit && (
          <div className="rounded-lg border border-border p-2 space-y-2">
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3}
              placeholder="例: 本日中に1-1エリアの建て込みを完了してください"
              className="w-full rounded-md border border-border bg-background p-2 text-sm" />
            <div className="grid grid-cols-2 gap-2">
              <select value={target} onChange={(e) => setTarget(e.target.value)} className="rounded-md border border-border bg-background p-2 text-sm">
                <option value="all">👥 全員へ</option>
                {teamList.map((g) => <option key={g.id} value={`team:${g.id}`}>🏳 {g.name}（{g.memberIds.length}名）へ</option>)}
                {userList.map((u) => <option key={u.id} value={`worker:${u.id}`}>👤 {u.name || `user#${u.id}`}へ</option>)}
              </select>
              {/* エリア(工区)の対象は図(マップ)からタップして選ぶ。エリアが多くてもプルダウンを探さずに済む */}
              {zoneId ? (
                <div className="flex items-center gap-1 rounded-md border border-[#005AFF]/40 bg-[#005AFF]/5 p-1 pl-2 text-sm">
                  <span className="truncate flex-1 text-[#005AFF] font-semibold">📍 {dispName(zoneName(zoneId))}</span>
                  <button type="button" onClick={() => setShowZonePicker(true)} className="text-[11px] px-1.5 py-0.5 rounded border border-border text-muted-foreground hover:text-foreground">変更</button>
                  <button type="button" title="エリア指定を外す" onClick={() => setZoneId("")} className="text-muted-foreground hover:text-destructive px-1"><X className="h-3.5 w-3.5" /></button>
                </div>
              ) : (
                <button type="button" onClick={() => setShowZonePicker(true)}
                  className="flex items-center justify-center gap-1.5 rounded-md border border-border bg-background p-2 text-sm text-muted-foreground hover:border-[#005AFF] hover:text-[#005AFF]"
                  title="この指示が対象とするエリア（工区）を図から選ぶ">
                  <MapPin className="h-4 w-4" /> 図からエリアを選択
                </button>
              )}
            </div>
            <Button className="w-full" onClick={send} disabled={create.isPending}>送信</Button>
          </div>
        )}

        <div className="space-y-2">
          {items.length === 0 && <p className="text-sm text-muted-foreground py-2">指示はまだありません。</p>}
          {items.map((i) => {
            const unread = i.mine && !i.read;
            const targetUsers = i.targetKind === "team" ? (teamList.find((t) => t.id === i.targetId)?.memberIds || []) : i.targetKind === "worker" ? [Number(i.targetId)] : userList.map((u) => u.id);
            const readCount = i.readerIds.filter((id: number) => targetUsers.includes(id)).length;
            return (
              <div key={i.id} className="rounded-lg border border-border p-2" style={{ borderLeft: unread ? "4px solid #FF4B00" : undefined }}>
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="text-[11px] px-1.5 py-0.5 rounded bg-[#1B2A41] text-white">→ {targetLabel(i)}</span>
                  {i.zoneId && <span className="text-[11px] px-1.5 py-0.5 rounded bg-[#005AFF]/15 text-[#005AFF] font-semibold">📍 {dispName(zoneName(i.zoneId))}</span>}
                  {unread && <span className="text-[11px] px-1.5 py-0.5 rounded bg-[#FF4B00] text-white font-bold">未読</span>}
                </div>
                <div className="text-sm whitespace-pre-wrap">{i.text}</div>
                {canEdit && <div className="text-xs text-muted-foreground mt-1">既読 {readCount}/{targetUsers.length}</div>}
              </div>
            );
          })}
        </div>
      </>
  );

  const picker = showZonePicker && (
    <ZoneMapPicker
      siteId={siteId}
      selectedZoneId={zoneId || null}
      onPick={(id) => setZoneId(id || "")}
      onClose={() => setShowZonePicker(false)}
    />
  );

  if (embedded) return <div className="space-y-3">{inner}{picker}</div>;
  return (
    <>
      <Dialog open={!!open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">{inner}</DialogContent>
      </Dialog>
      {picker}
    </>
  );
}

import { useMemo, useState } from "react";
import { useRoute } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Loader2, HardHat, Megaphone, MapPin } from "lucide-react";
import { STATUS, polyPath } from "@/lib/genbaMap";
import StatusModal, { type SetStatusPayload } from "@/components/genba/StatusModal";

type MyTask = {
  id: string; zoneId: string; zoneName: string; name: string; romaji: string | null;
  status: "todo" | "progress" | "done" | "issue"; percent: number | null;
  dueDate: string | null; issueText: string | null; memo?: string | null;
};

/**
 * 作業員専用リンクの公開ページ (G2)。ログイン不要 (トークン認証)。
 * 自分の担当作業の確認とステータス更新・問題報告 (写真つき)・図面上の自分のエリア確認。
 * 無効化されたリンクは内容を一切表示しない。
 */
export default function AppGenbaWorker() {
  const [, params] = useRoute("/app/w/:token");
  const token = params?.token ?? "";
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.genba.workerLink.view.useQuery({ token }, { enabled: !!token, retry: false, refetchOnWindowFocus: true });
  const setStatus = trpc.genba.workerLink.setStatus.useMutation({
    onSuccess: () => { utils.genba.workerLink.view.invalidate({ token }); toast.success("更新しました"); },
    onError: (e) => toast.error(e.message),
  });
  const reply = trpc.genba.workerLink.reply.useMutation({
    onSuccess: () => { toast.success("コメントを送信しました"); setCommentFor(null); setCommentText(""); },
    onError: (e) => toast.error(e.message),
  });
  const [statusTask, setStatusTask] = useState<MyTask | null>(null);
  const [activeFloorId, setActiveFloorId] = useState<string | null>(null);
  const [commentFor, setCommentFor] = useState<string | null>(null);
  const [commentText, setCommentText] = useState("");

  const tasks = ((data && data.ok ? data.myTasks : []) || []) as MyTask[];
  const grouped = useMemo(() => {
    const m = new Map<string, MyTask[]>();
    for (const t of tasks) { const arr = m.get(t.zoneName) || []; arr.push(t); m.set(t.zoneName, arr); }
    return Array.from(m.entries());
  }, [tasks]);

  if (!token) return null;
  if (isLoading) {
    return <div className="min-h-dvh flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }
  if (!data) {
    return <CenterMessage title="読み込みに失敗しました" body="通信環境を確認して、もう一度開いてください。" />;
  }
  if (!data.ok) {
    if (data.reason === "disabled") return <CenterMessage title="このリンクは無効化されています" body="管理者に確認してください。" />;
    if (data.reason === "expired") return <CenterMessage title="このリンクは有効期限が切れています" body="管理者に新しいリンクの発行を依頼してください。" />;
    return <CenterMessage title="リンクが無効です" body="URLが正しいか確認するか、管理者に問い合わせてください。" />;
  }

  const floors = data.floors || [];
  const zones = data.zones || [];
  const activeFloor = floors.find((f) => f.id === activeFloorId) || floors.find((f) => zones.some((z) => z.floorId === f.id)) || floors[0] || null;
  const floorZones = zones.filter((z) => z.floorId === (activeFloor?.id ?? ""));
  const doneCount = tasks.filter((t) => t.status === "done").length;

  async function submit(p: SetStatusPayload) {
    if (!statusTask) return;
    await setStatus.mutateAsync({ token, taskId: statusTask.id, ...p });
  }

  return (
    <div className="min-h-dvh bg-background text-foreground">
      {/* ヘッダ */}
      <div className="sticky top-0 z-10 bg-[#1B2A41] text-white px-3 py-2.5 flex items-center gap-2">
        <HardHat className="h-5 w-5 text-[#F6AA00] shrink-0" />
        <div className="min-w-0">
          <div className="text-sm font-bold truncate">{data.site.name}</div>
          <div className="text-[11px] opacity-85 truncate">
            {data.me.displayName} さん
            <span className="ml-1 px-1 py-0.5 rounded bg-white/15 text-[9px]">{data.me.kind === "guest" ? "ゲスト" : "登録作業員"}</span>
            {data.me.role === "leader" && <span className="ml-1 px-1 py-0.5 rounded bg-[#F6AA00] text-[#3a2a00] text-[9px] font-bold">リーダー</span>}
          </div>
        </div>
        <div className="ml-auto text-[11px] opacity-85 tabular-nums">{doneCount}/{tasks.length} 完了</div>
      </div>

      <div className="p-3 space-y-4 max-w-xl mx-auto pb-16">
        {/* 指示 */}
        {(data.instructions || []).length > 0 && (
          <section className="rounded-xl border border-border overflow-hidden">
            <div className="px-3 py-2 bg-muted/50 text-sm font-bold flex items-center gap-1.5"><Megaphone className="h-4 w-4" /> 指示</div>
            <div className="divide-y divide-border/60 max-h-64 overflow-y-auto">
              {data.instructions.map((i) => (
                <div key={i.id} className="px-3 py-2 text-sm whitespace-pre-wrap">{i.text}</div>
              ))}
            </div>
          </section>
        )}

        {/* 自分の担当作業 (エリア別) */}
        <section className="space-y-2">
          <h2 className="text-sm font-bold flex items-center gap-1.5"><MapPin className="h-4 w-4" /> {data.me.role === "leader" ? "現場の作業" : "自分の担当作業"}</h2>
          {tasks.length === 0 && (
            <p className="text-sm text-muted-foreground rounded-xl border border-border p-4">
              担当作業はまだ割り当てられていません。管理者・リーダーに確認してください。
            </p>
          )}
          {grouped.map(([zoneName, ts]) => (
            <div key={zoneName} className="rounded-xl border border-border overflow-hidden">
              <div className="px-3 py-1.5 bg-muted/50 text-xs font-bold">📍 {zoneName}</div>
              <div className="divide-y divide-border/60">
                {ts.map((t) => {
                  const st = STATUS[t.status];
                  return (
                    <div key={t.id} className="px-3 py-2 flex items-center gap-2">
                      <button
                        onClick={() => setStatusTask(t)}
                        className="text-xs font-bold rounded px-2 py-1.5 text-white shrink-0"
                        style={{ background: st.color }}
                      >
                        {st.icon} {t.status === "progress" ? `${t.percent ?? 50}%` : st.label}
                      </button>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm truncate">{t.name}</div>
                        {t.dueDate && <div className="text-[11px] text-muted-foreground">📅 {t.dueDate}</div>}
                        {t.memo && <div className="text-[11px] text-muted-foreground whitespace-pre-wrap">📝 {t.memo}</div>}
                        {t.status === "issue" && t.issueText && <div className="text-[11px] text-[#b91c1c]">⚠ {t.issueText}</div>}
                        {commentFor === t.id && (
                          <div className="mt-1.5 flex gap-1.5">
                            <input value={commentText} onChange={(e) => setCommentText(e.target.value)}
                              placeholder="コメント (例: 資材が足りません)"
                              className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm" />
                            <button
                              onClick={() => { const v = commentText.trim(); if (v) reply.mutate({ token, taskId: t.id, text: v }); }}
                              disabled={reply.isPending || !commentText.trim()}
                              className="text-xs font-bold rounded px-2.5 py-1.5 bg-[#005AFF] text-white disabled:opacity-50">送信</button>
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => { setCommentFor(commentFor === t.id ? null : t.id); setCommentText(""); }}
                        className="shrink-0 text-lg leading-none p-1 rounded hover:bg-muted" title="コメントを送る">💬</button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </section>

        {/* 図面 (自分のエリア) */}
        {activeFloor?.imageUrl && (
          <section className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-sm font-bold">🗺 図面</h2>
              {floors.filter((f) => f.imageUrl).map((f) => (
                <button key={f.id} onClick={() => setActiveFloorId(f.id)}
                  className={`px-2 py-1 rounded-md text-xs border ${f.id === activeFloor.id ? "bg-[#005AFF] text-white border-[#005AFF]" : "border-border text-muted-foreground"}`}>
                  {f.name}
                </button>
              ))}
            </div>
            <div className="rounded-xl border border-border overflow-hidden">
              <svg viewBox={`0 0 ${activeFloor.w || 1280} ${activeFloor.h || 906}`} className="w-full h-auto block">
                <image href={activeFloor.imageUrl} width={activeFloor.w || 1280} height={activeFloor.h || 906} />
                {floorZones.map((z: any) => {
                  const poly = z.polygon as { x: number; y: number }[];
                  if (!Array.isArray(poly) || poly.length < 3) return null;
                  const mine = !!z.mine;
                  return (
                    <g key={z.id}>
                      <path d={polyPath(poly)}
                        fill={mine ? "rgba(0,90,255,0.18)" : "rgba(100,116,139,0.08)"}
                        stroke={mine ? "#005AFF" : "#94a3b8"} strokeWidth={mine ? 5 : 3}
                        strokeDasharray={mine ? "none" : "12 8"} />
                      <text x={poly[0].x} y={poly[0].y - 8} fontSize={mine ? 26 : 20} fontWeight={800}
                        fill={mine ? "#0f172a" : "#64748b"} stroke="#fff" strokeWidth={5} paintOrder="stroke">{z.name}</text>
                    </g>
                  );
                })}
              </svg>
            </div>
            <p className="text-[11px] text-muted-foreground">青枠があなたの担当エリア、点線は他のエリアです。</p>
          </section>
        )}
      </div>

      {statusTask && (
        <StatusModal
          task={statusTask as any}
          open={!!statusTask}
          onOpenChange={(v) => !v && setStatusTask(null)}
          onSubmit={submit}
        />
      )}
    </div>
  );
}

function CenterMessage({ title, body }: { title: string; body: string }) {
  return (
    <div className="min-h-dvh flex items-center justify-center p-6">
      <div className="max-w-sm text-center space-y-2">
        <div className="text-4xl">🔒</div>
        <h1 className="text-lg font-bold">{title}</h1>
        <p className="text-sm text-muted-foreground">{body}</p>
      </div>
    </div>
  );
}

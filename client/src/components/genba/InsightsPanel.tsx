import { trpc } from "@/lib/trpc";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { dispName } from "@/lib/genbaRomaji";
import { useGenbaT } from "@/lib/genbaLang";

/** 学習と改善提案 (プロトタイプ InsightsCard 移植・field): 利用ログから自動生成 */
export default function InsightsPanel({
  siteId, open, onOpenChange,
}: {
  siteId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const t = useGenbaT();
  const utils = trpc.useUtils();
  const { data } = trpc.genba.logs.insights.useQuery({ siteId }, { enabled: open, retry: false });
  const { data: presets } = trpc.genba.materials.listPresets.useQuery({ siteId }, { enabled: open, retry: false });
  const promote = trpc.genba.materials.savePreset.useMutation({
    onSuccess: () => { utils.genba.logs.insights.invalidate({ siteId }); utils.genba.materials.listPresets.invalidate(); toast.success(t("プリセットに追加しました")); },
    onError: (e) => toast.error(e.message),
  });

  const d = data;
  const total = d?.totalSuggestions ?? 0;
  const FAVORITE = "よく使う材料";

  function addPreset(name: string) {
    // 既存の「よく使う材料」プリセットがあれば追記、無ければ新規作成 (重複プリセットを作らない)
    const existing = (presets || []).find((p: any) => p.workName === FAVORITE);
    if (existing) {
      if ((existing.parts || []).includes(name)) { toast.info(t("すでに登録済みです")); return; }
      promote.mutate({ id: existing.id, siteId, workName: FAVORITE, parts: [...existing.parts, name] });
    } else {
      promote.mutate({ siteId, workName: FAVORITE, parts: [name] });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{t("📈 学習と改善提案")}{total > 0 ? `（${total}）` : ""}</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground">{t("アプリの使われ方から自動で提案します。")}</p>

        {/* 改善提案 */}
        <div className="text-sm font-bold text-[#7c3aed]">💡 {t("改善のヒント")}</div>
        {total === 0 && <p className="text-sm text-muted-foreground py-2">{t("提案はありません。使い込むほど提案が増えます 👍")}</p>}

        {(d?.promoteCandidates || []).map((p) => (
          <div key={p.name} className="rounded-lg border border-border p-2 flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold">📦 {t("手入力の材料をプリセット化")}</div>
              <div className="text-xs text-muted-foreground truncate">{dispName(p.name)}（{p.count} {t("回入力")}）</div>
            </div>
            <Button size="sm" onClick={() => addPreset(p.name)} disabled={promote.isPending}>{t("プリセットに追加")}</Button>
          </div>
        ))}

        {(d?.unusedTemplates?.length ?? 0) > 0 && (
          <div className="rounded-lg border border-border p-2">
            <div className="text-sm font-semibold">🧹 {t("未使用の作業テンプレート")}</div>
            <div className="text-xs text-muted-foreground">{d!.unusedTemplates.slice(0, 8).join("、")}{d!.unusedTemplates.length > 8 ? ` ${t("他")}` : ""} — {t("作業テンプレートから削除できます")}</div>
          </div>
        )}

        {/* 統計 */}
        <div className="text-sm font-bold text-muted-foreground mt-2">📊 {t("利用統計")}</div>
        <div className="flex gap-2 flex-wrap">
          {[["完了した作業", d?.stats.doneCount], ["報告された問題", d?.stats.issueCount], ["材料発注(品目)", d?.stats.materialCount]].map(([label, n]) => (
            <div key={label as string} className="flex-1 min-w-[90px] rounded-lg border border-border p-2 text-center">
              <div className="text-2xl font-bold tabular-nums">{n ?? 0}</div>
              <div className="text-[10px] text-muted-foreground">{t(label as string)}</div>
            </div>
          ))}
        </div>

        {(d?.topMaterials?.length ?? 0) > 0 && (
          <div>
            <div className="text-xs font-bold text-muted-foreground mb-1">{t("よく発注される材料 TOP5")}</div>
            {d!.topMaterials.map((m, i) => (
              <div key={m.name} className="flex items-center gap-2 py-1 border-b border-border/40 text-sm">
                <span className="text-muted-foreground w-5">{i + 1}.</span>
                <span className="flex-1 truncate">{dispName(m.name)}</span>
                <strong className="tabular-nums">{m.qty}</strong>
              </div>
            ))}
          </div>
        )}

        {(d?.topIssueZones?.length ?? 0) > 0 && (
          <div>
            <div className="text-xs font-bold text-muted-foreground mb-1">{t("問題が多いエリア")}</div>
            {d!.topIssueZones.map((z) => (
              <div key={z.zoneId} className="flex items-center gap-2 py-1 border-b border-border/40 text-sm">
                <span className="flex-1">{dispName(z.name)}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded text-white" style={{ background: "#FF4B00" }}>⚠ {z.count}</span>
              </div>
            ))}
          </div>
        )}

        <p className="text-[11px] text-muted-foreground mt-2">{t("※ ログは改善のための集計用です（直近1000件）。")}</p>
      </DialogContent>
    </Dialog>
  );
}

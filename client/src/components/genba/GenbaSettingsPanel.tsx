import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Users, ListChecks, Share2, TrendingUp, Trash2, Link2 } from "lucide-react";
import { GENBA_THEMES, GENBA_THEME_KEYS } from "@shared/genba/themes";
import type { GenbaLang } from "@shared/genba/i18n";
import TeamManager from "./TeamManager";
import TemplateEditor from "./TemplateEditor";
import SharesPanel from "./SharesPanel";
import InsightsPanel from "./InsightsPanel";

type SettingsSite = { id: string; name: string; driveUrl: string | null; projectId: number | null };

/** 設定タブ (プロトタイプ SettingsTab 相当): 現場管理・現場ツール・言語・テーマ・表示色・ガイド */
export default function GenbaSettingsPanel({
  settings, open, onOpenChange, onOpenGuide, embedded, site, isAdmin, canEdit, onSitesChanged,
}: {
  settings: { theme: string | null; lang: string | null; color: string | null; guideSeen: boolean };
  open?: boolean;
  onOpenChange?: (v: boolean) => void;
  onOpenGuide: () => void;
  embedded?: boolean;
  site?: SettingsSite | null;
  isAdmin?: boolean;
  canEdit?: boolean;
  onSitesChanged?: () => void;
}) {
  const utils = trpc.useUtils();
  const update = trpc.genba.settings.update.useMutation({
    onSuccess: () => { utils.genba.me.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const lang = (settings.lang === "pt" ? "pt" : "ja") as GenbaLang;
  const t = (ja: string, pt: string) => (lang === "pt" ? pt : ja);

  const [showTeams, setShowTeams] = useState(false);
  const [showTemplate, setShowTemplate] = useState(false);
  const [showShares, setShowShares] = useState(false);
  const [showInsights, setShowInsights] = useState(false);
  const [driveUrl, setDriveUrlInput] = useState(site?.driveUrl || "");

  const renameSite = trpc.genba.sites.rename.useMutation({ onSuccess: () => { utils.genba.sites.list.invalidate(); onSitesChanged?.(); toast.success(t("現場名を変更しました", "Nome atualizado")); }, onError: (e) => toast.error(e.message) });
  const setDrive = trpc.genba.sites.setDriveUrl.useMutation({ onSuccess: () => { utils.genba.sites.list.invalidate(); onSitesChanged?.(); toast.success(t("Driveリンクを更新しました", "Link atualizado")); }, onError: (e) => toast.error(e.message) });
  const archive = trpc.genba.sites.archive.useMutation({ onSuccess: () => { utils.genba.sites.list.invalidate(); onSitesChanged?.(); toast.success(t("現場を削除しました", "Obra removida")); }, onError: (e) => toast.error(e.message) });
  const setProject = trpc.genba.sites.setProject.useMutation({ onSuccess: () => { utils.genba.sites.list.invalidate(); utils.genba.budgets.invalidate?.(); onSitesChanged?.(); toast.success(t("案件連携を更新しました", "Vínculo atualizado")); }, onError: (e) => toast.error(e.message) });
  const { data: projects } = trpc.genba.sites.listProjects.useQuery(undefined, { enabled: !!canEdit && !!site, retry: false, staleTime: 60 * 1000 });
  const projectList = (projects || []) as { id: number; name: string; status: string }[];

  const inner = (
    <>
      {!embedded && <DialogHeader><DialogTitle>⚙ {t("設定", "Config.")}</DialogTitle></DialogHeader>}

      {/* 現場ツール (field) */}
      {canEdit && (
        <div className="rounded-xl border border-border p-3 space-y-2">
          <div className="text-sm font-bold text-foreground">🏗 {t("現場ツール", "Ferramentas da obra")}</div>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" size="sm" className="justify-start" onClick={() => setShowTeams(true)}><Users className="h-4 w-4 mr-1.5" />{t("班・メンバー", "Turmas")}</Button>
            <Button variant="outline" size="sm" className="justify-start" onClick={() => setShowTemplate(true)}><ListChecks className="h-4 w-4 mr-1.5" />{t("作業テンプレート", "Modelo de tarefas")}</Button>
            <Button variant="outline" size="sm" className="justify-start" onClick={() => setShowShares(true)}><Share2 className="h-4 w-4 mr-1.5" />{t("外部共有リンク", "Compartilhar")}</Button>
            <Button variant="outline" size="sm" className="justify-start" onClick={() => setShowInsights(true)}><TrendingUp className="h-4 w-4 mr-1.5" />{t("学習と改善", "Aprendizado")}</Button>
          </div>
          <p className="text-[11px] text-muted-foreground pt-1">
            {t("工事案件の連携は下の「この現場」から設定できます。作業員ごとの専用リンクは次のアップデートで追加します。", "O vínculo com a obra fica em “Esta obra”. Links por trabalhador virão depois.")}
          </p>
        </div>
      )}

      {/* 現場の編集・削除 */}
      {canEdit && site && (
        <div className="rounded-xl border border-border p-3 space-y-3">
          <div className="text-sm font-bold text-foreground">📍 {t("この現場", "Esta obra")}</div>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">{t("Drive共有リンク（空欄で解除）", "Link do Drive (vazio p/ remover)")}</label>
            <div className="flex gap-2">
              <input value={driveUrl} onChange={(e) => setDriveUrlInput(e.target.value)} placeholder="https://drive.google.com/..."
                className="flex-1 rounded-md border border-border bg-background p-2 text-sm" />
              <Button size="sm" onClick={() => setDrive.mutate({ id: site.id, driveUrl: driveUrl.trim() })} disabled={setDrive.isPending}>
                <Link2 className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* 工事案件（現場管理）の連携 */}
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">{t("連携する工事案件（現場管理）", "Obra vinculada (gestão)")}</label>
            <select
              value={site.projectId ?? ""}
              onChange={(e) => setProject.mutate({ id: site.id, projectId: e.target.value ? Number(e.target.value) : null })}
              disabled={setProject.isPending}
              className="w-full rounded-md border border-border bg-background p-2 text-sm"
            >
              <option value="">{t("（連携しない・手入力）", "(Sem vínculo)")}</option>
              {projectList.map((p) => (
                <option key={p.id} value={p.id}>{p.name}{p.status !== "active" ? `（${p.status}）` : ""}</option>
              ))}
            </select>
            <p className="text-[11px] text-muted-foreground">
              {t("案件を連携すると、予算トラッカーが出面表の人工を自動集計し、作業の担当候補が出面に登録された作業員に限定されます。", "Ao vincular, o orçamento soma as diárias da folha e as tarefas só podem ser atribuídas a quem está na folha de presença.")}
            </p>
          </div>

          {isAdmin && (
            <Button variant="outline" size="sm" className="w-full text-destructive border-destructive/40 hover:bg-destructive/10"
              onClick={() => { if (window.confirm(t(`「${site.name}」を削除しますか？（一覧から消えます。復元は管理者に相談）`, "Remover esta obra?"))) archive.mutate({ id: site.id, archived: true }); }}
              disabled={archive.isPending}>
              <Trash2 className="h-4 w-4 mr-1.5" /> {t("この現場を削除", "Remover obra")}
            </Button>
          )}
        </div>
      )}

      {/* 言語 */}
      <div className="rounded-xl border border-border p-3">
        <div className="text-sm font-bold mb-2 text-foreground">🌐 {t("言語", "Idioma")}</div>
        <div className="flex gap-2">
          {([["ja", "🇯🇵 日本語"], ["pt", "🇧🇷 Português"]] as const).map(([k, label]) => (
            <button key={k} onClick={() => update.mutate({ lang: k })}
              className={`px-3 py-1.5 rounded-lg text-sm border ${lang === k ? "bg-gold/15 text-gold border-gold/50 font-semibold" : "border-border text-foreground/80"}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* テーマ */}
      <div className="rounded-xl border border-border p-3">
        <div className="text-sm font-bold mb-2 text-foreground">🎨 {t("テーマ", "Tema")}</div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {GENBA_THEME_KEYS.map((k) => {
            const th = GENBA_THEMES[k];
            const active = (settings.theme || "dark") === k;
            return (
              <button key={k} onClick={() => update.mutate({ theme: k })}
                className={`rounded-lg border p-2 text-left ${active ? "border-gold ring-2 ring-gold" : "border-border"}`}
                style={{ background: th.header, color: th.headerText }}>
                <div className="flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded-full" style={{ background: th.accent }} />
                  <span className="text-xs font-bold truncate">{th.emblem} {th.label}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 表示色 */}
      <div className="rounded-xl border border-border p-3">
        <div className="text-sm font-bold mb-2 text-foreground">🎯 {t("表示色（配置ボード等）", "Sua cor (alocação)")}</div>
        <div className="flex items-center gap-2">
          <input type="color" value={settings.color || "#005AFF"} onChange={(e) => update.mutate({ color: e.target.value })} className="w-10 h-8 rounded border border-border" />
          <span className="text-xs text-muted-foreground">{settings.color || t("未設定（自動）", "Automático")}</span>
        </div>
      </div>

      {/* ガイド */}
      <div className="rounded-xl border border-border p-3 flex items-center gap-2">
        <div className="flex-1">
          <div className="text-sm font-bold text-foreground">📖 {t("使い方ガイド", "Guia do app")}</div>
          <div className="text-xs text-muted-foreground">{t("いつでも開けます", "Abra quando quiser")}</div>
        </div>
        <Button size="sm" variant="outline" onClick={onOpenGuide}>{t("ガイドを開く", "Abrir")}</Button>
      </div>

      {/* サブモーダル */}
      {showTeams && site && <TeamManager siteId={site.id} open={showTeams} onOpenChange={setShowTeams} />}
      {showTemplate && <TemplateEditor open={showTemplate} onOpenChange={setShowTemplate} />}
      {showShares && site && <SharesPanel siteId={site.id} open={showShares} onOpenChange={setShowShares} />}
      {showInsights && site && <InsightsPanel siteId={site.id} open={showInsights} onOpenChange={setShowInsights} />}
    </>
  );

  if (embedded) return <div className="space-y-3">{inner}</div>;
  return (
    <Dialog open={!!open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">{inner}</DialogContent>
    </Dialog>
  );
}

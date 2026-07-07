import { trpc } from "@/lib/trpc";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { GENBA_THEMES, GENBA_THEME_KEYS } from "@shared/genba/themes";
import type { GenbaLang } from "@shared/genba/i18n";

/** 個人設定 (プロトタイプ SettingsTab 相当): テーマ16種・言語・表示色・ガイド */
export default function GenbaSettingsPanel({
  settings, open, onOpenChange, onOpenGuide,
}: {
  settings: { theme: string | null; lang: string | null; color: string | null; guideSeen: boolean };
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onOpenGuide: () => void;
}) {
  const utils = trpc.useUtils();
  const update = trpc.genba.settings.update.useMutation({
    onSuccess: () => { utils.genba.me.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const lang = (settings.lang === "pt" ? "pt" : "ja") as GenbaLang;
  const t = (ja: string, pt: string) => (lang === "pt" ? pt : ja);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>⚙ {t("設定", "Config.")}</DialogTitle></DialogHeader>

        {/* 言語 */}
        <div className="rounded-lg border border-border p-3">
          <div className="text-sm font-bold mb-2">🌐 {t("言語", "Idioma")}</div>
          <div className="flex gap-2">
            {([["ja", "🇯🇵 日本語"], ["pt", "🇧🇷 Português"]] as const).map(([k, label]) => (
              <button key={k} onClick={() => update.mutate({ lang: k })}
                className={`px-3 py-1.5 rounded-lg text-sm border ${lang === k ? "bg-gold/10 text-gold border-gold/40" : "border-border text-muted-foreground"}`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* テーマ */}
        <div className="rounded-lg border border-border p-3">
          <div className="text-sm font-bold mb-2">🎨 {t("テーマ", "Tema")}</div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {GENBA_THEME_KEYS.map((k) => {
              const th = GENBA_THEMES[k];
              const active = (settings.theme || "dark") === k;
              return (
                <button key={k} onClick={() => update.mutate({ theme: k })}
                  className={`rounded-lg border p-2 text-left ${active ? "border-gold ring-1 ring-gold" : "border-border"}`}
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
        <div className="rounded-lg border border-border p-3">
          <div className="text-sm font-bold mb-2">🎯 {t("表示色（配置ボード等）", "Sua cor (alocação)")}</div>
          <div className="flex items-center gap-2">
            <input type="color" value={settings.color || "#005AFF"} onChange={(e) => update.mutate({ color: e.target.value })} className="w-10 h-8 rounded border border-border" />
            <span className="text-xs text-muted-foreground">{settings.color || t("未設定（自動）", "Automático")}</span>
          </div>
        </div>

        {/* ガイド */}
        <div className="rounded-lg border border-border p-3 flex items-center gap-2">
          <div className="flex-1">
            <div className="text-sm font-bold">📖 {t("使い方ガイド", "Guia do app")}</div>
            <div className="text-xs text-muted-foreground">{t("いつでも開けます", "Abra quando quiser")}</div>
          </div>
          <Button size="sm" variant="outline" onClick={onOpenGuide}>{t("ガイドを開く", "Abrir")}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

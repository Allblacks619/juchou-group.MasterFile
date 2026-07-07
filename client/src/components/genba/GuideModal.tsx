import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { GUIDE_SECTIONS } from "@shared/genba/guide";
import type { GenbaLang } from "@shared/genba/i18n";

/** 使い方ガイド (プロトタイプ GuideModal 移植): 日/PT・役割別 */
export default function GuideModal({
  lang, isAdmin, open, onOpenChange,
}: {
  lang: GenbaLang;
  isAdmin: boolean;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const sections = GUIDE_SECTIONS.filter((s) => s.who === null || (s.who === "admin" && isAdmin));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>📖 {lang === "pt" ? "Guia do app" : "使い方ガイド"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {sections.map((s, i) => {
            const c = lang === "pt" ? s.pt : s.jp;
            return (
              <div key={i} className="rounded-lg border border-border p-3">
                <div className="text-sm font-bold flex items-center gap-2">
                  <span>{s.icon}</span>{c.t}
                  {s.who === "admin" && <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{lang === "pt" ? "admin" : "管理者"}</span>}
                </div>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{c.b}</p>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

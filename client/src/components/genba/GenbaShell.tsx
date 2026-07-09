import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Map as MapIcon, ClipboardList, Megaphone, LayoutGrid, BarChart3, Wallet, Settings, Plus, ChevronDown, CloudOff, UploadCloud, Package, Zap } from "lucide-react";
import { resolveGenbaTheme, genbaThemeTokens } from "@shared/genba/themes";
import type { GenbaLang } from "@shared/genba/i18n";
import { useGenbaOutbox } from "@/lib/useGenbaOutbox";
import FloorWorkspace from "./FloorWorkspace";
import TasksTab from "./TasksTab";
import DashTab from "./DashTab";
import InstructionsPanel from "./InstructionsPanel";
import MaterialsPanel from "./MaterialsPanel";
import DispatchPanel from "./DispatchPanel";
import BoardPanel from "./BoardPanel";
import BudgetPanel from "./BudgetPanel";
import GenbaSettingsPanel from "./GenbaSettingsPanel";
import GuideModal from "./GuideModal";

type Me = {
  userId: number | null;
  name: string | null;
  genbaRole: "admin" | "leader" | "worker";
  settings: { theme: string | null; lang: string | null; color: string | null; guideSeen: boolean };
};
type Site = { id: string; name: string; driveUrl: string | null; projectId: number | null };

type TabKey = "map" | "tasks" | "inst" | "board" | "dash" | "budget" | "settings";

const ROLE_LABEL: Record<string, string> = { admin: "管理者", leader: "リーダー", worker: "作業員" };
const ROLE_ICON: Record<string, string> = { admin: "🛠", leader: "⭐", worker: "👷" };

/**
 * 現場ビジョン 一体型シェル (正本 GenbaAppV18 レイアウト移植)。
 * ヘッダ(現場切替+ユーザー+言語) + タブ内容 + 下部タブバー。テーマトークンで統一感を出す。
 */
export default function GenbaShell({
  me, sites, onCreateSite, onSitesChanged,
}: {
  me: Me;
  sites: Site[];
  onCreateSite: () => void;
  onSitesChanged: () => void;
}) {
  const utils = trpc.useUtils();
  const theme = resolveGenbaTheme(me.settings.theme);
  const lang = (me.settings.lang === "pt" ? "pt" : "ja") as GenbaLang;
  const isAdmin = me.genbaRole === "admin";
  const canEdit = me.genbaRole !== "worker";

  const [siteId, setSiteId] = useState<string>(sites[0]?.id ?? "");
  const [tab, setTab] = useState<TabKey>("map");
  const [showGuide, setShowGuide] = useState(false);
  const [showMaterials, setShowMaterials] = useState(false);
  const [showDispatch, setShowDispatch] = useState(false);

  const site = sites.find((s) => s.id === siteId) || sites[0] || null;
  const outbox = useGenbaOutbox();

  const { data: unreadCount } = trpc.genba.instructions.unreadCount.useQuery(
    { siteId: site?.id ?? "" },
    { retry: false, staleTime: 30_000, enabled: !!site },
  );
  const settingsMut = trpc.genba.settings.update.useMutation({ onSuccess: () => utils.genba.me.invalidate() });

  // 初回ガイド
  useEffect(() => {
    if (!me.settings.guideSeen) { setShowGuide(true); settingsMut.mutate({ guideSeen: true }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me.userId]);

  useEffect(() => { if (!site && sites[0]) setSiteId(sites[0].id); }, [sites, site]);

  const tabs = useMemo(() => {
    const base: { key: TabKey; label: string; icon: any }[] = [
      { key: "map", label: "図面", icon: MapIcon },
      { key: "tasks", label: "作業", icon: ClipboardList },
      { key: "inst", label: "指示", icon: Megaphone },
      { key: "board", label: "配置", icon: LayoutGrid },
      { key: "dash", label: "全体", icon: BarChart3 },
    ];
    if (isAdmin) base.push({ key: "budget", label: "予算", icon: Wallet });
    base.push({ key: "settings", label: "設定", icon: Settings });
    return base;
  }, [isAdmin]);

  const instBadge = (unreadCount || 0);

  if (!site) return null;

  return (
    <div
      className="flex flex-col rounded-2xl overflow-hidden border shadow-sm -m-1"
      style={{ ...genbaThemeTokens(me.settings.theme), background: theme.appBg, borderColor: "rgba(0,0,0,0.08)", minHeight: "calc(100dvh - 6.5rem)" } as CSSProperties}
    >
      {/* ヘッダ */}
      <header
        className="flex items-center gap-2 px-3 py-2.5"
        style={{ background: `linear-gradient(180deg, ${theme.header}, ${theme.header2})`, color: theme.headerText }}
      >
        <span
          className="shrink-0 grid place-items-center rounded-xl font-black"
          style={{ width: 36, height: 36, background: "rgba(255,255,255,0.12)", color: theme.logo, fontSize: 18 }}
        >
          {theme.emblem}
        </span>
        {/* 現場切替ドロップダウン */}
        <div className="relative flex-1 min-w-0">
          <select
            value={site.id}
            onChange={(e) => { setSiteId(e.target.value); setTab("map"); }}
            className="w-full appearance-none bg-transparent font-bold text-base pr-6 truncate outline-none cursor-pointer"
            style={{ color: theme.headerText }}
          >
            {sites.map((s) => (
              <option key={s.id} value={s.id} style={{ color: "#0f172a" }}>{s.name}</option>
            ))}
          </select>
          <ChevronDown className="h-4 w-4 absolute right-1 top-1/2 -translate-y-1/2 pointer-events-none opacity-70" />
        </div>
        {canEdit && (
          <button
            onClick={onCreateSite}
            className="shrink-0 inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm font-semibold"
            style={{ background: theme.accent, color: "#fff" }}
          >
            <Plus className="h-4 w-4" /> 現場
          </button>
        )}
        <button
          onClick={() => settingsMut.mutate({ lang: lang === "ja" ? "pt" : "ja" })}
          className="shrink-0 rounded-lg px-2 py-1.5 text-sm"
          style={{ background: "rgba(255,255,255,0.14)" }}
          title="日本語 / Português"
        >
          {lang === "ja" ? "🇯🇵" : "🇧🇷"}
        </button>
      </header>

      {/* ユーザー行 + オフライン/送信待ち */}
      <div
        className="flex items-center gap-2 px-3 py-1.5 text-xs border-b"
        style={{ borderColor: "rgba(0,0,0,0.06)", background: "rgba(255,255,255,0.5)" }}
      >
        <span className="inline-flex items-center gap-1.5 font-semibold text-foreground">
          <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: me.settings.color || theme.accent }} />
          {me.name || "ユーザー"} <span className="opacity-70">{ROLE_ICON[me.genbaRole]} {ROLE_LABEL[me.genbaRole]}</span>
        </span>
        <span className="ml-auto flex items-center gap-2">
          {!outbox.online && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full" style={{ background: "rgba(246,170,0,0.16)", color: "#8a6d00" }}>
              <CloudOff className="h-3 w-3" /> オフライン
            </span>
          )}
          {outbox.pending > 0 && (
            <button onClick={() => outbox.flush()} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full" style={{ background: "rgba(77,196,255,0.18)", color: "#0369a1" }}>
              <UploadCloud className="h-3 w-3" /> 送信待ち {outbox.pending}
            </button>
          )}
        </span>
      </div>

      {/* タブ内容 */}
      <main className="flex-1 overflow-y-auto p-3" style={{ WebkitOverflowScrolling: "touch" }}>
        {tab === "map" && (
          <FloorWorkspace
            key={site.id}
            siteId={site.id}
            canEdit={canEdit}
            isAdmin={isAdmin}
            meUserId={me.userId ?? null}
            mapOnly
          />
        )}
        {tab === "tasks" && <TasksTab siteId={site.id} meUserId={me.userId ?? null} canEdit={canEdit} />}
        {tab === "inst" && (
          <div className="space-y-3">
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowDispatch(true)} className="inline-flex items-center gap-1.5 text-sm rounded-lg px-3 py-1.5 border border-[#FF4B00]/50 text-[#FF4B00] font-medium">
                <Zap className="h-4 w-4" /> 今日の急ぎ手配
              </button>
              <button onClick={() => setShowMaterials(true)} className="inline-flex items-center gap-1.5 text-sm rounded-lg px-3 py-1.5 border border-border font-medium">
                <Package className="h-4 w-4" /> 材料発注
              </button>
            </div>
            <InstructionsPanel
              embedded
              siteId={site.id}
              canEdit={canEdit}
              onReadChanged={() => utils.genba.instructions.unreadCount.invalidate({ siteId: site.id })}
            />
          </div>
        )}
        {tab === "board" && <BoardPanel embedded siteId={site.id} meUserId={me.userId ?? null} />}
        {tab === "dash" && <DashTab siteId={site.id} />}
        {tab === "budget" && isAdmin && <BudgetPanel embedded siteId={site.id} siteName={site.name} />}
        {tab === "settings" && (
          <GenbaSettingsPanel
            embedded
            settings={me.settings}
            site={site}
            isAdmin={isAdmin}
            canEdit={canEdit}
            onOpenGuide={() => setShowGuide(true)}
            onSitesChanged={onSitesChanged}
          />
        )}
      </main>

      {/* 下部タブバー */}
      <nav
        className="flex items-stretch border-t"
        style={{ background: `linear-gradient(180deg, ${theme.header2}, ${theme.header})`, borderColor: "rgba(0,0,0,0.1)" }}
      >
        {tabs.map((t) => {
          const active = tab === t.key;
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className="relative flex-1 flex flex-col items-center justify-center gap-0.5 py-2 min-w-0"
              style={{ color: active ? theme.tabOn : theme.tabOff }}
            >
              <Icon className="h-5 w-5" strokeWidth={active ? 2.4 : 1.8} />
              <span className="text-[10px] font-medium leading-none">{t.label}</span>
              {t.key === "inst" && instBadge > 0 && (
                <span className="absolute top-1 right-[22%] min-w-[16px] h-4 px-1 rounded-full bg-[#FF4B00] text-white text-[9px] font-bold flex items-center justify-center">
                  {instBadge}
                </span>
              )}
              {active && <span className="absolute bottom-0 left-1/4 right-1/4 h-0.5 rounded-full" style={{ background: theme.tabOn }} />}
            </button>
          );
        })}
      </nav>

      {showGuide && <GuideModal lang={lang} isAdmin={isAdmin} open={showGuide} onOpenChange={setShowGuide} />}
      {showMaterials && <MaterialsPanel siteId={site.id} canEdit={canEdit} meUserId={me.userId ?? null} open={showMaterials} onOpenChange={setShowMaterials} />}
      {showDispatch && <DispatchPanel siteId={site.id} canEdit={canEdit} meUserId={me.userId ?? null} open={showDispatch} onOpenChange={setShowDispatch} />}
    </div>
  );
}

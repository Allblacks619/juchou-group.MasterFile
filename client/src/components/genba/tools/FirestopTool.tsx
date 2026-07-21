import { useMemo, useState } from "react";
import { AlertTriangle, CheckSquare, Flame, Square, Wrench } from "lucide-react";
import { genbaTr, type GenbaLang } from "@shared/genba/i18n";
import { romanize } from "@/lib/genbaRomaji";
import {
  FIRESTOP_COMMON_CHECKLIST,
  FIRESTOP_PENETRANT_ORDER,
  FIRESTOP_STRUCTURE_ORDER,
  findFirestopEntry,
  getFirestopLevel,
  getFirestopMethod,
  getFirestopPenetrant,
  getFirestopStructure,
  type FirestopPenetrantKey,
  type FirestopStructureKey,
} from "@shared/genba/tools/firestop";

/**
 * 耐火区画貫通 ガイド: 壁・床の種別 → 貫通物 を選ぶと、防火区画貫通処理の
 * 代表的工法・施工ポイント・チェックリストを即表示する一般ガイド。
 * データは shared/genba/tools/firestop.ts（建築基準法施行令・一般周知の施工目安）。
 * 完全クライアント完結（サーバー通信なし）。認定工法の適用条件確認を必ず促す。
 */
export default function FirestopTool({ lang }: { lang: GenbaLang }) {
  const t = (ja: string) => genbaTr(ja, lang);
  const rz = (name: string) => (lang === "pt" ? romanize(name) : name);
  const [structure, setStructure] = useState<FirestopStructureKey | null>(null);
  const [penetrant, setPenetrant] = useState<FirestopPenetrantKey | null>(null);

  const entry = useMemo(
    () => (structure != null && penetrant != null ? findFirestopEntry(structure, penetrant) : null),
    [structure, penetrant],
  );
  const level = entry ? getFirestopLevel(entry.level) : null;

  return (
    <div className="space-y-4">
      {/* 見出し */}
      <div className="flex items-center gap-2">
        <Flame className="w-5 h-5 text-muted-foreground" />
        <h2 className="text-base font-bold">{t("耐火区画貫通 ガイド")}</h2>
      </div>

      {/* STEP1: 壁・床の種別 */}
      <div className="rounded-2xl border border-border bg-card/70 p-4">
        <div className="text-xs font-bold text-muted-foreground mb-2">{t("STEP 1　壁・床の種別")}</div>
        <div className="grid grid-cols-2 gap-2">
          {FIRESTOP_STRUCTURE_ORDER.map((k) => {
            const s = getFirestopStructure(k);
            const on = structure === k;
            return (
              <button
                key={k}
                type="button"
                onClick={() => setStructure(k)}
                className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${
                  on ? "border-transparent text-white" : "border-border bg-card/50"
                }`}
                style={on ? { background: "#4DC4FF" } : undefined}
              >
                <div className="text-sm font-bold leading-tight">{rz(s.label)}</div>
                {s.sub !== "" && (
                  <div className={`text-[11px] leading-tight ${on ? "text-white/80" : "text-muted-foreground"}`}>
                    {rz(s.sub)}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* STEP2: 貫通物 */}
      {structure && (
        <div className="rounded-2xl border border-border bg-card/70 p-4">
          <div className="text-xs font-bold text-muted-foreground mb-2">{t("STEP 2　貫通物")}</div>
          <div className="grid grid-cols-2 gap-2">
            {FIRESTOP_PENETRANT_ORDER.map((k) => {
              const p = getFirestopPenetrant(k);
              const on = penetrant === k;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setPenetrant(k)}
                  className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${
                    on ? "border-transparent text-white" : "border-border bg-card/50"
                  }`}
                  style={on ? { background: "#4DC4FF" } : undefined}
                >
                  <div className="text-sm font-bold leading-tight">{rz(p.label)}</div>
                  {p.sub !== "" && (
                    <div className={`text-[11px] leading-tight ${on ? "text-white/80" : "text-muted-foreground"}`}>
                      {rz(p.sub)}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 結果 */}
      {structure && penetrant && entry && level && (
        <div className="space-y-3">
          {/* 判定カード */}
          <div className="rounded-2xl border border-border bg-card/70 p-4">
            <div className="text-xs text-muted-foreground">
              {rz(getFirestopStructure(structure).name)}｜{rz(getFirestopPenetrant(penetrant).name)}
            </div>
            <div className="mt-1 text-3xl font-black leading-tight" style={{ color: level.color }}>
              {level.label}
            </div>
            <div className="mt-1.5 text-[11px] text-muted-foreground">{level.note}</div>
            <p className="mt-2 text-sm leading-relaxed">{entry.summary}</p>
          </div>

          {/* 認定条件の確認喚起（全結果共通） */}
          <div
            className="flex items-start gap-2 rounded-xl border px-3 py-2.5"
            style={{ borderColor: "#F6AA00" }}
          >
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "#F6AA00" }} />
            <p className="text-sm leading-relaxed">
              {t("防火区画貫通は国土交通大臣認定工法の適用条件（壁厚・開口径・充填深さ等）に従うこと。実施工前に認定書・設計図書で必ず確認する。")}
            </p>
          </div>

          {/* 代表工法カード */}
          <div className="rounded-2xl border border-border bg-card/70 p-4">
            <div className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground mb-2">
              <Wrench className="w-3.5 h-3.5" />
              {t("代表的工法")}
            </div>
            <div className="space-y-2">
              {entry.methods.map((m, i) => {
                const method = getFirestopMethod(m.method);
                return (
                  <div key={i} className="rounded-xl border border-border bg-card/50 px-3 py-2.5">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="text-sm font-bold leading-tight">{method.name}</span>
                      <span className="text-[11px]" style={{ color: "#4DC4FF" }}>{m.role}</span>
                    </div>
                    <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{method.summary}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 施工ポイントカード */}
          <div className="rounded-2xl border border-border bg-card/70 p-4">
            <div className="text-xs font-bold text-muted-foreground mb-2">{t("施工ポイント")}</div>
            <ul className="space-y-1.5">
              {entry.points.map((p, i) => (
                <li key={i} className="flex items-start gap-1.5 text-sm leading-relaxed">
                  <span className="mt-[7px] w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "#4DC4FF" }} />
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* チェックリストカード（選択が変わったら key でチェック状態リセット） */}
          <Checklist
            key={`${structure}-${penetrant}`}
            lang={lang}
            items={[...entry.checklist, ...FIRESTOP_COMMON_CHECKLIST]}
          />
        </div>
      )}

      {/* 免責注記 */}
      <div className="text-[11px] text-muted-foreground px-1 space-y-0.5">
        <p>{t("※ 建築基準法施行令・一般周知の施工目安に基づく一般ガイドです。特定メーカーの認定内容を示すものではありません。")}</p>
        <p>{t("※ 防火区画貫通は国土交通大臣認定工法の適用条件（壁厚・開口径・充填深さ）に従うこと。実施工前に認定書・設計図書で確認してください。")}</p>
        <p>{t("※ 現場条件により異なる場合があります。現場実測・設計図書・施工要領書を優先してください。")}</p>
      </div>
    </div>
  );
}

/** タップでチェックできる施工チェックリスト（状態は画面内のみ・保存しない） */
function Checklist({ lang, items }: { lang: GenbaLang; items: readonly string[] }) {
  const t = (ja: string) => genbaTr(ja, lang);
  const [checked, setChecked] = useState<ReadonlySet<number>>(new Set());
  const allDone = items.length > 0 && checked.size === items.length;

  const toggle = (i: number) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  return (
    <div className="rounded-2xl border border-border bg-card/70 p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className="text-xs font-bold text-muted-foreground">{t("チェックリスト")}</div>
        <span
          className="ml-auto text-[11px] font-bold tabular-nums"
          style={{ color: allDone ? "#03AF7A" : undefined }}
        >
          {checked.size}/{items.length}
        </span>
      </div>
      <div className="space-y-1">
        {items.map((t, i) => {
          const on = checked.has(i);
          return (
            <button
              key={i}
              type="button"
              onClick={() => toggle(i)}
              className="w-full flex items-start gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-muted/50"
            >
              {on ? (
                <CheckSquare className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "#03AF7A" }} />
              ) : (
                <Square className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
              )}
              <span className={`text-sm leading-relaxed ${on ? "text-muted-foreground line-through" : ""}`}>
                {t}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

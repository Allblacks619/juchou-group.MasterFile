/**
 * 現場ビジョン: 日本語→ローマ字変換 (ポルトガル語表示補助)。
 * プロトタイプ GenbaAppV18.jsx の ROMAJI_DICT / kanaToRomaji / romanize を移植。
 */

const ROMAJI_DICT: Record<string, string> = {
  "壁": "Kabe", "天井": "Tenjou", "墨出し": "Sumidashi", "建て込み": "Tatekomi", "取り付け": "Toritsuke",
  "貫通": "Kantsuu", "配管": "Haikan", "区画処理": "Kukaku Shori", "全ネジ": "Zen-Neji", "敷設": "Fusetsu",
  "配線": "Haisen", "強電": "Kyouden", "電灯": "Dentou", "非常照明": "Hijou Shoumei", "動力": "Douryoku",
  "幹線引き": "Kansen Hiki", "幹線": "Kansen", "弱電": "Jakuden", "自火報": "Jikahou", "工区": "Kouku",
  "吊りボルト": "Tsuri Bolt", "吊り": "Tsuri", "支持金具": "Shiji Kanagu", "金具": "Kanagu",
  "電線管": "Densenkan", "厚鋼": "Atsukou", "ねじなし": "Nejinashi", "金属管": "Kinzokukan",
  "レースウェイ": "Raceway", "ダクター": "Ducter", "チャンネル": "Channel", "ボックス": "Box",
  "アース": "Earth", "ラック": "Rack", "アウトレット": "Outlet", "ボンド": "Bond",
  "器具": "Kigu", "付け": "Tsuke", "取付": "Toritsuke", "ルート": "Route", "作業": "Sagyou", "エリア": "Area",
  "管": "Kan", "防災": "Bousai", "材料": "Zairyou",
};
const DICT_KEYS = Object.keys(ROMAJI_DICT).sort((a, b) => b.length - a.length);
const KANA: Record<string, string> = { あ:"a",い:"i",う:"u",え:"e",お:"o",か:"ka",き:"ki",く:"ku",け:"ke",こ:"ko",さ:"sa",し:"shi",す:"su",せ:"se",そ:"so",た:"ta",ち:"chi",つ:"tsu",て:"te",と:"to",な:"na",に:"ni",ぬ:"nu",ね:"ne",の:"no",は:"ha",ひ:"hi",ふ:"fu",へ:"he",ほ:"ho",ま:"ma",み:"mi",む:"mu",め:"me",も:"mo",や:"ya",ゆ:"yu",よ:"yo",ら:"ra",り:"ri",る:"ru",れ:"re",ろ:"ro",わ:"wa",を:"o",ん:"n",が:"ga",ぎ:"gi",ぐ:"gu",げ:"ge",ご:"go",ざ:"za",じ:"ji",ず:"zu",ぜ:"ze",ぞ:"zo",だ:"da",ぢ:"ji",づ:"zu",で:"de",ど:"do",ば:"ba",び:"bi",ぶ:"bu",べ:"be",ぼ:"bo",ぱ:"pa",ぴ:"pi",ぷ:"pu",ぺ:"pe",ぽ:"po",ぁ:"a",ぃ:"i",ぅ:"u",ぇ:"e",ぉ:"o",ゔ:"vu" };
const SMALL_YA: Record<string, string> = { ゃ:"ya", ゅ:"yu", ょ:"yo" };

function kanaToRomaji(src: string): string {
  let out = "";
  for (let i = 0; i < src.length; i++) {
    let c = src[i];
    const code = c.charCodeAt(0);
    if (code >= 0x30a1 && code <= 0x30f6) c = String.fromCharCode(code - 0x60);
    if (c === "ー") { const m = out.match(/[aiueo]$/); out += m ? m[0] : ""; continue; }
    if (c === "っ") {
      let n = src[i + 1] || "";
      const nc = n.charCodeAt(0);
      if (nc >= 0x30a1 && nc <= 0x30f6) n = String.fromCharCode(nc - 0x60);
      const r = KANA[n] || "";
      out += r ? r[0] : "tsu";
      continue;
    }
    if (SMALL_YA[c]) {
      out = out.replace(/i$/, "");
      out += /(sh|ch|j)$/.test(out) ? SMALL_YA[c].slice(1) : SMALL_YA[c];
      continue;
    }
    out += KANA[c] !== undefined ? KANA[c] : c;
  }
  return out ? out[0].toUpperCase() + out.slice(1) : out;
}

export function romanize(text: string): string {
  const s = String(text || "");
  let i = 0;
  const parts: string[] = [];
  while (i < s.length) {
    let hit: string | null = null;
    for (const k of DICT_KEYS) { if (s.startsWith(k, i)) { hit = k; break; } }
    if (hit) { parts.push(ROMAJI_DICT[hit]); i += hit.length; continue; }
    const code = s.charCodeAt(i);
    if ((code >= 0x3041 && code <= 0x309f) || (code >= 0x30a1 && code <= 0x30fc)) {
      let j = i;
      while (j < s.length) {
        const cc = s.charCodeAt(j);
        if ((cc >= 0x3041 && cc <= 0x309f) || (cc >= 0x30a1 && cc <= 0x30fc)) j++;
        else break;
      }
      parts.push(kanaToRomaji(s.slice(i, j)));
      i = j;
      continue;
    }
    if (code < 128) {
      let j = i;
      while (j < s.length && s.charCodeAt(j) < 128) j++;
      parts.push(s.slice(i, j));
      i = j;
      continue;
    }
    let j = i;
    while (j < s.length) {
      const cc = s.charCodeAt(j);
      const isKana = (cc >= 0x3041 && cc <= 0x309f) || (cc >= 0x30a1 && cc <= 0x30fc);
      if (cc < 128 || isKana) break;
      let dictHit = false;
      for (const k of DICT_KEYS) { if (s.startsWith(k, j)) { dictHit = true; break; } }
      if (dictHit) break;
      j++;
    }
    parts.push(s.slice(i, j));
    i = j;
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

/**
 * 表示言語 (GenbaShell がレンダー時に設定)。プロトタイプのグローバル LANG 相当。
 * ポルトガル語表示のときだけ dispName が「日本語 — Romaji」を返す。
 */
let displayLang: "ja" | "pt" = "ja";
export function setRomajiLang(lang: "ja" | "pt"): void { displayLang = lang; }

/** 日本語正式名を保ち、PT時のみ「名前 — Romaji」。romaji 未設定は自動変換でフォールバック */
export function dispName(name: string, romaji?: string | null): string {
  if (displayLang !== "pt") return name;
  const r = (romaji && romaji.trim()) || romanize(name);
  return r && r !== name ? `${name} — ${r}` : name;
}

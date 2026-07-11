/**
 * 作業員専用リンクのトークン保持 (G-full)。
 * /app/w/:token で入った場合、以後の genba API 呼び出しに x-genba-link ヘッダとして自動付与し、
 * ログイン無しで本体アプリ (GenbaShell) をその現場スコープで使えるようにする。
 * 保存は sessionStorage (タブを閉じれば消える。リンクを再度開けば復帰)。
 */

const KEY = "genba-link-token";
let current: string | null = null;

export function setGenbaLinkToken(token: string | null): void {
  current = token;
  try {
    if (token) sessionStorage.setItem(KEY, token);
    else sessionStorage.removeItem(KEY);
  } catch { /* プライベートモード等は無視 (メモリ保持のみ) */ }
}

export function getGenbaLinkToken(): string | null {
  if (current) return current;
  try { current = sessionStorage.getItem(KEY); } catch { /* noop */ }
  return current;
}

/** リンクセッション中か (UI の出し分けに使う) */
export function isGenbaLinkSession(): boolean {
  return !!getGenbaLinkToken();
}

/** ゲスト用のテーマ/言語/ガイド既読 (アカウントが無いため端末保存) */
const PREFS_KEY = "genba-link-prefs";
export type GenbaLinkPrefs = { theme?: string | null; lang?: string | null; guideSeen?: boolean };

export function getGenbaLinkPrefs(): GenbaLinkPrefs {
  try { return JSON.parse(localStorage.getItem(PREFS_KEY) || "{}"); } catch { return {}; }
}

export function setGenbaLinkPrefs(patch: GenbaLinkPrefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ ...getGenbaLinkPrefs(), ...patch }));
  } catch { /* noop */ }
}

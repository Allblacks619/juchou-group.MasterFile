/**
 * PWA Service Worker のルーティング戦略 (純関数・単体テスト対象)。
 * public/sw.js は依存を持てない静的ファイルのため同一ロジックを内包する。
 * ここを正本とし、sw.js は本仕様に一致させること。
 *
 * 方針 (認証を絶対に壊さない):
 *  - /api/** は絶対にキャッシュしない (tRPC・ログイン・セッション。常にネットワーク)。
 *  - ハッシュ付き静的アセット (/assets/**, フォント, 画像) は stale-while-revalidate。
 *  - それ以外 (HTML ナビゲーション等) は network-first (オフライン時のみキャッシュ shell)。
 */

export type SwStrategy = "network-only" | "stale-while-revalidate" | "network-first";

const ASSET_EXT = /\.(?:js|mjs|css|woff2?|ttf|otf|eot|png|jpe?g|gif|svg|webp|avif|ico)$/i;

/** 同一オリジンのパスに対する取得戦略を決める */
export function swRouteStrategy(pathname: string): SwStrategy {
  // 認証・API は常にネットワーク (キャッシュ厳禁)
  if (pathname.startsWith("/api/")) return "network-only";
  // service worker 自身は常にネットワーク (更新検知のため)
  if (pathname === "/sw.js") return "network-only";
  // ハッシュ付き immutable アセット
  if (pathname.startsWith("/assets/") || ASSET_EXT.test(pathname)) return "stale-while-revalidate";
  // マニフェスト・アイコン類も SWR で可
  if (pathname.endsWith(".webmanifest")) return "stale-while-revalidate";
  // それ以外 (ドキュメント/ナビゲーション) は network-first
  return "network-first";
}

/** /app 配下だけをオフライン shell の対象にする (マーケティングサイトは対象外) */
export function isAppShellPath(pathname: string): boolean {
  return pathname === "/app" || pathname.startsWith("/app/");
}

/*
 * 充寵グループ 業務アプリ Service Worker (手書き・依存なし)。
 * 正本の戦略は shared/pwa/swStrategy.ts。ここは同ロジックを内包する。
 *
 * 安全設計 (認証を壊さない):
 *  - /api/** と /sw.js は絶対にキャッシュしない (常にネットワーク)。
 *  - ナビゲーション(HTML)は network-first。オフライン時のみ /app シェルを返す。
 *  - ハッシュ付き静的アセット・画像は stale-while-revalidate。
 *  - クロスオリジン(フォント等)は素通し。
 *  - CACHE_VERSION を上げると旧キャッシュを一掃する。skipWaiting + clients.claim で即時反映。
 *  - 新SWは install で skipWaiting し、次回起動時に自動で最新へ切り替わる (ゲストが「更新」を押さなくても古いまま固まらない)。
 */
const CACHE_VERSION = "genba-v2";
const CACHE = `app-cache-${CACHE_VERSION}`;
const APP_SHELL = "/app";
const ASSET_EXT = /\.(?:js|mjs|css|woff2?|ttf|otf|eot|png|jpe?g|gif|svg|webp|avif|ico)$/i;

function routeStrategy(pathname) {
  if (pathname.startsWith("/api/")) return "network-only";
  if (pathname === "/sw.js") return "network-only";
  if (pathname.startsWith("/assets/") || ASSET_EXT.test(pathname)) return "swr";
  if (pathname.endsWith(".webmanifest")) return "swr";
  return "network-first";
}

self.addEventListener("install", (event) => {
  // 新SWは待機せず即座に有効化候補にする (待機のまま古いSWが居座り、古い画面/白画面で固まるのを防ぐ)。
  // 実際の切り替えは activate の clients.claim + ページ側 controllerchange で1回リロードして行う。
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.add(new Request(APP_SHELL, { credentials: "same-origin" })).catch(() => {})),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING" || (event.data && event.data.type === "SKIP_WAITING")) {
    self.skipWaiting();
  }
});

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((res) => {
      if (res && res.ok && res.type === "basic") cache.put(request, res.clone());
      return res;
    })
    .catch(() => cached);
  return cached || network;
}

async function networkFirst(request, pathname) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(request);
    // /app 系のナビゲーションだけオフライン用にシェルを保存
    if (res && res.ok && request.mode === "navigate" && (pathname === "/app" || pathname.startsWith("/app/"))) {
      cache.put(APP_SHELL, res.clone());
    }
    return res;
  } catch (err) {
    if (request.mode === "navigate" && (pathname === "/app" || pathname.startsWith("/app/"))) {
      const shell = await cache.match(APP_SHELL);
      if (shell) return shell;
    }
    const cached = await cache.match(request);
    if (cached) return cached;
    throw err;
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return; // 変更系は素通し (アウトボックスはページ側で処理)
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // クロスオリジンは素通し

  const strategy = routeStrategy(url.pathname);
  if (strategy === "network-only") return; // 既定のネットワーク処理に任せる (キャッシュしない)
  if (strategy === "swr") { event.respondWith(staleWhileRevalidate(request)); return; }
  event.respondWith(networkFirst(request, url.pathname));
});

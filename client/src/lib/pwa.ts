/**
 * PWA 登録 (業務アプリ = /app 配下のみ)。
 * - マーケティングサイト(/)や開発モードでは何もしない。
 * - manifest / テーマ色 / iOS 用メタを動的注入 (index.html は変更しない)。
 * - Service Worker を登録し、新バージョン検知時に「更新」トーストを表示する。
 * 認証を壊さないため SW 側で /api/** は絶対にキャッシュしない (sw.js 参照)。
 */
import { toast } from "sonner";

function injectHead() {
  const head = document.head;
  if (!document.querySelector('link[rel="manifest"]')) {
    const link = document.createElement("link");
    link.rel = "manifest";
    link.href = "/manifest.webmanifest";
    head.appendChild(link);
  }
  if (!document.querySelector('meta[name="theme-color"]')) {
    const meta = document.createElement("meta");
    meta.name = "theme-color";
    meta.content = "#1B2A41";
    head.appendChild(meta);
  }
  if (!document.querySelector('link[rel="apple-touch-icon"]')) {
    const icon = document.createElement("link");
    icon.rel = "apple-touch-icon";
    icon.href = "/icons/apple-touch-icon.png";
    head.appendChild(icon);
  }
  for (const [name, content] of [
    ["apple-mobile-web-app-capable", "yes"],
    ["apple-mobile-web-app-status-bar-style", "black-translucent"],
    ["apple-mobile-web-app-title", "充寵 現場"],
    ["mobile-web-app-capable", "yes"],
  ]) {
    if (!document.querySelector(`meta[name="${name}"]`)) {
      const m = document.createElement("meta");
      m.name = name;
      m.content = content;
      head.appendChild(m);
    }
  }
}

/** 待機中の新SWがあれば更新トーストを出す */
function promptUpdate(reg: ServiceWorkerRegistration, worker: ServiceWorker) {
  toast("新しいバージョンがあります", {
    description: "タップして最新に更新します。",
    duration: Infinity,
    action: {
      label: "更新",
      onClick: () => {
        worker.postMessage("SKIP_WAITING");
      },
    },
  });
  void reg; // reg は将来の拡張用 (参照保持)
}

export function registerPwa() {
  if (typeof window === "undefined") return;
  // 業務アプリ配下だけを PWA 化 (マーケティングサイトは対象外)
  if (!window.location.pathname.startsWith("/app")) return;
  // 開発モード(Vite HMR)では SW を登録しない
  const isProd = typeof import.meta !== "undefined" && (import.meta as any).env && (import.meta as any).env.PROD;
  if (!isProd) return;
  if (!("serviceWorker" in navigator)) return;

  injectHead();

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        // 既に待機中の新SWがある
        if (reg.waiting && navigator.serviceWorker.controller) promptUpdate(reg, reg.waiting);
        // 新SWのインストールを監視
        reg.addEventListener("updatefound", () => {
          const nw = reg.installing;
          if (!nw) return;
          nw.addEventListener("statechange", () => {
            if (nw.state === "installed" && navigator.serviceWorker.controller) {
              promptUpdate(reg, nw);
            }
          });
        });
      })
      .catch((err) => console.warn("[pwa] SW registration failed:", err));

    // 新SW(skipWaiting)が制御を奪ったら1回だけリロードして最新へ。
    // 初回インストール(それまで誰も制御していない)時の claim ではリロードしない(不要な再読込を避ける)。
    const hadController = !!navigator.serviceWorker.controller;
    let reloaded = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloaded || !hadController) return;
      reloaded = true;
      window.location.reload();
    });
  });
}

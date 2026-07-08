import { describe, it, expect } from "vitest";
import { swRouteStrategy, isAppShellPath } from "../shared/pwa/swStrategy";

/** PWA Service Worker のルーティング戦略 (認証を壊さないことの担保) */
describe("swRouteStrategy", () => {
  it("API・認証は絶対にキャッシュしない (network-only)", () => {
    expect(swRouteStrategy("/api/trpc/genba.me")).toBe("network-only");
    expect(swRouteStrategy("/api/auth/login")).toBe("network-only");
    expect(swRouteStrategy("/api/trpc/genba.materials.createRequest")).toBe("network-only");
  });

  it("sw.js 自身は network-only (更新検知のため)", () => {
    expect(swRouteStrategy("/sw.js")).toBe("network-only");
  });

  it("ハッシュ付き静的アセットは stale-while-revalidate", () => {
    expect(swRouteStrategy("/assets/index-abc123.js")).toBe("stale-while-revalidate");
    expect(swRouteStrategy("/assets/index-abc123.css")).toBe("stale-while-revalidate");
    expect(swRouteStrategy("/icons/icon-512.png")).toBe("stale-while-revalidate");
    expect(swRouteStrategy("/fonts/x.woff2")).toBe("stale-while-revalidate");
    expect(swRouteStrategy("/manifest.webmanifest")).toBe("stale-while-revalidate");
  });

  it("ナビゲーション/ドキュメントは network-first", () => {
    expect(swRouteStrategy("/app")).toBe("network-first");
    expect(swRouteStrategy("/app/genba")).toBe("network-first");
    expect(swRouteStrategy("/")).toBe("network-first");
    expect(swRouteStrategy("/app/login")).toBe("network-first");
  });

  it("ログインは絶対に stale-while-revalidate にならない (常に鮮度優先)", () => {
    // /app/login はナビゲーション扱い=network-first、/api/auth はnetwork-only。いずれもSWRではない
    expect(swRouteStrategy("/app/login")).not.toBe("stale-while-revalidate");
    expect(swRouteStrategy("/api/auth/login")).not.toBe("stale-while-revalidate");
  });

  it("isAppShellPath は /app 配下のみ true", () => {
    expect(isAppShellPath("/app")).toBe(true);
    expect(isAppShellPath("/app/genba")).toBe(true);
    expect(isAppShellPath("/")).toBe(false);
    expect(isAppShellPath("/recruit")).toBe(false);
  });
});

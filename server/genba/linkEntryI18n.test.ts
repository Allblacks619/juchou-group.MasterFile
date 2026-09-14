import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { genbaTr } from "../../shared/genba/i18n";

/**
 * 作業員リンクの入口 (ログイン前) の文言が pt へ訳されることの回帰テスト。
 * ここが未訳だと「リンクが開けない」場面でポルトガル語話者の作業員が
 * 何をすればよいか分からなくなるため、原文フォールバックのままにしない。
 *
 * サーバーが返すエラーメッセージは server/genba/router.ts の文言と一致している
 * 必要がある (原文が辞書キーのため、片方だけ変えると無言で未訳に戻る)。
 */
const SERVER_LINK_ERRORS = [
  "このリンクは無効化されています。管理者に確認してください。",
  "このリンクは有効期限が切れています。管理者に再発行を依頼してください。",
  "リンクが無効です。URLを確認するか、管理者に問い合わせてください。",
  "ログインが必要です",
];

const CLIENT_LINK_ENTRY = [
  "このリンクは利用できません",
  "通信環境を確認して、もう一度開いてください。",
  "現場が見つかりません",
  "この現場は削除されたか、非公開になっています。管理者に確認してください。",
];

describe("作業員リンク入口の i18n", () => {
  it("サーバーが返すリンクエラーが pt に訳される", () => {
    for (const ja of SERVER_LINK_ERRORS) {
      expect(genbaTr(ja, "pt"), `未訳: ${ja}`).not.toBe(ja);
    }
  });

  it("入口画面の文言が pt に訳される", () => {
    for (const ja of CLIENT_LINK_ENTRY) {
      expect(genbaTr(ja, "pt"), `未訳: ${ja}`).not.toBe(ja);
    }
  });

  it("辞書キーが router.ts の実際の文言と一致している (片方だけ変えると無言で未訳に戻る)", () => {
    const router = readFileSync(new URL("./router.ts", import.meta.url), "utf8");
    for (const ja of SERVER_LINK_ERRORS) {
      expect(router.includes(ja), `router.ts に無い文言が辞書キーになっている: ${ja}`).toBe(true);
    }
  });

  it("ja では原文のまま返す", () => {
    for (const ja of [...SERVER_LINK_ERRORS, ...CLIENT_LINK_ENTRY]) {
      expect(genbaTr(ja, "ja")).toBe(ja);
    }
  });
});

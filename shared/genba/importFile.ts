/**
 * 外部リンク取り込み (importLink) 用の純粋ヘルパー。
 * Drive 等が正規ファイルを application/octet-stream で返す/ファイル名を UTF-8 生バイトで
 * 返すケースを吸収する。サーバー・テスト双方から使うため Node 依存 (Buffer) を持たない。
 */

/** 検証で許可される MIME (uploadValidation と同期) */
const ALLOWED = new Set([
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

/** ダウンロード系サーバーが付けがちな「中身不明」の汎用バイナリ型 */
const GENERIC_MIME = /^(application\/octet-stream|application\/binary|binary\/octet-stream|application\/download|application\/force-download|application\/unknown)$/;

/**
 * 先頭バイトのマジックナンバーから MIME を判定する。判定できなければ null。
 * PDF(%PDF) / PNG / JPEG / WEBP(RIFF....WEBP) に対応。
 */
export function sniffMime(buf: Uint8Array): string | null {
  if (buf.length >= 4 && buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) {
    return "application/pdf"; // %PDF
  }
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
      buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a) {
    return "image/png"; // \x89PNG\r\n\x1a\n
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return "image/jpeg"; // JPEG SOI
  }
  if (buf.length >= 12 && buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
      buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) {
    return "image/webp"; // RIFF....WEBP
  }
  return null;
}

/**
 * content-type ヘッダとバイト署名から、検証・保存に使う MIME を決める。
 * ヘッダが空/汎用バイナリ型/許可外なのにバイト署名が正規ファイルを示す場合は署名を優先する
 * (Drive が PDF を application/octet-stream で返す等を救済)。
 */
export function resolveImportMime(contentType: string, buf: Uint8Array): string {
  const ct = (contentType || "").split(";")[0].trim().toLowerCase();
  const sniffed = sniffMime(buf);
  if (sniffed && (!ct || GENERIC_MIME.test(ct) || !ALLOWED.has(ct))) return sniffed;
  return ct || "application/octet-stream";
}

/**
 * latin1 として文字列化されたヘッダ値を、UTF-8 バイト列とみなして復元する。
 * undici(Node fetch) はヘッダを latin1 で保持するため、日本語ファイル名が文字化けする。
 * 復元して U+FFFD (置換不能) が出るなら本来の latin1 文字列とみなし元を返す。
 */
function recoverUtf8(s: string): string {
  // 既にマルチバイト文字を含む=正しくデコード済みとみなす
  for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) > 0xff) return s;
  const bytes = Uint8Array.from(s, (c) => c.charCodeAt(0) & 0xff);
  const decoded = new TextDecoder("utf-8").decode(bytes);
  return decoded.includes("�") ? s : decoded;
}

/**
 * Content-Disposition ヘッダからファイル名を安全に取り出す。
 * - RFC5987 の filename*=UTF-8''%.. を優先し UTF-8 としてデコード
 * - 素の filename="..." は latin1 化された UTF-8 を復元
 */
export function decodeHeaderFilename(contentDisposition: string | null | undefined, fallback = "import"): string {
  if (!contentDisposition) return fallback;
  const star = /filename\*\s*=\s*(?:UTF-8'')?([^;]+)/i.exec(contentDisposition);
  if (star) {
    const raw = star[1].trim().replace(/^"|"$/g, "");
    try {
      const dec = decodeURIComponent(raw);
      if (dec) return dec;
    } catch { /* fall through to plain */ }
  }
  const plain = /filename\s*=\s*"?([^";]+)"?/i.exec(contentDisposition);
  if (plain) {
    const v = plain[1].trim();
    return v ? recoverUtf8(v) : fallback;
  }
  return fallback;
}

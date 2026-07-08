#!/usr/bin/env node
/**
 * 現場ビジョン M5: メモリ実測レポート (依存なし)。
 * 本番コンテナ内で実行し、Node プロセスの実メモリ (RSS) と OS 空き容量を出力する。
 *   docker exec juchou-app node scripts/genba-mem-report.mjs
 * もしくは VPS 上で: node scripts/genba-mem-report.mjs
 * 数値は MiB。RSS が実際に確保している物理メモリの目安。
 */
import os from "node:os";

const MiB = (n) => (n / 1024 / 1024).toFixed(1);
const m = process.memoryUsage();
const arch = process.arch; // arm64 / x64
const rss = Number(MiB(m.rss));

const report = {
  timestampIso: new Date().toISOString(),
  arch,
  nodeVersion: process.version,
  process: {
    rssMiB: MiB(m.rss),
    heapUsedMiB: MiB(m.heapUsed),
    heapTotalMiB: MiB(m.heapTotal),
    externalMiB: MiB(m.external),
    arrayBuffersMiB: MiB(m.arrayBuffers ?? 0),
  },
  os: {
    totalMiB: MiB(os.totalmem()),
    freeMiB: MiB(os.freemem()),
    loadavg: os.loadavg().map((n) => n.toFixed(2)),
    cpus: os.cpus().length,
  },
};

// 目安レンジ (Node20 + Express + tRPC + drizzle/mysql2): アイドル 80–160MiB / 稼働時 200–320MiB。
// これを大きく超え続ける場合はリーク疑い (画像 base64 の保持・キャッシュ肥大等) を調査する。
const IDLE_HINT = 160;
const BUSY_HINT = 320;
report.assessment =
  rss <= IDLE_HINT ? "OK (アイドル圏内)" : rss <= BUSY_HINT ? "OK (稼働圏内)" : "要調査 (想定上限超過)";

console.log(JSON.stringify(report, null, 2));

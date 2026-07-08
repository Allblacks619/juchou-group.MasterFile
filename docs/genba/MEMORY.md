# 現場ビジョン M5: ARM64 メモリ実測

ROADMAP M5 の DoD「ARM64 イメージでのメモリ実測」。自社 VPS(ConoHa/ARM64・`/opt/juchou`)で
docker 稼働する `app` コンテナの実メモリを測る手順と目安をまとめる。デプロイ詳細は
`docs/DEPLOYMENT.md` を参照。

## 測り方

### 1) docker stats (最も手軽)
```bash
# VPS 上で
cd /opt/juchou
docker compose ps            # app サービス名/コンテナ名を確認
docker stats --no-stream juchou-app   # MEM USAGE / LIMIT と MEM% を見る
```

### 2) コンテナ内の RSS を直接読む
```bash
docker exec juchou-app sh -c 'grep -E "VmRSS|VmHWM" /proc/1/status'
# VmRSS = 現在の実メモリ、VmHWM = これまでのピーク
```

### 3) 付属スクリプト (プロセス/OSまとめて JSON 出力)
```bash
docker exec juchou-app node scripts/genba-mem-report.mjs
```
`rssMiB`(実メモリ) / `heapUsed` / OS 空き / `assessment`(目安判定) を出力する。依存なし・副作用なし。

### 4) 継続監視 (任意)
```bash
watch -n 5 'docker exec juchou-app sh -c "grep VmRSS /proc/1/status"'
# 図面アップロード連打・共有ビュー閲覧・進捗登録アウトボックス送信などを一巡させ、
# RSS がピーク後にベースラインへ戻る(=リークしていない)ことを確認する。
```

## 目安レンジ (Node20 + Express + tRPC + drizzle/mysql2)

| 状態 | RSS 目安 |
|------|----------|
| 起動直後・アイドル | 80–160 MiB |
| 通常稼働(数ユーザー・画像表示) | 200–320 MiB |
| 継続して 320 MiB 超 | 要調査(リーク疑い) |

- 本番イメージは**コンパイル済みバンドル**(`dist/index.js`)で動くため、開発時の `tsx`(TypeScript
  を直接実行)より軽い。参考: 本リポジトリのローカル検証(`tsx` 本番モード, x64)で
  **RSS ≈ 169 MiB / ピーク ≈ 261 MiB**。ARM64 本番バンドルはこれ以下に収まる想定。
- 画像・PDF は**クライアント側で縮小して R2 に直接保存**し、DB には R2 キーのみ格納する設計
  (base64 を DB・サーバーメモリに滞留させない)。ここが崩れるとメモリが跳ねるので、リーク調査時は
  まず「サーバーが base64/画像バッファを保持していないか」を疑う。
- マルチアーキ(amd64+arm64)イメージは `build.yml` が GHCR へ push、VPS の Watchtower が反映。

## リーク調査の初手
1. `scripts/genba-mem-report.mjs` を数分おきに叩き、`rssMiB`/`heapUsedMiB` の右肩上がりを確認。
2. 上がり続ける場合、直前に何を操作したか(図面アップロード/共有ビュー/大量タスク表示)で切り分け。
3. `heapUsed` が増える → JS オブジェクト滞留、`external`/`arrayBuffers` が増える → Buffer/画像滞留。
4. `docker compose restart app` で一時回復するが、原因(保持参照)を除去すること。

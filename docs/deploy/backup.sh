#!/bin/sh
# 充寵グループ 日次バックアップ（DB + MinIOファイル）
# /opt/juchou/backup.sh として配置し cron から毎日実行する。
# DB(gzip) と MinIOファイル(tar.gz) を /opt/juchou/backups/ に保存し 14 日保持。
# backups/ は NAS がそのまま取得 → Google Drive へ同期される。
set -eu
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

cd /opt/juchou
DIR=/opt/juchou/backups
mkdir -p "$DIR"
STAMP=$(date +%Y%m%d_%H%M%S)
MINIO_SIZE="-"

# --- DB バックアップ ---
DBFILE="$DIR/juchou_${STAMP}.sql.gz"
docker compose exec -T db sh -c 'exec mariadb-dump -uroot -p"$MARIADB_ROOT_PASSWORD" --single-transaction --routines --triggers --databases juchou' | gzip > "$DBFILE"
if [ ! -s "$DBFILE" ]; then
  rm -f "$DBFILE"
  echo "$(date '+%Y-%m-%d %H:%M:%S') FAILED (db dump empty)" >> "$DIR/backup.log"
  exit 1
fi

# --- MinIO ファイルバックアップ ---
if [ -d /opt/juchou/minio-data ]; then
  MINIOFILE="$DIR/minio_${STAMP}.tar.gz"
  if tar czf "$MINIOFILE" -C /opt/juchou minio-data 2>/dev/null && [ -s "$MINIOFILE" ]; then
    MINIO_SIZE=$(du -h "$MINIOFILE" | cut -f1)
  else
    rm -f "$MINIOFILE"
    MINIO_SIZE="FAILED"
  fi
fi

# --- 保持期間（14日）---
find "$DIR" -name 'juchou_*.sql.gz' -mtime +14 -delete
find "$DIR" -name 'minio_*.tar.gz' -mtime +14 -delete

echo "$(date '+%Y-%m-%d %H:%M:%S') OK db=$(du -h "$DBFILE" | cut -f1) minio=${MINIO_SIZE}" >> "$DIR/backup.log"

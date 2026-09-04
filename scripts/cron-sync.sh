#!/bin/bash
# 進行中シーズンの順位表とスコアを同期する。cron から定期実行する想定。
#
#   crontab 例（毎日 3:10）:
#     10 3 * * * /path/to/gap-league/scripts/cron-sync.sh >> /var/log/gap-sync.log 2>&1
#
# 環境変数（.env.local → .env の順に読む。同じ名前で export すればそちらが優先）:
#   CRON_SECRET  … 必須。未設定だとエンドポイントが 503 を返す
#   GAP_URL      … アプリのURL。既定 http://localhost:3020
#                  サブパス配信なら基底パスまで含める（例 http://localhost:3020/gap）
set -euo pipefail
cd "$(dirname "$0")/.."

# 探す順。GAP_ENV_FILE を指定すればそれだけを見る。
ENV_FILES=("${GAP_ENV_FILE:-}" ".env.local" ".env")

read_env() {
  # KEY=value 形式から値を取り出す。前後のクォートは外す。先に見つかった方を採る。
  local f
  for f in "${ENV_FILES[@]}"; do
    [ -n "$f" ] && [ -f "$f" ] || continue
    local v
    v=$(grep -E "^${1}=" "$f" | tail -1 | cut -d= -f2- | sed -e 's/^"//' -e "s/^'//" -e 's/"$//' -e "s/'$//")
    if [ -n "$v" ]; then
      echo "$v"
      return 0
    fi
  done
}

SECRET="${CRON_SECRET:-$(read_env CRON_SECRET)}"
BASE="${GAP_URL:-$(read_env GAP_URL)}"
BASE="${BASE:-http://localhost:3020}"

if [ -z "${SECRET}" ]; then
  echo "CRON_SECRET が設定されていません（.env.local / .env か環境変数で指定してください）" >&2
  exit 1
fi

curl -fsS -X POST -H "Authorization: Bearer ${SECRET}" "${BASE%/}/api/cron/sync"
echo

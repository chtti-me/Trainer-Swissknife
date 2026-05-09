#!/usr/bin/env bash
# =============================================================================
#  scripts/dev-wsl.sh
#  WSL / Linux 環境內真正的 Next.js 開發伺服器啟動器。
#  ─────────────────────────────────────────────────────────────────────────────
#  ‧ 載入 nvm（Node Version Manager，Node 版本管理器）
#  ‧ 套用 .nvmrc 指定的 Node 版本（缺版本則自動安裝）
#  ‧ 從 PATH 中剔除 /mnt/c/... 的 Windows Node，避免誤用 Windows 版而走回頭路
#  ‧ 釋放被佔用的埠（預設 3001；可由 DEV_PORT / PORT 覆寫）
#  ‧ 偵測 WSL，啟用 Watchpack/Chokidar polling 以解決 9P 共享路徑檔案監控問題
#  ‧ 直接啟動 next dev（不再透過 npm/cmd，避免多層跨環境包殼）
# =============================================================================
set -euo pipefail

PORT="${DEV_PORT:-${PORT:-3001}}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

log() { printf '[dev-wsl] %s\n' "$*"; }
err() { printf '[dev-wsl] %s\n' "$*" >&2; }

# -----------------------------------------------------------------------------
# 1) 載入 nvm 並對齊 .nvmrc 版本
# -----------------------------------------------------------------------------
# 注意：nvm.sh 在 source 時會跑 nvm_auto use（自動切版），其內部某些路徑會回傳
# 非零；如果我們的 set -e 在 source 期間生效，整支腳本會被 nvm 內部錯誤直接中斷
# 而沒有任何訊息。所以暫時關閉 errexit / nounset，載完再恢復。
if [ -s "$HOME/.nvm/nvm.sh" ]; then
  set +eu
  # shellcheck disable=SC1091
  . "$HOME/.nvm/nvm.sh" || true
  if [ -f .nvmrc ]; then
    if ! nvm use --silent >/dev/null 2>&1; then
      log "依 .nvmrc 安裝缺少的 Node 版本…"
      nvm install || true
      nvm use --silent || true
    fi
  fi
  set -eu
fi

# -----------------------------------------------------------------------------
# 2) 從 PATH 移除 Windows 版 Node / npm，避免被誤抓
# -----------------------------------------------------------------------------
CLEAN_PATH=""
IFS=':' read -ra _PARTS <<<"$PATH"
for _p in "${_PARTS[@]}"; do
  case "$_p" in
    /mnt/c/Program\ Files/nodejs|/mnt/c/Program\ Files/nodejs/*) ;;
    /mnt/c/nvm4w*) ;;
    /mnt/c/Users/*/AppData/Roaming/npm) ;;
    /mnt/c/Users/*/AppData/Local/nvm*) ;;
    *) CLEAN_PATH="${CLEAN_PATH:+$CLEAN_PATH:}$_p" ;;
  esac
done
export PATH="$CLEAN_PATH"

# -----------------------------------------------------------------------------
# 3) 後備 Node：若還沒有 Linux Node，嘗試用 ~/.local/nodejs/* 內任一版本
# -----------------------------------------------------------------------------
if ! command -v node >/dev/null 2>&1; then
  for _cand in "$HOME"/.local/nodejs/*/bin; do
    if [ -x "$_cand/node" ]; then
      export PATH="$_cand:$PATH"
      break
    fi
  done
fi

if ! command -v node >/dev/null 2>&1; then
  err "找不到 Linux 版 Node。請先執行：bash scripts/setup-wsl.sh"
  exit 127
fi

NODE_BIN="$(command -v node)"
log "node = $NODE_BIN ($($NODE_BIN -v))"
log "npm  = $(command -v npm) ($(npm -v))"

# -----------------------------------------------------------------------------
# 4) 釋放佔用埠
# -----------------------------------------------------------------------------
free_port() {
  local p="$1"
  local pids=""
  if command -v lsof >/dev/null 2>&1; then
    pids="$(lsof -ti:"$p" -sTCP:LISTEN 2>/dev/null || true)"
  elif command -v fuser >/dev/null 2>&1; then
    pids="$(fuser -n tcp "$p" 2>/dev/null | tr -s ' ' '\n' | sed '/^$/d' || true)"
  fi
  if [ -n "$pids" ]; then
    log "結束佔用埠 $p 的行程：$pids"
    kill -9 $pids 2>/dev/null || true
  fi
}
free_port "$PORT"

# -----------------------------------------------------------------------------
# 5) WSL 偵測 → 啟用 polling 模式
# -----------------------------------------------------------------------------
if grep -qiE 'microsoft|wsl' /proc/sys/kernel/osrelease 2>/dev/null; then
  if [ "${WATCHPACK_NO_POLL:-0}" != "1" ]; then
    : "${WATCHPACK_POLLING:=true}"
    : "${CHOKIDAR_USEPOLLING:=true}"
    export WATCHPACK_POLLING CHOKIDAR_USEPOLLING
    log "偵測到 WSL，啟用 Watchpack / Chokidar polling（如要關閉設 WATCHPACK_NO_POLL=1）"
  fi
fi

# -----------------------------------------------------------------------------
# 6) 確認依賴存在
# -----------------------------------------------------------------------------
if [ ! -d node_modules/next ]; then
  log "尚未安裝相依套件，自動執行 npm install…"
  npm install
fi

# -----------------------------------------------------------------------------
# 7) 啟動 Next.js dev server
# -----------------------------------------------------------------------------
log "啟動 Next.js dev server，埠 $PORT"
exec node ./node_modules/next/dist/bin/next dev -p "$PORT"

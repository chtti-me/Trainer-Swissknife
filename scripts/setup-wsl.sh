#!/usr/bin/env bash
# =============================================================================
#  scripts/setup-wsl.sh
#  在 WSL（Windows Subsystem for Linux，Windows 內的 Linux 子系統）內一次性
#  完成下列環境準備：
#    1. 安裝 nvm（Node Version Manager，Node 版本管理器）
#    2. 安裝 .nvmrc 指定的 Node（缺值時退回 22）
#    3. npm install 安裝專案相依套件
#  跑完後即可在 WSL 或 Windows 終端執行 npm run dev。
# =============================================================================
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

log() { printf '[setup-wsl] %s\n' "$*"; }
err() { printf '[setup-wsl] %s\n' "$*" >&2; }

if ! grep -qiE 'microsoft|wsl' /proc/sys/kernel/osrelease 2>/dev/null; then
  err "本腳本應在 WSL Ubuntu 內執行。"
  exit 1
fi

# -----------------------------------------------------------------------------
# 1) 安裝 nvm（無 sudo）
# -----------------------------------------------------------------------------
if [ ! -s "$HOME/.nvm/nvm.sh" ]; then
  log "安裝 nvm（Node Version Manager）…"
  if ! command -v curl >/dev/null 2>&1; then
    err "找不到 curl，請先以系統管理員手動安裝（sudo apt-get install curl）。"
    exit 1
  fi
  curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
fi

# shellcheck disable=SC1091
. "$HOME/.nvm/nvm.sh"

# -----------------------------------------------------------------------------
# 2) 套用 .nvmrc 版本（缺值時 fallback 22）
# -----------------------------------------------------------------------------
if [ -f .nvmrc ]; then
  log "依 .nvmrc 安裝 Node…"
  nvm install
  nvm use --silent
else
  log ".nvmrc 不存在，安裝 Node 22 LTS（Long Term Support，長期支援版）…"
  nvm install 22
  nvm use 22
fi

log "node = $(command -v node) ($(node -v))"
log "npm  = $(command -v npm) ($(npm -v))"

# -----------------------------------------------------------------------------
# 3) 安裝相依套件
# -----------------------------------------------------------------------------
if [ ! -d node_modules ] || [ ! -d node_modules/next ]; then
  log "執行 npm install …"
  npm install
else
  log "node_modules 已存在，略過 npm install（如要重裝請先刪除 node_modules）"
fi

log "完成 ✅  接下來執行：npm run dev"

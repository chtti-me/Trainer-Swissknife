/**
 * 【開發伺服器啟動器 v4.0】
 *
 * 設計目標：
 *   ‧ Windows 本機路徑（如 X:\...\Trainer-Swissknife）→ 直接用本機 Node 執行 next dev
 *   ‧ Linux / WSL 終端 → 仍交給 scripts/dev-wsl.sh（nvm、PATH 清理、polling）
 *
 * 若專案仍在 \\wsl.localhost\... 或 WSL 映射磁碟上，會提示並可選啟用 polling。
 *
 * 環境變數：
 *   DEV_PORT / PORT          指定埠（預設 3001）
 *   WATCHPACK_NO_POLL=1      關閉 Watchpack polling
 *   WATCHPACK_POLLING        強制啟用 polling（覆寫自動偵測）
 */
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { loadProjectEnv } from "./load-project-env.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadProjectEnv(root);
const port = Number(process.env.DEV_PORT || process.env.PORT || 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error("[dev] DEV_PORT / PORT 必須為 1–65535 的整數。");
  process.exit(1);
}

const childEnv = {
  ...process.env,
  DEV_PORT: String(port),
  PORT: String(port),
};

function log(msg) {
  console.log(`[dev] ${msg}`);
}

function isWslSharedWindowsPath(p) {
  if (process.platform !== "win32") return false;
  const norm = p.replace(/\//g, "\\");
  if (/^\\\\wsl(?:\.localhost|\$)/i.test(norm)) return true;
  if (/[\\/]wsl[$.]/i.test(norm)) return true;
  const drive = norm.match(/^([A-Z]):/i);
  if (!drive) return false;
  const remote = queryDriveRemote(drive[1]);
  return Boolean(remote && /^\\\\wsl(?:\.localhost|\$)/i.test(remote));
}

function queryDriveRemote(drive) {
  const ps = spawnSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      `(Get-PSDrive -Name '${drive}' -ErrorAction SilentlyContinue).DisplayRoot`,
    ],
    { encoding: "utf8", windowsHide: true },
  );
  if (ps.status === 0) {
    const out = (ps.stdout || "").trim();
    if (out) return out;
  }
  const r = spawnSync("cmd.exe", ["/c", "net", "use", `${drive}:`], {
    encoding: "utf8",
    windowsHide: true,
  });
  if (r.status !== 0) return null;
  const m = (r.stdout || "").match(/\\\\[^\s]+/);
  return m ? m[0] : null;
}

function applyPollingEnvIfNeeded() {
  if (process.env.WATCHPACK_NO_POLL === "1") return;
  const force =
    process.env.WATCHPACK_POLLING === "true" ||
    process.env.CHOKIDAR_USEPOLLING === "true";
  const onWslShare =
    process.platform === "win32" && isWslSharedWindowsPath(root);
  if (!force && !onWslShare) return;
  childEnv.WATCHPACK_POLLING = "true";
  childEnv.CHOKIDAR_USEPOLLING = "true";
  if (onWslShare) {
    log(
      "偵測到 WSL 共享路徑，啟用 Watchpack / Chokidar polling（關閉請設 WATCHPACK_NO_POLL=1）",
    );
  }
}

function freePortWin(p) {
  const r = spawnSync("netstat", ["-ano"], {
    encoding: "utf8",
    windowsHide: true,
  });
  if (r.status !== 0) return;
  const re = new RegExp(`[:\\.]${p}\\s+\\S+\\s+\\S+\\s+LISTENING\\s+(\\d+)`, "i");
  const pids = new Set();
  for (const line of (r.stdout || "").split(/\r?\n/)) {
    const m = line.match(re);
    if (m) pids.add(m[1]);
  }
  for (const pid of pids) {
    log(`結束佔用埠 ${p} 的行程 PID ${pid}`);
    spawnSync("taskkill", ["/F", "/PID", pid], {
      stdio: "ignore",
      windowsHide: true,
    });
  }
}

function ensureNextInstalled() {
  if (fs.existsSync(path.join(root, "node_modules", "next"))) return;
  log("尚未安裝相依套件，執行 npm install…");
  const inst = spawnSync("npm", ["install"], {
    cwd: root,
    stdio: "inherit",
    shell: true,
    env: childEnv,
  });
  if (inst.status !== 0) process.exit(inst.status ?? 1);
}

function runNextDevWindows() {
  applyPollingEnvIfNeeded();
  freePortWin(port);
  ensureNextInstalled();

  const nodeBin = process.execPath;
  log(`node = ${nodeBin} (${process.version})`);
  log(`啟動 Next.js dev server（Windows 本機），埠 ${port}`);

  const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");
  const child = spawn(nodeBin, [nextBin, "dev", "-p", String(port)], {
    stdio: "inherit",
    cwd: root,
    env: childEnv,
    windowsHide: false,
  });
  child.on("exit", (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    process.exit(code ?? 1);
  });
}

// ---------------------------------------------------------------------------
// Windows：本機 Node 直接跑 next dev
// ---------------------------------------------------------------------------
if (process.platform === "win32") {
  runNextDevWindows();
} else {
  // -------------------------------------------------------------------------
  // Linux / WSL：交給 dev-wsl.sh（nvm、剔除 /mnt/c Node、polling 等）
  // -------------------------------------------------------------------------
  const script = path.join(root, "scripts", "dev-wsl.sh");
  try {
    if (fs.existsSync(script)) {
      const stat = fs.statSync(script);
      if (!(stat.mode & 0o111)) fs.chmodSync(script, stat.mode | 0o755);
    }
  } catch {
    /* 非致命 */
  }
  const child = spawn("bash", [script], {
    stdio: "inherit",
    cwd: root,
    env: childEnv,
  });
  child.on("exit", (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    process.exit(code ?? 1);
  });
}

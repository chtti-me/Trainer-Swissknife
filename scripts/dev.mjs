/**
 * 【開發伺服器啟動器 v2.0】
 * 啟動前先釋放指定埠（預設 3001），再執行 next dev -p <port>，
 * 避免舊行程佔用埠而落到 3002、3003…（3000 常留給 Open WebUI 等服務）
 *
 * 覆寫埠號：DEV_PORT=3005 npm run dev
 * 略過清埠（不建議）：npm run dev:raw
 */
import { spawn, execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.DEV_PORT || process.env.PORT || 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error("dev.mjs：DEV_PORT / PORT 必須為 1–65535 的整數。");
  process.exit(1);
}

function killListenersWindows(p) {
  let out;
  try {
    out = execSync("netstat -ano", { encoding: "utf8" });
  } catch {
    return;
  }
  const pids = new Set();
  for (const line of out.split(/\r?\n/)) {
    if (!line.includes("LISTENING")) continue;
    const parts = line.trim().split(/\s+/);
    if (parts.length < 5) continue;
    const local = parts[1];
    const pid = parts[parts.length - 1];
    const m = local.match(/:(\d+)$/);
    if (!m || Number(m[1]) !== p) continue;
    if (!/^\d+$/.test(pid)) continue;
    pids.add(pid);
  }
  for (const pid of pids) {
    try {
      execSync(`taskkill /F /PID ${pid}`, { stdio: "inherit" });
      console.log(`[dev.mjs] 已結束佔用埠 ${p} 的行程 PID ${pid}（Windows）`);
    } catch {
      console.warn(`[dev.mjs] 無法結束 PID ${pid}，可能需自行以系統管理員身分處理。`);
    }
  }
}

function killListenersUnix(p) {
  try {
    const txt = execSync(`lsof -ti:${p} -sTCP:LISTEN`, {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    if (!txt) return;
    const pids = [...new Set(txt.split(/\n/).filter(Boolean))];
    for (const pid of pids) {
      try {
        execSync(`kill -9 ${pid}`, { stdio: "inherit" });
        console.log(`[dev.mjs] 已結束佔用埠 ${p} 的行程 PID ${pid}（Unix）`);
      } catch {
        console.warn(`[dev.mjs] 無法結束 PID ${pid}。`);
      }
    }
  } catch {
    // 無 lsof、或無人監聽該埠
  }
}

function freePort(p) {
  if (process.platform === "win32") killListenersWindows(p);
  else killListenersUnix(p);
}

freePort(port);

const nextCli = path.join(root, "node_modules", "next", "dist", "bin", "next");
const child = spawn(process.execPath, [nextCli, "dev", "-p", String(port)], {
  stdio: "inherit",
  cwd: root,
  env: process.env,
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});

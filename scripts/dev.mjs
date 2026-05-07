/**
 * 【跨環境開發伺服器啟動器 v3.0】
 *
 * 設計目標：不論使用者從 Windows 終端、PowerShell、或 WSL（Windows Subsystem
 * for Linux，Windows 內的 Linux 子系統）終端執行 `npm run dev`，都自動走進
 * WSL Ubuntu 內、用 Linux 版 Node 執行 next dev，避免歷次出現的：
 *
 *   ‧ cmd.exe 不支援 UNC（Universal Naming Convention，網路共享路徑）為 cwd
 *   ‧ Windows Node 監控 9P（WSL 共享協定）檔案系統卡死、不出 Ready 訊息
 *   ‧ WSL 內誤抓 /mnt/c/.../nodejs/npm 又繞回 Windows
 *
 * 行為：
 *   ‧ 若目前在 Linux/WSL 內 → 直接 exec scripts/dev-wsl.sh
 *   ‧ 若目前在 Windows 上   → 解析專案的 Linux 路徑，spawn wsl.exe --cd 進入
 *                              對應發行版後 exec scripts/dev-wsl.sh
 *
 * 環境變數：
 *   DEV_PORT / PORT          指定埠（預設 3001）
 *   WSL_DISTRO               指定要進入的 WSL 發行版（預設 Ubuntu-24.04）
 *   WATCHPACK_NO_POLL=1      關閉 Watchpack polling（預設於 WSL 啟用）
 */
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.DEV_PORT || process.env.PORT || 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error("[dev] DEV_PORT / PORT 必須為 1–65535 的整數。");
  process.exit(1);
}

const childEnv = { ...process.env, DEV_PORT: String(port) };

/**
 * Windows → WSL 轉送時用的「乾淨」env：
 * 移除會被 wsl.exe 自動路徑翻譯（PATH/WSLENV）誤判的 Windows 形式 PATH，
 * 只保留 DEV_PORT、WATCHPACK_NO_POLL 等少量變數。
 * 多數 npm 注入的變數（npm_*, INIT_CWD, PATH 含 node_modules\.bin 等）若一起轉送，
 * 會讓 wsl.exe 噴 "UtilTranslatePathList: Failed to translate ..." 而中止。
 */
function buildWindowsToWslEnv() {
  const allow = new Set([
    "DEV_PORT",
    "PORT",
    "WSL_DISTRO",
    "WATCHPACK_POLLING",
    "WATCHPACK_NO_POLL",
    "CHOKIDAR_USEPOLLING",
    "NEXT_TELEMETRY_DISABLED",
    "SystemRoot",
    "SYSTEMROOT",
    "WINDIR",
    "USERPROFILE",
    "TEMP",
    "TMP",
  ]);
  const out = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (allow.has(k) && v !== undefined) out[k] = v;
  }
  out.DEV_PORT = String(port);
  // 重點：強制覆寫 Path / PATH，移除 npm 注入的 U:\...\node_modules\.bin 系列。
  // wsl.exe 啟動時會做 Windows PATH → Linux PATH 翻譯（appendWindowsPath 機制），
  // 任何它無法用 wslpath 解析的條目（U:、Z: 等映射磁碟）都會讓 wsl.exe 直接 abort。
  const sysRoot = process.env.SystemRoot || process.env.SYSTEMROOT || "C:\\Windows";
  const safePath = [
    `${sysRoot}\\System32`,
    sysRoot,
    `${sysRoot}\\System32\\Wbem`,
    `${sysRoot}\\System32\\WindowsPowerShell\\v1.0\\`,
  ].join(";");
  out.Path = safePath;
  out.PATH = safePath;
  // 透過 WSLENV 把允許的變數帶入 WSL
  out.WSLENV = [
    "DEV_PORT",
    "PORT",
    "WSL_DISTRO",
    "WATCHPACK_POLLING",
    "WATCHPACK_NO_POLL",
    "CHOKIDAR_USEPOLLING",
    "NEXT_TELEMETRY_DISABLED",
  ].join(":");
  return out;
}

// ---------------------------------------------------------------------------
// 1) Linux / WSL 內：直接交給 scripts/dev-wsl.sh
// ---------------------------------------------------------------------------
if (process.platform !== "win32") {
  const script = path.join(root, "scripts", "dev-wsl.sh");
  const child = spawn("bash", [script], {
    stdio: "inherit",
    cwd: root,
    env: childEnv,
  });
  child.on("exit", (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    process.exit(code ?? 1);
  });
} else {
  // -------------------------------------------------------------------------
  // 2) Windows：透過 wsl.exe 進入發行版執行 dev-wsl.sh
  // -------------------------------------------------------------------------
  const distro = process.env.WSL_DISTRO || "Ubuntu-24.04";
  const linuxRoot = resolveLinuxPath(root, distro);
  if (!linuxRoot) {
    console.error(
      "[dev] 無法解析專案在 WSL 內的 Linux 路徑。\n" +
        "      請確認專案位於 WSL 檔案系統，或設定環境變數 WSL_DISTRO 指定發行版。",
    );
    process.exit(1);
  }
  console.log(`[dev] 從 Windows 轉送進 WSL（${distro}）：${linuxRoot}`);
  // cwd 強制設為 C:\，避免父行程的 UNC cwd 導致 spawn 失敗
  const args = [
    "-d",
    distro,
    "--cd",
    linuxRoot,
    "--",
    "bash",
    "scripts/dev-wsl.sh",
  ];
  const child = spawn("wsl.exe", args, {
    stdio: "inherit",
    cwd: "C:\\",
    env: buildWindowsToWslEnv(),
    windowsHide: false,
  });
  child.on("exit", (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    process.exit(code ?? 1);
  });
}

// ===========================================================================
// helpers
// ===========================================================================

/**
 * 解析 Windows 看到的專案路徑，得到對應的 WSL Linux 絕對路徑。
 *
 * 解析順序：
 *   1) UNC：\\wsl.localhost\<distro>\rest 或 \\wsl$\<distro>\rest
 *   2) 映射磁碟（mapped drive，如 U:、Z:）：透過 `net use` 查 RemoteName，
 *      若指向 WSL UNC 則組成 Linux 路徑；
 *   3) 透過 wsl.exe + wslpath -u 轉換（適用於專案位於 Windows 本機 fs 時）。
 */
function resolveLinuxPath(winPath, distro) {
  // (1) UNC
  const wslMatch = winPath.match(
    /^[\\/]{2}wsl(?:\.localhost|\$)[\\/]([^\\/]+)[\\/](.*)$/i,
  );
  if (wslMatch) {
    return "/" + wslMatch[2].replace(/\\/g, "/").replace(/\/+$/, "");
  }

  // (2) 映射磁碟
  const driveMatch = winPath.match(/^([A-Z]):[\\/](.*)$/i);
  if (driveMatch) {
    const [, drive, rest] = driveMatch;
    const remote = queryDriveRemote(drive);
    if (remote) {
      const remoteWslMatch = remote.match(
        /^[\\/]{2}wsl(?:\.localhost|\$)[\\/]([^\\/]+)[\\/]?(.*)$/i,
      );
      if (remoteWslMatch) {
        const remoteRest = (remoteWslMatch[2] || "").replace(/\\/g, "/");
        const restNorm = rest.replace(/\\/g, "/");
        const joined = (
          "/" +
          [remoteRest, restNorm].filter(Boolean).join("/")
        ).replace(/\/+/g, "/");
        return joined.replace(/\/+$/, "") || "/";
      }
    }
  }

  // (3) wslpath fallback（含一些保護：忽略 wslpath 的錯誤輸出格式）
  const result = spawnSync(
    "wsl.exe",
    ["-d", distro, "--", "wslpath", "-u", winPath],
    { encoding: "utf8" },
  );
  if (result.status !== 0) return null;
  const linuxPath = (result.stdout || "").trim();
  if (!linuxPath) return null;
  // wslpath 對未知磁碟代號會原樣印回（甚至帶 "wslpath: " 前綴），這類視為失敗
  if (
    /^wslpath:/i.test(linuxPath) ||
    /^[A-Z]:/i.test(linuxPath) ||
    !linuxPath.startsWith("/")
  ) {
    return null;
  }
  if (linuxPath.startsWith("/mnt/")) {
    console.warn(
      "[dev] 偵測到專案位於 Windows 本機檔案系統 (" +
        linuxPath +
        ")\n" +
        "      建議：(a) 仍從 WSL 內以 npm run dev 啟動，或 (b) 將專案移至 ~/ 下的 Linux 檔案系統。",
    );
  }
  return linuxPath;
}

/**
 * 查詢 Windows 映射磁碟（mapped drive）對應的 RemoteName。
 * 例：drive="U" → "\\wsl.localhost\Ubuntu-24.04"
 * 用 `net use <drive>:` 解析。語系會影響欄位文字，因此用 cp437/英文模式。
 */
function queryDriveRemote(drive) {
  // 嘗試方法 a：PowerShell Get-PSDrive
  const ps = spawnSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      `(Get-PSDrive -Name '${drive}' -ErrorAction SilentlyContinue).DisplayRoot`,
    ],
    { encoding: "utf8" },
  );
  if (ps.status === 0) {
    const out = (ps.stdout || "").trim();
    if (out) return out;
  }
  // 方法 b：net use（後備）
  const r = spawnSync("cmd.exe", ["/c", "net", "use", `${drive}:`], {
    encoding: "utf8",
  });
  if (r.status !== 0) return null;
  // 解析輸出中第一個出現的 \\... 字串作為 RemoteName
  const m = (r.stdout || "").match(/\\\\[^\s]+/);
  return m ? m[0] : null;
}

// 確保腳本可被執行（於 Linux 端 chmod；於 Windows 由 bash 直接執行也 OK）
try {
  const sh = path.join(root, "scripts", "dev-wsl.sh");
  if (process.platform !== "win32" && fs.existsSync(sh)) {
    const stat = fs.statSync(sh);
    if (!(stat.mode & 0o111)) fs.chmodSync(sh, stat.mode | 0o755);
  }
} catch {
  /* 非致命 */
}

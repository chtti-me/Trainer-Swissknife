/**
 * 【Next.js 設定】
 * 例如 Server Actions 上傳大小上限。部署時 Next 會讀這份檔。
 */
import type { NextConfig } from "next";

// 在 Windows 把專案放在 WSL 9P 共享路徑（U:\home\... 之類）時，fs.watch 會狂噴 EISDIR；
// 這時改用 polling 模式來監聽檔案變更（CPU 多一點，但能跑）。
const cwd = process.cwd();
const isWslSharedPath =
  process.platform === "win32" &&
  (/[\\/]wsl[$.]/i.test(cwd) || /WSL/i.test(cwd) || cwd.startsWith("\\\\wsl"));

const nextConfig: NextConfig = {
  /** 避免 Prisma 被編進各 API route 區塊而產生多份／過期 Client，造成模型委派為 undefined */
  serverExternalPackages: ["@prisma/client", "prisma"],
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  webpack: (config, { dev, isServer }) => {
    if (dev && isWslSharedPath) {
      config.watchOptions = {
        ...config.watchOptions,
        poll: 1500,
        aggregateTimeout: 300,
        ignored: ["**/node_modules/**", "**/.next/**", "**/.git/**"],
      };
    }
    // 讓 client bundle 安全處理某些只在 Node 環境有效的內建模組
    // （如 pptxgenjs 內部 dynamic import("node:fs") / "node:https"）
    if (!isServer) {
      config.resolve = config.resolve ?? {};
      config.resolve.fallback = {
        ...(config.resolve.fallback ?? {}),
        fs: false,
        path: false,
        https: false,
        http: false,
      };
      config.externals = [
        ...(Array.isArray(config.externals) ? config.externals : []),
        // node: 開頭的 ESM 規範 builtin import：在 client 不存在，輸出空模組
        ({ request }: { request?: string }, callback: (err?: Error | null, result?: string) => void) => {
          if (request && /^node:/.test(request)) {
            return callback(null, "var {}");
          }
          callback();
        },
      ];
    }
    return config;
  },
};

export default nextConfig;

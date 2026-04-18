/**
 * 【Next.js 設定】
 * 例如 Server Actions 上傳大小上限。部署時 Next 會讀這份檔。
 */
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /** 避免 Prisma 被編進各 API route 區塊而產生多份／過期 Client，造成模型委派為 undefined */
  serverExternalPackages: ["@prisma/client", "prisma"],
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;

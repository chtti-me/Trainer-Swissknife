/**
 * 【資料庫連線（Prisma Client）】
 * 全專案共用一個連線物件，開發模式下重複使用同一個實例，避免連線爆量。
 * 比喻：全公司共用一條對資料庫的「專線」，不要每人每請求都拉新線。
 *
 * 須搭配 next.config 的 `serverExternalPackages: ['@prisma/client']`，否則各 API route
 * 可能各自打包出不同版本的 Prisma，導致 `prisma.aiGlobalSkillDefinition` 等為 undefined。
 *
 * 若仍偵測到「缺模型委派」的實例，會斷線並重建；若重建後仍缺，代表需執行 `prisma generate`。
 */
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function newPrismaClient() {
  return new PrismaClient();
}

/** 與目前 schema 不一致的 Client（例如 generate 新增模型後的快取實例） */
function isMissingAiSkillDelegates(client: PrismaClient): boolean {
  const d = client as unknown as { aiGlobalSkillDefinition?: { findMany: unknown } };
  return typeof d.aiGlobalSkillDefinition === "undefined";
}

function getPrisma(): PrismaClient {
  let p = globalForPrisma.prisma;
  if (p && isMissingAiSkillDelegates(p)) {
    void p.$disconnect().catch(() => {});
    globalForPrisma.prisma = undefined;
    p = undefined;
  }
  if (!p) {
    p = newPrismaClient();
    if (isMissingAiSkillDelegates(p)) {
      throw new Error(
        "Prisma Client 與 schema 不一致：請在專案根目錄執行 `npx prisma generate`，並重新啟動 Next.js（next dev / next start）。"
      );
    }
    if (process.env.NODE_ENV !== "production") {
      globalForPrisma.prisma = p;
    }
  }
  return p;
}

export const prisma = getPrisma();

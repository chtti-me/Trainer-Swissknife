/**
 * 把 `default-global-ai-skills-data.ts` 的內容**冪等地**推進資料庫。
 * - 已存在的 slug：若最新版內容與檔案不同，新建一個 version（versionNo+1，舊版保留）
 * - 不存在的 slug：建立 definition + version 1
 * 不會刪除任何資料，可重複執行。
 *
 * 執行：`npm run db:upsert:ai-global`
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { DEFAULT_GLOBAL_AI_SKILLS } from "./default-global-ai-skills-data";

const prisma = new PrismaClient();

async function main() {
  let created = 0;
  let updated = 0;
  let unchanged = 0;

  for (const row of DEFAULT_GLOBAL_AI_SKILLS) {
    const def = await prisma.aiGlobalSkillDefinition.upsert({
      where: { slug: row.slug },
      update: { title: row.title, sortOrder: row.sortOrder },
      create: { slug: row.slug, title: row.title, sortOrder: row.sortOrder },
    });

    const latest = await prisma.aiGlobalSkillVersion.findFirst({
      where: { definitionId: def.id },
      orderBy: { versionNo: "desc" },
    });

    if (!latest) {
      await prisma.aiGlobalSkillVersion.create({
        data: { definitionId: def.id, versionNo: 1, content: row.content },
      });
      created++;
      console.log(`✅ 新建 ${row.slug}（version 1）`);
      continue;
    }

    if (latest.content === row.content) {
      unchanged++;
      console.log(`= 未變更 ${row.slug}（最新版 v${latest.versionNo}）`);
      continue;
    }

    await prisma.aiGlobalSkillVersion.create({
      data: {
        definitionId: def.id,
        versionNo: latest.versionNo + 1,
        content: row.content,
      },
    });
    updated++;
    console.log(`↑ 更新 ${row.slug}（v${latest.versionNo} → v${latest.versionNo + 1}）`);
  }

  console.log(
    `\n完成。新建 ${created}、更新 ${updated}、未變更 ${unchanged}（共 ${DEFAULT_GLOBAL_AI_SKILLS.length} 筆）。`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

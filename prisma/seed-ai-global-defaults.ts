/**
 * 若資料庫尚無任何「全院 AI 技能」定義，則寫入預設 slug 與第 1 版占位內容。
 * 執行：`npm run db:seed:ai-global`（不刪除其他資料）。
 */
import { PrismaClient } from "@prisma/client";
import { DEFAULT_GLOBAL_AI_SKILLS } from "./default-global-ai-skills-data";

const prisma = new PrismaClient();

async function main() {
  const n = await prisma.aiGlobalSkillDefinition.count();
  if (n > 0) {
    console.log(`已存在 ${n} 筆全院 AI 技能，略過。`);
    return;
  }
  for (const row of DEFAULT_GLOBAL_AI_SKILLS) {
    const def = await prisma.aiGlobalSkillDefinition.create({
      data: { slug: row.slug, title: row.title, sortOrder: row.sortOrder },
    });
    await prisma.aiGlobalSkillVersion.create({
      data: { definitionId: def.id, versionNo: 1, content: row.content },
    });
  }
  console.log(`✅ 已建立 ${DEFAULT_GLOBAL_AI_SKILLS.length} 筆預設全院 AI 技能。`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

/**
 * 補齊「課程規劃」相關全院 AI 技能（planning_* 中較晚新增之 slug）。
 * 若 slug 已存在則略過，不覆寫管理員已編修之內容。
 * 執行：`npm run db:seed:planning-skills`
 */
import { PrismaClient } from "@prisma/client";
import { DEFAULT_GLOBAL_AI_SKILLS } from "./default-global-ai-skills-data";

const prisma = new PrismaClient();

/** 僅補齊此批（與 default-global 內 slug 一致） */
const UPSERT_SLUGS = new Set([
  "planning_outline",
  "planning_lesson_slides",
  "planning_activities",
  "planning_assessment",
  "planning_logistics",
]);

async function main() {
  const rows = DEFAULT_GLOBAL_AI_SKILLS.filter((r) => UPSERT_SLUGS.has(r.slug));
  let created = 0;
  for (const row of rows) {
    const exists = await prisma.aiGlobalSkillDefinition.findUnique({ where: { slug: row.slug } });
    if (exists) {
      console.log(`略過（已存在）: ${row.slug}`);
      continue;
    }
    const def = await prisma.aiGlobalSkillDefinition.create({
      data: { slug: row.slug, title: row.title, sortOrder: row.sortOrder },
    });
    await prisma.aiGlobalSkillVersion.create({
      data: { definitionId: def.id, versionNo: 1, content: row.content },
    });
    created += 1;
    console.log(`✅ 已建立: ${row.slug}`);
  }
  console.log(`完成：新建 ${created} 筆，其餘已存在或不在清單內。`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

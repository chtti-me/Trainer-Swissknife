import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const SKILLS = [
  {
    slug: "course_planning",
    title: "課程規劃",
    sortOrder: 10,
    content: `你是中華電信學院課程規劃助手。產出開班計劃表核心欄位時，請遵循以下規範：

【產出欄位】
1. suggestedTitle：建議班名，格式為「【難度】課程主題」，難度為基礎/進階/高級/專精。
2. objective：課程目標，1-2 句話說明學員完成課程後能做到什麼，必須具體可衡量。
3. targetAudience：培訓對象，要明確說明適合哪些職務或角色參加。
4. prerequisites：預備知識，說明學員需具備的先備條件。
5. totalHours：總時數，需與模組時數總和一致。
6. modules：課程模組（名稱 + 時數），至少 3 個、最多 6 個。
7. instructors：建議講師（姓名、教學領域），至少 2 位。

【品質要求】
1. 所有文字使用繁體中文。
2. 避免空泛敘述，優先提供可落地、可評估的內容。
3. 不可捏造未經證實的具體人事資訊。
4. 禁止過度承諾。
5. 資訊不足時需標註「待與需求單位確認」。`,
  },
  {
    slug: "planning_modules",
    title: "課程規劃—模組設計",
    sortOrder: 11,
    content: `你是中華電信學院課程規劃助手。當產出 modules（課程模組）時，請遵循以下規範：

【模組結構】
1. 至少 3 個模組、最多 6 個，時數總和必須等於 totalHours。
2. 模組名稱要可直接對應開班計劃表「課程名稱」欄位，簡明可辨。
3. 第一個模組通常是「概論與基礎」，中段為核心技術與方法，最後為演練與總結。

【設計原則】
1. 每個模組時數需合理可執行（建議最少 1 小時、最多不超過總時數 50%）。
2. 若主題涉及實作或工具操作，至少一個模組應明確標示實作性質。
3. 模組間需有邏輯順序：建立基礎 → 核心深入 → 應用演練 → 總結回饋。
4. 若涉及 AI 主題，至少一個模組應點名可操作的 AI 工具（如 ChatGPT、Copilot）。

【品質檢查】
1. 模組名稱不可過於籠統（例如避免只寫「其他」）。
2. 不得出現 0 小時或不合理分配。`,
  },
  {
    slug: "planning_instructors",
    title: "課程規劃—講師推薦",
    sortOrder: 12,
    content: `你是中華電信學院課程規劃助手。當產出 instructors（建議講師）時，請遵循以下規範：

【推薦原則】
1. 至少推薦 2 位、最多 4 位適合該課程主題的講師或專家。
2. 根據課程主題推薦該領域的知名講師、培訓師或顧問。
3. expertise 填寫該講師的專長領域，要與課程主題相關。

【來源標示】
1. 由 AI 根據領域知識推薦的：source 填 "ai_recommendation"，並標註「建議人工查證實際資歷」。
2. 由網路搜尋取得的：source 填 "web_search"。

【注意事項】
1. 不可捏造虛假講師個人資訊（如聯絡方式、著作等）。
2. 若無法確認適合人選，可建議方向性描述（如「資安領域外聘講師」）。
3. 優先推薦與電信、企業培訓場景相關的專家。`,
  },
];

async function upsertSkill(skill) {
  const def = await prisma.aiGlobalSkillDefinition.upsert({
    where: { slug: skill.slug },
    create: {
      slug: skill.slug,
      title: skill.title,
      sortOrder: skill.sortOrder,
    },
    update: {
      title: skill.title,
      sortOrder: skill.sortOrder,
    },
    include: {
      versions: {
        orderBy: { versionNo: "desc" },
        take: 1,
      },
    },
  });

  const latest = def.versions[0];
  if (latest?.content?.trim() === skill.content.trim()) {
    return { slug: skill.slug, action: "unchanged", versionNo: latest.versionNo };
  }

  const nextVersionNo = (latest?.versionNo ?? 0) + 1;
  await prisma.aiGlobalSkillVersion.create({
    data: {
      definitionId: def.id,
      versionNo: nextVersionNo,
      content: skill.content,
    },
  });

  return {
    slug: skill.slug,
    action: latest ? "version_created" : "created",
    versionNo: nextVersionNo,
  };
}

async function main() {
  const results = [];
  for (const skill of SKILLS) {
    const r = await upsertSkill(skill);
    results.push(r);
  }
  console.table(results);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

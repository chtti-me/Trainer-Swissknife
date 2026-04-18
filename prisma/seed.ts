/**
 * 【資料庫種子腳本】
 * 清空後重建測試用使用者、班次（來自 y115-open-classes.json）、培訓師名冊等。
 * 執行：`npm run db:seed`。比喻：樣品屋裝潢——一次放好示範家具方便試住。
 */
import * as fs from "fs";
import * as path from "path";
import { PrismaClient } from "@prisma/client";
import {
  inferCategoryFromClassName,
  prismaFieldsFromTisClassCode,
  tisDifficultyDigitToLevel,
  tisVenueCodeToCampus,
  tisVenueCodeToDeliveryMode,
} from "../src/lib/tis-class-code";
import { isLedByHuangJianhao } from "../src/lib/trainer-huang";
import { DEFAULT_GLOBAL_AI_SKILLS } from "./default-global-ai-skills-data";

const prisma = new PrismaClient();

/** 民國 115 年對應西元開班日（與 TIS yy=2026 一致） */
const ROC115_AD_YEAR = 2026;

type Y115JsonRow = {
  classCode: string;
  className: string;
  rocDate: string;
  seq: string;
  department: string | null;
  campusFromSection: string;
  statusRaw: string;
  mentorName: string | null;
  enrolledCount: number | null;
  isPlanClass: boolean;
  tags: string[];
  sourceFile: string;
};

function loadY115Rows(): Y115JsonRow[] {
  const jsonPath = path.join(__dirname, "data", "y115-open-classes.json");
  if (!fs.existsSync(jsonPath)) {
    throw new Error(
      `找不到 ${jsonPath}。請先執行：npx tsx prisma/generate-y115-open-class-json.ts`
    );
  }
  const raw = fs.readFileSync(jsonPath, "utf-8");
  const rows = JSON.parse(raw) as (Y115JsonRow & { instructorName?: string | null })[];
  return rows.map((r) => ({
    ...r,
    mentorName: r.mentorName ?? r.instructorName ?? null,
  }));
}

function roc115DateTime(rocDate: string, hour: number, minute: number): Date {
  const [mm, dd] = rocDate.split("/").map((s) => parseInt(s, 10));
  return new Date(ROC115_AD_YEAR, mm - 1, dd, hour, minute, 0, 0);
}

function resolveClassType(className: string, isPlanClass: boolean): string {
  if (className.includes("學程")) return "學程班";
  if (isPlanClass) return "年度計畫班";
  return "專案班";
}

function resolveDeliveryMode(tags: string[], tisVenueCode: string | null): string {
  if (tags.includes("純直播課程")) return "直播";
  if (tags.includes("三所遠距") || tags.includes("中央端")) return "遠距";
  if (tisVenueCode === "E") return tisVenueCodeToDeliveryMode("E") ?? "遠距";
  return "課堂";
}

function resolveStatus(statusRaw: string, startDay: Date): string {
  if (statusRaw === "未核定") return "規劃中";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(startDay);
  d.setHours(0, 0, 0, 0);
  if (d < today) return "已結訓";
  const msPerDay = 86400000;
  const days = (d.getTime() - today.getTime()) / msPerDay;
  if (days >= 0 && days <= 14) return "即將開班";
  return "已排定";
}

async function main() {
  console.log("🌱 開始建立種子資料...");

  const y115Rows = loadY115Rows();

  // 清除舊資料
  await prisma.customTool.deleteMany();
  await prisma.agentMessage.deleteMany();
  await prisma.agentConversation.deleteMany();
  await prisma.agentRule.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.aiTrainerSkillVersion.deleteMany();
  await prisma.aiTrainerSkillDefinition.deleteMany();
  await prisma.aiGlobalSkillVersion.deleteMany();
  await prisma.aiGlobalSkillDefinition.deleteMany();
  await prisma.syncJob.deleteMany();
  await prisma.similarityCheck.deleteMany();
  await prisma.planningDraft.deleteMany();
  await prisma.planningRequest.deleteMany();
  await prisma.trainingClass.deleteMany();
  await prisma.trainer.deleteMany();
  await prisma.user.deleteMany();

  // ================================================================
  // 使用者
  // ================================================================
  const users = await Promise.all([
    prisma.user.create({
      data: {
        name: "黃建豪",
        email: "trainer1@cht-academy.tw",
        password: "password123",
        department: "資訊學系",
        role: "trainer",
        campus: "院本部",
      },
    }),
    prisma.user.create({
      data: {
        name: "林怡萱",
        email: "trainer2@cht-academy.tw",
        password: "password123",
        department: "台中所",
        role: "trainer",
        campus: "台中所",
      },
    }),
    prisma.user.create({
      data: {
        name: "陳志豪",
        email: "trainer3@cht-academy.tw",
        password: "password123",
        department: "高雄所",
        role: "trainer",
        campus: "高雄所",
      },
    }),
    prisma.user.create({
      data: {
        name: "系統管理員",
        email: "admin@cht-academy.tw",
        password: "admin123",
        department: "企管學系",
        role: "admin",
        campus: "院本部",
      },
    }),
  ]);

  const [trainerPrimary] = users;

  // ================================================================
  // 培訓師名冊（Trainer）：TIS「導師」＝開班導師／培訓師，姓名去重
  // ================================================================
  const mentorNamesUnique = [
    ...new Set(
      y115Rows.map((r) => r.mentorName).filter((n): n is string => Boolean(n && n.trim()))
    ),
  ].sort((a, b) => a.localeCompare(b, "zh-Hant"));

  if (mentorNamesUnique.length > 0) {
    await prisma.trainer.createMany({
      data: mentorNamesUnique.map((name) => ({
        name,
        trainerType: "內聘",
        dataSource: "115年開班計畫表（TIS 匯出 HTML）",
      })),
    });
  }

  await prisma.trainer.updateMany({
    where: { name: "黃建豪" },
    data: { linkedUserId: trainerPrimary.id },
  });

  // ================================================================
  // 班次：115 年開班計畫表真實資料（prisma/data/y115-open-classes.json）
  // ================================================================
  const importedAt = new Date();
  for (const row of y115Rows) {
    const tis = prismaFieldsFromTisClassCode(row.classCode);
    const category = inferCategoryFromClassName(row.className);
    const campusFromCode = tisVenueCodeToCampus(tis.tisVenueCode);
    const campus = campusFromCode ?? row.campusFromSection;
    const deliveryMode = resolveDeliveryMode(row.tags, tis.tisVenueCode);
    const difficultyLevel =
      tisDifficultyDigitToLevel(tis.tisDifficultyDigit) ?? null;
    const classType = resolveClassType(row.className, row.isPlanClass);
    const startDatetime = roc115DateTime(row.rocDate, 9, 0);
    const endDatetime = roc115DateTime(row.rocDate, 17, 0);
    const checkinDatetime = roc115DateTime(row.rocDate, 8, 30);
    const graduationDatetime = endDatetime;
    const status = resolveStatus(row.statusRaw, startDatetime);
    const notesParts = [...row.tags];
    if (row.sourceFile) notesParts.push(`來源檔：${row.sourceFile}`);
    const notes = notesParts.length ? notesParts.join("；") : null;

    const textParts = [row.className, category, difficultyLevel, row.mentorName, campus].filter(Boolean);
    await prisma.trainingClass.create({
      data: {
        sourceSystemId: row.seq,
        classCode: row.classCode,
        className: row.className,
        campus,
        category,
        classType,
        difficultyLevel,
        deliveryMode,
        startDatetime,
        endDatetime,
        checkinDatetime,
        graduationDatetime,
        trainerUserId: isLedByHuangJianhao(row.mentorName) ? trainerPrimary.id : null,
        mentorName: row.mentorName ?? undefined,
        instructorNames: null,
        location: campus,
        roomName: null,
        summary: null,
        audience: null,
        status,
        maxStudents: row.enrolledCount,
        sourceType: "tis_html_snapshot",
        importedAt,
        rawPayload: JSON.stringify({
          department: row.department,
          statusRaw: row.statusRaw,
          tags: row.tags,
        }),
        embeddingText: textParts.join(" | "),
        ...tis,
      },
    });
  }

  // ================================================================
  // 同步紀錄
  // ================================================================
  // ================================================================
  // 預設「全院 AI 技能」占位（管理員可於系統內改內容與新增 slug）
  // ================================================================
  for (const row of DEFAULT_GLOBAL_AI_SKILLS) {
    const def = await prisma.aiGlobalSkillDefinition.create({
      data: { slug: row.slug, title: row.title, sortOrder: row.sortOrder },
    });
    await prisma.aiGlobalSkillVersion.create({
      data: { definitionId: def.id, versionNo: 1, content: row.content },
    });
  }

  await prisma.syncJob.create({
    data: {
      sourceName: "115年開班計畫表 HTML",
      syncMode: "manual_import",
      startedAt: new Date(importedAt.getTime() - 3600000),
      finishedAt: importedAt,
      status: "success",
      totalCount: y115Rows.length,
      successCount: y115Rows.length,
      failedCount: 0,
      logText: `自 prisma/data/y115-open-classes.json 匯入 ${y115Rows.length} 筆班次（TIS 開班計畫表另存 HTML）。`,
    },
  });

  // ================================================================
  // v3 Agent 預設規則
  // ================================================================
  const defaultRules = [
    {
      slug: "no_promise_date",
      title: "不得對外承諾開班日期",
      content: "在與使用者對話中，不可代替培訓師承諾或確認任何具體的開班日期、報名截止日。若使用者詢問，請建議「依學院正式公告為準」。",
      scope: "global",
      priority: 100,
    },
    {
      slug: "export_disclaimer",
      title: "匯出文件含免責聲明",
      content: "當產出課程規劃或匯出文件時，結尾應附上「本規劃由 AI 輔助產出，實際開班內容以正式簽核為準」的提示。",
      scope: "global",
      priority: 90,
    },
    {
      slug: "no_fabricate_instructor",
      title: "不捏造講師資料",
      content: "推薦講師時，不可捏造不存在的姓名、職稱或經歷。若無法確認，應標示「AI 推薦（建議人工查證）」。",
      scope: "global",
      priority: 95,
    },
    {
      slug: "traditional_chinese",
      title: "全程使用繁體中文",
      content: "所有回覆、文件、匯出內容一律使用繁體中文。專有名詞可附英文原文。",
      scope: "global",
      priority: 80,
    },
    {
      slug: "respect_tis_data",
      title: "尊重 TIS 資料權威",
      content: "當查詢到的系統資料（班次、講師等）與使用者描述不一致時，以系統資料為準，並告知使用者差異所在。",
      scope: "global",
      priority: 85,
    },
  ];

  for (const rule of defaultRules) {
    await prisma.agentRule.create({ data: rule });
  }

  console.log("✅ 種子資料建立完成！");
  console.log(`   - 使用者: ${users.length} 筆`);
  console.log(`   - 班次: ${y115Rows.length} 筆（115 年開班計畫表真實資料）`);
  console.log(`   - 培訓師名冊（Trainer）: ${mentorNamesUnique.length} 筆（TIS 導師欄位去重）`);
  console.log(`   - 授課講師姓名：僅存於班次 instructorNames 欄位（種子為空）`);
  console.log(`   - 同步紀錄: 1 筆`);
  console.log(`   - 全院 AI 技能（預設 slug）: ${DEFAULT_GLOBAL_AI_SKILLS.length} 筆`);
  console.log(`   - Agent 預設規則: ${defaultRules.length} 筆`);
  console.log("");
  console.log("📌 測試帳號：");
  console.log("   trainer1@cht-academy.tw / password123 （黃建豪 - 資訊學系）");
  console.log("   trainer2@cht-academy.tw / password123 （林怡萱 - 台中所）");
  console.log("   trainer3@cht-academy.tw / password123 （陳志豪 - 高雄所）");
  console.log("   admin@cht-academy.tw / admin123 （系統管理員）");
  console.log("");
  console.log("📌 更新班次資料：編輯 HTML 後執行 npx tsx prisma/generate-y115-open-class-json.ts，再 npm run db:seed");
}

main()
  .catch((e) => {
    console.error("❌ 種子資料建立失敗:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

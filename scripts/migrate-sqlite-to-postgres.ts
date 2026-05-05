/**
 * 【v4 資料遷移腳本】SQLite → Supabase PostgreSQL
 *
 * 用途：把 v3 時期 prisma/dev.db（SQLite）裡的所有資料，
 * 原樣搬到 Supabase PostgreSQL 上（v4 正式資料庫）。
 *
 * 作法：
 *   1. 以 better-sqlite3 直接讀取 SQLite 檔（不依賴舊版 Prisma Client）
 *   2. 透過新版 Prisma Client 一筆一筆寫入 PostgreSQL
 *   3. 依 FK 相依順序搬移（User 先、TrainingClass 次之…）
 *   4. 時間欄位：SQLite 存整數 epoch ms，要轉成 JS Date
 *
 * 執行：npm run migrate:sqlite-to-pg
 *
 * 注意：
 *   - 目的地資料庫必須已執行 prisma db push（schema 同步完）
 *   - 預設冪等：若目的地已有同 id 資料會跳過
 *   - 向量欄位 embedding 不在此腳本處理，另請執行 npm run embed:backfill
 */
import "dotenv/config";
import Database from "better-sqlite3";
import path from "path";
import { PrismaClient } from "@prisma/client";
import { existsSync } from "fs";

const SQLITE_PATH = process.env.LEGACY_SQLITE_URL?.replace(/^file:/, "") ?? "./prisma/dev.db";
const absSqlitePath = path.isAbsolute(SQLITE_PATH) ? SQLITE_PATH : path.resolve(process.cwd(), SQLITE_PATH);

if (!existsSync(absSqlitePath)) {
  console.error(`❌ 找不到 SQLite 檔：${absSqlitePath}`);
  console.error("   請確認 .env 中的 LEGACY_SQLITE_URL 指向正確的舊版 dev.db");
  process.exit(1);
}

console.log(`📂 SQLite 來源：${absSqlitePath}`);
const sqlite = new Database(absSqlitePath, { readonly: true, fileMustExist: true });
// 唯讀模式下不能改 journal_mode，只查詢即可

const prisma = new PrismaClient({ log: ["error", "warn"] });

type Row = Record<string, unknown>;

function toDate(v: unknown): Date | null {
  if (v == null) return null;
  if (v instanceof Date) return v;
  if (typeof v === "number") return new Date(v);
  if (typeof v === "string") {
    const n = Number(v);
    if (!isNaN(n) && v.length >= 10) return new Date(n);
    const d = new Date(v);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

function toBool(v: unknown, def = false): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") return v === "1" || v.toLowerCase() === "true";
  return def;
}

function toInt(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return isNaN(n) ? null : Math.trunc(n);
}

function toStr(v: unknown): string | null {
  if (v == null) return null;
  return String(v);
}

function rows(table: string): Row[] {
  try {
    return sqlite.prepare(`SELECT * FROM ${table}`).all() as Row[];
  } catch (e) {
    console.warn(`⚠️ 讀取資料表 ${table} 失敗：`, (e as Error).message);
    return [];
  }
}

async function migrateUsers() {
  const src = rows("users");
  console.log(`\n👤 User：${src.length} 筆`);
  for (const r of src) {
    await prisma.user.upsert({
      where: { id: String(r.id) },
      update: {},
      create: {
        id: String(r.id),
        name: String(r.name ?? ""),
        email: String(r.email ?? ""),
        password: String(r.password ?? ""),
        department: toStr(r.department),
        role: String(r.role ?? "trainer"),
        campus: toStr(r.campus),
        createdAt: toDate(r.created_at) ?? new Date(),
        updatedAt: toDate(r.updated_at) ?? new Date(),
      },
    });
  }
}

async function migrateTrainers() {
  const src = rows("trainers");
  console.log(`🎓 Trainer：${src.length} 筆`);
  for (const r of src) {
    await prisma.trainer.upsert({
      where: { id: String(r.id) },
      update: {},
      create: {
        id: String(r.id),
        name: String(r.name ?? ""),
        trainerType: toStr(r.trainer_type),
        expertiseTags: toStr(r.expertise_tags),
        teachingTopics: toStr(r.teaching_topics),
        email: toStr(r.email),
        phone: toStr(r.phone),
        organization: toStr(r.organization),
        notes: toStr(r.notes),
        dataSource: toStr(r.data_source),
        active: toBool(r.active, true),
        linkedUserId: toStr(r.linked_user_id),
        createdAt: toDate(r.created_at) ?? new Date(),
        updatedAt: toDate(r.updated_at) ?? new Date(),
      },
    });
  }
}

async function migrateTrainingClasses() {
  const src = rows("training_classes");
  console.log(`📚 TrainingClass：${src.length} 筆`);
  let ok = 0;
  for (const r of src) {
    try {
      await prisma.trainingClass.upsert({
        where: { id: String(r.id) },
        update: {},
        create: {
          id: String(r.id),
          sourceSystemId: toStr(r.source_system_id),
          classCode: toStr(r.class_code),
          tisClassId5: toStr(r.tis_class_id_5),
          tisVenueCode: toStr(r.tis_venue_code),
          tisSessionCode: toStr(r.tis_session_code),
          tisDifficultyDigit: toInt(r.tis_difficulty_digit),
          className: String(r.class_name ?? ""),
          campus: toStr(r.campus),
          category: toStr(r.category),
          classType: toStr(r.class_type),
          difficultyLevel: toStr(r.difficulty_level),
          deliveryMode: toStr(r.delivery_mode),
          startDatetime: toDate(r.start_datetime),
          endDatetime: toDate(r.end_datetime),
          checkinDatetime: toDate(r.checkin_datetime),
          graduationDatetime: toDate(r.graduation_datetime),
          trainerUserId: toStr(r.trainer_user_id),
          mentorName: toStr(r.mentor_name),
          instructorNames: toStr(r.instructor_names),
          location: toStr(r.location),
          roomName: toStr(r.room_name),
          summary: toStr(r.summary),
          audience: toStr(r.audience),
          status: String(r.status ?? "規劃中"),
          requestSource: toStr(r.request_source),
          maxStudents: toInt(r.max_students),
          materialLink: toStr(r.material_link),
          notes: toStr(r.notes),
          sourceType: toStr(r.source_type),
          importedAt: toDate(r.imported_at),
          rawPayload: toStr(r.raw_payload),
          embeddingText: toStr(r.embedding_text),
          createdAt: toDate(r.created_at) ?? new Date(),
          updatedAt: toDate(r.updated_at) ?? new Date(),
        },
      });
      ok++;
    } catch (e) {
      console.warn(`  ⚠️ 跳過 ${String(r.id)}：${(e as Error).message}`);
    }
  }
  console.log(`   ✅ 成功寫入 ${ok}/${src.length}`);
}

// 註：v1 課程規劃幫手（planning_requests / planning_drafts）已於 v5 重構為
// course_plan_requests / course_plan_skill_runs / course_plan_drafts。
// 由於本腳本是 v3 SQLite → v4 PostgreSQL 一次性遷移工具且 v1 資料模型已淘汰，
// 此處保留 stub 以維持函式呼叫順序，但不再實際遷移舊版規劃資料。
async function migratePlanningRequests() {
  console.log(`📋 PlanningRequest：v1 已淘汰，跳過遷移`);
}

async function migratePlanningDrafts() {
  console.log(`📝 PlanningDraft：v1 已淘汰，跳過遷移`);
}

async function migrateSimilarityChecks() {
  const src = rows("similarity_checks");
  console.log(`🔍 SimilarityCheck：${src.length} 筆`);
  for (const r of src) {
    await prisma.similarityCheck.upsert({
      where: { id: String(r.id) },
      update: {},
      create: {
        id: String(r.id),
        createdBy: String(r.created_by),
        queryPayload: String(r.query_payload ?? "{}"),
        filterPayload: toStr(r.filter_payload),
        threshold: Number(r.threshold ?? 0.75),
        resultJson: toStr(r.result_json),
        status: String(r.status ?? "pending"),
        createdAt: toDate(r.created_at) ?? new Date(),
        updatedAt: toDate(r.updated_at) ?? new Date(),
      },
    });
  }
}

async function migrateSyncJobs() {
  const src = rows("sync_jobs");
  console.log(`🔄 SyncJob：${src.length} 筆`);
  for (const r of src) {
    await prisma.syncJob.upsert({
      where: { id: String(r.id) },
      update: {},
      create: {
        id: String(r.id),
        sourceName: String(r.source_name ?? ""),
        syncMode: String(r.sync_mode ?? ""),
        startedAt: toDate(r.started_at) ?? new Date(),
        finishedAt: toDate(r.finished_at),
        status: String(r.status ?? "running"),
        totalCount: toInt(r.total_count) ?? 0,
        successCount: toInt(r.success_count) ?? 0,
        failedCount: toInt(r.failed_count) ?? 0,
        logText: toStr(r.log_text),
        createdAt: toDate(r.created_at) ?? new Date(),
      },
    });
  }
}

async function migrateAiSkills() {
  const g = rows("ai_global_skill_definitions");
  console.log(`🧠 AiGlobalSkillDefinition：${g.length} 筆`);
  for (const r of g) {
    await prisma.aiGlobalSkillDefinition.upsert({
      where: { id: String(r.id) },
      update: {},
      create: {
        id: String(r.id),
        slug: String(r.slug),
        title: String(r.title),
        sortOrder: toInt(r.sort_order) ?? 0,
        toolBinding: toStr(r.tool_binding),
        triggerCondition: toStr(r.trigger_condition),
        createdAt: toDate(r.created_at) ?? new Date(),
        updatedAt: toDate(r.updated_at) ?? new Date(),
      },
    });
  }
  const gv = rows("ai_global_skill_versions");
  console.log(`🧠 AiGlobalSkillVersion：${gv.length} 筆`);
  for (const r of gv) {
    await prisma.aiGlobalSkillVersion.upsert({
      where: { id: String(r.id) },
      update: {},
      create: {
        id: String(r.id),
        definitionId: String(r.definition_id),
        content: String(r.content ?? ""),
        versionNo: toInt(r.version_no) ?? 1,
        createdAt: toDate(r.created_at) ?? new Date(),
      },
    });
  }
  const t = rows("ai_trainer_skill_definitions");
  console.log(`🧠 AiTrainerSkillDefinition：${t.length} 筆`);
  for (const r of t) {
    await prisma.aiTrainerSkillDefinition.upsert({
      where: { id: String(r.id) },
      update: {},
      create: {
        id: String(r.id),
        userId: String(r.user_id),
        title: String(r.title ?? "個人培訓師 AI 脈絡"),
        createdAt: toDate(r.created_at) ?? new Date(),
        updatedAt: toDate(r.updated_at) ?? new Date(),
      },
    });
  }
  const tv = rows("ai_trainer_skill_versions");
  console.log(`🧠 AiTrainerSkillVersion：${tv.length} 筆`);
  for (const r of tv) {
    await prisma.aiTrainerSkillVersion.upsert({
      where: { id: String(r.id) },
      update: {},
      create: {
        id: String(r.id),
        definitionId: String(r.definition_id),
        content: String(r.content ?? ""),
        versionNo: toInt(r.version_no) ?? 1,
        createdAt: toDate(r.created_at) ?? new Date(),
      },
    });
  }
}

async function migratePersonalContacts() {
  const src = rows("personal_instructor_contacts");
  console.log(`📇 PersonalInstructorContact：${src.length} 筆`);
  for (const r of src) {
    await prisma.personalInstructorContact.upsert({
      where: { id: String(r.id) },
      update: {},
      create: {
        id: String(r.id),
        ownerId: String(r.owner_id),
        displayName: String(r.display_name ?? ""),
        title: toStr(r.title),
        organization: toStr(r.organization),
        expertiseDomains: toStr(r.expertise_domains),
        email: toStr(r.email),
        lineId: toStr(r.line_id),
        address: toStr(r.address),
        phone: toStr(r.phone),
        notes: toStr(r.notes),
        sortOrder: toInt(r.sort_order) ?? 0,
        createdAt: toDate(r.created_at) ?? new Date(),
        updatedAt: toDate(r.updated_at) ?? new Date(),
      },
    });
  }
}

async function migrateAgentData() {
  const conv = rows("agent_conversations");
  console.log(`💬 AgentConversation：${conv.length} 筆`);
  for (const r of conv) {
    await prisma.agentConversation.upsert({
      where: { id: String(r.id) },
      update: {},
      create: {
        id: String(r.id),
        userId: String(r.user_id),
        title: String(r.title ?? "新對話"),
        status: String(r.status ?? "active"),
        createdAt: toDate(r.created_at) ?? new Date(),
        updatedAt: toDate(r.updated_at) ?? new Date(),
      },
    });
  }
  const msg = rows("agent_messages");
  console.log(`💬 AgentMessage：${msg.length} 筆`);
  for (const r of msg) {
    await prisma.agentMessage.upsert({
      where: { id: String(r.id) },
      update: {},
      create: {
        id: String(r.id),
        conversationId: String(r.conversation_id),
        role: String(r.role),
        content: String(r.content ?? ""),
        toolCalls: toStr(r.tool_calls),
        createdAt: toDate(r.created_at) ?? new Date(),
      },
    });
  }
  const rules = rows("agent_rules");
  console.log(`📜 AgentRule：${rules.length} 筆`);
  for (const r of rules) {
    await prisma.agentRule.upsert({
      where: { id: String(r.id) },
      update: {},
      create: {
        id: String(r.id),
        slug: String(r.slug),
        title: String(r.title),
        content: String(r.content ?? ""),
        scope: String(r.scope ?? "global"),
        isActive: toBool(r.is_active, true),
        priority: toInt(r.priority) ?? 0,
        createdBy: toStr(r.created_by),
        createdAt: toDate(r.created_at) ?? new Date(),
        updatedAt: toDate(r.updated_at) ?? new Date(),
      },
    });
  }
  const tools = rows("custom_tools");
  console.log(`🔧 CustomTool：${tools.length} 筆`);
  for (const r of tools) {
    await prisma.customTool.upsert({
      where: { id: String(r.id) },
      update: {},
      create: {
        id: String(r.id),
        userId: String(r.user_id),
        name: String(r.name),
        description: String(r.description ?? ""),
        endpointUrl: String(r.endpoint_url),
        inputSchema: String(r.input_schema ?? "{}"),
        headers: toStr(r.headers),
        isActive: toBool(r.is_active, true),
        createdAt: toDate(r.created_at) ?? new Date(),
        updatedAt: toDate(r.updated_at) ?? new Date(),
      },
    });
  }
}

async function migrateClassNotes() {
  const src = rows("class_notes");
  console.log(`🔔 ClassNote：${src.length} 筆`);
  for (const r of src) {
    await prisma.classNote.upsert({
      where: { id: String(r.id) },
      update: {},
      create: {
        id: String(r.id),
        classId: toStr(r.class_id),
        userId: String(r.user_id),
        content: String(r.content ?? ""),
        alarmAt: toDate(r.alarm_at),
        alarmFired: toBool(r.alarm_fired, false),
        importance: String(r.importance ?? "normal"),
        createdAt: toDate(r.created_at) ?? new Date(),
        updatedAt: toDate(r.updated_at) ?? new Date(),
      },
    });
  }
}

async function migrateAuditLogs() {
  const src = rows("audit_logs");
  console.log(`📝 AuditLog：${src.length} 筆`);
  for (const r of src) {
    await prisma.auditLog.upsert({
      where: { id: String(r.id) },
      update: {},
      create: {
        id: String(r.id),
        userId: toStr(r.user_id),
        action: String(r.action),
        target: toStr(r.target),
        detail: toStr(r.detail),
        ipAddress: toStr(r.ip_address),
        agentConversationId: toStr(r.agent_conversation_id),
        createdAt: toDate(r.created_at) ?? new Date(),
      },
    });
  }
}

async function main() {
  console.log("🚀 開始遷移 SQLite → Supabase PostgreSQL\n");
  const t0 = Date.now();

  await migrateUsers();
  await migrateTrainers();
  await migrateTrainingClasses();
  await migratePlanningRequests();
  await migratePlanningDrafts();
  await migrateSimilarityChecks();
  await migrateSyncJobs();
  await migrateAiSkills();
  await migratePersonalContacts();
  await migrateAgentData();
  await migrateClassNotes();
  await migrateAuditLogs();

  console.log(`\n🎉 遷移完成，耗時 ${((Date.now() - t0) / 1000).toFixed(1)} 秒`);
  console.log("👉 下一步：npm run embed:backfill  # 為所有班次產生向量嵌入");
}

main()
  .catch((e) => {
    console.error("❌ 遷移失敗：", e);
    process.exit(1);
  })
  .finally(async () => {
    sqlite.close();
    await prisma.$disconnect();
  });

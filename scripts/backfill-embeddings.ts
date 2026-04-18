/**
 * 【v4 批次向量嵌入腳本】為所有 TrainingClass 產生 embedding 並寫入 pgvector 欄位。
 *
 * 用途：
 *   - 首次遷移後呼叫一次（全部資料）
 *   - 之後若有大量新增資料、或改用不同 embedding model，都可重新跑一次
 *
 * 行為：
 *   - 預設只處理 embedding = NULL 的班次（增量）
 *   - `--rebuild` 旗標會重跑所有班次（覆蓋）
 *   - 使用環境 AI_PROVIDER + {OPENAI|GEMINI}_EMBEDDING_MODEL 決定模型
 *   - 批次處理（BATCH=32），避免超過 API rate limit
 *
 * 執行：
 *   npm run embed:backfill              # 只補沒有嵌入的
 *   npm run embed:backfill -- --rebuild # 全部重建
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import OpenAI from "openai";

const prisma = new PrismaClient({ log: ["error", "warn"] });

const REBUILD = process.argv.includes("--rebuild");
const BATCH = 32;
const PROVIDER = (process.env.AI_PROVIDER || "openai").toLowerCase();
const MODEL =
  PROVIDER === "gemini"
    ? process.env.GEMINI_EMBEDDING_MODEL || "gemini-embedding-001"
    : process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";

const TARGET_DIM = Number(process.env.EMBEDDING_DIMENSION || (PROVIDER === "gemini" ? 768 : 1536));

const API_KEY =
  PROVIDER === "gemini"
    ? (process.env.GEMINI_API_KEY?.trim() || "")
    : (process.env.OPENAI_API_KEY?.trim() || "");

const BASE_URL =
  PROVIDER === "gemini"
    ? (process.env.GEMINI_BASE_URL?.trim() || "https://generativelanguage.googleapis.com/v1beta/openai")
    : (process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1");

if (!API_KEY) {
  console.error(`❌ ${PROVIDER.toUpperCase()}_API_KEY 未設定，無法呼叫 Embedding API`);
  process.exit(1);
}

const aiClient = new OpenAI({ apiKey: API_KEY, baseURL: BASE_URL });

type EmbeddingArgs = Parameters<typeof aiClient.embeddings.create>[0] & { dimensions?: number };

async function generateEmbedding(text: string): Promise<number[]> {
  const cleaned = text.replace(/\s+/g, " ").trim().slice(0, 8000);
  const args: EmbeddingArgs = { model: MODEL, input: cleaned };
  if (TARGET_DIM) args.dimensions = TARGET_DIM;
  const res = await aiClient.embeddings.create(args);
  return res.data[0]?.embedding ?? [];
}

async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const cleaned = texts.map((t) => t.replace(/\s+/g, " ").trim().slice(0, 8000));
  const args: EmbeddingArgs = { model: MODEL, input: cleaned };
  if (TARGET_DIM) args.dimensions = TARGET_DIM;
  const res = await aiClient.embeddings.create(args);
  return res.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

/** 把班次欄位組成 embedding 輸入文字（跟 semantic_search 一致） */
function composeText(c: {
  className: string;
  summary: string | null;
  category: string | null;
  campus: string | null;
  classCode: string | null;
  audience: string | null;
  embeddingText: string | null;
}): string {
  return [
    c.className,
    c.classCode,
    c.category,
    c.campus,
    c.audience,
    c.summary,
    c.embeddingText,
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 8000);
}

async function main() {
  console.log(`🔢 批次嵌入 (provider=${PROVIDER}, model=${MODEL}, rebuild=${REBUILD})`);

  const rawIds: Array<{ id: string }> = REBUILD
    ? await prisma.$queryRawUnsafe(`SELECT id FROM training_classes`)
    : await prisma.$queryRawUnsafe(
        `SELECT id FROM training_classes WHERE embedding IS NULL`
      );

  const ids = rawIds.map((r) => r.id);
  console.log(`📊 待處理：${ids.length} 筆`);
  if (ids.length === 0) {
    console.log("✅ 沒有需要更新的班次");
    return;
  }

  let done = 0;
  let failed = 0;

  for (let i = 0; i < ids.length; i += BATCH) {
    const slice = ids.slice(i, i + BATCH);

    const classes = await prisma.trainingClass.findMany({
      where: { id: { in: slice } },
      select: {
        id: true,
        className: true,
        summary: true,
        category: true,
        campus: true,
        classCode: true,
        audience: true,
        embeddingText: true,
      },
    });

    const texts = classes.map(composeText);

    let vectors: number[][] = [];
    try {
      vectors = await generateEmbeddings(texts);
    } catch (e) {
      console.error(
        `❌ 批次 ${i / BATCH + 1} 嵌入失敗：${(e as Error).message}，改逐筆重試…`
      );
      for (let j = 0; j < texts.length; j++) {
        try {
          vectors[j] = await generateEmbedding(texts[j]);
        } catch (ee) {
          console.error(`  ⚠️ 跳過 ${classes[j].id}：${(ee as Error).message}`);
          vectors[j] = [];
          failed++;
        }
      }
    }

    // pgvector 需要以 '[0.1,0.2,...]' 字串寫入，再用 ::vector cast
    for (let j = 0; j < classes.length; j++) {
      const vec = vectors[j];
      if (!vec || vec.length === 0) continue;

      const vecLiteral = `[${vec.join(",")}]`;
      await prisma.$executeRawUnsafe(
        `UPDATE training_classes
         SET embedding = $1::vector,
             embedding_model = $2,
             embedding_updated_at = NOW()
         WHERE id = $3`,
        vecLiteral,
        MODEL,
        classes[j].id
      );
      done++;
    }

    console.log(`  📦 進度：${Math.min(i + BATCH, ids.length)}/${ids.length}（成功 ${done}，失敗 ${failed}）`);
  }

  console.log(`\n🎉 完成！成功 ${done} 筆，失敗 ${failed} 筆`);
  console.log("👉 建議接著執行：npm run embed:create-index  # 建立 HNSW 向量索引");
}

main()
  .catch((e) => {
    console.error("❌ 批次失敗：", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

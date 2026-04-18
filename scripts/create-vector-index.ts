/**
 * 【v4 建立 pgvector HNSW 索引】
 *
 * 資料量大時（>10 萬筆），循序掃描會慢。
 * 建立 HNSW 索引可大幅加速 ORDER BY embedding <=> query_vector LIMIT K。
 *
 * 執行時機：
 *   - embedding 欄位填好後（不可在空欄位上建，索引會無效）
 *   - 可重複執行（IF NOT EXISTS）
 *
 * 執行：npm run embed:create-index
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({ log: ["error", "warn"] });

async function main() {
  console.log("🔨 建立 pgvector HNSW 索引…");

  // vector_cosine_ops：搭配 <=> （cosine distance）
  // m=16, ef_construction=64 為 pgvector 預設推薦值
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS training_classes_embedding_hnsw_idx
    ON training_classes
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);
  `);

  console.log("✅ 索引建立完成：training_classes_embedding_hnsw_idx");

  const stat = await prisma.$queryRawUnsafe<Array<{ total: bigint; withvec: bigint }>>(
    `SELECT
       COUNT(*)::bigint AS total,
       COUNT(embedding)::bigint AS withvec
     FROM training_classes`
  );
  if (stat[0]) {
    const s = stat[0];
    console.log(`📊 班次總數：${s.total}，含向量：${s.withvec}`);
  }
}

main()
  .catch((e) => {
    console.error("❌ 建立索引失敗：", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

/**
 * 【向量嵌入引擎】
 * 透過 OpenAI / Gemini Embedding API 將文字轉為向量，
 * 支援語義級相似度搜尋（餘弦相似度）。
 */
import "server-only";

import { createAiClient, getAiProvider, type AiProvider } from "./ai-provider";

function getEmbeddingModel(provider: AiProvider): string {
  if (provider === "gemini") {
    return process.env.GEMINI_EMBEDDING_MODEL?.trim() || "gemini-embedding-001";
  }
  return process.env.OPENAI_EMBEDDING_MODEL?.trim() || "text-embedding-3-small";
}

function getTargetDimension(provider: AiProvider): number | undefined {
  // 由 .env EMBEDDING_DIMENSION 指定；對 Gemini 的 Matryoshka 模型尤其重要，
  // 因為 gemini-embedding-001 預設 3072 維會超過 pgvector HNSW 上限（2000 維），
  // 需透過 dimensions 參數截斷。
  const raw = process.env.EMBEDDING_DIMENSION?.trim();
  if (raw) {
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) return n;
  }
  if (provider === "gemini") return 768;
  return undefined;
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const client = createAiClient();
  const provider = getAiProvider();
  const model = getEmbeddingModel(provider);
  const dim = getTargetDimension(provider);

  const cleaned = text.replace(/\s+/g, " ").trim().slice(0, 8000);

  const params: Record<string, unknown> = { model, input: cleaned };
  if (dim) params.dimensions = dim;

  const response = await client.embeddings.create(
    params as unknown as Parameters<typeof client.embeddings.create>[0]
  );

  return response.data[0]?.embedding ?? [];
}

export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const client = createAiClient();
  const provider = getAiProvider();
  const model = getEmbeddingModel(provider);
  const dim = getTargetDimension(provider);

  const cleaned = texts.map((t) => t.replace(/\s+/g, " ").trim().slice(0, 8000));

  const params: Record<string, unknown> = { model, input: cleaned };
  if (dim) params.dimensions = dim;

  const response = await client.embeddings.create(
    params as unknown as Parameters<typeof client.embeddings.create>[0]
  );

  return response.data
    .sort((a, b) => a.index - b.index)
    .map((d) => d.embedding);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dotProduct / denominator;
}

export function findTopKSimilar(
  queryEmbedding: number[],
  candidates: Array<{ id: string; embedding: number[]; metadata?: Record<string, unknown> }>,
  topK: number = 10,
  threshold: number = 0.3
): Array<{ id: string; score: number; metadata?: Record<string, unknown> }> {
  const scored = candidates
    .map((c) => ({
      id: c.id,
      score: cosineSimilarity(queryEmbedding, c.embedding),
      metadata: c.metadata,
    }))
    .filter((r) => r.score >= threshold);

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}

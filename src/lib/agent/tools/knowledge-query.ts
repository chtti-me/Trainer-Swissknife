/**
 * Agent 工具：知識庫查詢（RAG）
 * 讓使用者上傳文件到 agent-workspace，小瑞可以讀取並用語義搜尋回答問題。
 * 將 agent-workspace 中的文字檔案作為知識來源。
 */
import "server-only";

import fs from "fs/promises";
import path from "path";
import { generateEmbedding, cosineSimilarity } from "@/lib/embedding";
import type { AgentToolExecutor, AgentToolResult } from "../types";

const WORKSPACE_ROOT = path.resolve(process.cwd(), "agent-workspace");
const MAX_CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 200;

interface TextChunk {
  fileName: string;
  chunkIndex: number;
  content: string;
}

function chunkText(text: string, fileName: string): TextChunk[] {
  const chunks: TextChunk[] = [];
  let start = 0;
  let idx = 0;

  while (start < text.length) {
    const end = Math.min(start + MAX_CHUNK_SIZE, text.length);
    chunks.push({
      fileName,
      chunkIndex: idx++,
      content: text.slice(start, end),
    });
    start += MAX_CHUNK_SIZE - CHUNK_OVERLAP;
    if (start >= text.length) break;
  }

  return chunks;
}

const TEXT_EXTENSIONS = new Set([
  ".txt", ".md", ".csv", ".json", ".html", ".xml",
  ".js", ".ts", ".py", ".css", ".yaml", ".yml", ".log",
]);

async function loadWorkspaceFiles(): Promise<TextChunk[]> {
  try {
    await fs.mkdir(WORKSPACE_ROOT, { recursive: true });
    const entries = await fs.readdir(WORKSPACE_ROOT, { withFileTypes: true });

    const allChunks: TextChunk[] = [];

    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (!TEXT_EXTENSIONS.has(ext)) continue;

      const fullPath = path.join(WORKSPACE_ROOT, entry.name);
      const stat = await fs.stat(fullPath);
      if (stat.size > 3 * 1024 * 1024) continue;

      const content = await fs.readFile(fullPath, "utf-8");
      const chunks = chunkText(content, entry.name);
      allChunks.push(...chunks);
    }

    return allChunks;
  } catch {
    return [];
  }
}

const definition = {
  name: "knowledge_query",
  description:
    "在使用者上傳到工作區的文件中做語義搜尋。會讀取 agent-workspace 中所有文字檔案（txt/md/csv/json 等），將內容分段後用 AI 向量比對找出與問題最相關的段落。適合回答「文件裡提到了什麼」之類的問題。使用前，使用者需先透過聊天介面上傳檔案。",
  parameters: {
    type: "object",
    properties: {
      question: {
        type: "string",
        description: "想查詢的問題或關鍵描述",
      },
      topK: {
        type: "number",
        description: "回傳幾段最相關的內容（預設 5）",
      },
    },
    required: ["question"],
  },
} as const;

async function execute(
  params: Record<string, unknown>
): Promise<AgentToolResult> {
  try {
    const question = String(params.question || "").trim();
    if (!question) return { success: false, error: "查詢問題不可為空" };

    const topK = Math.min(Number(params.topK) || 5, 15);

    const chunks = await loadWorkspaceFiles();
    if (chunks.length === 0) {
      return {
        success: true,
        data: {
          results: [],
          message: "工作區中沒有可搜尋的文字檔案。請先透過聊天介面的 📎 按鈕上傳檔案。",
        },
      };
    }

    const questionEmb = await generateEmbedding(question);
    if (questionEmb.length === 0) {
      return { success: false, error: "無法產生向量嵌入" };
    }

    const scored: Array<{ chunk: TextChunk; score: number }> = [];

    for (const chunk of chunks) {
      try {
        const chunkEmb = await generateEmbedding(chunk.content);
        const score = cosineSimilarity(questionEmb, chunkEmb);
        if (score >= 0.3) {
          scored.push({ chunk, score });
        }
      } catch {
        continue;
      }
    }

    scored.sort((a, b) => b.score - a.score);
    const topResults = scored.slice(0, topK);

    const results = topResults.map((r) => ({
      fileName: r.chunk.fileName,
      chunkIndex: r.chunk.chunkIndex,
      relevanceScore: Math.round(r.score * 100) / 100,
      content: r.chunk.content,
    }));

    return {
      success: true,
      data: {
        question,
        totalChunks: chunks.length,
        matchCount: results.length,
        results,
        fileNames: [...new Set(chunks.map((c) => c.fileName))],
      },
    };
  } catch (e) {
    return { success: false, error: `知識庫查詢失敗：${(e as Error).message}` };
  }
}

export const knowledgeQueryTool: AgentToolExecutor = { definition, execute };

/**
 * Agent 工具：網路搜尋
 * 使用 Tavily Search API 進行網路搜尋，不依賴特定 LLM 供應商。
 * 免費額度：每月 1,000 次。
 * https://tavily.com/
 */
import "server-only";

import type { AgentToolExecutor, AgentToolResult } from "../types";

const TAVILY_API_URL = "https://api.tavily.com/search";
const TAVILY_TIMEOUT_MS = 15_000;

const definition = {
  name: "web_search",
  description:
    "使用網路搜尋引擎查詢即時資訊。可用來搜尋講師資料、課程參考、最新技術趨勢等。回傳搜尋摘要與來源網址。",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "搜尋關鍵字（必填）",
      },
    },
    required: ["query"],
  },
} as const;

interface TavilyResult {
  title: string;
  url: string;
  content: string;
  score: number;
}

interface TavilyResponse {
  answer?: string;
  results: TavilyResult[];
  query: string;
}

async function execute(
  params: Record<string, unknown>
): Promise<AgentToolResult> {
  try {
    const query = String(params.query || "").trim();
    if (!query) {
      return { success: false, error: "搜尋關鍵字不得為空" };
    }

    const apiKey = process.env.TAVILY_API_KEY?.trim();
    if (!apiKey) {
      return {
        success: false,
        error: "尚未設定 TAVILY_API_KEY。請至 https://tavily.com 免費註冊取得 API Key，並加入 .env 檔案。",
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TAVILY_TIMEOUT_MS);

    const res = await fetch(TAVILY_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        max_results: 5,
        include_answer: true,
        search_depth: "basic",
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return {
        success: false,
        error: `Tavily API 回傳 ${res.status}：${errText.slice(0, 500)}`,
      };
    }

    const data: TavilyResponse = await res.json();

    const citations = data.results.map((r) => ({
      title: r.title,
      url: r.url,
      snippet: r.content.slice(0, 300),
    }));

    const summary = data.answer
      ? data.answer
      : data.results
          .map((r) => `【${r.title}】\n${r.content.slice(0, 500)}`)
          .join("\n\n");

    return {
      success: true,
      data: {
        query,
        summary: summary.slice(0, 3000),
        citations: citations.slice(0, 10),
      },
    };
  } catch (e) {
    const message =
      e instanceof Error && e.name === "AbortError"
        ? `搜尋逾時（${TAVILY_TIMEOUT_MS}ms）`
        : (e as Error).message;
    return { success: false, error: `網路搜尋失敗：${message}` };
  }
}

export const webSearchTool: AgentToolExecutor = { definition, execute };

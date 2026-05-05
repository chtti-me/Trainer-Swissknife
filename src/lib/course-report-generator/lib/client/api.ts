/**
 * 【課程規劃報告產生器 - client 端 API 包裝】
 *
 * 把 fetch /api/tools/course-report/* 的細節封裝起來，讓 UI 元件直接呼方法。
 */
"use client";

import type { ChartSpec } from "../../types/report";

async function postJson<T>(url: string, body: unknown, opts?: { signal?: AbortSignal }): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    credentials: "include",
    signal: opts?.signal,
  });
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try {
      const err = (await res.json()) as { error?: string };
      if (err?.error) msg = err.error;
    } catch {
      // ignore
    }
    throw new Error(msg);
  }
  return (await res.json()) as T;
}

// ─────────────────────────── 解析上傳 ───────────────────────────

export interface ParseUploadResult {
  text: string;
  ext: string;
  filename: string;
}

export async function parseUploadFile(file: File): Promise<ParseUploadResult> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch("/api/tools/course-report/parse-uploads", {
    method: "POST",
    body: fd,
    credentials: "include",
  });
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try {
      const err = (await res.json()) as { error?: string };
      if (err?.error) msg = err.error;
    } catch {
      // ignore
    }
    throw new Error(msg);
  }
  return (await res.json()) as ParseUploadResult;
}

// ─────────────────────────── URL 抓取 ───────────────────────────

export interface FetchUrlResult {
  text: string;
  title: string;
  url: string;
}

export async function fetchUrl(url: string, cookie?: string): Promise<FetchUrlResult> {
  return postJson<FetchUrlResult>("/api/tools/course-report/fetch-url", { url, cookie });
}

// ─────────────────────────── AI extract ───────────────────────────

export interface ExtractInput {
  userTitle?: string;
  userNotes?: string;
  parsedTexts?: Array<{ filename: string; text: string }>;
  fetchedUrl?: { url: string; title?: string; text: string };
  images?: Array<{ filename: string; mimeType: string; base64: string }>;
  reporter?: string;
  department?: string;
}

export interface ExtractResult {
  title?: string;
  purpose?: string;
  designSummary?: string;
  sessions?: Array<{
    date?: string;
    timeRange?: string;
    topic?: string;
    instructor?: string;
    highlights?: string;
    hours?: string;
  }>;
  benefits?: string[];
  notes?: string;
}

export async function aiExtract(input: ExtractInput): Promise<ExtractResult> {
  return postJson<ExtractResult>("/api/tools/course-report/ai/extract", input);
}

// ─────────────────────────── AI 右鍵動作 ───────────────────────────

export interface ReportSnapshot {
  title?: string;
  reporter?: string;
  department?: string;
  purpose?: string;
}

export async function aiOptimizeText(
  text: string,
  reportSnapshot?: ReportSnapshot,
  contextField?: string,
  style?: "formal" | "concise" | "vivid"
): Promise<string> {
  const r = await postJson<{ text: string }>("/api/tools/course-report/ai/optimize-text", {
    text,
    reportSnapshot,
    contextField,
    style,
  });
  return r.text;
}

export async function aiFindHighlights(
  text: string,
  reportSnapshot?: ReportSnapshot
): Promise<string[]> {
  const r = await postJson<{ highlights: string[] }>(
    "/api/tools/course-report/ai/find-highlights",
    { text, reportSnapshot }
  );
  return r.highlights;
}

export interface AiImageResult {
  dataUrl: string;
  base64: string;
  mimeType: string;
  model: string;
}

export async function aiGenerateImage(
  text: string,
  options?: { ratio?: "1:1" | "16:9" | "9:16" | "4:3" | "3:4"; extraPrompt?: string }
): Promise<AiImageResult> {
  return postJson<AiImageResult>("/api/tools/course-report/ai/image", {
    text,
    ratio: options?.ratio ?? "16:9",
    extraPrompt: options?.extraPrompt,
  });
}

export interface AiChartResult {
  ok: boolean;
  reason?: string;
  spec?: ChartSpec;
}

export async function aiGenerateChart(text: string): Promise<AiChartResult> {
  return postJson<AiChartResult>("/api/tools/course-report/ai/chart", { text });
}

/**
 * Agent 工具：檔案系統操作
 * 支援讀取、寫入、列出目錄（限定在安全工作目錄內）。
 */
import "server-only";

import fs from "fs/promises";
import path from "path";
import type { AgentToolExecutor, AgentToolResult } from "../types";

const WORKSPACE_ROOT = path.resolve(process.cwd(), "agent-workspace");
const BLOCKED_PATTERNS = [
  ".env", "node_modules", ".git", ".prisma", "prisma/dev.db",
  ".next", "package-lock.json", ".github", "Dockerfile",
  "docker-compose", ".cursor", "credentials", "secret",
  "../",
];
const MAX_FILE_SIZE = 3 * 1024 * 1024; // 3MB

async function ensureWorkspace(): Promise<void> {
  try {
    await fs.mkdir(WORKSPACE_ROOT, { recursive: true });
  } catch {
    // 目錄已存在
  }
}

function resolveSafe(filePath: string): string | null {
  const resolved = path.resolve(WORKSPACE_ROOT, filePath);
  if (!resolved.startsWith(WORKSPACE_ROOT)) return null;
  for (const blocked of BLOCKED_PATTERNS) {
    if (resolved.includes(blocked)) return null;
  }
  return resolved;
}

// ---- file_read ----

const fileReadDef = {
  name: "file_read",
  description: "讀取 agent-workspace 目錄下的檔案內容。僅支援文字檔案，上限 3MB。",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "相對於 agent-workspace 的檔案路徑" },
    },
    required: ["path"],
  },
} as const;

async function fileReadExec(params: Record<string, unknown>): Promise<AgentToolResult> {
  try {
    await ensureWorkspace();
    const filePath = String(params.path || "");
    const resolved = resolveSafe(filePath);
    if (!resolved) return { success: false, error: "路徑不合法或在封鎖清單中" };

    const stat = await fs.stat(resolved);
    if (stat.size > MAX_FILE_SIZE) {
      return { success: false, error: `檔案大小 ${stat.size} bytes 超過上限 ${MAX_FILE_SIZE} bytes` };
    }

    const content = await fs.readFile(resolved, "utf-8");
    return { success: true, data: { path: filePath, size: stat.size, content } };
  } catch (e) {
    return { success: false, error: `讀取檔案失敗：${(e as Error).message}` };
  }
}

export const fileReadTool: AgentToolExecutor = {
  definition: fileReadDef,
  execute: fileReadExec,
};

// ---- file_write ----

const fileWriteDef = {
  name: "file_write",
  description: "將內容寫入 agent-workspace 目錄下的檔案。會自動建立不存在的子目錄。寫入成功後會提供下載連結，使用者可直接在瀏覽器下載。請在回覆中附上下載連結。",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "相對於 agent-workspace 的檔案路徑" },
      content: { type: "string", description: "要寫入的文字內容" },
    },
    required: ["path", "content"],
  },
  requiresConfirmation: true,
} as const;

async function fileWriteExec(params: Record<string, unknown>): Promise<AgentToolResult> {
  try {
    await ensureWorkspace();
    const filePath = String(params.path || "");
    const content = String(params.content || "");
    const resolved = resolveSafe(filePath);
    if (!resolved) return { success: false, error: "路徑不合法或在封鎖清單中" };

    await fs.mkdir(path.dirname(resolved), { recursive: true });
    await fs.writeFile(resolved, content, "utf-8");
    const downloadUrl = `/api/agent/workspace/download/${encodeURIComponent(filePath)}`;
    return {
      success: true,
      data: {
        path: filePath,
        bytesWritten: Buffer.byteLength(content),
        downloadUrl,
        message: `檔案已寫入，使用者可透過下載連結取得：${downloadUrl}`,
      },
    };
  } catch (e) {
    return { success: false, error: `寫入檔案失敗：${(e as Error).message}` };
  }
}

export const fileWriteTool: AgentToolExecutor = {
  definition: fileWriteDef,
  execute: fileWriteExec,
};

// ---- file_list ----

const fileListDef = {
  name: "file_list",
  description: "列出 agent-workspace 目錄下的檔案與子目錄。",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "相對於 agent-workspace 的目錄路徑（預設為根目錄）" },
    },
  },
} as const;

async function fileListExec(params: Record<string, unknown>): Promise<AgentToolResult> {
  try {
    await ensureWorkspace();
    const dirPath = String(params.path || ".");
    const resolved = resolveSafe(dirPath);
    if (!resolved) return { success: false, error: "路徑不合法" };

    const entries = await fs.readdir(resolved, { withFileTypes: true });
    const items = entries.map((e) => ({
      name: e.name,
      type: e.isDirectory() ? "directory" : "file",
    }));
    return { success: true, data: { path: dirPath, items } };
  } catch (e) {
    return { success: false, error: `列出目錄失敗：${(e as Error).message}` };
  }
}

export const fileListTool: AgentToolExecutor = {
  definition: fileListDef,
  execute: fileListExec,
};

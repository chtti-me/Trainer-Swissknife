/**
 * Agent 工具：腳本執行器
 * 僅允許執行白名單中的預定義腳本，避免任意命令注入。
 */
import "server-only";

import { exec } from "child_process";
import { promisify } from "util";
import type { AgentToolExecutor, AgentToolResult } from "../types";

const execAsync = promisify(exec);

const ALLOWED_SCRIPTS: Record<string, { command: string; description: string }> = {
  seed_ai_global: {
    command: "npm run db:seed:ai-global",
    description: "重新載入全院 AI 技能預設資料",
  },
  tis_classrooms: {
    command: "npm run data:tis-classrooms",
    description: "重新產生 TIS 教室資料清單",
  },
  db_studio: {
    command: "echo '請手動執行 npx prisma studio 以開啟資料庫管理介面'",
    description: "顯示 Prisma Studio 啟動指引",
  },
};

const definition = {
  name: "script_run",
  description: `執行系統預定義的安全腳本。可用腳本：${Object.entries(ALLOWED_SCRIPTS)
    .map(([k, v]) => `${k}（${v.description}）`)
    .join("、")}`,
  parameters: {
    type: "object",
    properties: {
      scriptName: {
        type: "string",
        enum: Object.keys(ALLOWED_SCRIPTS),
        description: "要執行的腳本名稱",
      },
    },
    required: ["scriptName"],
  },
  requiresConfirmation: true,
} as const;

async function execute(
  params: Record<string, unknown>
): Promise<AgentToolResult> {
  try {
    const scriptName = String(params.scriptName || "");
    const script = ALLOWED_SCRIPTS[scriptName];
    if (!script) {
      return {
        success: false,
        error: `未知的腳本「${scriptName}」。可用腳本：${Object.keys(ALLOWED_SCRIPTS).join("、")}`,
      };
    }

    const { stdout, stderr } = await execAsync(script.command, {
      cwd: process.cwd(),
      timeout: 30_000,
      env: { ...process.env },
    });

    const output = [stdout, stderr].filter(Boolean).join("\n").slice(0, 5000);

    return {
      success: true,
      data: { scriptName, description: script.description, output },
    };
  } catch (e) {
    return { success: false, error: `腳本執行失敗：${(e as Error).message}` };
  }
}

export const scriptRunTool: AgentToolExecutor = { definition, execute };

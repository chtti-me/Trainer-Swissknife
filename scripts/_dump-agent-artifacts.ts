/**
 * 內部腳本：把實際的 BASE_SYSTEM_PROMPT 與所有工具 OpenAI function 定義 dump 成 JSON。
 * 給 debug-agent-tools.mjs 透過 spawnSync npx tsx 呼叫用。
 *
 * 為了不 import 真實的 server-only 模組（會炸），我們直接用 regex 從原始碼解析出
 * 每個工具的 `definition = {...} as const`，這對純讀 schema 來說足夠了。
 */
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const toolsDir = join(root, "src/lib/agent/tools");
const ctxPath = join(root, "src/lib/agent/context.ts");

// 1) 從 src/lib/agent/tools/index.ts 拿到工具註冊順序
const indexSrc = readFileSync(join(toolsDir, "index.ts"), "utf8");
const registeredOrder: string[] = [];
const reReg = /registerTool\((\w+)\)/g;
let mm: RegExpExecArray | null;
while ((mm = reReg.exec(indexSrc))) registeredOrder.push(mm[1]);

// 2) 從每個 .ts 檔案抓出 const definition = { name: "xxx", description: "...", parameters: {...} }
function evalLiteral(src: string): any {
  // 用 Function eval；description 內可能有跨行 + 字串拼接，給 a tag 處理
  // eslint-disable-next-line no-new-func
  return Function(`"use strict"; return (${src});`)();
}

interface ParsedTool {
  exportName: string;
  filePath: string;
  definition: { name: string; description: string; parameters: any };
}

const parsed: ParsedTool[] = [];

for (const file of readdirSync(toolsDir)) {
  if (!file.endsWith(".ts") || file === "index.ts" || file.startsWith("_")) continue;
  const path = join(toolsDir, file);
  const code = readFileSync(path, "utf8");

  // 找 export const xxxTool: AgentToolExecutor = { definition, execute };
  const reExport = /export const (\w+Tool):\s*AgentToolExecutor\s*=\s*\{\s*definition\s*,?\s*execute\s*,?\s*\}/;
  const expM = reExport.exec(code);
  if (!expM) continue;
  const exportName = expM[1];

  // 找 const definition = { ... } as const;
  // 因為內容含 nested object 與字串拼接，先用一個簡單的「找 `const definition = {`，
  // 再從那位置開始 brace-match 到對應 `}` + ` as const;`」演算法
  const startIdx = code.indexOf("const definition = {");
  if (startIdx === -1) continue;
  let braceLevel = 0;
  let i = startIdx + "const definition = ".length;
  let inString: string | null = null;
  let inTemplate = false;
  let endIdx = -1;
  for (; i < code.length; i++) {
    const ch = code[i];
    const prev = code[i - 1];
    if (inTemplate) {
      if (ch === "`" && prev !== "\\") inTemplate = false;
      continue;
    }
    if (inString) {
      if (ch === inString && prev !== "\\") inString = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inString = ch;
      continue;
    }
    if (ch === "`") { inTemplate = true; continue; }
    if (ch === "{") braceLevel++;
    else if (ch === "}") {
      braceLevel--;
      if (braceLevel === 0) {
        endIdx = i + 1;
        break;
      }
    }
  }
  if (endIdx === -1) continue;
  const literalSrc = code.slice(startIdx + "const definition = ".length, endIdx);

  let definition: any;
  try {
    definition = evalLiteral(literalSrc);
  } catch (e) {
    process.stderr.write(`[warn] eval failed for ${file}: ${(e as Error).message}\n`);
    continue;
  }
  parsed.push({ exportName, filePath: file, definition });
}

// 3) 對齊註冊順序
const map = new Map(parsed.map((p) => [p.exportName, p]));
const orderedTools = registeredOrder
  .map((n) => map.get(n))
  .filter((p): p is ParsedTool => Boolean(p));

const tools = orderedTools.map((p) => ({
  type: "function" as const,
  function: {
    name: p.definition.name,
    description: p.definition.description,
    parameters: p.definition.parameters,
  },
}));

// 4) 抓 BASE_SYSTEM_PROMPT
const ctxSrc = readFileSync(ctxPath, "utf8");
const promptM = ctxSrc.match(/const BASE_SYSTEM_PROMPT = `([\s\S]*?)`;/);
const basePrompt = promptM ? promptM[1].replace(/\\`/g, "`") : "";

const toolsSection =
  "\n## 可用工具清單\n" +
  tools.map((t) => `- \`${t.function.name}\`：${t.function.description}`).join("\n");

const systemPrompt = basePrompt + toolsSection;

process.stdout.write(JSON.stringify({ systemPrompt, tools }));

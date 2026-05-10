#!/usr/bin/env node
/**
 * 模擬真實 agent 呼叫：完整 BASE_SYSTEM_PROMPT + 完整工具列表（23 支）
 * 一次只測一種組合，避開 rate limit。
 *
 * 用法：
 *   node scripts/debug-agent-tools.mjs full      # 全部 23 支工具
 *   node scripts/debug-agent-tools.mjs minus3    # 拿掉新加的 3 支
 *   node scripts/debug-agent-tools.mjs only3     # 只放新加的 3 支
 *   node scripts/debug-agent-tools.mjs noimg     # 全部但拿掉 excalidraw
 *   node scripts/debug-agent-tools.mjs nomer     # 全部但拿掉 mermaid
 *   node scripts/debug-agent-tools.mjs nocls     # 全部但拿掉 classroom_suggest
 */
import { config } from "dotenv";
import OpenAI from "openai";
import { spawnSync } from "node:child_process";

config();

const apiKey = process.env.GEMINI_API_KEY;
const baseURL = process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta/openai";
const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";

if (!apiKey) {
  console.error("缺 GEMINI_API_KEY");
  process.exit(1);
}

const client = new OpenAI({ apiKey, baseURL });

// 透過 tsx 把 src/lib/agent/tools/index.ts 的所有工具 + context 的 BASE_SYSTEM_PROMPT 抓出來
function loadAgentArtifacts() {
  const r = spawnSync(
    "npx",
    ["tsx", "scripts/_dump-agent-artifacts.ts"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
  );
  if (r.status !== 0) {
    throw new Error("_dump-agent-artifacts failed: " + r.stderr);
  }
  return JSON.parse(r.stdout);
}

const { systemPrompt, tools: allTools } = loadAgentArtifacts();
console.log(`[loaded] system prompt: ${systemPrompt.length} chars / ${Buffer.byteLength(systemPrompt, "utf8")} bytes`);
console.log(`[loaded] tools: ${allTools.length}`);
for (const t of allTools) {
  const desc = t.function?.description || "";
  const params = JSON.stringify(t.function?.parameters || {});
  console.log(
    `  - ${t.function?.name}: desc ${desc.length}c/${Buffer.byteLength(desc, "utf8")}b, params ${params.length}c`
  );
}

const NEW3 = new Set(["mermaid_diagram", "excalidraw_diagram", "classroom_suggest"]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function attempt(mode, tools) {
  console.log(`\n[mode] ${mode} → 帶 ${tools.length} 支工具`);
  for (let i = 1; i <= 5; i++) {
    try {
      const resp = await client.chat.completions.create({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: "你好，今天天氣如何？（這是測試訊息，不要呼叫工具）" },
        ],
        tools,
        temperature: 0.3,
      });
      console.log(`  OK (try ${i}):`, JSON.stringify(resp.choices?.[0]?.message?.content?.slice(0, 80)));
      return true;
    } catch (e) {
      const st = e?.status;
      console.log(`  FAIL (try ${i}): status=${st} msg="${e?.message}"`);
      if (e?.error && Object.keys(e.error).length) console.log(`    error:`, JSON.stringify(e.error));
      if (st === 429) {
        const wait = 60000;
        console.log(`  → rate-limited; sleeping ${wait / 1000}s...`);
        await sleep(wait);
        continue;
      }
      return false; // 非限流的失敗就停
    }
  }
  return false;
}

const requested = process.argv[2];
const allModes = ["full", "minus3", "noimg", "nomer", "nocls", "only3"];
const modes = requested ? [requested] : allModes;

for (const mode of modes) {
  let toolsToSend = allTools;
  if (mode === "minus3") toolsToSend = allTools.filter((t) => !NEW3.has(t.function.name));
  else if (mode === "only3") toolsToSend = allTools.filter((t) => NEW3.has(t.function.name));
  else if (mode === "noimg") toolsToSend = allTools.filter((t) => t.function.name !== "excalidraw_diagram");
  else if (mode === "nomer") toolsToSend = allTools.filter((t) => t.function.name !== "mermaid_diagram");
  else if (mode === "nocls") toolsToSend = allTools.filter((t) => t.function.name !== "classroom_suggest");
  await attempt(mode, toolsToSend);
  // 每次呼叫後 sleep 60 秒避免限流
  if (modes.indexOf(mode) < modes.length - 1) {
    console.log(`  (cool down 60s before next mode)`);
    await sleep(60000);
  }
}

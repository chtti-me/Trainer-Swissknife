#!/usr/bin/env node
/**
 * 用使用者提供的 GEMINI_API_KEY 直接打 Google API，
 * 連續驗證：
 *   1. 模型列表是否回得來（key 活著嗎）
 *   2. OpenAI-compat 端點打一個極簡 chat
 *   3. 完整 12 工具 + 完整 system prompt 打 chat
 *
 * 每步之間故意 sleep 久一點（free tier 10 RPM，安全 8 秒就夠）。
 */
import { config } from "dotenv";
import OpenAI from "openai";
import { spawnSync } from "node:child_process";

config();

const apiKey = process.env.GEMINI_API_KEY;
const baseURL =
  process.env.GEMINI_BASE_URL ||
  "https://generativelanguage.googleapis.com/v1beta/openai";
const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";

if (!apiKey) {
  console.error("缺 GEMINI_API_KEY");
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function loadAgentArtifacts() {
  const r = spawnSync("npx", ["tsx", "scripts/_dump-agent-artifacts.ts"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (r.status !== 0) {
    throw new Error("_dump-agent-artifacts failed: " + r.stderr);
  }
  return JSON.parse(r.stdout);
}

const client = new OpenAI({ apiKey, baseURL });

async function step1_listModels() {
  console.log("\n=== STEP 1: GET /v1beta/models（驗證 key 還活著）===");
  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
      { method: "GET" }
    );
    console.log("  HTTP", r.status, r.statusText);
    if (!r.ok) {
      const txt = await r.text();
      console.log("  body:", txt.slice(0, 500));
      return false;
    }
    const json = await r.json();
    const ourModel = json.models?.find((m) => m.name?.endsWith(`/${model}`));
    console.log(`  models 共 ${json.models?.length || 0} 個`);
    console.log(`  ${model}:`, ourModel ? "✓ 存在" : "✗ 找不到");
    if (ourModel) {
      console.log(
        "    supportedGenerationMethods:",
        ourModel.supportedGenerationMethods
      );
      console.log("    inputTokenLimit:", ourModel.inputTokenLimit);
      console.log("    outputTokenLimit:", ourModel.outputTokenLimit);
    }
    return true;
  } catch (e) {
    console.log("  FAIL:", e?.message);
    return false;
  }
}

async function step2_simpleChat() {
  console.log("\n=== STEP 2: 極簡 chat（無工具）===");
  try {
    const resp = await client.chat.completions.create({
      model,
      messages: [{ role: "user", content: "你好" }],
      temperature: 0.3,
    });
    console.log(
      "  OK:",
      JSON.stringify(resp.choices?.[0]?.message?.content?.slice(0, 80))
    );
    return true;
  } catch (e) {
    console.log("  FAIL:", "status=", e?.status, "msg=", e?.message);
    if (e?.error) console.log("  error:", JSON.stringify(e.error));
    return false;
  }
}

async function step3_fullToolset(systemPrompt, tools) {
  console.log("\n=== STEP 3: 完整 system prompt + 12 工具 ===");
  console.log(
    `  system prompt: ${systemPrompt.length} chars / ${Buffer.byteLength(systemPrompt, "utf8")} bytes`
  );
  console.log(`  tools: ${tools.length}`);
  try {
    const resp = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: "你好，今天能做什麼？" },
      ],
      tools,
      temperature: 0.3,
    });
    console.log(
      "  OK:",
      JSON.stringify(resp.choices?.[0]?.message?.content?.slice(0, 80))
    );
    return true;
  } catch (e) {
    console.log("  FAIL:", "status=", e?.status, "msg=", e?.message);
    if (e?.error) console.log("  error:", JSON.stringify(e.error));
    return false;
  }
}

async function step4_streaming(systemPrompt, tools) {
  console.log("\n=== STEP 4: 完整 12 工具 + 串流（模擬 OpenAI 路徑，純驗證）===");
  try {
    const resp = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: "你好" },
      ],
      tools,
      temperature: 0.3,
      stream: true,
    });
    let collected = "";
    for await (const chunk of resp) {
      collected += chunk.choices?.[0]?.delta?.content || "";
    }
    console.log("  OK stream:", JSON.stringify(collected.slice(0, 80)));
    return true;
  } catch (e) {
    console.log("  FAIL stream:", "status=", e?.status, "msg=", e?.message);
    if (e?.error) console.log("  error:", JSON.stringify(e.error));
    return false;
  }
}

async function main() {
  console.log(`[env] apiKey=${apiKey.slice(0, 10)}...${apiKey.slice(-4)}`);
  console.log(`[env] model=${model}`);
  console.log(`[env] baseURL=${baseURL}`);

  await step1_listModels();
  await sleep(8000);
  await step2_simpleChat();
  await sleep(8000);

  const { systemPrompt, tools } = loadAgentArtifacts();
  await step3_fullToolset(systemPrompt, tools);
  await sleep(8000);
  await step4_streaming(systemPrompt, tools);
}

main().catch((e) => {
  console.error("fatal", e);
  process.exit(1);
});

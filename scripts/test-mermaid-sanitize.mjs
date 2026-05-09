/**
 * 快速測 sanitizeFlowchartLabels 的 regex 行為，以及 stripClassDefs fallback 邏輯。
 * 用法：node scripts/test-mermaid-sanitize.mjs
 */

function sanitize(code) {
  return code.replace(/\[([^\]"\n]+)\]/g, (m, inner) => {
    if (!inner.trim()) return m;
    if (/[(),:;]/.test(inner)) return `["${inner}"]`;
    return m;
  });
}

function stripClassDefs(code) {
  let changed = false;
  const linesKept = [];
  for (const line of code.split("\n")) {
    if (/^\s*classDef\s+/.test(line)) {
      changed = true;
      continue;
    }
    if (/^\s*class\s+[\w,\s]+\s+\w+\s*$/.test(line)) {
      changed = true;
      continue;
    }
    linesKept.push(line);
  }
  let stripped = linesKept.join("\n");
  if (/:::\w+/.test(stripped)) {
    stripped = stripped.replace(/:::\w+/g, "");
    changed = true;
  }
  return { stripped, changed };
}

const cases = [
  ["A2[開發環境建置 (IDE, SDK)]:::stage1", `A2["開發環境建置 (IDE, SDK)"]:::stage1`],
  ["A1[Vibe Coding 核心概念]", "A1[Vibe Coding 核心概念]"],
  ["B[使用者:王小明]", `B["使用者:王小明"]`],
  [`C["已包好 (a, b)"]`, `C["已包好 (a, b)"]`],
  [`subgraph S1["階段一：基礎 (2 週)"]`, `subgraph S1["階段一：基礎 (2 週)"]`],
  ["D[甲 (乙) 丙]", `D["甲 (乙) 丙"]`],
  ["E[一般文字]", "E[一般文字]"],
  // 跨行不影響
  ["A[第一行\n第二行]", "A[第一行\n第二行]"],
  // 多個 in 同一行
  ["A[x:y] B[u,v]", `A["x:y"] B["u,v"]`],
  // classDef / class 語句不會被誤動（沒有 [...]）
  ["classDef stage1 fill:#dbeafe,stroke:#3b82f6", "classDef stage1 fill:#dbeafe,stroke:#3b82f6"],
  ["class A,B foundation", "class A,B foundation"],
];

let ok = 0;
let fail = 0;
for (const [input, expected] of cases) {
  const got = sanitize(input);
  const pass = got === expected;
  if (pass) ok++;
  else fail++;
  console.log(`${pass ? "PASS" : "FAIL"} | ${JSON.stringify(input)}`);
  console.log(`     →  ${JSON.stringify(got)}`);
  if (!pass) console.log(`     ✗  expect ${JSON.stringify(expected)}`);
}
console.log(`---\nOK ${ok} / FAIL ${fail}`);

console.log(`\n=== stripClassDefs ===`);
const stripCases = [
  {
    name: "user-reported case (classDef + subgraph + :::)",
    input: `flowchart TD
    classDef stage1 fill:#dbeafe,stroke:#3b82f6
    classDef stage2 fill:#dcfce7
    subgraph S1["階段一 (2 週)"]
        A1[核心概念]:::stage1
        A2["環境建置 (IDE)"]:::stage1
    end
    subgraph S2["階段二 (3 週)"]
        B1[Async]:::stage2
    end
    A1 --> A2 --> B1
    class A1,A2 foundation`,
    expectedChanged: true,
    mustNotContain: ["classDef", ":::", "class A1,A2 foundation"],
    mustContain: ["subgraph S1", "A1[核心概念]", "A1 --> A2 --> B1"],
  },
  {
    name: "no classDef (no change)",
    input: `flowchart TD\n  A --> B\n  B --> C`,
    expectedChanged: false,
  },
  {
    name: "only :::",
    input: `flowchart TD\n  A:::stage1 --> B`,
    expectedChanged: true,
    mustNotContain: [":::"],
    mustContain: ["A --> B"],
  },
];

let stripOk = 0;
let stripFail = 0;
for (const c of stripCases) {
  const result = stripClassDefs(c.input);
  let pass = result.changed === c.expectedChanged;
  if (pass && c.mustNotContain) {
    for (const s of c.mustNotContain) {
      if (result.stripped.includes(s)) {
        pass = false;
        console.log(`  ✗ unexpected substring still present: ${s}`);
      }
    }
  }
  if (pass && c.mustContain) {
    for (const s of c.mustContain) {
      if (!result.stripped.includes(s)) {
        pass = false;
        console.log(`  ✗ missing expected substring: ${s}`);
      }
    }
  }
  console.log(`${pass ? "PASS" : "FAIL"} | ${c.name}`);
  if (!pass) {
    console.log(`  changed=${result.changed} (expected ${c.expectedChanged})`);
    console.log(`  stripped:\n${result.stripped}`);
  }
  if (pass) stripOk++;
  else stripFail++;
}
console.log(`---\nstripClassDefs OK ${stripOk} / FAIL ${stripFail}`);

process.exit(fail + stripFail === 0 ? 0 : 1);

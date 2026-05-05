/**
 * 課程規劃工具箱依賴解析器
 *
 * 「我只想跑⑥講師媒合 + ⑩教材資源」這種需求進來，這支函式負責：
 *   1. 算出傳遞依賴閉包：⑥需要④outline → ④需要③objectives → ③需要②audience → ②需要①needs
 *   2. 拓樸排序：保證執行時上游一定先於下游
 *   3. 區分 displayed（使用者勾選的）vs auxiliary（自動補上的上游）
 *
 * 不打 LLM、不寫 DB、無副作用，純函式工具庫。
 */
import "server-only";

import {
  LLM_SKILL_NAMES,
  SKILL_PIPELINE_ORDER,
  SKILL_UPSTREAM,
  type LlmSkillName,
} from "./schemas/common";

/** 計算 selected 的傳遞依賴閉包（包含 selected 本身），按 SKILL_PIPELINE_ORDER 拓樸排序回傳。 */
export function resolveRequiredSkills(selected: LlmSkillName[]): LlmSkillName[] {
  const required = new Set<LlmSkillName>(selected);
  let changed = true;
  while (changed) {
    changed = false;
    for (const s of [...required]) {
      for (const dep of SKILL_UPSTREAM[s]) {
        if (!required.has(dep)) {
          required.add(dep);
          changed = true;
        }
      }
    }
  }
  // 用 SKILL_PIPELINE_ORDER 排序保證上游先於下游（因為 SKILL_PIPELINE_ORDER 本身就是拓樸順序）
  return SKILL_PIPELINE_ORDER.filter((n) => required.has(n));
}

/** 區分使用者勾選的 vs 自動補上的上游依賴。 */
export function splitDisplayedAndAuxiliary(
  selected: LlmSkillName[],
  required: LlmSkillName[],
): { displayed: LlmSkillName[]; auxiliary: LlmSkillName[] } {
  const selectedSet = new Set(selected);
  const displayed: LlmSkillName[] = [];
  const auxiliary: LlmSkillName[] = [];
  for (const s of required) {
    if (selectedSet.has(s)) displayed.push(s);
    else auxiliary.push(s);
  }
  return { displayed, auxiliary };
}

/** 簡單 sanity check：所有 selected 必須是合法 LLM Skill 名稱、不能空 */
export function validateSelectedSkills(raw: unknown): { ok: true; selected: LlmSkillName[] } | { ok: false; error: string } {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { ok: false, error: "至少需要勾選 1 個 Skill" };
  }
  const allowed = new Set<string>(LLM_SKILL_NAMES);
  const seen = new Set<LlmSkillName>();
  for (const item of raw) {
    if (typeof item !== "string" || !allowed.has(item)) {
      return { ok: false, error: `未知的 Skill 名稱：${String(item)}` };
    }
    seen.add(item as LlmSkillName);
  }
  return { ok: true, selected: [...seen] };
}

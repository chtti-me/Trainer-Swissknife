/**
 * 課程規劃幫手 — 上游 output 投餵下游前的精簡工具
 *
 * 觀察：
 *   - 各 Skill 的 buildUserMessage 已經做欄位 extraction，user message text 並不會吃太多 token。
 *   - 真正會 bloat 的是 instructor 的 candidatesPerSession：每個 session × 4 來源 × 多位候選人，每位都帶
 *     name/source/expertise/organization/email/phone/fitReasoning/notes 一整組，整體可達 10~20 KB。
 *   - 其他 Skill 的上游 output 進來後 inputSchema.parse() 會驗證；這個檔不去動 inputSchema，只負責「進到
 *     LLM 之前先把候選人陣列削短」。
 *
 * 規則：每個 session 每個來源最多保留 N 位候選人（預設 3）。順序維持 lookupAllSources() 內的 priority。
 */

import type { Candidate } from "./schemas/instructor";

export const INSTRUCTOR_CANDIDATES_PER_SOURCE = Number(
  process.env.COURSE_PLANNER_INSTRUCTOR_CANDIDATES_PER_SOURCE ?? "3",
);

export interface RawCandidatesPerSession {
  sessionPosition: number;
  sessionName: string;
  personalContacts: Candidate[];
  trainers: Candidate[];
  historyInstructors: Candidate[];
  webResults: Candidate[];
}

/**
 * 削減每個 session 各來源的候選人到上限（預設 3 位）。
 * 削減後傳給 instructor Skill，token 用量約可減 50%~70%。
 */
export function pruneCandidatesPerSession(
  raw: RawCandidatesPerSession[],
  perSourceLimit = INSTRUCTOR_CANDIDATES_PER_SOURCE,
): RawCandidatesPerSession[] {
  if (perSourceLimit <= 0) return raw;
  return raw.map((s) => ({
    sessionPosition: s.sessionPosition,
    sessionName: s.sessionName,
    personalContacts: s.personalContacts.slice(0, perSourceLimit),
    trainers: s.trainers.slice(0, perSourceLimit),
    historyInstructors: s.historyInstructors.slice(0, perSourceLimit),
    webResults: s.webResults.slice(0, perSourceLimit),
  }));
}

/**
 * 【教室建議：與 TIS 溝通】
 * 驗證 session、抓取教室清單、離線／DEMO 模擬資料等。
 * 院本部（department P）容量與設備以 `src/data/classroom-inventory/hq.json`（JSON 檔）為準，由 `scripts/generate-tis-classroom-inventory.mjs` 自 TIS 存檔產生。
 */
import {
  filterHqRoomsForQuery,
  getHqRoomById,
  scoreHqRoom,
  type TisClassroomRoomRow,
} from "@/lib/classroom/tis-classroom-inventory";

const TIS_BASE = "https://tis.cht.com.tw";
const OFFLINE_DEMO_MODE = process.env.CLASSROOM_OFFLINE_MODE !== "false";

export interface ClassroomSuggestQuery {
  department: string;
  building: string;
  date: string;
  timeStart: string;
  timeEnd: string;
  attendees: number;
  classroomTypes: string[];
  requiredFeatures: string[];
}

export interface ClassroomSuggestion {
  roomId: string;
  roomName: string;
  building: string;
  capacity: number;
  score: number;
  reasons: string[];
  reserveUrl: string;
}

export type DemoCampusProfile = "hq" | "taichung" | "kaohsiung";

function headersWithSession(sessionId: string, contentType?: string): HeadersInit {
  const headers: Record<string, string> = {
    Cookie: sessionId,
    Referer: `${TIS_BASE}/jap/classroom/ClassroomUseStatus.jsp`,
  };
  if (contentType) headers["Content-Type"] = contentType;
  return headers;
}

export async function validateTisSession(sessionId: string): Promise<boolean> {
  if (OFFLINE_DEMO_MODE) {
    // 離線模式下允許流程往下，方便本機展示與開發。
    return true;
  }
  try {
    const res = await fetch(`${TIS_BASE}/jap/classroom/QueryClassroom.jsp`, {
      method: "GET",
      headers: headersWithSession(sessionId),
      cache: "no-store",
    });
    if (!res.ok) return false;
    const text = await res.text();
    // 若出現登入頁常見關鍵字，代表 session（工作階段）已失效。
    if (/login|帳號|密碼|請登入/i.test(text)) return false;
    return true;
  } catch {
    return false;
  }
}

function buildSuggestionsFromHqRows(
  rows: TisClassroomRoomRow[],
  query: ClassroomSuggestQuery,
  modeLabel: string
): ClassroomSuggestion[] {
  return rows
    .map((room) => {
      const { score, reasons: baseReasons } = scoreHqRoom(room, { attendees: query.attendees });
      const reasons = [modeLabel, ...baseReasons];
      return {
        roomId: room.roomId,
        roomName: room.displayCode,
        building: query.building,
        capacity: room.maxCapacity,
        score,
        reasons,
        reserveUrl: `${TIS_BASE}/jap/classroom/ReserveClassroom.jsp`,
      };
    })
    .sort((a, b) => b.score - a.score);
}

function buildOfflineMockSuggestions(query: ClassroomSuggestQuery) {
  const candidates = filterHqRoomsForQuery(query);
  const scored = buildSuggestionsFromHqRows(candidates, query, "離線模式：院本部設備表 JSON（JSON 檔）");
  return {
    suggestions: scored.slice(0, 5),
    candidateCount: candidates.length,
  };
}

export function getDemoClassroomSuggestions(
  profile: DemoCampusProfile,
  query: ClassroomSuggestQuery
): { suggestions: ClassroomSuggestion[]; candidateCount: number } {
  if (profile !== "hq") {
    return { suggestions: [], candidateCount: 0 };
  }

  const candidates = filterHqRoomsForQuery(query);
  const suggestions = buildSuggestionsFromHqRows(candidates, query, "DEMO 模式：院本部設備表 JSON（JSON 檔）");
  return {
    suggestions: suggestions.slice(0, 5),
    candidateCount: candidates.length,
  };
}

function parseRoomOptions(html: string): Array<{ roomId: string; roomName: string }> {
  const options: Array<{ roomId: string; roomName: string }> = [];
  const match = html.match(/name=roomid[^>]*>([\s\S]*?)<\/select>/i);
  if (!match) return options;
  const optionRegex = /<option\s+value=([^>\s]+)[^>]*>([^<]*)/gi;
  let optionMatch: RegExpExecArray | null;
  while ((optionMatch = optionRegex.exec(match[1])) !== null) {
    const value = optionMatch[1]?.trim();
    const label = optionMatch[2]?.trim();
    if (!value || value === '""') continue;
    if (!label) continue;
    options.push({ roomId: value, roomName: label });
  }
  return options;
}

function scoreSuggestion(query: ClassroomSuggestQuery, room: { roomId: string; roomName: string }): ClassroomSuggestion {
  const inv = getHqRoomById(room.roomId);
  if (inv) {
    const { score, reasons: invReasons } = scoreHqRoom(inv, { attendees: query.attendees });
    const reasons = ["符合 TIS 回傳選項，並以院本部設備表 JSON（JSON 檔）對應容量", ...invReasons];
    return {
      roomId: room.roomId,
      roomName: room.roomName,
      building: query.building,
      capacity: inv.maxCapacity,
      score,
      reasons,
      reserveUrl: `${TIS_BASE}/jap/classroom/ReserveClassroom.jsp`,
    };
  }

  const estimatedCapacity = 40;
  let score = 55;
  const reasons: string[] = ["教室未在院本部設備表 JSON（JSON 檔）中，容量採預設估算"];
  if (query.attendees > 0) {
    if (query.attendees <= estimatedCapacity) {
      score += 12;
      reasons.push("預估容量可能可容納");
    } else {
      score -= 15;
      reasons.push("可能容量不足，建議人工確認");
    }
  }
  score = Math.max(0, Math.min(100, score));
  return {
    roomId: room.roomId,
    roomName: room.roomName,
    building: query.building,
    capacity: estimatedCapacity,
    score,
    reasons,
    reserveUrl: `${TIS_BASE}/jap/classroom/ReserveClassroom.jsp`,
  };
}

export async function getClassroomSuggestionsFromTis(
  sessionId: string,
  query: ClassroomSuggestQuery
): Promise<{ suggestions: ClassroomSuggestion[]; candidateCount: number }> {
  if (OFFLINE_DEMO_MODE) {
    return buildOfflineMockSuggestions(query);
  }

  const body = new URLSearchParams();
  body.set("department", query.department);
  body.set("building", query.building);
  query.classroomTypes.forEach((t) => body.append("classroomtype", t));

  // 教室使用狀況列表頁使用年月，先由 date（日期）拆解。
  const d = new Date(query.date);
  if (!Number.isNaN(d.getTime())) {
    body.set("yy", String(d.getFullYear()));
    body.set("mm", String(d.getMonth() + 1));
  }

  const res = await fetch(`${TIS_BASE}/jap/classroom/ClassroomUseStatusList.jsp`, {
    method: "POST",
    headers: headersWithSession(sessionId, "application/x-www-form-urlencoded"),
    body: body.toString(),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error("TIS_FETCH_FAILED");
  }

  const html = await res.text();
  if (/login|帳號|密碼|請登入/i.test(html)) {
    throw new Error("TIS_SESSION_EXPIRED");
  }

  const parsed = parseRoomOptions(html);
  /** 僅院本部（P）以 hq 設備表 JSON（JSON 檔）與查詢條件交集；其他所別仍採 TIS 回傳清單。 */
  const rooms =
    query.department === "P"
      ? (() => {
          const allowedIds = new Set(filterHqRoomsForQuery(query).map((r) => r.roomId));
          return parsed.filter((r) => allowedIds.has(r.roomId));
        })()
      : parsed;
  const suggestions = rooms.map((room) => scoreSuggestion(query, room));
  suggestions.sort((a, b) => b.score - a.score);

  return {
    suggestions: suggestions.slice(0, 5),
    candidateCount: rooms.length,
  };
}


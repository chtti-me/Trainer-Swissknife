/**
 * Agent 工具：教室預約建議（classroom_suggest）
 * 對應功能頁 /classroom-suggestions 的後端邏輯（src/lib/classroom/tis.ts）。
 * 預設使用院本部 DEMO 設備表 JSON（src/data/classroom-inventory/hq.json），
 * 在 OFFLINE 模式下與正式 TIS 路徑都會回相同的離線建議（不會自動送出預約）。
 *
 * 與 SOP（slug=classroom_suggest）連動：小瑞遇到「找一間可借用教室」類問題時，
 * 應**優先**呼叫此工具，而非引導使用者到頁面手動操作。
 */
import "server-only";

import {
  getClassroomSuggestionsFromTis,
  getDemoClassroomSuggestions,
  validateTisSession,
  type ClassroomSuggestion,
  type DemoCampusProfile,
} from "@/lib/classroom/tis";
import { getClassroomSession } from "@/lib/classroom/session-store";
import { inventoryHasData } from "@/lib/classroom/tis-classroom-inventory";
import type { AgentToolExecutor, AgentToolResult } from "../types";

const definition = {
  name: "classroom_suggest",
  description:
    "教室預約建議工具：根據日期、時段、人數、教室性質、設備需求，回傳本院可借用教室的建議清單（已扣除指定時段被別人借走的）。\n" +
    "預設用 DEMO 院本部設備表 JSON（hq.json，板橋 15 間教室）；若使用者已在 /classroom-suggestions 頁面建立 TIS session 並把 sessionToken 提供給你，可帶入以查 TIS 即時資料。\n" +
    "本工具**只回建議**，不會送出預約；最終預約一律由人員到 TIS（培訓資訊系統）完成（回傳的 reserveUrl 是 TIS 直連連結）。\n" +
    "代碼字典：\n" +
    "- department：P=院本部（板橋）、T=台中所、K=高雄所、E=全 e 課程；台中／高雄目前無 DEMO 設備資料。\n" +
    "- building：0=綜合大樓、1=實驗大樓、6=教學大樓、7=板橋會館、11=服務大樓、12=文康中心、13=國際學苑。\n" +
    "- classroomTypes（多選 AND）：1=一般教室、2=電腦教室、3=會議／研討室、4=遠距／直播專用、5=多功能教室、6=實作／實驗型；空陣列＝不篩。\n" +
    "- requiredFeatures：projector=投影機、mic=麥克風、vc=視訊會議、whiteboard=電子白板、recording=錄影／錄音；空陣列＝不篩。",
  parameters: {
    type: "object",
    properties: {
      date: {
        type: "string",
        description: "查詢日期（YYYY-MM-DD），例如 2026-05-15",
      },
      timeStart: {
        type: "string",
        description: "起始時間（HH:mm，每 15 分鐘一格），例如 09:00",
      },
      timeEnd: {
        type: "string",
        description: "結束時間（HH:mm，每 15 分鐘一格），例如 12:00",
      },
      attendees: {
        type: "number",
        description: "預估參加人數；用於容量篩選（最大容量 ≥ attendees 為硬條件）",
      },
      department: {
        type: "string",
        description: "所別代碼（預設 P 院本部）",
        enum: ["P", "T", "K", "E"],
      },
      building: {
        type: "string",
        description: "樓別代碼；不限定可傳空字串。院本部常見：0/1/6/7/11/12/13",
      },
      classroomTypes: {
        type: "array",
        items: { type: "string" },
        description: "教室性質（複選 AND，留空＝不篩），例：[\"2\"] 表電腦教室；[\"3\",\"4\"] 表會議室且遠距",
      },
      requiredFeatures: {
        type: "array",
        items: { type: "string", enum: ["projector", "mic", "vc", "whiteboard", "recording"] },
        description: "設備需求關鍵字（複選），影響評分與條件說明",
      },
      sessionToken: {
        type: "string",
        description:
          "（選填）使用者在 /classroom-suggestions 頁面建立的 TIS sessionToken（本系統發的 UUID，非 JSESSIONID 本身）；提供時嘗試走即時 TIS，否則走 DEMO 院本部設備表 JSON。",
      },
    },
    required: ["date", "timeStart", "timeEnd", "attendees"],
  },
} as const;

interface ClassroomSuggestArgs {
  date: string;
  timeStart: string;
  timeEnd: string;
  attendees: number;
  department?: string;
  building?: string;
  classroomTypes?: string[];
  requiredFeatures?: string[];
  sessionToken?: string;
}

function pickStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x ?? "").trim()).filter(Boolean);
}

function summarizeForLlm(
  suggestions: ClassroomSuggestion[],
  meta: { mode: string; profile?: string; candidateCount: number }
): string {
  if (suggestions.length === 0) {
    return `（${meta.mode}）查無符合條件教室；候選總數 ${meta.candidateCount}。建議放寬人數、教室性質或設備條件後再試。`;
  }
  const top = suggestions
    .slice(0, 5)
    .map(
      (s, idx) =>
        `${idx + 1}. ${s.roomName}（${s.roomId}）｜容量 ${s.capacity} ｜分數 ${s.score}\n   原因：${s.reasons.join(" / ")}\n   預約連結：${s.reserveUrl}`
    )
    .join("\n");
  return `（${meta.mode}${meta.profile ? `／${meta.profile}` : ""}）共 ${suggestions.length} 筆建議（候選 ${meta.candidateCount}）：\n${top}`;
}

async function execute(params: Record<string, unknown>): Promise<AgentToolResult> {
  try {
    const args = params as Record<string, unknown> as Partial<ClassroomSuggestArgs>;

    const date = String(args.date || "").trim();
    const timeStart = String(args.timeStart || "").trim();
    const timeEnd = String(args.timeEnd || "").trim();
    const attendeesRaw = Number(args.attendees ?? 0);
    const attendees = Number.isFinite(attendeesRaw) ? attendeesRaw : 0;

    const department = String(args.department || "P").trim() || "P";
    const building = String(args.building || "").trim();
    const classroomTypes = pickStringArray(args.classroomTypes);
    const requiredFeatures = pickStringArray(args.requiredFeatures);
    const sessionToken = String(args.sessionToken || "").trim();

    if (!date || !timeStart || !timeEnd) {
      return {
        success: false,
        error: "必要欄位不足：date / timeStart / timeEnd 都要提供（YYYY-MM-DD 與 HH:mm）",
      };
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return { success: false, error: `date 格式錯誤：${date}（應為 YYYY-MM-DD，例如 2026-05-15）` };
    }
    if (!/^\d{2}:\d{2}$/.test(timeStart) || !/^\d{2}:\d{2}$/.test(timeEnd)) {
      return { success: false, error: "時間格式應為 HH:mm（例如 09:00）" };
    }
    if (timeStart >= timeEnd) {
      return { success: false, error: `時間區間不合法：起始 ${timeStart} 必須早於結束 ${timeEnd}` };
    }

    const query = {
      department,
      building,
      date,
      timeStart,
      timeEnd,
      attendees,
      classroomTypes,
      requiredFeatures,
    };

    // 路徑 1：使用者帶了 TIS sessionToken — 嘗試即時查 TIS。
    // 在離線模式下（CLASSROOM_OFFLINE_MODE !== "false"）即時路徑也會回 hq.json 的離線資料。
    if (sessionToken) {
      const session = getClassroomSession(sessionToken);
      if (!session) {
        return {
          success: false,
          error: "TIS sessionToken 不存在或已過期；請使用者到 /classroom-suggestions 頁面重新建立 session（工作階段）",
        };
      }
      const valid = await validateTisSession(session.sessionId);
      if (!valid) {
        return {
          success: false,
          error: "TIS session（工作階段）已失效，請使用者重新提供 JSESSIONID",
        };
      }
      const result = await getClassroomSuggestionsFromTis(session.sessionId, query);
      return {
        success: true,
        data: {
          mode: "tis",
          query,
          suggestions: result.suggestions,
          candidateCount: result.candidateCount,
          excludedCount: Math.max(0, result.candidateCount - result.suggestions.length),
          summary: summarizeForLlm(result.suggestions, {
            mode: "TIS 即時",
            candidateCount: result.candidateCount,
          }),
          notice:
            "本工具只提供建議；最終預約請點 reserveUrl 連到 TIS 系統由人員操作。本系統不會幫你送預約。",
        },
      };
    }

    // 路徑 2：DEMO 模式（預設）— 各所別吃對應的設備表 JSON；占位空檔會主動回提示。
    const profile: DemoCampusProfile = department === "T" ? "taichung" : department === "K" ? "kaohsiung" : "hq";

    if (!inventoryHasData(profile)) {
      return {
        success: true,
        data: {
          mode: "demo",
          profile,
          query,
          suggestions: [],
          candidateCount: 0,
          excludedCount: 0,
          summary: `（DEMO／${profile}）此所別尚未匯入設備表 JSON（占位空檔），離線模式無法提供建議。可改詢問院本部（department=P），或請使用者在 /classroom-suggestions 頁面提供 TIS session 後再試。`,
          notice:
            "院本部（hq）已有離線設備表；台中所、高雄所占位中，待對應 TIS『列印教室基本資料』HTML 匯入並執行 npm run data:tis-classrooms 即自動生效。",
        },
      };
    }

    const demo = getDemoClassroomSuggestions(profile, query);

    return {
      success: true,
      data: {
        mode: "demo",
        profile,
        query,
        suggestions: demo.suggestions,
        candidateCount: demo.candidateCount,
        excludedCount: Math.max(0, demo.candidateCount - demo.suggestions.length),
        summary: summarizeForLlm(demo.suggestions, {
          mode: "DEMO",
          profile,
          candidateCount: demo.candidateCount,
        }),
        notice:
          "本工具只提供建議；最終預約請點 reserveUrl 連到 TIS 系統由人員操作。本系統不會幫你送預約。",
      },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      success: false,
      error:
        msg === "TIS_SESSION_EXPIRED"
          ? "TIS session（工作階段）已失效，請使用者重新提供 JSESSIONID"
          : msg === "TIS_FETCH_FAILED"
            ? "TIS 連線失敗，請稍後重試或改用 DEMO 院本部"
            : `教室建議查詢失敗：${msg}`,
    };
  }
}

export const classroomSuggestTool: AgentToolExecutor = { definition, execute };

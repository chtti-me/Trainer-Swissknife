/**
 * 【TIS 教室設備清單（多所別 registry）】
 * 各所別資料來源於 `src/data/classroom-inventory/<campusId>.json`，由
 * `scripts/generate-tis-classroom-inventory.mjs` 從 QueryPrintClassroom 存檔產生。
 * 目前只有院本部（hq）有實際資料；台中（taichung）、高雄（kaohsiung）為占位空檔，
 * 待對應 HTML 匯入並重跑 `npm run data:tis-classrooms` 後即自動生效。
 *
 * 對外 API：
 *  - 通用：`getRoomById(campusId, roomId)`、`filterRoomsForQuery(query, campusId)`、`scoreRoom(room, query)`
 *  - 院本部 alias（向下相容）：`getHqRoomById`、`filterHqRoomsForQuery`、`scoreHqRoom`、`HQ_CLASSROOM_INVENTORY`
 */
import hqRaw from "@/data/classroom-inventory/hq.json";
import taichungRaw from "@/data/classroom-inventory/taichung.json";
import kaohsiungRaw from "@/data/classroom-inventory/kaohsiung.json";

export type CampusId = "hq" | "taichung" | "kaohsiung";

export type TisClassroomEquipment = Record<
  | "projector"
  | "overheadProjector"
  | "amplifier"
  | "recording"
  | "vcr"
  | "network"
  | "wallFan"
  | "camera"
  | "splitAC"
  | "centralAC"
  | "deskMic"
  | "surveillance"
  | "infoPodium"
  | "holidayAC"
  | "digitalPen",
  boolean
>;

export interface TisClassroomRoomRow {
  roomId: string;
  displayCode: string;
  nature: string;
  tags: string[];
  isComputerClassroom: boolean;
  isDistanceClassroom: boolean;
  buildingNameZh: string;
  tisBuildingCode: string;
  standardCapacity: number;
  maxCapacity: number;
  equipment: TisClassroomEquipment;
}

export interface TisClassroomInventoryFile {
  meta: {
    sourcePageUrl: string;
    sourceHtmlFile: string;
    campusId?: string;
    tisDepartmentCode?: string;
    campusLabel: string;
    description: string;
    roomCount: number;
    generatedAt: string;
    equipmentFieldLabelsZh?: Record<string, string>;
  };
  rooms: TisClassroomRoomRow[];
}

/** 全部所別教室靜態資料；台中／高雄目前為占位空檔（rooms 為空陣列）。 */
export const CLASSROOM_INVENTORY_BY_CAMPUS: Record<CampusId, TisClassroomInventoryFile> = {
  hq: hqRaw as TisClassroomInventoryFile,
  taichung: taichungRaw as TisClassroomInventoryFile,
  kaohsiung: kaohsiungRaw as TisClassroomInventoryFile,
};

/** TIS 所別代碼 ↔ 本系統 campusId 對照（E 全 e 課程不對應任何實體所別）。 */
export function tisDepartmentToCampusId(department: string): CampusId | null {
  switch (department) {
    case "P":
      return "hq";
    case "T":
      return "taichung";
    case "K":
      return "kaohsiung";
    default:
      return null;
  }
}

export function campusIdToTisDepartment(campusId: CampusId): string {
  return CLASSROOM_INVENTORY_BY_CAMPUS[campusId].meta.tisDepartmentCode || "";
}

/** 該所別是否已匯入實際教室資料（rooms 不是空陣列）。 */
export function inventoryHasData(campusId: CampusId): boolean {
  return CLASSROOM_INVENTORY_BY_CAMPUS[campusId].rooms.length > 0;
}

export function getRoomById(campusId: CampusId, roomId: string): TisClassroomRoomRow | undefined {
  return CLASSROOM_INVENTORY_BY_CAMPUS[campusId].rooms.find((r) => r.roomId === roomId);
}

/** 是否符合表單勾選的教室性質代碼（AND（且））；未勾選則不篩。 */
export function matchesClassroomTypeSelection(room: TisClassroomRoomRow, selectedCodes: string[]): boolean {
  if (selectedCodes.length === 0) return true;
  const nature = room.nature;
  return selectedCodes.every((code) => matchesSingleClassroomType(nature, code));
}

function matchesSingleClassroomType(nature: string, code: string): boolean {
  switch (code) {
    case "1":
      return (
        /普通|階梯|籃球/.test(nature) ||
        nature === "" ||
        (/遠距/.test(nature) && !/電腦教室/.test(nature))
      );
    case "2":
      return /電腦教室/.test(nature);
    case "3":
      return /會議廳/.test(nature);
    case "4":
      return /遠距/.test(nature);
    case "5":
      return true;
    case "6":
      return /實驗室|機房/.test(nature);
    default:
      return true;
  }
}

/** 是否具備使用者勾選的設備（AND）。 */
export function satisfiesRequiredFeatures(room: TisClassroomRoomRow, features: string[]): boolean {
  if (features.length === 0) return true;
  const eq = room.equipment;
  return features.every((f) => {
    switch (f) {
      case "projector":
        return eq.projector || eq.overheadProjector;
      case "mic":
        return eq.deskMic || eq.amplifier;
      case "vc":
        return eq.network && (eq.camera || room.isDistanceClassroom);
      case "whiteboard":
        return eq.digitalPen;
      case "recording":
        return eq.recording || eq.surveillance;
      default:
        return true;
    }
  });
}

export interface ClassroomFilterQuery {
  building: string;
  attendees: number;
  classroomTypes: string[];
  requiredFeatures: string[];
}

export function filterRoomsForQuery(
  query: ClassroomFilterQuery,
  campusId: CampusId
): TisClassroomRoomRow[] {
  const rooms = CLASSROOM_INVENTORY_BY_CAMPUS[campusId].rooms;
  return rooms.filter((room) => {
    if (query.building && room.tisBuildingCode !== query.building) return false;
    if (query.attendees > 0 && query.attendees > room.maxCapacity) return false;
    if (!matchesClassroomTypeSelection(room, query.classroomTypes)) return false;
    if (!satisfiesRequiredFeatures(room, query.requiredFeatures)) return false;
    return true;
  });
}

export function scoreRoom(
  room: TisClassroomRoomRow,
  query: { attendees: number }
): { score: number; reasons: string[] } {
  let score = 52;
  const reasons: string[] = [];

  if (query.attendees > 0) {
    if (query.attendees <= room.standardCapacity) {
      score += 22;
      reasons.push(`人數未超過標準人數（${room.standardCapacity}）`);
    } else if (query.attendees <= room.maxCapacity) {
      score += 12;
      reasons.push(`人數在最大容量內（標準 ${room.standardCapacity}／最大 ${room.maxCapacity}）`);
    }
  } else {
    reasons.push(`最大容量 ${room.maxCapacity} 人`);
  }

  if (room.isComputerClassroom) reasons.push("為電腦教室（電腦教室）");
  if (room.isDistanceClassroom) reasons.push("性質含遠距教室（遠距教室）");

  score = Math.max(0, Math.min(100, score));
  return { score, reasons };
}

// ---- 院本部（hq）向下相容 alias ----

/** 院本部教室靜態資料（向下相容；新程式請改用 `CLASSROOM_INVENTORY_BY_CAMPUS.hq`）。 */
export const HQ_CLASSROOM_INVENTORY = CLASSROOM_INVENTORY_BY_CAMPUS.hq;

export function getHqRoomById(roomId: string): TisClassroomRoomRow | undefined {
  return getRoomById("hq", roomId);
}

export function filterHqRoomsForQuery(
  query: ClassroomFilterQuery,
  rooms: TisClassroomRoomRow[] = CLASSROOM_INVENTORY_BY_CAMPUS.hq.rooms
): TisClassroomRoomRow[] {
  if (rooms === CLASSROOM_INVENTORY_BY_CAMPUS.hq.rooms) {
    return filterRoomsForQuery(query, "hq");
  }
  // 為了相容舊呼叫端傳入自訂 rooms 的情境，這裡保留就地過濾。
  return rooms.filter((room) => {
    if (query.building && room.tisBuildingCode !== query.building) return false;
    if (query.attendees > 0 && query.attendees > room.maxCapacity) return false;
    if (!matchesClassroomTypeSelection(room, query.classroomTypes)) return false;
    if (!satisfiesRequiredFeatures(room, query.requiredFeatures)) return false;
    return true;
  });
}

export function scoreHqRoom(
  room: TisClassroomRoomRow,
  query: { attendees: number }
): { score: number; reasons: string[] } {
  return scoreRoom(room, query);
}

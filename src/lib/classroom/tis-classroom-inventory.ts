/**
 * 【TIS 教室設備清單（院本部）】
 * 資料來源：`src/data/classroom-inventory/hq.json`（由 `scripts/generate-tis-classroom-inventory.mjs` 從 QueryPrintClassroom 存檔產生）。
 * 台中／高雄產出檔可沿用相同型別，於串接所別時再掛載。
 */
import raw from "@/data/classroom-inventory/hq.json";

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

/** 院本部（TIS department P）教室靜態資料，與設備表 JSON 一致。 */
export const HQ_CLASSROOM_INVENTORY = raw as TisClassroomInventoryFile;

export function getHqRoomById(roomId: string): TisClassroomRoomRow | undefined {
  return HQ_CLASSROOM_INVENTORY.rooms.find((r) => r.roomId === roomId);
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

export function filterHqRoomsForQuery(
  query: {
    building: string;
    attendees: number;
    classroomTypes: string[];
    requiredFeatures: string[];
  },
  rooms: TisClassroomRoomRow[] = HQ_CLASSROOM_INVENTORY.rooms
): TisClassroomRoomRow[] {
  return rooms.filter((room) => {
    if (room.tisBuildingCode !== query.building) return false;
    if (query.attendees > 0 && query.attendees > room.maxCapacity) return false;
    if (!matchesClassroomTypeSelection(room, query.classroomTypes)) return false;
    if (!satisfiesRequiredFeatures(room, query.requiredFeatures)) return false;
    return true;
  });
}

export function scoreHqRoom(room: TisClassroomRoomRow, query: { attendees: number }): { score: number; reasons: string[] } {
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

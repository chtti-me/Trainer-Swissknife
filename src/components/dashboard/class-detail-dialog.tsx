"use client";

/**
 * 【班次詳情彈窗】檢視 / 編輯模式切換
 *
 * 兩種模式：
 *   1. 檢視模式（預設）— 所有欄位純顯示；可編輯欄位旁若被使用者手動覆寫過會顯示「✎ 手動覆寫」徽章 + 「還原為 TIS 值」連結
 *   2. 編輯模式 — 點「編輯」進入；所有可編輯欄位變表單元件；「儲存」叫 PUT /api/classes/[id]
 *
 * 後端機制（src/lib/tis/sync-applier.ts）：
 *   - 使用者改過的欄位會 mark 進 manualOverrides，下次 TIS sync 不會蓋掉
 *   - TIS sync 會把「最新 TIS 值」存到 tisOriginalValues 供「還原為 TIS 值」用
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Mail, Pencil, Save, X, RotateCcw, Loader2, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/components/ui/toaster";
import { formatDateTime, getStatusColor } from "@/lib/utils";
import dynamic from "next/dynamic";
import { readResponseJson } from "@/lib/read-response-json";

const ClassNotes = dynamic(() => import("@/components/dashboard/class-notes"), { ssr: false });

interface ClassLike {
  id: string;
  classCode?: string | null;
  className: string;
  campus?: string | null;
  category?: string | null;
  classType?: string | null;
  difficultyLevel?: string | null;
  deliveryMode?: string | null;
  startDatetime?: string | null;
  endDatetime?: string | null;
  checkinDatetime?: string | null;
  graduationDatetime?: string | null;
  instructorNames?: string | null;
  mentorName?: string | null;
  location?: string | null;
  roomName?: string | null;
  summary?: string | null;
  audience?: string | null;
  status: string;
  requestSource?: string | null;
  maxStudents?: number | null;
  materialLink?: string | null;
  notes?: string | null;
  trainerUserId?: string | null;
  manualOverrides?: Record<string, unknown> | null;
  tisOriginalValues?: Record<string, unknown> | null;
  trainer?: { name: string; department?: string; email?: string };
}

function tisMentorLabel(c: ClassLike): string {
  const a = c.mentorName;
  if (typeof a === "string" && a.trim()) return a.trim();
  const b = (c as unknown as Record<string, unknown>)["mentor_name"];
  if (typeof b === "string" && b.trim()) return b.trim();
  return "-";
}

interface ClassDetailDialogProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  selectedClass: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 班次更新後的 callback（給 parent 更新自己的 list） */
  onUpdated?: (updated: ClassLike) => void;
}

// ============================================================
// 常數：選單選項（與 similarity / dashboard 其他頁面一致）
// ============================================================
const CAMPUS_OPTIONS = ["院本部", "台中所", "高雄所"];
const CATEGORY_OPTIONS = ["資訊安全", "數位轉型", "網路技術", "管理技能"];
const CLASS_TYPE_OPTIONS = ["年度計畫班", "臨時需求專案班", "學程班"];
const DIFFICULTY_OPTIONS = ["基礎", "進階", "高級", "專精"];
const DELIVERY_MODE_OPTIONS = ["課堂", "直播", "遠距", "混成"];
const STATUS_OPTIONS = ["規劃中", "已排定", "即將開班", "已結訓"];

/** 後端會被 TIS sync 蓋寫的欄位（與 sync-applier.ts TIS_SYNC_PROTECTABLE_FIELDS 對齊）；
 *  這些欄位會顯示「手動覆寫」徽章與「還原為 TIS 值」按鈕 */
const PROTECTABLE_FIELDS = new Set([
  "className",
  "campus",
  "category",
  "difficultyLevel",
  "deliveryMode",
  "startDatetime",
  "mentorName",
  "status",
]);

/** field key → 中文 label（給 toast / confirm 訊息用） */
const FIELD_LABELS: Record<string, string> = {
  className: "班名",
  campus: "院所別",
  category: "課程類別",
  classType: "班次類型",
  difficultyLevel: "難度",
  deliveryMode: "開班方式",
  startDatetime: "開班日期",
  endDatetime: "結束日期",
  checkinDatetime: "報到時間",
  graduationDatetime: "結訓時間",
  mentorName: "TIS 導師",
  instructorNames: "授課講師",
  location: "開班地點",
  roomName: "教室名稱",
  audience: "培訓對象",
  summary: "課程內容摘要",
  status: "狀態",
  requestSource: "需求來源",
  maxStudents: "名額",
  materialLink: "教材連結",
  notes: "備註",
};
function fieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? field;
}

/** ISO datetime → input[type=datetime-local] 需要的 YYYY-MM-DDTHH:mm（local time）*/
function toDateTimeLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function isManuallyOverridden(cls: ClassLike, field: string): boolean {
  const o = cls.manualOverrides;
  if (!o || typeof o !== "object") return false;
  return (o as Record<string, unknown>)[field] === true;
}

export function ClassDetailDialog({ selectedClass, open, onOpenChange, onUpdated }: ClassDetailDialogProps) {
  const { data: session } = useSession();
  const { toast } = useToast();
  const role = (session?.user as { role?: string } | undefined)?.role;
  const userId = (session?.user as { id?: string } | undefined)?.id;
  const isAdmin = role === "admin";
  const canEdit = !!selectedClass && (isAdmin || selectedClass.trainerUserId === userId);

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<Record<string, unknown>>({});

  const cls: ClassLike | null = selectedClass;

  useEffect(() => {
    setEditing(false);
    setDraft({});
  }, [cls?.id]);

  const enterEdit = () => {
    if (!cls) return;
    setDraft({
      className: cls.className ?? "",
      campus: cls.campus ?? "",
      category: cls.category ?? "",
      classType: cls.classType ?? "",
      difficultyLevel: cls.difficultyLevel ?? "",
      deliveryMode: cls.deliveryMode ?? "",
      status: cls.status ?? "規劃中",
      maxStudents: cls.maxStudents ?? "",
      startDatetime: toDateTimeLocal(cls.startDatetime),
      endDatetime: toDateTimeLocal(cls.endDatetime),
      checkinDatetime: toDateTimeLocal(cls.checkinDatetime),
      graduationDatetime: toDateTimeLocal(cls.graduationDatetime),
      mentorName: cls.mentorName ?? "",
      instructorNames: cls.instructorNames ?? "",
      location: cls.location ?? "",
      roomName: cls.roomName ?? "",
      audience: cls.audience ?? "",
      summary: cls.summary ?? "",
      requestSource: cls.requestSource ?? "",
      materialLink: cls.materialLink ?? "",
      notes: cls.notes ?? "",
    });
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setDraft({});
  };

  const handleSave = async () => {
    if (!cls) return;
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {};
      // 只送有改變的欄位（避免不必要的 manualOverride mark）
      for (const [k, v] of Object.entries(draft)) {
        const original =
          k === "startDatetime" || k === "endDatetime" || k === "checkinDatetime" || k === "graduationDatetime"
            ? toDateTimeLocal(cls[k as keyof ClassLike] as string | null | undefined)
            : (cls[k as keyof ClassLike] ?? "");
        if (String(original ?? "") !== String(v ?? "")) {
          // datetime-local 字串若空 → 送 null；非空 → 直接送字串（後端會 new Date(v)）
          if (
            (k === "startDatetime" || k === "endDatetime" || k === "checkinDatetime" || k === "graduationDatetime") &&
            v === ""
          ) {
            payload[k] = null;
          } else if (k === "maxStudents" && v === "") {
            payload[k] = null;
          } else {
            payload[k] = v;
          }
        }
      }
      if (Object.keys(payload).length === 0) {
        toast("沒有變更", "info");
        setEditing(false);
        return;
      }
      const res = await fetch(`/api/classes/${cls.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await readResponseJson<{ error?: string }>(res).catch(() => ({}) as { error?: string });
        throw new Error(err?.error ?? `儲存失敗 HTTP ${res.status}`);
      }
      const data = await readResponseJson<{ class: ClassLike; overrideAdded: string[] }>(res);
      const overrideMsg =
        data.overrideAdded.length > 0 ? `（${data.overrideAdded.length} 個欄位已標記為手動覆寫，TIS 同步不會再蓋掉）` : "";
      toast(`已儲存${overrideMsg}`, "success");
      setEditing(false);
      onUpdated?.(data.class);
    } catch (e) {
      toast(`儲存失敗：${(e as Error).message}`, "error");
    } finally {
      setSaving(false);
    }
  };

  const handleRestoreField = async (field: string) => {
    if (!cls) return;
    if (!confirm(`確定要把「${fieldLabel(field)}」還原為 TIS 最新版的值嗎？\n還原後此欄位將恢復受 TIS 月度同步管理。`)) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/classes/${cls.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restore: [field] }),
      });
      if (!res.ok) {
        const err = await readResponseJson<{ error?: string }>(res).catch(() => ({}) as { error?: string });
        throw new Error(err?.error ?? `還原失敗 HTTP ${res.status}`);
      }
      const data = await readResponseJson<{ class: ClassLike }>(res);
      toast(`已還原「${fieldLabel(field)}」為 TIS 值`, "success");
      onUpdated?.(data.class);
    } catch (e) {
      toast(`還原失敗：${(e as Error).message}`, "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        {cls && (
          <>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            {editing ? (
              <Input
                value={String(draft.className ?? "")}
                onChange={(e) => setDraft({ ...draft, className: e.target.value })}
                className="text-lg font-semibold flex-1 min-w-[200px]"
              />
            ) : (
              <>
                {cls.className}
                {isManuallyOverridden(cls, "className") && <ManualOverrideBadge onRestore={() => handleRestoreField("className")} disabled={saving} />}
              </>
            )}
            <Badge variant="outline" className={getStatusColor(cls.status)}>{cls.status}</Badge>
          </DialogTitle>
          <DialogDescription>{cls.classCode && <span>班代號：{cls.classCode}</span>}</DialogDescription>
        </DialogHeader>

        {/* 編輯模式工具列 */}
        {canEdit && (
          <div className="flex items-center justify-end gap-2 -mt-2">
            {editing ? (
              <>
                <Button variant="outline" size="sm" onClick={cancelEdit} disabled={saving}>
                  <X className="w-4 h-4 mr-1" />取消
                </Button>
                <Button size="sm" onClick={handleSave} disabled={saving}>
                  {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
                  儲存
                </Button>
              </>
            ) : (
              <Button variant="outline" size="sm" onClick={enterEdit}>
                <Pencil className="w-4 h-4 mr-1" />編輯
              </Button>
            )}
          </div>
        )}

        {/* 編輯模式說明 */}
        {editing && (
          <div className="flex items-start gap-2 rounded-md border border-amber-300/40 bg-amber-50 dark:bg-amber-900/20 p-3 text-xs text-amber-900 dark:text-amber-200">
            <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
            <div className="space-y-1">
              <p>
                您修改的欄位會被標記為「手動覆寫」，
                <strong>下次 TIS 月度同步時不會被覆蓋</strong>
                。
              </p>
              <p className="opacity-80">
                若想恢復受 TIS 同步管理，可在儲存後點欄位旁的「還原為 TIS 值」連結。
              </p>
            </div>
          </div>
        )}

        <ClassNotes classId={cls.id} />

        <Separator />

        <div className="space-y-4">
          {/* 區塊 1：分類欄位 */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <FieldRow
              label="院所別" fieldKey="campus" cls={cls} editing={editing} draft={draft} setDraft={setDraft}
              type="select" options={CAMPUS_OPTIONS} onRestore={handleRestoreField} disabled={saving}
            />
            <FieldRow
              label="課程類別" fieldKey="category" cls={cls} editing={editing} draft={draft} setDraft={setDraft}
              type="select" options={CATEGORY_OPTIONS} onRestore={handleRestoreField} disabled={saving}
            />
            <FieldRow
              label="班次類型" fieldKey="classType" cls={cls} editing={editing} draft={draft} setDraft={setDraft}
              type="select" options={CLASS_TYPE_OPTIONS} onRestore={handleRestoreField} disabled={saving}
            />
            <FieldRow
              label="難度" fieldKey="difficultyLevel" cls={cls} editing={editing} draft={draft} setDraft={setDraft}
              type="select" options={DIFFICULTY_OPTIONS} onRestore={handleRestoreField} disabled={saving}
            />
            <FieldRow
              label="開班方式" fieldKey="deliveryMode" cls={cls} editing={editing} draft={draft} setDraft={setDraft}
              type="select" options={DELIVERY_MODE_OPTIONS} onRestore={handleRestoreField} disabled={saving}
            />
            <FieldRow
              label="名額" fieldKey="maxStudents" cls={cls} editing={editing} draft={draft} setDraft={setDraft}
              type="number" onRestore={handleRestoreField} disabled={saving}
            />
            <FieldRow
              label="狀態" fieldKey="status" cls={cls} editing={editing} draft={draft} setDraft={setDraft}
              type="select" options={STATUS_OPTIONS} onRestore={handleRestoreField} disabled={saving}
            />
          </div>

          <Separator />

          {/* 區塊 2：時間欄位 */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <FieldRow
              label="開班日期" fieldKey="startDatetime" cls={cls} editing={editing} draft={draft} setDraft={setDraft}
              type="datetime" displayValue={formatDateTime(cls.startDatetime)} onRestore={handleRestoreField} disabled={saving}
            />
            <FieldRow
              label="結束日期" fieldKey="endDatetime" cls={cls} editing={editing} draft={draft} setDraft={setDraft}
              type="datetime" displayValue={formatDateTime(cls.endDatetime)} onRestore={handleRestoreField} disabled={saving}
            />
            <FieldRow
              label="報到時間" fieldKey="checkinDatetime" cls={cls} editing={editing} draft={draft} setDraft={setDraft}
              type="datetime" displayValue={formatDateTime(cls.checkinDatetime) || "-"} onRestore={handleRestoreField} disabled={saving}
            />
            <FieldRow
              label="結訓時間" fieldKey="graduationDatetime" cls={cls} editing={editing} draft={draft} setDraft={setDraft}
              type="datetime" displayValue={formatDateTime(cls.graduationDatetime) || "-"} onRestore={handleRestoreField} disabled={saving}
            />
          </div>

          <Separator />

          {/* 區塊 3：人員與內容 */}
          <div className="space-y-3 text-sm">
            <div>
              <p className="text-muted-foreground">負責培訓師（系統帳號）</p>
              <p className="font-medium">{cls.trainer?.name || "未綁定登入帳號"}</p>
            </div>
            <FieldRow
              label="TIS 導師（計畫表快照）" fieldKey="mentorName" cls={cls} editing={editing} draft={draft} setDraft={setDraft}
              type="text" displayValue={tisMentorLabel(cls)} onRestore={handleRestoreField} disabled={saving}
            />
            <FieldRow
              label="授課講師（課程附屬）" fieldKey="instructorNames" cls={cls} editing={editing} draft={draft} setDraft={setDraft}
              type="text" displayValue={cls.instructorNames || "尚未指定"} onRestore={handleRestoreField} disabled={saving}
            />
            <div className="grid grid-cols-2 gap-3">
              <FieldRow
                label="開班地點" fieldKey="location" cls={cls} editing={editing} draft={draft} setDraft={setDraft}
                type="text" displayValue={cls.location || "-"} onRestore={handleRestoreField} disabled={saving}
              />
              <FieldRow
                label="教室名稱" fieldKey="roomName" cls={cls} editing={editing} draft={draft} setDraft={setDraft}
                type="text" displayValue={cls.roomName || "-"} onRestore={handleRestoreField} disabled={saving}
              />
            </div>
            <FieldRow
              label="培訓對象" fieldKey="audience" cls={cls} editing={editing} draft={draft} setDraft={setDraft}
              type="text" onRestore={handleRestoreField} disabled={saving}
            />
            <FieldRow
              label="課程內容摘要" fieldKey="summary" cls={cls} editing={editing} draft={draft} setDraft={setDraft}
              type="textarea" onRestore={handleRestoreField} disabled={saving}
            />
            <FieldRow
              label="需求來源" fieldKey="requestSource" cls={cls} editing={editing} draft={draft} setDraft={setDraft}
              type="text" displayValue={cls.requestSource || "-"} onRestore={handleRestoreField} disabled={saving}
            />
            <FieldRow
              label="教材連結" fieldKey="materialLink" cls={cls} editing={editing} draft={draft} setDraft={setDraft}
              type="text" onRestore={handleRestoreField} disabled={saving}
            />
            <FieldRow
              label="備註" fieldKey="notes" cls={cls} editing={editing} draft={draft} setDraft={setDraft}
              type="textarea" onRestore={handleRestoreField} disabled={saving}
            />
          </div>

          <Separator />

          <div className="flex flex-wrap gap-2">
            <Button asChild variant="default" size="sm">
              <Link href={`/tools/edm-generator?classId=${encodeURIComponent(cls.id)}`}>
                <Mail className="w-4 h-4 mr-1.5" />
                製作 EDM
              </Link>
            </Button>
          </div>
        </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// 欄位列：自動依 editing 切換顯示／編輯，並處理「手動覆寫」徽章與「還原」連結
// ============================================================

interface FieldRowProps {
  label: string;
  fieldKey: string;
  cls: ClassLike;
  editing: boolean;
  draft: Record<string, unknown>;
  setDraft: (next: Record<string, unknown>) => void;
  type: "text" | "textarea" | "number" | "select" | "datetime";
  options?: string[];
  /** 檢視模式下要顯示的值（預設取 cls[fieldKey]） */
  displayValue?: string;
  onRestore: (field: string) => void;
  disabled?: boolean;
}

function FieldRow({
  label, fieldKey, cls, editing, draft, setDraft, type, options, displayValue, onRestore, disabled,
}: FieldRowProps) {
  const overridden = isManuallyOverridden(cls, fieldKey);
  const isProtectable = PROTECTABLE_FIELDS.has(fieldKey);
  const draftVal = draft[fieldKey];

  return (
    <div className={type === "textarea" ? "" : ""}>
      <div className="flex items-center justify-between gap-2 mb-0.5">
        <Label className="text-muted-foreground text-xs">{label}</Label>
        {!editing && overridden && isProtectable && (
          <ManualOverrideBadge onRestore={() => onRestore(fieldKey)} disabled={disabled} />
        )}
      </div>
      {editing ? (
        renderInput({ fieldKey, type, options, value: draftVal, setDraft, draft })
      ) : (
        <p className={`font-medium ${overridden && isProtectable ? "text-amber-700 dark:text-amber-300" : ""}`}>
          {displayValue ?? (cls[fieldKey as keyof ClassLike] as string) ?? "-"}
        </p>
      )}
    </div>
  );
}

interface RenderInputArgs {
  fieldKey: string;
  type: "text" | "textarea" | "number" | "select" | "datetime";
  options?: string[];
  value: unknown;
  setDraft: (next: Record<string, unknown>) => void;
  draft: Record<string, unknown>;
}

function renderInput({ fieldKey, type, options, value, setDraft, draft }: RenderInputArgs) {
  const v = value == null ? "" : String(value);
  const update = (next: unknown) => setDraft({ ...draft, [fieldKey]: next });

  if (type === "select" && options) {
    // shadcn Select 不允許 value=""，用 sentinel 代表「(未指定)」
    const SENTINEL = "__none__";
    return (
      <Select value={v || SENTINEL} onValueChange={(val) => update(val === SENTINEL ? "" : val)}>
        <SelectTrigger className="h-9"><SelectValue placeholder="選擇" /></SelectTrigger>
        <SelectContent>
          <SelectItem value={SENTINEL}>（未指定）</SelectItem>
          {options.map((opt) => (
            <SelectItem key={opt} value={opt}>{opt}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }
  if (type === "textarea") {
    return <Textarea value={v} onChange={(e) => update(e.target.value)} className="min-h-[60px]" />;
  }
  if (type === "number") {
    return <Input type="number" value={v} onChange={(e) => update(e.target.value)} className="h-9" min={0} />;
  }
  if (type === "datetime") {
    return <Input type="datetime-local" value={v} onChange={(e) => update(e.target.value)} className="h-9" />;
  }
  return <Input value={v} onChange={(e) => update(e.target.value)} className="h-9" />;
}

// ============================================================
// 「手動覆寫」徽章 + 「還原為 TIS 值」按鈕（一個元件）
// ============================================================

function ManualOverrideBadge({ onRestore, disabled }: { onRestore: () => void; disabled?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Badge variant="outline" className="text-[10px] py-0 h-4 px-1.5 border-amber-400 text-amber-700 dark:text-amber-300">
        ✎ 手動覆寫
      </Badge>
      <button
        type="button"
        onClick={onRestore}
        disabled={disabled}
        className="text-[10px] text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5 disabled:opacity-50"
        title="把此欄位還原為 TIS 同步的最新值"
      >
        <RotateCcw className="w-2.5 h-2.5" />
        還原為 TIS 值
      </button>
    </span>
  );
}

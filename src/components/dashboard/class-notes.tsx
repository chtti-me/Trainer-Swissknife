"use client";

/**
 * 【班次備註區塊】
 * 顯示在班次詳情彈窗頂部，支援新增 / 編輯 / 刪除備註，
 * 每則備註可設定鬧鈴時間與重要性等級。
 */
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toaster";
import { cn } from "@/lib/utils";
import {
  Bell,
  BellOff,
  Download,
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  AlertTriangle,
  AlertCircle,
  Loader2,
} from "lucide-react";

interface ClassNote {
  id: string;
  classId: string;
  content: string;
  alarmAt: string | null;
  alarmFired: boolean;
  importance: "normal" | "important" | "critical";
  createdAt: string;
  updatedAt: string;
}

const IMPORTANCE_OPTIONS = [
  { value: "normal", label: "一般", color: "bg-green-100 text-green-800 border-green-300 dark:bg-green-900/40 dark:text-green-300 dark:border-green-700" },
  { value: "important", label: "重要", color: "bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-900/40 dark:text-yellow-300 dark:border-yellow-700" },
  { value: "critical", label: "極重要", color: "bg-red-100 text-red-800 border-red-300 dark:bg-red-900/40 dark:text-red-300 dark:border-red-700" },
] as const;

function getImportanceStyle(importance: string) {
  return IMPORTANCE_OPTIONS.find((o) => o.value === importance)?.color
    ?? IMPORTANCE_OPTIONS[0].color;
}

function getImportanceLabel(importance: string) {
  return IMPORTANCE_OPTIONS.find((o) => o.value === importance)?.label ?? "一般";
}

function formatAlarmTime(dt: string | null): string {
  if (!dt) return "";
  const d = new Date(dt);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString("zh-TW", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

function toLocalDatetimeInput(dt: string | null): string {
  if (!dt) return "";
  const d = new Date(dt);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface ClassNotesProps {
  classId: string;
}

export default function ClassNotes({ classId }: ClassNotesProps) {
  const [notes, setNotes] = useState<ClassNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [formContent, setFormContent] = useState("");
  const [formAlarmAt, setFormAlarmAt] = useState("");
  const [formImportance, setFormImportance] = useState<string>("normal");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const fetchNotes = useCallback(async () => {
    try {
      const res = await fetch(`/api/classes/${classId}/notes`);
      if (res.ok) {
        const data = await res.json();
        setNotes(data);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [classId]);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  function resetForm() {
    setFormContent("");
    setFormAlarmAt("");
    setFormImportance("normal");
    setShowForm(false);
    setEditingId(null);
  }

  function startEdit(note: ClassNote) {
    setEditingId(note.id);
    setFormContent(note.content);
    setFormAlarmAt(toLocalDatetimeInput(note.alarmAt));
    setFormImportance(note.importance);
    setShowForm(true);
  }

  async function handleSave() {
    if (!formContent.trim()) return;
    setSaving(true);

    const payload = {
      content: formContent,
      alarmAt: formAlarmAt || null,
      importance: formImportance,
    };

    try {
      if (editingId) {
        await fetch(`/api/classes/${classId}/notes/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        toast("備註已更新");
      } else {
        await fetch(`/api/classes/${classId}/notes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        toast("備註已新增");
      }
      resetForm();
      await fetchNotes();
    } catch { /* ignore */ }
    setSaving(false);
  }

  async function handleDelete(noteId: string) {
    try {
      await fetch(`/api/classes/${classId}/notes/${noteId}`, { method: "DELETE" });
      toast("備註已刪除");
      await fetchNotes();
    } catch { /* ignore */ }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold flex items-center gap-1.5">
          <Pencil className="w-3.5 h-3.5" />
          備註筆記
        </h4>
        <div className="flex gap-1">
        {notes.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={() => {
              const a = document.createElement("a");
              a.href = `/api/classes/${classId}/notes/export`;
              a.download = "";
              a.click();
            }}
          >
            <Download className="w-3 h-3" />
            匯出
          </Button>
        )}
        {!showForm && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={() => { resetForm(); setShowForm(true); }}
          >
            <Plus className="w-3 h-3" />
            新增備註
          </Button>
        )}
        </div>
      </div>

      {/* 新增 / 編輯表單 */}
      {showForm && (
        <div className="rounded-lg border bg-muted/30 p-3 space-y-2.5">
          <Textarea
            placeholder="輸入備註內容..."
            value={formContent}
            onChange={(e) => setFormContent(e.target.value)}
            className="min-h-[60px] text-sm resize-none"
            autoFocus
          />
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <label className="text-[11px] text-muted-foreground font-medium">鬧鈴時間</label>
              <div className="flex items-center gap-1.5">
                <Bell className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <Input
                  type="datetime-local"
                  value={formAlarmAt}
                  onChange={(e) => setFormAlarmAt(e.target.value)}
                  className="h-8 text-xs w-auto"
                />
                {formAlarmAt && (
                  <button
                    type="button"
                    onClick={() => setFormAlarmAt("")}
                    className="text-muted-foreground hover:text-foreground"
                    title="清除鬧鈴"
                  >
                    <BellOff className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-[11px] text-muted-foreground font-medium">重要性</label>
              <div className="flex gap-1">
                {IMPORTANCE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setFormImportance(opt.value)}
                    className={cn(
                      "rounded-md border px-2 py-1 text-[11px] font-medium transition-all",
                      formImportance === opt.value
                        ? cn(opt.color, "ring-2 ring-offset-1 ring-current")
                        : "bg-background text-muted-foreground border-border hover:bg-muted"
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <Button
              type="button"
              size="sm"
              className="h-7 text-xs gap-1"
              disabled={saving || !formContent.trim()}
              onClick={handleSave}
            >
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
              {editingId ? "儲存" : "新增"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={resetForm}
            >
              <X className="w-3 h-3" />
              取消
            </Button>
          </div>
        </div>
      )}

      {/* 備註清單 */}
      {loading ? (
        <div className="text-xs text-muted-foreground py-2 text-center">
          <Loader2 className="w-3.5 h-3.5 animate-spin inline mr-1" />
          載入中...
        </div>
      ) : notes.length === 0 && !showForm ? (
        <p className="text-xs text-muted-foreground py-1">尚無備註，點選「新增備註」開始記錄。</p>
      ) : (
        <div className="space-y-1.5">
          {notes.map((note) => (
            <div
              key={note.id}
              className={cn(
                "rounded-md border-l-[3px] bg-card px-3 py-2 text-sm group relative",
                note.importance === "critical"
                  ? "border-l-red-500"
                  : note.importance === "important"
                  ? "border-l-yellow-500"
                  : "border-l-green-500"
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="whitespace-pre-wrap leading-snug">{note.content}</p>
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                    <span className={cn("rounded px-1.5 py-0.5 font-medium border", getImportanceStyle(note.importance))}>
                      {getImportanceLabel(note.importance)}
                    </span>
                    {note.alarmAt && (
                      <span className="inline-flex items-center gap-1">
                        {note.alarmFired ? (
                          <BellOff className="w-3 h-3" />
                        ) : (
                          <Bell className="w-3 h-3 text-primary" />
                        )}
                        {formatAlarmTime(note.alarmAt)}
                        {note.alarmFired && "（已提醒）"}
                      </span>
                    )}
                    <span>{new Date(note.createdAt).toLocaleDateString("zh-TW")}</span>
                  </div>
                </div>
                <div className="shrink-0 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    onClick={() => startEdit(note)}
                    className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                    title="編輯"
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(note.id)}
                    className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-destructive transition-colors"
                    title="刪除"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

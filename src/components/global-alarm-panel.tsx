"use client";

/**
 * 【全域鬧鈴管理面板】
 * 跨頁面的圓形鬧鈴按鈕 → 點擊展開 Popover，列出所有鬧鈴（班次附屬 + 個人獨立）。
 * 支援新增個人獨立鬧鈴、編輯、刪除。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bell,
  Plus,
  Pencil,
  Trash2,
  Save,
  X,
  AlertTriangle,
  AlertCircle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface AlarmItem {
  id: string;
  classId: string | null;
  className: string | null;
  classCode: string | null;
  content: string;
  alarmAt: string | null;
  alarmFired: boolean;
  importance: string;
  createdAt: string;
}

type Importance = "normal" | "important" | "critical";

const IMP_STYLES: Record<Importance, { label: string; dot: string; badge: string }> = {
  normal: { label: "一般", dot: "bg-green-500", badge: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300" },
  important: { label: "重要", dot: "bg-yellow-500", badge: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300" },
  critical: { label: "極重要", dot: "bg-red-500", badge: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300" },
};

function formatDT(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("zh-TW", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function toInputDT(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function GlobalAlarmPanel() {
  const [open, setOpen] = useState(false);
  const [alarms, setAlarms] = useState<AlarmItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // 新增表單狀態
  const [newContent, setNewContent] = useState("");
  const [newAlarmAt, setNewAlarmAt] = useState("");
  const [newImportance, setNewImportance] = useState<Importance>("normal");

  // 編輯表單狀態
  const [editContent, setEditContent] = useState("");
  const [editAlarmAt, setEditAlarmAt] = useState("");
  const [editImportance, setEditImportance] = useState<Importance>("normal");

  const upcomingCount = alarms.filter((a) => a.alarmAt && !a.alarmFired && new Date(a.alarmAt) > new Date()).length;

  const fetchAlarms = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/notes/all");
      if (res.ok) setAlarms(await res.json());
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (open) fetchAlarms();
  }, [open, fetchAlarms]);

  // 點擊外部關閉
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  async function handleAdd() {
    if (!newContent.trim()) return;
    await fetch("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: newContent.trim(),
        alarmAt: newAlarmAt || null,
        importance: newImportance,
      }),
    });
    setNewContent("");
    setNewAlarmAt("");
    setNewImportance("normal");
    setShowAdd(false);
    fetchAlarms();
  }

  async function handleUpdate(id: string) {
    await fetch(`/api/notes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: editContent.trim(),
        alarmAt: editAlarmAt || null,
        importance: editImportance,
      }),
    });
    setEditId(null);
    fetchAlarms();
  }

  async function handleDelete(id: string) {
    await fetch(`/api/notes/${id}`, { method: "DELETE" });
    fetchAlarms();
  }

  function startEdit(a: AlarmItem) {
    setEditId(a.id);
    setEditContent(a.content);
    setEditAlarmAt(toInputDT(a.alarmAt));
    setEditImportance((a.importance as Importance) || "normal");
  }

  return (
    <div className="relative" ref={panelRef}>
      {/* 圓形按鈕 */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "relative flex h-9 w-9 items-center justify-center rounded-full border transition-colors",
          "bg-card hover:bg-accent text-foreground/80",
          open && "ring-2 ring-primary"
        )}
        aria-label="鬧鈴管理"
        aria-expanded={open}
      >
        <Bell className="h-4.5 w-4.5" />
        {upcomingCount > 0 && (
          <span
            className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white"
            aria-label={`${upcomingCount} 則待觸發鬧鈴`}
          >
            {upcomingCount > 99 ? "99+" : upcomingCount}
          </span>
        )}
      </button>

      {/* 面板 */}
      {open && (
        <div className="absolute right-0 top-full mt-2 z-[100] w-96 max-h-[70vh] overflow-auto rounded-xl border bg-card shadow-2xl animate-in fade-in slide-in-from-top-2 duration-200">
          {/* 標題列 */}
          <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-card px-4 py-3">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">鬧鈴管理</h3>
              <span className="text-xs text-muted-foreground">（共 {alarms.length} 則）</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setCollapsed(!collapsed)}
                className="p-1 rounded hover:bg-accent text-muted-foreground"
                title={collapsed ? "展開全部" : "收合全部"}
              >
                {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
              </button>
              <button
                type="button"
                onClick={() => setShowAdd(!showAdd)}
                className="p-1 rounded hover:bg-accent text-primary"
                title="新增個人鬧鈴"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* 新增表單 */}
          {showAdd && (
            <div className="border-b p-3 space-y-2 bg-muted/30">
              <p className="text-xs font-medium text-muted-foreground">新增個人鬧鈴（不綁定班次）</p>
              <textarea
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                placeholder="備註內容..."
                className="w-full rounded-md border bg-background px-2 py-1.5 text-sm resize-none"
                rows={2}
              />
              <div className="flex gap-2">
                <input
                  type="datetime-local"
                  value={newAlarmAt}
                  onChange={(e) => setNewAlarmAt(e.target.value)}
                  className="flex-1 rounded-md border bg-background px-2 py-1 text-xs"
                />
                <select
                  value={newImportance}
                  onChange={(e) => setNewImportance(e.target.value as Importance)}
                  className="rounded-md border bg-background px-2 py-1 text-xs"
                >
                  <option value="normal">一般</option>
                  <option value="important">重要</option>
                  <option value="critical">極重要</option>
                </select>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAdd(false)}
                  className="px-2 py-1 text-xs rounded hover:bg-accent text-muted-foreground"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleAdd}
                  disabled={!newContent.trim()}
                  className="px-3 py-1 text-xs rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  <Plus className="inline h-3 w-3 mr-1" />
                  新增
                </button>
              </div>
            </div>
          )}

          {/* 鬧鈴清單 */}
          {loading ? (
            <div className="p-6 text-center text-sm text-muted-foreground">載入中...</div>
          ) : alarms.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-3">
              <Bell className="w-10 h-10 opacity-30" />
              <p className="text-sm">目前沒有任何鬧鈴</p>
              <p className="text-xs opacity-60">點擊上方「新增獨立鬧鈴」開始設定</p>
            </div>
          ) : (
            <div className="divide-y">
              {alarms.map((a) => {
                const imp = IMP_STYLES[(a.importance as Importance) || "normal"] || IMP_STYLES.normal;
                const ImpIcon =
                  a.importance === "critical" ? AlertCircle
                    : a.importance === "important" ? AlertTriangle : Bell;
                const isEditing = editId === a.id;
                const isPast = a.alarmAt && new Date(a.alarmAt) < new Date();

                return (
                  <div key={a.id} className="px-4 py-2.5 hover:bg-accent/30 transition-colors">
                    {isEditing ? (
                      <div className="space-y-2">
                        <textarea
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          className="w-full rounded-md border bg-background px-2 py-1.5 text-sm resize-none"
                          rows={2}
                        />
                        <div className="flex gap-2">
                          <input
                            type="datetime-local"
                            value={editAlarmAt}
                            onChange={(e) => setEditAlarmAt(e.target.value)}
                            className="flex-1 rounded-md border bg-background px-2 py-1 text-xs"
                          />
                          <select
                            value={editImportance}
                            onChange={(e) => setEditImportance(e.target.value as Importance)}
                            className="rounded-md border bg-background px-2 py-1 text-xs"
                          >
                            <option value="normal">一般</option>
                            <option value="important">重要</option>
                            <option value="critical">極重要</option>
                          </select>
                        </div>
                        <div className="flex justify-end gap-2">
                          <button type="button" onClick={() => setEditId(null)} className="px-2 py-1 text-xs rounded hover:bg-accent text-muted-foreground">
                            取消
                          </button>
                          <button type="button" onClick={() => handleUpdate(a.id)} className="px-3 py-1 text-xs rounded bg-primary text-primary-foreground hover:bg-primary/90">
                            <Save className="inline h-3 w-3 mr-1" />儲存
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {!collapsed && (
                          <div className="flex items-start gap-2">
                            <ImpIcon className={cn("h-3.5 w-3.5 mt-0.5 shrink-0", a.importance === "critical" ? "text-red-500" : a.importance === "important" ? "text-yellow-500" : "text-green-500")} />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm leading-snug whitespace-pre-wrap">{a.content}</p>
                              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
                                <span className={cn("px-1.5 py-0.5 rounded-full font-medium", imp.badge)}>{imp.label}</span>
                                {a.className && (
                                  <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                                    📋 {a.className}
                                  </span>
                                )}
                                {!a.classId && (
                                  <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                                    個人鬧鈴
                                  </span>
                                )}
                                {a.alarmAt && (
                                  <span className={cn("px-1.5 py-0.5 rounded", isPast ? "bg-muted text-muted-foreground line-through" : "bg-muted text-foreground")}>
                                    ⏰ {formatDT(a.alarmAt)}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex shrink-0 gap-0.5">
                              <button type="button" onClick={() => startEdit(a)} className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground">
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button type="button" onClick={() => handleDelete(a.id)} className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        )}
                        {collapsed && (
                          <div className="flex items-center gap-2 text-xs">
                            <span className={cn("h-2 w-2 rounded-full shrink-0", imp.dot)} />
                            <span className="truncate flex-1">{a.content}</span>
                            {a.alarmAt && <span className="text-muted-foreground shrink-0">{formatDT(a.alarmAt)}</span>}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

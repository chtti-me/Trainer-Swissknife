"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Bot,
  LayoutDashboard,
  BookOpen,
  GitCompareArrows,
  School,
  ContactRound,
  Monitor,
  Presentation,
  PenTool,
  FileBarChart2,
  Mail,
  RefreshCw,
  UserRound,
  Brain,
  Settings,
  UserCog,
  Search,
  type LucideIcon,
} from "lucide-react";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  group: string;
}

const ALL_ITEMS: NavItem[] = [
  { href: "/agent", label: "AI 助理（小瑞）", icon: Bot, group: "主要功能" },
  { href: "/dashboard", label: "培訓師儀表板", icon: LayoutDashboard, group: "主要功能" },
  { href: "/course-planner", label: "課程規劃幫手", icon: BookOpen, group: "主要功能" },
  { href: "/similarity", label: "開班相似度檢測", icon: GitCompareArrows, group: "主要功能" },
  { href: "/classroom-suggestions", label: "教室預約建議", icon: School, group: "主要功能" },
  { href: "/personal-instructor-network", label: "個人師資人脈", icon: ContactRound, group: "主要功能" },
  { href: "/tools/teleprompter", label: "讀稿提詞機", icon: Monitor, group: "工具箱" },
  { href: "/tools/presentation", label: "互動簡報製作器", icon: Presentation, group: "工具箱" },
  { href: "/tools/report-writer", label: "業務會報撰寫器", icon: PenTool, group: "工具箱" },
  { href: "/tools/course-report", label: "課程規劃報告產生器", icon: FileBarChart2, group: "工具箱" },
  { href: "/tools/edm-generator", label: "EDM 產生器", icon: Mail, group: "工具箱" },
  { href: "/sync", label: "資料同步紀錄", icon: RefreshCw, group: "系統" },
  { href: "/trainers", label: "培訓師名冊", icon: UserRound, group: "系統" },
  { href: "/settings/ai-skills", label: "AI 技能脈絡", icon: Brain, group: "系統" },
  { href: "/settings", label: "系統設定", icon: Settings, group: "系統" },
  { href: "/settings/users", label: "使用者管理", icon: UserCog, group: "系統" },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelected(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const filtered = useMemo(() => {
    if (!query.trim()) return ALL_ITEMS;
    const q = query.toLowerCase();
    return ALL_ITEMS.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.href.toLowerCase().includes(q) ||
        item.group.toLowerCase().includes(q)
    );
  }, [query]);

  const grouped = useMemo(() => {
    const groups: Record<string, NavItem[]> = {};
    for (const item of filtered) {
      if (!groups[item.group]) groups[item.group] = [];
      groups[item.group].push(item);
    }
    return groups;
  }, [filtered]);

  const navigate = useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelected((s) => Math.min(s + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelected((s) => Math.max(s - 1, 0));
      } else if (e.key === "Enter" && filtered[selected]) {
        e.preventDefault();
        navigate(filtered[selected].href);
      } else if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
      }
    },
    [filtered, selected, navigate]
  );

  useEffect(() => {
    if (listRef.current) {
      const el = listRef.current.querySelector(`[data-idx="${selected}"]`);
      el?.scrollIntoView({ block: "nearest" });
    }
  }, [selected]);

  if (!open) return null;

  let flatIdx = -1;

  return (
    <div
      className="fixed inset-0 z-[600] flex items-start justify-center pt-[15vh] animate-in fade-in duration-150"
      onClick={() => setOpen(false)}
      role="dialog"
      aria-modal="true"
      aria-label="快速導覽"
    >
      <div className="fixed inset-0 bg-background/60 backdrop-blur-sm" />

      <div
        className="relative w-full max-w-lg rounded-xl border bg-popover shadow-2xl animate-in zoom-in-95 slide-in-from-top-2 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <Search className="w-4 h-4 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            type="text"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            placeholder="搜尋頁面或功能…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelected(0);
            }}
            onKeyDown={handleKeyDown}
            aria-label="搜尋頁面或功能"
          />
          <kbd className="hidden sm:inline-flex items-center rounded border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            ESC
          </kbd>
        </div>

        <div ref={listRef} className="max-h-72 overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              找不到符合的功能頁面
            </div>
          ) : (
            Object.entries(grouped).map(([group, items]) => (
              <div key={group}>
                <p className="px-2 py-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  {group}
                </p>
                {items.map((item) => {
                  flatIdx++;
                  const idx = flatIdx;
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.href}
                      data-idx={idx}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                        idx === selected
                          ? "bg-primary/10 text-primary"
                          : "text-foreground hover:bg-accent"
                      )}
                      onClick={() => navigate(item.href)}
                      onMouseEnter={() => setSelected(idx)}
                    >
                      <Icon className="w-4 h-4 shrink-0 opacity-60" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div className="border-t px-4 py-2 flex items-center gap-3 text-[11px] text-muted-foreground">
          <span>
            <kbd className="rounded border bg-muted px-1 py-0.5 font-mono">↑↓</kbd> 選取
          </span>
          <span>
            <kbd className="rounded border bg-muted px-1 py-0.5 font-mono">Enter</kbd> 前往
          </span>
          <span>
            <kbd className="rounded border bg-muted px-1 py-0.5 font-mono">Esc</kbd> 關閉
          </span>
        </div>
      </div>
    </div>
  );
}

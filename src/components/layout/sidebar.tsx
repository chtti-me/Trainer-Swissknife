"use client";

/**
 * 【左側選單 Sidebar】
 * 像餐廳的「分類目錄牌」：點不同項目就導到儀表板、規劃、工具等各區。
 * 會依登入角色顯示／隱藏部分連結（例如管理員專區）。
 * 導覽使用 useTransition + pending 狀態，點擊後立即有視覺回饋（縮放、ring、spinner）。
 */

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  BookOpen,
  GitCompareArrows,
  School,
  RefreshCw,
  Settings,
  Brain,
  ChevronLeft,
  ChevronRight,
  Wrench,
  Monitor,
  Presentation,
  PenTool,
  FileBarChart2,
  Mail,
  UserCog,
  UserRound,
  ContactRound,
  Loader2,
  Bot,
  Layers,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useState, useTransition } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import { ThemeSwitcher } from "@/components/theme-switcher";

const mainNav = [
  { href: "/agent", label: "AI 助理（小瑞）", icon: Bot },
  { href: "/dashboard", label: "培訓師儀表板", icon: LayoutDashboard },
  { href: "/course-planner", label: "課程規劃幫手", icon: BookOpen },
  { href: "/similarity", label: "開班相似度檢測", icon: GitCompareArrows },
  { href: "/classroom-suggestions", label: "教室預約建議", icon: School },
  { href: "/personal-instructor-network", label: "個人師資人脈", icon: ContactRound },
];

const toolboxNav = [
  { href: "/course-planner/skills", label: "課程規劃工具箱", icon: Layers },
  { href: "/tools/teleprompter", label: "讀稿提詞機", icon: Monitor },
  { href: "/tools/presentation", label: "互動簡報製作器", icon: Presentation },
  { href: "/tools/report-writer", label: "業務會報撰寫器", icon: PenTool },
  { href: "/tools/course-report", label: "課程規劃報告產生器", icon: FileBarChart2 },
  { href: "/tools/edm-generator", label: "EDM產生器", icon: Mail },
];

const secondaryNav = [
  { href: "/sync", label: "資料同步紀錄", icon: RefreshCw },
  { href: "/trainers", label: "培訓師名冊", icon: UserRound },
  { href: "/settings/ai-skills", label: "AI 技能脈絡", icon: Brain },
  { href: "/settings", label: "系統設定", icon: Settings },
];

const adminOnlyNav = [{ href: "/settings/users", label: "使用者管理", icon: UserCog }];

const ALL_NAV_ENTRIES = [...mainNav, ...toolboxNav, ...secondaryNav, ...adminOnlyNav];

function navDestinationLabel(href: string): string {
  return ALL_NAV_ENTRIES.find((item) => item.href === href)?.label ?? "新頁面";
}

/** 導覽載入提示：固定於視窗上方置中，不干擾側欄按鈕寬度 */
function NavTransitionBubble({ targetHref }: { targetHref: string }) {
  const name = navDestinationLabel(targetHref);
  return (
    <div
      className="pointer-events-none fixed left-1/2 top-4 z-[200] w-[min(92vw,380px)] -translate-x-1/2"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <div
        className={cn(
          "flex w-full items-center gap-2.5 rounded-2xl border border-border/80 bg-background/90 px-4 py-2.5",
          "text-sm font-medium text-foreground shadow-lg shadow-black/10 backdrop-blur-md",
          "animate-in fade-in-0 zoom-in-95 slide-in-from-top-2 duration-200"
        )}
      >
        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" aria-hidden />
        <span className="min-w-0 flex-1 truncate">正在開啟「{name}」…</span>
      </div>
    </div>
  );
}

/** 展開寬度：約可單行容納 10 個全形字（不換行），略窄於最初 260px 以兼顧主內容區 */
const SIDEBAR_W_EXPANDED = 240;
const SIDEBAR_W_COLLAPSED = 60;

type NavVisualVariant = "main" | "tool" | "secondary" | "admin";

const variantClass: Record<
  NavVisualVariant,
  { active: string; inactive: string; pendingRing: string }
> = {
  main: {
    active: "bg-primary/10 text-primary border border-primary/20",
    inactive: "text-muted-foreground hover:bg-accent hover:text-accent-foreground border border-transparent",
    pendingRing: "ring-primary/35",
  },
  tool: {
    active: "bg-emerald-50 text-emerald-700 border border-emerald-200",
    inactive: "text-muted-foreground hover:bg-accent hover:text-accent-foreground border border-transparent",
    pendingRing: "ring-emerald-400/40",
  },
  secondary: {
    active: "bg-primary/10 text-primary border border-transparent",
    inactive: "text-muted-foreground hover:bg-accent hover:text-accent-foreground border border-transparent",
    pendingRing: "ring-primary/35",
  },
  admin: {
    active: "bg-amber-50 text-amber-900 border border-amber-200",
    inactive: "text-muted-foreground hover:bg-accent hover:text-accent-foreground border border-transparent",
    pendingRing: "ring-amber-400/45",
  },
};

function SidebarNavLink({
  href,
  label,
  icon: Icon,
  collapsed,
  pathname,
  pendingHref,
  onNavigate,
  visual,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  collapsed: boolean;
  pathname: string;
  pendingHref: string | null;
  onNavigate: (href: string) => void;
  visual: NavVisualVariant;
}) {
  const isActive = pathname.startsWith(href);
  const isPending = pendingHref === href;
  const vc = variantClass[visual];

  const link = (
    <Link
      href={href}
      prefetch
      aria-busy={isPending}
      aria-current={isActive ? "page" : undefined}
      onClick={(e) => {
        if (pathname === href) {
          e.preventDefault();
          return;
        }
        e.preventDefault();
        onNavigate(href);
      }}
      className={cn(
        "relative flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] font-medium leading-snug",
        "border transition-[transform,box-shadow,background-color,color,opacity] duration-150 ease-out",
        "active:scale-[0.97] active:brightness-[0.98]",
        isPending && cn("ring-2 ring-offset-1 ring-offset-background shadow-sm", vc.pendingRing),
        isPending && "bg-muted/60",
        isActive ? vc.active : vc.inactive,
        collapsed && "justify-center px-2",
        isPending && "pointer-events-none"
      )}
    >
      <span className="relative inline-flex shrink-0 items-center justify-center">
        {isPending ? (
          <Loader2
            className={cn("animate-spin text-primary", collapsed ? "h-5 w-5" : "h-4 w-4")}
            aria-hidden
          />
        ) : (
          <Icon className={cn("shrink-0", collapsed ? "h-5 w-5" : "h-4 w-4")} aria-hidden />
        )}
      </span>
      {!collapsed && <span className="min-w-0 flex-1 truncate">{label}</span>}
    </Link>
  );

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{link}</TooltipTrigger>
        <TooltipContent side="right">{label}</TooltipContent>
      </Tooltip>
    );
  }
  return link;
}

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const { data: session } = useSession();
  const isAdmin = (session?.user as { role?: string } | undefined)?.role === "admin";

  useEffect(() => {
    setPendingHref(null);
  }, [pathname]);

  useEffect(() => {
    if (!pendingHref) return;
    const timer = window.setTimeout(() => setPendingHref(null), 15000);
    return () => window.clearTimeout(timer);
  }, [pendingHref]);

  const onNavigate = useCallback(
    (href: string) => {
      setPendingHref(href);
      startTransition(() => {
        router.push(href);
      });
    },
    [router]
  );

  const navLinkProps = {
    collapsed,
    pathname,
    pendingHref,
    onNavigate,
  };

  return (
    <>
      {pendingHref ? <NavTransitionBubble targetHref={pendingHref} /> : null}
      <TooltipProvider delayDuration={0}>
        <aside
          className="relative flex h-full min-h-0 shrink-0 flex-col border-r transition-[width] duration-300 ease-out"
          style={{
            background: `linear-gradient(to bottom, hsl(var(--sidebar-bg-from)), hsl(var(--sidebar-bg-to)))`,
            width: collapsed ? `${SIDEBAR_W_COLLAPSED}px` : `${SIDEBAR_W_EXPANDED}px`,
          }}
        >
          {/* 品牌 Logo（固定頂部，不隨選單捲動） */}
          <div className={cn("shrink-0 flex items-center gap-2 px-2 h-[52px] border-b", collapsed && "justify-center px-0")}>
            <div className="flex items-center justify-center w-8 h-8 rounded-md bg-primary text-primary-foreground shrink-0">
              <Wrench className="w-4 h-4" />
            </div>
            {!collapsed && (
              <div className="flex min-w-0 flex-col leading-tight">
                <span className="font-bold text-xs tracking-wide truncate">培訓師瑞士刀</span>
                <span className="text-[9px] text-muted-foreground truncate">Trainer Swiss Knife v4.0</span>
              </div>
            )}
          </div>

          {/* 主要導覽：可捲動區域（瀏覽器高度不足時仍可點到底部項目） */}
          <nav
            className={cn(
              "flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-y-contain p-2 space-y-0.5",
              "[scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border hover:[&::-webkit-scrollbar-thumb]:bg-muted-foreground/40"
            )}
          >
            <p className={cn("text-[9px] font-semibold text-muted-foreground uppercase tracking-wide mb-1 px-1.5 pt-0.5", collapsed && "hidden")}>
              主要功能
            </p>
            {mainNav.map((item) => (
              <SidebarNavLink key={item.href} {...item} {...navLinkProps} visual="main" />
            ))}

            <Separator className="my-2 shrink-0" />

            <p className={cn("text-[9px] font-semibold text-muted-foreground uppercase tracking-wide mb-1 px-1.5", collapsed && "hidden")}>
              工具箱
            </p>
            {toolboxNav.map((item) => (
              <SidebarNavLink key={item.href} {...item} {...navLinkProps} visual="tool" />
            ))}

            <Separator className="my-2 shrink-0" />

            <p className={cn("text-[9px] font-semibold text-muted-foreground uppercase tracking-wide mb-1 px-1.5", collapsed && "hidden")}>
              系統管理
            </p>
            {secondaryNav.map((item) => (
              <SidebarNavLink key={item.href} {...item} {...navLinkProps} visual="secondary" />
            ))}

            {isAdmin &&
              adminOnlyNav.map((item) => (
                <SidebarNavLink key={item.href} {...item} {...navLinkProps} visual="admin" />
              ))}
          </nav>

          {/* 主題切換 + 收合按鈕（固定底部） */}
          <div className="shrink-0 border-t px-1.5 py-1 space-y-0.5">
            <ThemeSwitcher collapsed={collapsed} />
            <Button
              variant="ghost"
              size="sm"
              className="w-full h-8 px-1 text-[11px] gap-1"
              title={collapsed ? "展開側邊欄" : "收合側邊欄"}
              aria-label={collapsed ? "展開側邊欄" : "收合側邊欄"}
              aria-expanded={!collapsed}
              onClick={() => setCollapsed(!collapsed)}
            >
              {collapsed ? (
                <ChevronRight className="w-4 h-4" />
              ) : (
                <>
                  <ChevronLeft className="w-3.5 h-3.5 shrink-0" />
                  <span className="whitespace-nowrap">收合側邊欄</span>
                </>
              )}
            </Button>
          </div>
        </aside>
    </TooltipProvider>
    </>
  );
}

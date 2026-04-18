"use client";

/**
 * 【TIS 外部系統捷徑列】
 * 一排連到培訓資訊系統（TIS）常用頁面，另開分頁。
 */
import { ExternalLink } from "lucide-react";
import dynamic from "next/dynamic";

const GlobalAlarmPanel = dynamic(() => import("@/components/global-alarm-panel"), { ssr: false });
const GlobalTodayClasses = dynamic(() => import("@/components/global-today-classes"), { ssr: false });
const AgentBriefingButton = dynamic(() => import("@/components/agent-briefing-button"), { ssr: false });

type TisMenuItem = {
  label: string;
  href?: string;
  children?: Array<{ label: string; href: string }>;
};

function withYear(url: string): string {
  return url.replace("{year}", String(new Date().getFullYear()));
}

const tisMenu: TisMenuItem[] = [
  {
    label: "開班計劃表",
    children: [
      {
        label: "開班計劃表",
        href: "https://tis.cht.com.tw/jap/OpenClass/OpenClass_ClassList2.jsp?yy={year}",
      },
      {
        label: "開班計畫表&課程表查詢",
        href: "https://tis.cht.com.tw/jap/Director/classmenu3.jsp",
      },
    ],
  },
  {
    label: "預定開班日期",
    href: "https://tis.cht.com.tw/jap/OpenClass/OpenClass_ClassList2.jsp?yy={year}",
  },
  {
    label: "教室日誌確認",
    href: "https://tis.cht.com.tw/jap/OpenClass/TimeTableSignInp.jsp",
  },
  {
    label: "教師",
    children: [
      { label: "維護", href: "https://tis.cht.com.tw/jap/OpenClass/TeacherDBase/TeacherBaseMenu.jsp" },
      { label: "查詢", href: "https://tis.cht.com.tw/jap/OpenClass/TeacherListQry.jsp" },
    ],
  },
  {
    label: "班名",
    children: [
      { label: "新增", href: "https://tis.cht.com.tw/jap/OpenClass/ClassInp.jsp" },
      { label: "修改、刪除、查詢", href: "https://tis.cht.com.tw/jap/OpenClass/ClassListQry.jsp" },
    ],
  },
  {
    label: "課程",
    children: [
      { label: "新增", href: "https://tis.cht.com.tw/jap/OpenClass/addCourse_ins.jsp" },
      { label: "修改、刪除、查詢", href: "https://tis.cht.com.tw/jap/OpenClass/CourseListQry.jsp" },
    ],
  },
  {
    label: "學員",
    children: [
      { label: "學員報名名單輸入/刪除", href: "https://tis.cht.com.tw/jap/OuAssign/DirectorAssignChooser.jsp" },
      { label: "學員名冊", href: "https://tis.cht.com.tw/jap/OuAssign/DirectorAssignChooser.jsp" },
      { label: "學員名冊（指定班代號）", href: "https://tis.cht.com.tw/jap/OpenClass/StudentRollOneInp.jsp" },
      { label: "未報到學員名冊", href: "https://tis.cht.com.tw/jap/OpenClass/StudentNotCheckinInp.jsp" },
    ],
  },
  {
    label: "課前提問",
    children: [
      { label: "填寫及查詢", href: "https://tis.cht.com.tw/jap/OpenClass/issueProcInp.jsp" },
      { label: "解答滿意度", href: "https://tis.cht.com.tw/jap/statistic/issueSatAdvInp.jsp" },
    ],
  },
  {
    label: "餐食",
    children: [
      { label: "餐桌分配表", href: "https://tis.cht.com.tw/jap/Dinner/QueryByClassInp2.jsp" },
      { label: "老師用餐查詢", href: "https://tis.cht.com.tw/jap/Dinner/TeacherTableQryInp.jsp" },
      { label: "午餐用餐調查", href: "https://tis.cht.com.tw/jap/Dinner/LunchSurveyInp.jsp" },
    ],
  },
  {
    label: "成績",
    children: [
      { label: "全班成績查詢", href: "https://tis.cht.com.tw/jap/Score/TE2P27_front.jsp" },
      { label: "開班成績評量", href: "https://tis.cht.com.tw/jap/Score/ScoreCommentInp.jsp" },
    ],
  },
];

/** 頂層字級：隨視窗寬度在約 11px～13px 之間平滑縮放（fluid type，流體排版） */
const tisTopFont =
  "text-[clamp(11px,0.18vw+0.62rem,13px)] leading-tight tracking-tight";

const tisItemPad = "px-1.5 sm:px-2 py-1";

const iconSm = "h-3 w-3 shrink-0 text-muted-foreground sm:h-3.5 sm:w-3.5";

/** 僅 TIS 外部連結選單；使用者資訊見 PageHeading / UserTray（使用者區塊）。 */
export function TisMenuBar() {
  return (
    <header className="border-b bg-card relative z-30 overflow-visible">
      <div className="px-3 py-1 sm:px-4 sm:py-1.5">
        <div className="flex items-center gap-2">
          {/* 左側：TIS 連結選單 */}
          <nav
            className="flex min-h-8 flex-1 flex-wrap items-center gap-x-0.5 gap-y-1 overflow-visible"
            aria-label="TIS 外部系統快速連結"
          >
            {tisMenu.map((menu) => {
              if (menu.children?.length) {
                return (
                  <div key={menu.label} className="group relative shrink-0">
                    <button
                      type="button"
                      className={`${tisItemPad} ${tisTopFont} rounded-md text-foreground/80 transition-colors hover:bg-accent`}
                    >
                      {menu.label}
                    </button>
                    <div className="absolute left-0 top-full z-50 hidden pt-1 group-hover:block">
                      <div className="w-max max-w-[min(100vw-1.5rem,22rem)] rounded-md border bg-popover p-0.5 shadow-lg">
                        {menu.children.map((item) => (
                          <a
                            key={item.label}
                            href={withYear(item.href)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 whitespace-nowrap rounded px-2 py-1.5 text-sm leading-tight text-popover-foreground hover:bg-accent"
                          >
                            <span className="min-w-0">{item.label}</span>
                            <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                          </a>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              }

              return (
                <a
                  key={menu.label}
                  href={withYear(menu.href || "#")}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`${tisItemPad} ${tisTopFont} inline-flex shrink-0 items-center gap-0.5 rounded-md text-foreground/80 transition-colors hover:bg-accent`}
                >
                  {menu.label}
                  <ExternalLink className={iconSm} />
                </a>
              );
            })}
          </nav>

          {/* 右側：全域功能按鈕 — 小瑞日報 + 當日課程 + 鬧鈴管理 */}
          <div className="flex shrink-0 items-center gap-1.5">
            <AgentBriefingButton />
            <GlobalTodayClasses />
            <GlobalAlarmPanel />
          </div>
        </div>
      </div>
    </header>
  );
}

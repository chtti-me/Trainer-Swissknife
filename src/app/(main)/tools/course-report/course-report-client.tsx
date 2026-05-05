"use client";

/**
 * 【課程規劃報告產生器 - Client wrapper】
 *
 * 專案頁主框架（左側 sidebar 已由 (main) layout 提供），
 * 此 client 元件只負責掛載 CourseReportGenerator 並撐滿可用區域。
 *
 * 【版面說明】
 *   v2 架構：放棄三欄，改成「單欄編輯區 + 浮層選單」。
 *   父層 (main) 仍有 p-6 padding，這層用 w-full + min-w-0 + overflow-hidden
 *   確保寬度收斂；單欄之後就不會再有右側面板被截斷的問題。
 *   1024px 的報告 stage 在中央區域內以橫向滾動條呈現，不會把整體版面撐寬。
 */
import { CourseReportGenerator } from "@/lib/course-report-generator";

interface Props {
  userId: string;
  defaultReporter?: string;
  defaultDepartment?: string;
}

export function CourseReportClient({ userId, defaultReporter, defaultDepartment }: Props) {
  return (
    <div
      className="course-report-page-root flex h-full min-h-[600px] w-full min-w-0 flex-col overflow-hidden"
    >
      <CourseReportGenerator
        userId={userId}
        defaultReporter={defaultReporter}
        defaultDepartment={defaultDepartment}
      />
    </div>
  );
}

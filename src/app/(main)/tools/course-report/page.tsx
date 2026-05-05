/**
 * 【課程規劃報告產生器】v1.0
 *
 * 培訓師可：
 *   - 上傳多檔案 / 截圖 / TIS 網址 / 文字筆記，AI 自動萃取為結構化報告
 *   - 在「制式表單」與「自由畫布」雙模式中編輯
 *   - 用 AI 右鍵選單優化文字、發掘亮點、生成配圖、生成資料圖表
 *   - 匯出 DOCX / PDF / PNG / PPTX / HTML
 *
 * 此 page 為 Server Component：
 *   - 拿 next-auth session
 *   - 把 userId、預設 reporter / department 交給 <CourseReportClient />
 */
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CourseReportClient } from "./course-report-client";

export const dynamic = "force-dynamic";

export default async function CourseReportPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }
  const userId = (session.user as { id?: string }).id || "";

  // 嘗試取使用者的姓名 / 學系作為預設報告人 / 學系
  let defaultReporter = session.user.name ?? "";
  let defaultDepartment = "";
  if (userId) {
    try {
      const u = await prisma.user.findUnique({
        where: { id: userId },
        select: { name: true, department: true },
      });
      if (u?.name) defaultReporter = u.name;
      if (u?.department) defaultDepartment = u.department;
    } catch (err) {
      console.warn("[course-report page] 取使用者預設資料失敗：", err);
    }
  }

  return (
    <CourseReportClient
      userId={userId}
      defaultReporter={defaultReporter}
      defaultDepartment={defaultDepartment}
    />
  );
}

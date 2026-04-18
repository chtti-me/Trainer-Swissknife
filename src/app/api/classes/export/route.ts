/**
 * 【班次清單匯出】GET → CSV 下載
 */
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function escapeCsv(val: string | null | undefined): string {
  if (!val) return "";
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "未授權" }, { status: 401 });

  const classes = await prisma.trainingClass.findMany({
    where: { trainerUserId: (session.user as any).id },
    include: { trainer: { select: { name: true } } },
    orderBy: { startDatetime: "desc" },
  });

  const BOM = "\uFEFF";
  const headers = ["班名", "班代號", "院所別", "開班日期", "結束日期", "方式", "狀態", "培訓師", "講師", "名額", "備註"];
  const rows = classes.map((c) => [
    escapeCsv(c.className),
    escapeCsv(c.classCode),
    escapeCsv(c.campus),
    c.startDatetime ? new Date(c.startDatetime).toLocaleDateString("zh-TW") : "",
    c.endDatetime ? new Date(c.endDatetime).toLocaleDateString("zh-TW") : "",
    escapeCsv(c.deliveryMode),
    escapeCsv(c.status),
    escapeCsv(c.trainer?.name || c.mentorName),
    escapeCsv(c.instructorNames),
    c.maxStudents?.toString() || "",
    escapeCsv(c.notes),
  ].join(","));

  const csv = BOM + headers.join(",") + "\n" + rows.join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="classes-export-${new Date().toISOString().split("T")[0]}.csv"`,
    },
  });
}

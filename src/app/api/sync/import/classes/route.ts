/**
 * 【班次匯入 API】POST：解析上傳檔寫入 TrainingClass，並記 SyncJob。
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enrichImportedClassRow } from "@/lib/tis-class-code";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "未授權" }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "請上傳檔案" }, { status: 400 });
  }

  const syncJob = await prisma.syncJob.create({
    data: {
      sourceName: `Excel 手動匯入 (${file.name})`,
      syncMode: "manual_import",
      status: "running",
    },
  });

  try {
    const text = await file.text();
    const lines = text.split("\n").filter((l) => l.trim());

    if (lines.length < 2) {
      await prisma.syncJob.update({
        where: { id: syncJob.id },
        data: { status: "failed", finishedAt: new Date(), logText: "檔案內容不足" },
      });
      return NextResponse.json({ error: "檔案內容不足" }, { status: 400 });
    }

    const headers = lines[0].split(",").map((h) => h.trim().replace(/"/g, ""));
    let success = 0;
    let failed = 0;

    for (let i = 1; i < lines.length; i++) {
      try {
        const values = lines[i].split(",").map((v) => v.trim().replace(/"/g, ""));
        const row: Record<string, string> = {};
        headers.forEach((h, idx) => { row[h] = values[idx] || ""; });

        const className = row["班名"] || row["class_name"] || `未命名班次-${i}`;
        const enriched = enrichImportedClassRow({
          classCode: row["班代號"] || row["class_code"] || null,
          className,
          campus: row["院所別"] || row["campus"] || null,
          category: row["課程類別"] || row["category"] || null,
          difficultyLevel: row["難度"] || row["difficulty_level"] || null,
          deliveryMode: row["開班方式"] || row["delivery_mode"] || null,
        });

        await prisma.trainingClass.create({
          data: {
            classCode: enriched.classCode,
            className: enriched.className,
            campus: enriched.campus,
            category: enriched.category,
            tisClassId5: enriched.tisClassId5,
            tisVenueCode: enriched.tisVenueCode,
            tisSessionCode: enriched.tisSessionCode,
            tisDifficultyDigit: enriched.tisDifficultyDigit,
            classType: row["班次類型"] || row["class_type"] || null,
            difficultyLevel: enriched.difficultyLevel,
            deliveryMode: enriched.deliveryMode,
            startDatetime: row["開班日期"] || row["start_datetime"] ? new Date(row["開班日期"] || row["start_datetime"]) : null,
            endDatetime: row["結束日期"] || row["end_datetime"] ? new Date(row["結束日期"] || row["end_datetime"]) : null,
            instructorNames: row["講師"] || row["instructor_names"] || null,
            location: row["地點"] || row["location"] || null,
            roomName: row["教室"] || row["room_name"] || null,
            summary: row["摘要"] || row["summary"] || null,
            audience: row["培訓對象"] || row["audience"] || null,
            status: row["狀態"] || row["status"] || "規劃中",
            sourceType: "manual_import",
            importedAt: new Date(),
            embeddingText: [
              enriched.className,
              row["摘要"] || row["summary"],
              row["培訓對象"] || row["audience"],
              enriched.category,
              enriched.difficultyLevel,
            ].filter(Boolean).join(" | "),
          },
        });
        success++;
      } catch (e) {
        failed++;
      }
    }

    await prisma.syncJob.update({
      where: { id: syncJob.id },
      data: {
        status: failed === 0 ? "success" : "partial",
        finishedAt: new Date(),
        totalCount: lines.length - 1,
        successCount: success,
        failedCount: failed,
        logText: `匯入完成。成功 ${success} 筆，失敗 ${failed} 筆。`,
      },
    });

    return NextResponse.json({ success: true, successCount: success, failedCount: failed });
  } catch (error: any) {
    await prisma.syncJob.update({
      where: { id: syncJob.id },
      data: { status: "failed", finishedAt: new Date(), logText: error.message },
    });
    return NextResponse.json({ error: "匯入失敗" }, { status: 500 });
  }
}

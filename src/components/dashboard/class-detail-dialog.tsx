"use client";

/**
 * 【班次詳情彈窗】
 * 從 Dashboard 頁面抽取出的獨立元件，負責顯示班次完整資訊。
 */
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { formatDateTime, getStatusColor } from "@/lib/utils";
import dynamic from "next/dynamic";

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
}

export function ClassDetailDialog({ selectedClass, open, onOpenChange }: ClassDetailDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        {selectedClass && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 flex-wrap">
                {selectedClass.className}
                <Badge variant="outline" className={getStatusColor(selectedClass.status)}>{selectedClass.status}</Badge>
              </DialogTitle>
              <DialogDescription>
                {selectedClass.classCode && <span>班代號：{selectedClass.classCode}</span>}
              </DialogDescription>
            </DialogHeader>

            <ClassNotes classId={selectedClass.id} />

            <Separator />

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">院所別</p>
                  <p className="font-medium">{selectedClass.campus || "-"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">課程類別</p>
                  <p className="font-medium">{selectedClass.category || "-"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">班次類型</p>
                  <p className="font-medium">{selectedClass.classType || "-"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">難度</p>
                  <p className="font-medium">{selectedClass.difficultyLevel || "-"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">開班方式</p>
                  <p className="font-medium">{selectedClass.deliveryMode || "-"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">名額</p>
                  <p className="font-medium">{selectedClass.maxStudents || "-"}</p>
                </div>
              </div>

              <Separator />

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">開班日期</p>
                  <p className="font-medium">{formatDateTime(selectedClass.startDatetime)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">結束日期</p>
                  <p className="font-medium">{formatDateTime(selectedClass.endDatetime)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">報到時間</p>
                  <p className="font-medium">{formatDateTime(selectedClass.checkinDatetime) || "-"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">結訓時間</p>
                  <p className="font-medium">{formatDateTime(selectedClass.graduationDatetime) || "-"}</p>
                </div>
              </div>

              <Separator />

              <div className="space-y-3 text-sm">
                <div>
                  <p className="text-muted-foreground">負責培訓師（系統帳號）</p>
                  <p className="font-medium">{selectedClass.trainer?.name || "未綁定登入帳號"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">TIS 導師（計畫表快照）</p>
                  <p className="font-medium">{tisMentorLabel(selectedClass)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">授課講師（課程附屬）</p>
                  <p className="font-medium">{selectedClass.instructorNames || "尚未指定"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">教室 / 地點</p>
                  <p className="font-medium">
                    {[selectedClass.location, selectedClass.roomName].filter(Boolean).join(" - ") || "尚未指定"}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">培訓對象</p>
                  <p className="font-medium">{selectedClass.audience || "-"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">課程內容摘要</p>
                  <p className="font-medium">{selectedClass.summary || "-"}</p>
                </div>
                {selectedClass.requestSource && (
                  <div>
                    <p className="text-muted-foreground">需求來源</p>
                    <p className="font-medium">{selectedClass.requestSource}</p>
                  </div>
                )}
                {selectedClass.materialLink && (
                  <div>
                    <p className="text-muted-foreground">教材連結</p>
                    <p className="font-medium text-primary">{selectedClass.materialLink}</p>
                  </div>
                )}
                {selectedClass.notes && (
                  <div>
                    <p className="text-muted-foreground">備註</p>
                    <p className="font-medium">{selectedClass.notes}</p>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

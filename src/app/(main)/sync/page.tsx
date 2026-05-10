"use client";

/**
 * 【班次匯入／同步】
 * 上傳 Excel 等觸發 /api/sync/import/classes，並可查看同步紀錄。
 */
import { useEffect, useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Upload, CheckCircle2, XCircle, Clock, FileSpreadsheet, Loader2, Database } from "lucide-react";
import { formatDateTime } from "@/lib/utils";
import { PageHeading } from "@/components/layout/page-heading";
import { useToast } from "@/components/ui/toaster";
import { TableSkeleton } from "@/components/ui/skeleton";
import { TisHtmlUploader } from "@/components/sync/tis-html-uploader";

interface SyncJob {
  id: string;
  sourceName: string;
  syncMode: string;
  startedAt: string;
  finishedAt: string | null;
  status: string;
  totalCount: number;
  successCount: number;
  failedCount: number;
  logText: string | null;
}

export default function SyncPage() {
  const { toast } = useToast();
  const [jobs, setJobs] = useState<SyncJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const fetchJobs = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/sync/jobs");
      const data = await res.json();
      setJobs(data);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { fetchJobs(); }, []);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("type", "classes");

    try {
      const res = await fetch("/api/sync/import/classes", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (data.error) {
        toast("匯入失敗：" + data.error, "error");
      } else {
        toast(`匯入完成！成功 ${data.successCount} 筆，失敗 ${data.failedCount} 筆`, "success");
        fetchJobs();
      }
    } catch {
      toast("匯入失敗", "error");
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "success": return <Badge className="bg-green-100 text-green-800"><CheckCircle2 className="w-3 h-3 mr-1" />成功</Badge>;
      case "failed": return <Badge className="bg-red-100 text-red-800"><XCircle className="w-3 h-3 mr-1" />失敗</Badge>;
      case "partial": return <Badge className="bg-yellow-100 text-yellow-800">部分成功</Badge>;
      default: return <Badge className="bg-blue-100 text-blue-800"><Clock className="w-3 h-3 mr-1" />執行中</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <PageHeading
        title="資料同步記錄"
        description="管理 TIS 資料匯入與同步記錄"
        trailing={
          <div className="flex gap-2">
            <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleUpload} />
            <Button onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              匯入班次資料
            </Button>
          </div>
        }
      />

      {/* 1. 匯入 / 同步記錄（最上方） */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">匯入 / 同步記錄</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <TableSkeleton rows={4} cols={3} />
          ) : jobs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-3">
              <RefreshCw className="w-10 h-10 opacity-30" />
              <p className="text-sm">尚無同步記錄</p>
              <p className="text-xs opacity-60">選擇檔案後按「上傳」開始匯入</p>
            </div>
          ) : (
            <div className="space-y-3">
              {jobs.map((job) => (
                <div key={job.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center gap-4">
                    <FileSpreadsheet className="w-8 h-8 text-muted-foreground" />
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm">{job.sourceName}</p>
                        {getStatusBadge(job.status)}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatDateTime(job.startedAt)}
                        {job.finishedAt && ` → ${formatDateTime(job.finishedAt)}`}
                      </p>
                      {job.logText && <p className="text-xs text-muted-foreground mt-0.5">{job.logText}</p>}
                    </div>
                  </div>
                  <div className="text-right text-xs space-y-0.5">
                    <p>總計：<span className="font-medium">{job.totalCount}</span> 筆</p>
                    <p className="text-green-600">成功：{job.successCount}</p>
                    {job.failedCount > 0 && <p className="text-red-600">失敗：{job.failedCount}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 2. TIS HTML 同步 */}
      <TisHtmlUploader onSyncDone={fetchJobs} />

      {/* 3. 資料來源設定（從「系統設定」搬過來） */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Database className="w-4 h-4 text-primary" />
            資料來源設定
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="space-y-2">
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div>
                <p className="font-medium">手動匯入 Excel / CSV</p>
                <p className="text-xs text-muted-foreground">透過檔案上傳匯入班次資料</p>
              </div>
              <Badge className="bg-green-100 text-green-800">已啟用</Badge>
            </div>
            <div className="flex items-start justify-between p-3 border rounded-lg gap-4">
              <div className="flex-1">
                <p className="font-medium">TIS 只讀同步器（HTML 上傳版）</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  將 TIS「開班計畫表列表」每月份 HTML 上傳到本系統 →
                  解析 → 預覽差異 →確認後 upsert 進 TrainingClass。
                  搭配 SingleFile 擴充功能可一次存全年 12 個月份。
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  入口：本頁上方「TIS HTML 同步」區塊。
                </p>
              </div>
              <Badge className="bg-green-100 text-green-800 shrink-0">已啟用</Badge>
            </div>
            <div className="flex items-start justify-between p-3 border rounded-lg gap-4">
              <div className="flex-1">
                <p className="font-medium">TIS 頁面抓取器（Bookmarklet 一鍵抓）</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  使用者登入 TIS 後點瀏覽器書籤 →
                  在 TIS 頁面以同源 fetch 抓取 12 個月份 → 自動 POST 回本系統解析入庫。
                  避免使用者手動逐月另存 HTML。
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  架構：所有 TIS fetch 都在使用者瀏覽器內發起（同源、不受 CORS 限制），
                  本系統 server 不接觸 TIS 帳密或 session。書籤拖拉與使用步驟在
                  <a href="/settings" className="text-primary underline ml-1">系統設定</a>
                  頁面下方。
                </p>
              </div>
              <Badge className="bg-green-100 text-green-800 shrink-0">已啟用</Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

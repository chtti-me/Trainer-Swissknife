"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PageHeading } from "@/components/layout/page-heading";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ScrollText,
  Search,
  FileText,
} from "lucide-react";
import { formatDateTime } from "@/lib/utils";
import { TableSkeleton } from "@/components/ui/skeleton";

interface AuditLogRow {
  id: string;
  userId: string | null;
  action: string;
  target: string | null;
  detail: string | null;
  agentConversationId: string | null;
  createdAt: string;
}

interface AuditLogResponse {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  logs: AuditLogRow[];
}

export default function AuditLogPage() {
  const [data, setData] = useState<AuditLogResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [selectedLog, setSelectedLog] = useState<AuditLogRow | null>(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "30" });
      if (actionFilter) params.set("action", actionFilter);
      const res = await fetch(`/api/agent/audit-log?${params}`);
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, [page, actionFilter]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const handleSearch = () => {
    setPage(1);
    setActionFilter(searchInput.trim());
  };

  const handleClearFilter = () => {
    setSearchInput("");
    setActionFilter("");
    setPage(1);
  };

  const actionBadgeColor = (action: string): string => {
    if (action.startsWith("agent_tool:")) return "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/30 dark:text-violet-300 dark:border-violet-800";
    if (action.startsWith("agent_")) return "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-300 dark:border-blue-800";
    return "bg-muted text-muted-foreground border-border";
  };

  const formatDetail = (detail: string | null): string => {
    if (!detail) return "—";
    try {
      return JSON.stringify(JSON.parse(detail), null, 2);
    } catch {
      return detail;
    }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" asChild className="gap-1">
          <Link href="/settings">
            <ArrowLeft className="h-4 w-4" />
            返回系統設定
          </Link>
        </Button>
      </div>

      <PageHeading
        title="審計日誌"
        description="檢視 AI 助理的工具呼叫紀錄與系統操作歷史。管理員可查看全部紀錄，一般使用者僅可查看自己的紀錄。"
      />

      <Card>
        <CardHeader className="py-3 px-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-sm flex items-center gap-2">
              <ScrollText className="h-4 w-4 text-muted-foreground" />
              操作紀錄
              {data && (
                <Badge variant="outline" className="text-[10px] font-normal">
                  共 {data.total} 筆
                </Badge>
              )}
            </CardTitle>

            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <Label htmlFor="action-filter" className="sr-only">
                  篩選動作
                </Label>
                <Input
                  id="action-filter"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  placeholder="篩選動作（例如：agent_tool）"
                  className="h-8 w-56 text-sm"
                />
                <Button variant="outline" size="sm" className="h-8 gap-1" onClick={handleSearch}>
                  <Search className="h-3.5 w-3.5" /> 篩選
                </Button>
                {actionFilter && (
                  <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={handleClearFilter}>
                    清除
                  </Button>
                )}
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <TableSkeleton rows={6} cols={4} />
          ) : !data || data.logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-3">
              <FileText className="w-10 h-10 opacity-30" />
              <p className="text-sm">暫無審計紀錄</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-40">時間</TableHead>
                      <TableHead className="w-40">動作</TableHead>
                      <TableHead className="w-28">目標</TableHead>
                      <TableHead>摘要</TableHead>
                      <TableHead className="w-16 text-center">詳情</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.logs.map((log) => (
                      <TableRow key={log.id} className="group">
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {formatDateTime(log.createdAt)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-[10px] font-mono ${actionBadgeColor(log.action)}`}>
                            {log.action}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs font-mono">
                          {log.target || "—"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-xs truncate">
                          {log.detail ? log.detail.slice(0, 80) : "—"}
                          {log.detail && log.detail.length > 80 ? "…" : ""}
                        </TableCell>
                        <TableCell className="text-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 text-[10px] opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => setSelectedLog(log)}
                          >
                            查看
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="flex items-center justify-between px-4 py-3 border-t text-sm">
                <span className="text-muted-foreground text-xs">
                  第 {data.page} 頁 / 共 {data.totalPages} 頁
                </span>
                <div className="flex gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7"
                    disabled={page >= (data?.totalPages ?? 1)}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selectedLog} onOpenChange={() => setSelectedLog(null)}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>審計紀錄詳情</DialogTitle>
          </DialogHeader>
          {selectedLog && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-[6rem_1fr] gap-y-2">
                <span className="text-muted-foreground">時間</span>
                <span>{formatDateTime(selectedLog.createdAt)}</span>
                <span className="text-muted-foreground">動作</span>
                <Badge variant="outline" className={`w-fit text-[10px] font-mono ${actionBadgeColor(selectedLog.action)}`}>
                  {selectedLog.action}
                </Badge>
                <span className="text-muted-foreground">目標</span>
                <span className="font-mono">{selectedLog.target || "—"}</span>
                <span className="text-muted-foreground">使用者 ID</span>
                <span className="font-mono text-[11px] break-all">{selectedLog.userId || "—"}</span>
                {selectedLog.agentConversationId && (
                  <>
                    <span className="text-muted-foreground">對話 ID</span>
                    <span className="font-mono text-[11px] break-all">{selectedLog.agentConversationId}</span>
                  </>
                )}
              </div>
              <div>
                <span className="text-muted-foreground block mb-1">詳細資訊</span>
                <pre className="bg-muted/50 p-3 rounded text-xs overflow-x-auto whitespace-pre-wrap break-all max-h-60">
                  {formatDetail(selectedLog.detail)}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

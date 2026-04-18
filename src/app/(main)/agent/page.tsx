"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Bot,
  Send,
  Plus,
  Loader2,
  Wrench,
  CheckCircle2,
  XCircle,
  MessageSquare,
  Trash2,
  Clock,
  AlertCircle,
  Download,
  Paperclip,
  FileUp,
  File as FileIcon,
  X,
} from "lucide-react";
import { useAgentStreams } from "@/hooks/use-agent-streams";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { useToast } from "@/components/ui/toaster";

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  toolCalls?: Array<{
    toolName: string;
    params: Record<string, unknown>;
    result: unknown;
    durationMs: number;
    status: string;
  }>;
  createdAt: string;
}

interface ConversationItem {
  id: string;
  title: string;
  updatedAt: string;
  messageCount: number;
}

interface PendingFile {
  file: File;
  name: string;
  size: number;
}

export default function AgentPage() {
  const { toast } = useToast();
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [parallelWarning, setParallelWarning] = useState<string | null>(null);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const streams = useAgentStreams();
  const currentStream = activeConvId ? streams.getStreamState(activeConvId) : null;
  const currentStreaming = currentStream?.streaming ?? false;

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, currentStream?.streamText, scrollToBottom]);

  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch("/api/agent/conversations");
      if (res.ok) {
        const data = await res.json();
        setConversations(data);
      }
    } catch {
      // 靜默失敗
    }
  }, []);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  const loadConversation = useCallback(async (convId: string) => {
    try {
      const res = await fetch(`/api/agent/conversations/${convId}`);
      if (res.ok) {
        const data = await res.json();
        setActiveConvId(convId);
        setMessages(data.messages || []);
        setParallelWarning(null);
      }
    } catch {
      // 靜默失敗
    }
  }, []);

  const startNewConversation = useCallback(() => {
    setActiveConvId(null);
    setMessages([]);
    setParallelWarning(null);
    inputRef.current?.focus();
  }, []);

  const deleteConversation = useCallback(
    async (convId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      if (!confirm("確定要刪除這個對話嗎？")) return;
      try {
        streams.abortStream(convId);
        await fetch(`/api/agent/conversations/${convId}`, { method: "DELETE" });
        if (activeConvId === convId) {
          startNewConversation();
        }
        fetchConversations();
      } catch {
        // 靜默失敗
      }
    },
    [activeConvId, startNewConversation, fetchConversations, streams]
  );

  const addFiles = useCallback((fileList: FileList | File[]) => {
    const newFiles: PendingFile[] = [];
    for (const file of Array.from(fileList)) {
      if (file.size > 3 * 1024 * 1024) {
        toast(`「${file.name}」超過 3MB 上限，已略過`, "error");
        continue;
      }
      newFiles.push({ file, name: file.name, size: file.size });
    }
    setPendingFiles((prev) => [...prev, ...newFiles]);
  }, []);

  const removePendingFile = useCallback((idx: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const uploadPendingFiles = useCallback(async (): Promise<{ names: string[]; imageUrls: string[] }> => {
    if (pendingFiles.length === 0) return { names: [], imageUrls: [] };
    setUploading(true);
    try {
      const form = new FormData();
      for (const pf of pendingFiles) {
        form.append("files", pf.file);
      }
      const res = await fetch("/api/agent/workspace/upload", { method: "POST", body: form });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "上傳失敗" }));
        throw new Error(err.error);
      }
      const data = await res.json();
      const uploaded = (data.uploaded as Array<{ name: string; ok: boolean; path: string }>)
        .filter((u) => u.ok);
      const names = uploaded.map((u) => u.name);

      const imageExts = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"];
      const imageUrls = uploaded
        .filter((u) => imageExts.some((ext) => u.name.toLowerCase().endsWith(ext)))
        .map((u) => `${window.location.origin}/api/agent/workspace/download/${encodeURIComponent(u.name)}`);

      setPendingFiles([]);
      return { names, imageUrls };
    } catch (e) {
      toast(`上傳失敗：${(e as Error).message}`, "error");
      return { names: [], imageUrls: [] };
    } finally {
      setUploading(false);
    }
  }, [pendingFiles]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
  }, [addFiles]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    const hasFiles = pendingFiles.length > 0;
    if ((!text && !hasFiles) || currentStreaming) return;

    setParallelWarning(null);

    let finalText = text;
    let imageUrls: string[] = [];

    if (hasFiles) {
      const uploadResult = await uploadPendingFiles();
      if (uploadResult.names.length > 0) {
        const fileNote = uploadResult.names.map((n) => `「${n}」`).join("、");
        const prefix = `[使用者已上傳檔案到 agent-workspace：${fileNote}]\n\n`;
        finalText = prefix + (text || `請幫我查看我剛上傳的檔案：${fileNote}`);
        imageUrls = uploadResult.imageUrls;
      } else if (!text) {
        return;
      }
    }

    const userMsg: ChatMessage = {
      id: `temp-${Date.now()}`,
      role: "user",
      content: finalText,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");

    const sendConvId = activeConvId;

    const result = await streams.startStream(sendConvId, finalText, {
      onConversationCreated: (newConvId) => {
        setActiveConvId(newConvId);
      },
      onMessageAppend: (msg) => {
        setMessages((prev) => [...prev, msg as ChatMessage]);
      },
      onDone: () => {
        fetchConversations();
      },
    }, imageUrls.length > 0 ? { imageUrls } : undefined);

    if (!result.ok && result.error) {
      if (result.error.includes("正在執行中")) {
        setParallelWarning(result.error);
        setMessages((prev) => prev.filter((m) => m.id !== userMsg.id));
        setInput(text);
      }
    }
  }, [input, currentStreaming, activeConvId, streams, fetchConversations, pendingFiles, uploadPendingFiles]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    },
    [sendMessage]
  );

  return (
    <div className="flex -m-6" style={{ height: "calc(100% + 48px)" }}>
      {/* 左側：對話歷史 */}
      <div className="w-40 shrink-0 border-r bg-card flex flex-col">
        <div className="p-2 border-b">
          <Button
            onClick={startNewConversation}
            variant="outline"
            size="sm"
            className="w-full gap-1.5 text-xs h-8"
          >
            <Plus className="h-3.5 w-3.5" />
            新對話
          </Button>
        </div>

        {streams.activeStreamCount > 0 && (
          <div className="px-2 py-1 border-b bg-primary/5">
            <div className="flex items-center gap-1 text-[9px] text-primary">
              <Loader2 className="h-2.5 w-2.5 animate-spin" />
              <span>{streams.activeStreamCount} 個執行中</span>
            </div>
          </div>
        )}

        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {conversations.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-3">
                <MessageSquare className="w-10 h-10 opacity-30" />
                <p className="text-sm">尚無對話紀錄</p>
                <p className="text-xs opacity-60">按下「+ 新對話」開始使用 AI 助理</p>
              </div>
            )}
            {conversations.map((conv) => {
              const convIsStreaming = streams.isStreaming(conv.id);
              return (
                <div
                  key={conv.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`開啟對話：${conv.title}`}
                  onClick={() => loadConversation(conv.id)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); loadConversation(conv.id); } }}
                  className={cn(
                    "w-full text-left rounded-md px-2 py-1.5 transition-colors group cursor-pointer",
                    "hover:bg-accent",
                    activeConvId === conv.id
                      ? "bg-primary/10 text-primary"
                      : "text-foreground"
                  )}
                >
                  <div className="overflow-hidden pr-1">
                    <p className="font-medium text-[10px] leading-tight line-clamp-2 break-all">
                      {conv.title}
                    </p>
                    <div className="flex items-center justify-between mt-0.5">
                      {convIsStreaming ? (
                        <span className="text-[8px] text-primary font-medium flex items-center gap-1">
                          <Loader2 className="h-2.5 w-2.5 animate-spin" />
                          執行中…
                        </span>
                      ) : (
                        <span className="text-[8px] text-muted-foreground">
                          {new Date(conv.updatedAt).toLocaleDateString("zh-TW")}
                        </span>
                      )}
                      <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const a = document.createElement("a");
                            a.href = `/api/agent/conversations/${conv.id}/export`;
                            a.download = "";
                            a.click();
                          }}
                          className="hover:text-primary p-0.5"
                          title="匯出對話"
                        >
                          <Download className="h-3 w-3" />
                        </button>
                        <button
                          onClick={(e) => deleteConversation(conv.id, e)}
                          className="hover:text-destructive p-0.5"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </div>

      {/* 右側：對話區 */}
      <div
        className={cn("flex-1 flex flex-col min-w-0 bg-background", dragOver && "ring-2 ring-inset ring-primary/50")}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* 標題列 */}
        <div className="shrink-0 px-6 py-3 border-b bg-card flex items-center gap-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 text-white">
            <Bot className="w-4.5 h-4.5" />
          </div>
          <div className="flex-1">
            <h1 className="text-sm font-bold">AI 助理「小瑞」</h1>
            <p className="text-[11px] text-muted-foreground">
              課程規劃 · 班次查詢 · 相似度檢測 · 網路搜尋 · 檔案操作
            </p>
          </div>
          {currentStreaming && (
            <Badge variant="outline" className="gap-1.5 text-[11px] text-primary border-primary/30 bg-primary/5">
              <Loader2 className="h-3 w-3 animate-spin" />
              處理中
            </Badge>
          )}
        </div>

        {/* 訊息區 */}
        <div className="flex-1 overflow-auto px-6 py-4">
          {messages.length === 0 && !(currentStream?.streamText) && (
            <div className="flex flex-col items-center justify-center h-full text-center max-w-md mx-auto">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-100 to-purple-100 flex items-center justify-center mb-4">
                <Bot className="w-8 h-8 text-violet-600" />
              </div>
              <h2 className="text-lg font-bold mb-2">嗨！我是小瑞</h2>
              <p className="text-sm text-muted-foreground mb-6">
                你的 AI 培訓助理。我可以幫你規劃課程、查詢班次資料、檢測開班相似度、搜尋講師資訊，還可以讀寫工作區檔案。
              </p>
              <div className="grid grid-cols-2 gap-2 w-full">
                {[
                  "幫我規劃一門「Python 資料分析」培訓課程",
                  "查詢今年院本部的資安課程有哪些",
                  "檢測「AI 應用實務班」和既有課程的相似度",
                  "搜尋台灣有哪些知名的雲端技術講師",
                ].map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => {
                      setInput(suggestion);
                      inputRef.current?.focus();
                    }}
                    className="text-left text-xs p-3 rounded-lg border bg-card hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-4 max-w-3xl mx-auto">
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}

            {/* 串流中的工具呼叫狀態 */}
            {currentStream && currentStream.activeTools.length > 0 && (
              <div className="flex gap-3">
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shrink-0">
                  <Bot className="w-3.5 h-3.5 text-white" />
                </div>
                <div className="space-y-1.5">
                  {currentStream.activeTools.map((tool) => (
                    <div
                      key={tool}
                      className="flex items-center gap-2 text-sm text-muted-foreground"
                    >
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>
                        正在執行工具：
                        <span className="font-mono text-xs">{tool}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {currentStream && currentStream.toolResults.length > 0 && currentStreaming && (
              <div className="flex gap-3">
                <div className="w-7 h-7 shrink-0" />
                <div className="space-y-1.5">
                  {currentStream.toolResults.map((tr, i) => (
                    <ToolResultBadge key={i} {...tr} />
                  ))}
                </div>
              </div>
            )}

            {/* 串流中的文字 */}
            {currentStream?.streamText && (
              <div className="flex gap-3">
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shrink-0">
                  <Bot className="w-3.5 h-3.5 text-white" />
                </div>
                <div className="flex-1 min-w-0 bg-card border shadow-sm rounded-xl px-4 py-2.5 text-[13.5px] leading-relaxed">
                  <MarkdownRenderer content={currentStream.streamText} />
                  <span className="inline-block w-1.5 h-4 bg-violet-500 animate-pulse ml-0.5 align-text-bottom" />
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* 並行上限警告 */}
        {parallelWarning && (
          <div className="shrink-0 px-6 py-2 bg-destructive/10 border-t border-destructive/20">
            <div className="max-w-3xl mx-auto flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{parallelWarning}</span>
              <button
                onClick={() => setParallelWarning(null)}
                className="ml-auto text-xs underline hover:no-underline"
              >
                關閉
              </button>
            </div>
          </div>
        )}

        {/* 拖放提示覆蓋 */}
        {dragOver && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm pointer-events-none">
            <div className="flex flex-col items-center gap-2 text-primary">
              <FileUp className="h-12 w-12" />
              <p className="text-sm font-medium">放開以上傳檔案到工作區</p>
            </div>
          </div>
        )}

        {/* 輸入區 */}
        <div className="shrink-0 border-t bg-card px-6 pt-5 pb-1">
          <div className="mx-auto space-y-2">
            {/* 待上傳檔案預覽 */}
            {pendingFiles.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {pendingFiles.map((pf, idx) => (
                  <div
                    key={`${pf.name}-${idx}`}
                    className="flex items-center gap-1.5 rounded-lg border bg-muted/50 px-2 py-1 text-xs"
                  >
                    <FileIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="max-w-[120px] truncate">{pf.name}</span>
                    <span className="text-muted-foreground">
                      ({pf.size < 1024 ? `${pf.size}B` : pf.size < 1024 * 1024 ? `${(pf.size / 1024).toFixed(0)}KB` : `${(pf.size / 1024 / 1024).toFixed(1)}MB`})
                    </span>
                    <button
                      type="button"
                      onClick={() => removePendingFile(idx)}
                      className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2 items-end">
              {/* 上傳按鈕 */}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => fileInputRef.current?.click()}
                disabled={currentStreaming || uploading}
                className="shrink-0 h-10 w-10 text-muted-foreground hover:text-foreground"
                title="上傳檔案到工作區"
              >
                <Paperclip className="h-4.5 w-4.5" />
              </Button>

              <Textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="輸入訊息… (Shift+Enter 換行)"
                disabled={currentStreaming}
                rows={1}
                className="resize-none min-h-[40px] max-h-[120px] text-sm"
                style={{ height: "auto" }}
                onInput={(e) => {
                  const target = e.target as HTMLTextAreaElement;
                  target.style.height = "auto";
                  target.style.height = `${Math.min(target.scrollHeight, 120)}px`;
                }}
              />
              <Button
                onClick={sendMessage}
                disabled={(!input.trim() && pendingFiles.length === 0) || currentStreaming || uploading}
                size="icon"
                className="shrink-0 h-10 w-10 bg-gradient-to-br from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700"
              >
                {currentStreaming || uploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
          <p className="text-[5px] text-center text-muted-foreground mt-3 mx-auto leading-relaxed">
            AI 助理可能產生不正確的資訊，重要決策請人工確認。<br />📎 可附加檔案或拖放至此區域上傳。
          </p>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";

  return (
    <div className={cn("flex gap-3", isUser && "flex-row-reverse")}>
      {isUser ? (
        <div className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center shrink-0 text-xs font-bold text-secondary-foreground">
          我
        </div>
      ) : (
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shrink-0">
          <Bot className="w-3.5 h-3.5 text-white" />
        </div>
      )}
      <div
        className={cn(
          "flex-1 min-w-0",
          isUser && "flex justify-end"
        )}
      >
        <div
          className={cn(
            "rounded-xl px-4 py-2.5 text-[13.5px] leading-relaxed",
            isUser
              ? "bg-primary text-primary-foreground max-w-[80%] inline-block"
              : "bg-card border shadow-sm"
          )}
        >
          {isUser ? (
            <div className="whitespace-pre-wrap">{message.content}</div>
          ) : (
            <MarkdownRenderer content={message.content} />
          )}
        </div>

        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="mt-2 space-y-1">
            {message.toolCalls.map((tc, i) => (
              <ToolResultBadge
                key={i}
                toolName={tc.toolName}
                success={tc.status === "success"}
                data={tc.result}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ToolResultBadge({
  toolName,
  success,
  data,
}: {
  toolName: string;
  success: boolean;
  data?: unknown;
}) {
  const downloadUrl = success && toolName === "file_write" && data
    ? (data as Record<string, unknown>)?.downloadUrl as string | undefined
    : undefined;

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <Badge
        variant="outline"
        className={cn(
          "gap-1.5 text-[11px] font-normal",
          success
            ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300"
            : "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300"
        )}
      >
        {success ? (
          <CheckCircle2 className="h-3 w-3" />
        ) : (
          <XCircle className="h-3 w-3" />
        )}
        <Wrench className="h-3 w-3" />
        <span className="font-mono">{toolName}</span>
        <span>{success ? "完成" : "失敗"}</span>
      </Badge>
      {downloadUrl && (
        <a
          href={downloadUrl}
          download
          className="inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/5 px-2 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/10 transition-colors"
        >
          <Download className="h-3 w-3" />
          下載檔案
        </a>
      )}
    </div>
  );
}

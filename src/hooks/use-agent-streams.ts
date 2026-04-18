"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentStreamChunk } from "@/lib/agent/types";

const MAX_PARALLEL_STREAMS = 2;

export interface ToolResultItem {
  toolName: string;
  success: boolean;
  data?: unknown;
}

export interface StreamState {
  streaming: boolean;
  streamText: string;
  activeTools: string[];
  toolResults: ToolResultItem[];
}

interface InternalStreamState extends StreamState {
  abortController: AbortController | null;
}

function emptyState(): InternalStreamState {
  return {
    streaming: false,
    streamText: "",
    activeTools: [],
    toolResults: [],
    abortController: null,
  };
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  createdAt: string;
}

export interface StartStreamResult {
  ok: boolean;
  error?: string;
  conversationId?: string;
}

export interface AgentStreamsAPI {
  getStreamState: (convId: string) => StreamState;
  isStreaming: (convId: string) => boolean;
  activeStreamCount: number;
  streamingConvIds: string[];
  startStream: (
    convId: string | null,
    message: string,
    callbacks: {
      onConversationCreated?: (convId: string) => void;
      onMessageAppend?: (msg: ChatMessage) => void;
      onDone?: () => void;
    },
    options?: { imageUrls?: string[] }
  ) => Promise<StartStreamResult>;
  abortStream: (convId: string) => void;
  abortAll: () => void;
}

export function useAgentStreams(): AgentStreamsAPI {
  const streamsRef = useRef(new Map<string, InternalStreamState>());
  const [, setTick] = useState(0);
  const rerender = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    return () => {
      for (const state of streamsRef.current.values()) {
        state.abortController?.abort();
      }
    };
  }, []);

  const getStreamState = useCallback(
    (convId: string): StreamState => {
      const s = streamsRef.current.get(convId);
      if (!s) return emptyState();
      return {
        streaming: s.streaming,
        streamText: s.streamText,
        activeTools: s.activeTools,
        toolResults: s.toolResults,
      };
    },
    []
  );

  const isStreaming = useCallback(
    (convId: string): boolean => streamsRef.current.get(convId)?.streaming ?? false,
    []
  );

  const getActiveStreamCount = useCallback((): number => {
    let count = 0;
    for (const s of streamsRef.current.values()) {
      if (s.streaming) count++;
    }
    return count;
  }, []);

  const getStreamingConvIds = useCallback((): string[] => {
    const ids: string[] = [];
    for (const [id, s] of streamsRef.current.entries()) {
      if (s.streaming) ids.push(id);
    }
    return ids;
  }, []);

  const updateStream = useCallback(
    (convId: string, updater: (prev: InternalStreamState) => Partial<InternalStreamState>) => {
      const current = streamsRef.current.get(convId) ?? emptyState();
      streamsRef.current.set(convId, { ...current, ...updater(current) });
      rerender();
    },
    [rerender]
  );

  const abortStream = useCallback(
    (convId: string) => {
      const s = streamsRef.current.get(convId);
      if (s) {
        s.abortController?.abort();
        s.streaming = false;
        s.abortController = null;
        rerender();
      }
    },
    [rerender]
  );

  const abortAll = useCallback(() => {
    for (const [, s] of streamsRef.current.entries()) {
      s.abortController?.abort();
      s.streaming = false;
      s.abortController = null;
    }
    rerender();
  }, [rerender]);

  const startStream = useCallback(
    async (
      convId: string | null,
      message: string,
      callbacks: {
        onConversationCreated?: (convId: string) => void;
        onMessageAppend?: (msg: ChatMessage) => void;
        onDone?: () => void;
      },
      options?: { imageUrls?: string[] }
    ): Promise<StartStreamResult> => {
      if (getActiveStreamCount() >= MAX_PARALLEL_STREAMS) {
        return {
          ok: false,
          error: `目前已有 ${MAX_PARALLEL_STREAMS} 個對話正在執行中，請等待其中一個完成後再試`,
        };
      }

      const abortController = new AbortController();
      const tempId = convId ?? `pending-${Date.now()}`;

      updateStream(tempId, () => ({
        streaming: true,
        streamText: "",
        activeTools: [],
        toolResults: [],
        abortController,
      }));

      let resolvedConvId = convId;

      try {
        const res = await fetch("/api/agent/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversationId: convId,
            message,
            imageUrls: options?.imageUrls,
          }),
          signal: abortController.signal,
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "未知錯誤" }));
          callbacks.onMessageAppend?.({
            id: `err-${Date.now()}`,
            role: "assistant",
            content: `錯誤：${err.error || "伺服器錯誤"}`,
            createdAt: new Date().toISOString(),
          });
          updateStream(tempId, () => ({ streaming: false, abortController: null }));
          return { ok: false, error: err.error };
        }

        const serverConvId = res.headers.get("X-Conversation-Id");
        if (serverConvId) {
          resolvedConvId = serverConvId;
          if (tempId !== serverConvId) {
            const oldState = streamsRef.current.get(tempId) ?? emptyState();
            streamsRef.current.delete(tempId);
            streamsRef.current.set(serverConvId, { ...oldState, abortController });
            rerender();
          }
          if (!convId) {
            callbacks.onConversationCreated?.(serverConvId);
          }
        }

        const reader = res.body?.getReader();
        if (!reader) {
          updateStream(resolvedConvId ?? tempId, () => ({ streaming: false, abortController: null }));
          return { ok: false, error: "無法建立串流" };
        }

        const streamKey = resolvedConvId ?? tempId;
        const decoder = new TextDecoder();
        let accumulated = "";
        let lineBuffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          lineBuffer += decoder.decode(value, { stream: true });
          const parts = lineBuffer.split("\n");
          lineBuffer = parts.pop() ?? "";

          for (const line of parts) {
            if (!line.startsWith("data: ")) continue;
            const jsonStr = line.slice(6).trim();
            if (!jsonStr) continue;

            try {
              const chunk: AgentStreamChunk = JSON.parse(jsonStr);

              switch (chunk.type) {
                case "text_delta":
                  accumulated += chunk.content || "";
                  updateStream(streamKey, () => ({ streamText: accumulated }));
                  break;

                case "tool_start":
                  updateStream(streamKey, (prev) => ({
                    activeTools: [...prev.activeTools, chunk.toolName || ""],
                  }));
                  break;

                case "tool_end":
                  updateStream(streamKey, (prev) => ({
                    activeTools: prev.activeTools.filter((t) => t !== chunk.toolName),
                    toolResults: chunk.toolResult
                      ? [
                          ...prev.toolResults,
                          {
                            toolName: chunk.toolName || "",
                            success: chunk.toolResult?.success ?? false,
                            data: chunk.toolResult?.data,
                          },
                        ]
                      : prev.toolResults,
                  }));
                  break;

                case "done":
                  if (accumulated) {
                    callbacks.onMessageAppend?.({
                      id: `assistant-${Date.now()}`,
                      role: "assistant",
                      content: accumulated,
                      createdAt: new Date().toISOString(),
                    });
                  }
                  updateStream(streamKey, () => ({
                    streaming: false,
                    streamText: "",
                    abortController: null,
                  }));
                  callbacks.onDone?.();
                  break;

                case "error":
                  callbacks.onMessageAppend?.({
                    id: `err-${Date.now()}`,
                    role: "assistant",
                    content: chunk.content || "發生未知錯誤",
                    createdAt: new Date().toISOString(),
                  });
                  updateStream(streamKey, () => ({
                    streaming: false,
                    streamText: "",
                    abortController: null,
                  }));
                  break;
              }
            } catch {
              // 忽略解析錯誤
            }
          }
        }

        return { ok: true, conversationId: resolvedConvId ?? undefined };
      } catch (e) {
        if ((e as Error).name === "AbortError") {
          return { ok: false, error: "串流已中斷" };
        }
        const finalKey = resolvedConvId ?? tempId;
        callbacks.onMessageAppend?.({
          id: `err-${Date.now()}`,
          role: "assistant",
          content: `連線錯誤：${(e as Error).message}`,
          createdAt: new Date().toISOString(),
        });
        updateStream(finalKey, () => ({ streaming: false, streamText: "", abortController: null }));
        return { ok: false, error: (e as Error).message };
      }
    },
    [getActiveStreamCount, updateStream, rerender]
  );

  return {
    getStreamState,
    isStreaming,
    get activeStreamCount() {
      return getActiveStreamCount();
    },
    get streamingConvIds() {
      return getStreamingConvIds();
    },
    startStream,
    abortStream,
    abortAll,
  };
}

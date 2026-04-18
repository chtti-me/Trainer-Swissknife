"use client";

/**
 * 【全域鍵盤快捷鍵】
 * Ctrl+K / Cmd+K：聚焦搜尋欄（如果存在）
 * Escape：關閉彈窗
 */
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function useKeyboardShortcuts() {
  const router = useRouter();

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const isInput = ["INPUT", "TEXTAREA", "SELECT"].includes(
        (e.target as HTMLElement)?.tagName || ""
      );

      if ((e.ctrlKey || e.metaKey) && e.key === "1" && !isInput) {
        e.preventDefault();
        router.push("/dashboard");
      }

      if ((e.ctrlKey || e.metaKey) && e.key === "2" && !isInput) {
        e.preventDefault();
        router.push("/agent");
      }
    }

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [router]);
}

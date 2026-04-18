"use client";

/**
 * 【主功能區版面】登入後的大部分頁面都用這個外框：左側選單、上方 TIS 選單、中間是各頁內容。
 * 未登入會被導回 /login。
 */

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { TisMenuBar } from "@/components/layout/tis-menu-bar";
import { OfflineBanner } from "@/components/offline-banner";
import { ToastProvider } from "@/components/ui/toaster";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import dynamic from "next/dynamic";

const AlarmNotifier = dynamic(() => import("@/components/alarm-notifier"), { ssr: false });
const CommandPalette = dynamic(() => import("@/components/command-palette").then(m => ({ default: m.CommandPalette })), { ssr: false });

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  const router = useRouter();
  useKeyboardShortcuts();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  if (status === "loading") {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-muted-foreground">載入中...</p>
        </div>
      </div>
    );
  }

  if (status === "unauthenticated") return null;

  return (
    <ToastProvider>
      <OfflineBanner />
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <div className="flex-1 flex flex-col min-h-0">
          <TisMenuBar />
          <main className="flex-1 overflow-auto bg-background p-6 animate-page-enter">{children}</main>
        </div>
        <AlarmNotifier />
        <CommandPalette />
      </div>
    </ToastProvider>
  );
}

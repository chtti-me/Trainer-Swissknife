"use client";

/**
 * 【全站 React 上下文包裝】
 * 把 NextAuth 的 SessionProvider 包在外面，讓底下頁面能用 useSession() 知道「現在誰登入」。
 * 比喻：總機把「這通電話是誰打的」資訊分發給各分機，不用每支電話自己重查。
 */

import type { Session } from "next-auth";
import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "@/components/theme-provider";

type ProvidersProps = {
  children: React.ReactNode;
  /** 由 RootLayout（伺服端）讀取，避免客戶端一直等 /api/auth/session 而卡在 loading（載入中） */
  session: Session | null;
};

export function Providers({ children, session }: ProvidersProps) {
  return (
    <SessionProvider session={session} refetchOnWindowFocus={false}>
      <ThemeProvider>{children}</ThemeProvider>
    </SessionProvider>
  );
}

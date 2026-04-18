/**
 * 【全站根版面 Root Layout】
 * 像「整棟大樓的外牆與大門」：每個頁面都會被包在這裡，負責載入全站 CSS、讀取登入狀態（session），
 * 並用 Providers 把登入資訊交給前端 React 使用。
 * 產品版本：v4.0（雲端 PostgreSQL + pgvector 語意搜尋版）
 */
import type { Metadata } from "next";
import { getServerSession } from "next-auth/next";
import Script from "next/script";
import "./globals.css";
import { Providers } from "@/components/providers";
import { authOptions } from "@/lib/auth";

export const metadata: Metadata = {
  title: "培訓師瑞士刀 v4.0",
  description: "中華電信學院培訓師內部工作平台（雲端 PostgreSQL + pgvector 語意搜尋版）",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);

  return (
    <html lang="zh-TW" data-theme="default" suppressHydrationWarning>
      <body className="antialiased" suppressHydrationWarning>
        <Script
          id="theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=JSON.parse(localStorage.getItem("trainer-swissknife-theme")||"{}");if(t.color)document.documentElement.setAttribute("data-theme",t.color);if(t.mode==="dark")document.documentElement.classList.add("dark");}catch(e){}})();`,
          }}
        />
        <Providers session={session}>{children}</Providers>
      </body>
    </html>
  );
}

/**
 * 【網站首頁 /】
 * 只做分流：沒登入 → 去登入頁；已登入 → 直接去儀表板。
 * 像大樓一樓的接待櫃台：幫訪客決定要上哪一層。
 */
import { getServerSession } from "next-auth/next";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";

/** 依登入狀態導向，避免未登入時先進 /dashboard 再被客戶端轉址（可能造成白畫面或體感「無法開啟」）。 */
export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/login");
  }
  redirect("/dashboard");
}

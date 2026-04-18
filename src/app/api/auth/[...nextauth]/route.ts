/**
 * 【NextAuth API 路由】
 * 處理登入、登出、session 等 /api/auth/* 請求。
 */
import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };

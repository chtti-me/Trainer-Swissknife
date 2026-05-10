"use client";

/**
 * 【系統設定總覽】
 * 顯示版本與環境提示；連到「使用者管理」等子頁。
 */
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Info, UserCog, Sparkles, Shield, ScrollText, Plug } from "lucide-react";
import { PageHeading } from "@/components/layout/page-heading";
import { AiServiceSettings } from "@/components/settings/ai-service-settings";
import { SimilaritySettings } from "@/components/settings/similarity-settings";
import { TisBookmarkletSection } from "@/components/settings/tis-bookmarklet-section";

export default function SettingsPage() {
  const { data: session } = useSession();
  const isAdmin = (session?.user as { role?: string } | undefined)?.role === "admin";

  return (
    <div className="space-y-6 max-w-3xl">
      <PageHeading title="系統設定" description="管理系統參數與設定" />

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            AI 技能脈絡
          </CardTitle>
          <CardDescription>
            維護全院共用的 AI 參考文字與個人偏好（多版本）；會自動併入課程規劃、EDM 等功能的 Prompt。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="default">
            <Link href="/settings/ai-skills">前往 AI 技能脈絡</Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="w-4 h-4 text-violet-600" />
            Agent 規則管理
          </CardTitle>
          <CardDescription>
            定義 AI 助理「小瑞」的行為約束。全院規則由管理員維護，個人規則可自行設定。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="default">
            <Link href="/settings/agent-rules">前往 Agent 規則管理</Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ScrollText className="w-4 h-4 text-orange-600" />
            審計日誌
          </CardTitle>
          <CardDescription>
            檢視 AI 助理的工具呼叫紀錄、操作歷史與系統事件。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="default">
            <Link href="/settings/audit-log">前往審計日誌</Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Plug className="w-4 h-4 text-cyan-600" />
            自定義工具
          </CardTitle>
          <CardDescription>
            新增外部 HTTP 端點作為 AI 助理可呼叫的工具。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="default">
            <Link href="/settings/custom-tools">前往自定義工具</Link>
          </Button>
        </CardContent>
      </Card>

      {isAdmin && (
        <Card className="border-amber-200 bg-amber-50/40">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <UserCog className="w-4 h-4 text-amber-800" />
              使用者管理
            </CardTitle>
            <CardDescription>新增、編輯或刪除系統帳號與培訓師單位資料。</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="default">
              <Link href="/settings/users">前往使用者管理</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Info className="w-4 h-4 text-primary" />
            系統資訊
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-muted-foreground">系統名稱</p>
              <p className="font-medium">培訓師瑞士刀</p>
            </div>
            <div>
              <p className="text-muted-foreground">版本</p>
              <p className="font-medium">v4.0</p>
            </div>
            <div>
              <p className="text-muted-foreground">前端框架</p>
              <p className="font-medium">Next.js + TypeScript + Tailwind CSS</p>
            </div>
            <div>
              <p className="text-muted-foreground">資料庫</p>
              <p className="font-medium">Supabase PostgreSQL + pgvector</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {isAdmin && <AiServiceSettings />}

      <SimilaritySettings isAdmin={isAdmin} />

      {isAdmin && <TisBookmarkletSection />}
    </div>
  );
}

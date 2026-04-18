"use client";

/**
 * 【系統設定總覽】
 * 顯示版本與環境提示；連到「使用者管理」等子頁。
 */
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Database, Brain, GitCompareArrows, Info, UserCog, Sparkles, Shield, ScrollText, Plug } from "lucide-react";
import { PageHeading } from "@/components/layout/page-heading";

export default function SettingsPage() {
  const { data: session } = useSession();
  const isAdmin = (session?.user as { role?: string } | undefined)?.role === "admin";
  const runtimeProvider = (process.env.NEXT_PUBLIC_AI_PROVIDER || "openai").toLowerCase();
  const runtimeBaseUrl =
    process.env.NEXT_PUBLIC_AI_BASE_URL || (runtimeProvider === "gemini" ? "https://generativelanguage.googleapis.com/v1beta/openai" : "https://api.openai.com/v1");
  const runtimeModel = process.env.NEXT_PUBLIC_AI_MODEL || (runtimeProvider === "gemini" ? "gemini-2.5-flash" : "gpt-4o-mini");

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

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Brain className="w-4 h-4 text-primary" />
            AI 服務設定
          </CardTitle>
          <CardDescription>設定 AI 服務連線參數（需重啟生效）</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>供應商（provider，模型供應商）</Label>
            <Input value={runtimeProvider} disabled />
          </div>
          <div className="space-y-2">
            <Label>API Base URL</Label>
            <Input value={runtimeBaseUrl} disabled />
          </div>
          <div className="space-y-2">
            <Label>模型名稱</Label>
            <Input value={runtimeModel} disabled />
          </div>
          <p className="text-xs text-muted-foreground">
            AI 設定透過環境變數（.env）配置；可切換 `AI_PROVIDER=openai` 或 `AI_PROVIDER=gemini`（Gemini 走 OpenAI-compatible 端點）。
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <GitCompareArrows className="w-4 h-4 text-primary" />
            相似度檢測設定
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-muted-foreground">預設門檻值</p>
              <p className="font-medium">0.75（75%）</p>
            </div>
            <div>
              <p className="text-muted-foreground">計算公式</p>
              <p className="font-medium">(向量 60% + 文字 40%) × 60% + 規則 × 40%</p>
            </div>
            <div>
              <p className="text-muted-foreground">文字引擎</p>
              <Badge variant="outline">Jaccard + Bigram</Badge>
            </div>
            <div>
              <p className="text-muted-foreground">向量引擎</p>
              <Badge variant="outline">Embedding + pgvector（v4.0）</Badge>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            v4.0 採用「雙引擎」：向量嵌入（AI 判讀語意）+ 文字字詞（Jaccard/bigram 抓字面近似），在資料庫端以 pgvector HNSW 索引加速語意搜尋，再疊加開班條件（院區、類別、難度等）規則分數，全面提升相似度判斷準確度。
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Database className="w-4 h-4 text-primary" />
            資料來源設定
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="space-y-2">
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div>
                <p className="font-medium">手動匯入 Excel / CSV</p>
                <p className="text-xs text-muted-foreground">透過檔案上傳匯入班次資料</p>
              </div>
              <Badge className="bg-green-100 text-green-800">已啟用</Badge>
            </div>
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div>
                <p className="font-medium">TIS 只讀同步器</p>
                <p className="text-xs text-muted-foreground">自動同步 TIS 系統資料</p>
              </div>
              <Badge variant="outline">v2 規劃中</Badge>
            </div>
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div>
                <p className="font-medium">TIS 頁面抓取器</p>
                <p className="text-xs text-muted-foreground">登入 TIS 後抓取頁面資料</p>
              </div>
              <Badge variant="outline">v2 規劃中</Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

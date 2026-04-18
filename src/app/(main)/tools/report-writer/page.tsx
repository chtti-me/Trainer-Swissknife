"use client";

/**
 * 【會報撰寫工具】
 * 連到外部或內嵌編輯體驗的入口說明頁。
 */
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ExternalLink, Info } from "lucide-react";
import { PageHeading } from "@/components/layout/page-heading";

export default function ReportWriterPage() {
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <PageHeading
        title="業務會報撰寫工具"
        description="專為中華電信學院業務會報設計，支援畫布編輯、AI 輔助生成、多人報告合併等功能。"
        titleClassName="text-3xl font-bold mb-2"
        descriptionClassName="text-muted-foreground mt-2"
      />

      <Card className="border-blue-200 bg-blue-50/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="w-5 h-5 text-blue-600" />
            功能特色
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <h3 className="font-semibold mb-1">📝 畫布編輯</h3>
            <p className="text-sm text-muted-foreground">
              拖曳式文字方塊、圖片、表格，支援快速模板（案由、培訓對象、辦理情形、績效與貢獻、後續推廣）
            </p>
          </div>
          <div>
            <h3 className="font-semibold mb-1">🤖 AI 輔助</h3>
            <p className="text-sm text-muted-foreground">
              可貼上參考資料、上傳截圖或網頁，使用 AI 自動生成會報內容（支援 Google Gemini、OpenAI、OpenRouter）
            </p>
          </div>
          <div>
            <h3 className="font-semibold mb-1">🔗 合併管理</h3>
            <p className="text-sm text-muted-foreground">
              將多位同仁的 JSON 報告合併為一份，可調整工作項目順序，匯出 PDF、PPTX 或可編輯 PPTX
            </p>
          </div>
          <div>
            <h3 className="font-semibold mb-1">📽️ 簡報預覽</h3>
            <p className="text-sm text-muted-foreground">
              即時預覽簡報效果，支援全螢幕播放、主題切換、鍵盤快捷鍵導覽
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>開啟業務會報撰寫工具</span>
            <Button variant="ghost" size="sm" asChild>
              <a href="/tools/report-writer/index.html" target="_blank" rel="noopener noreferrer">
                <ExternalLink className="w-4 h-4 mr-2" />
                在新視窗開啟
              </a>
            </Button>
          </CardTitle>
          <CardDescription>
            建議在新視窗開啟以獲得最佳使用體驗，所有資料皆儲存在瀏覽器本機，不會上傳至伺服器。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="w-full h-[calc(100vh-320px)] min-h-[700px] border rounded-lg overflow-hidden">
            <iframe
              src="/tools/report-writer/index.html"
              className="w-full h-full"
              title="業務會報撰寫工具"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

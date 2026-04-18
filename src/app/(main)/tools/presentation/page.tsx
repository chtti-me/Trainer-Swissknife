"use client";

/**
 * 【互動簡報製作器】
 * 拖曳元件建簡報（主要為前端原型／展示）。
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ExternalLink } from "lucide-react";
import { PageHeading } from "@/components/layout/page-heading";

export default function PresentationPage() {
  const [activeTab, setActiveTab] = useState("intro");

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <PageHeading
        title="互動教學簡報製作器"
        description="專為培訓師設計的工具，可用拖曳方式建立互動式教學簡報，支援測驗、影片、程式碼展示等多種元件。"
        titleClassName="text-3xl font-bold mb-2"
        descriptionClassName="text-muted-foreground mt-2"
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="intro">簡介</TabsTrigger>
          <TabsTrigger value="editor">編輯器</TabsTrigger>
          <TabsTrigger value="player">播放器</TabsTrigger>
        </TabsList>

        <TabsContent value="intro" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>功能介紹</CardTitle>
              <CardDescription>這個工具可以幫助您快速製作互動式教學簡報</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h3 className="font-semibold mb-2">支援元件類型：</h3>
                <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                  <li>文字、圖片、影片、音訊</li>
                  <li>連結、內嵌網頁</li>
                  <li>單選題、複選題、填空題、配對題</li>
                  <li>拖曳排序、進度條、計時器</li>
                  <li>表格、程式碼區塊、圖表</li>
                  <li>時間軸、可摺疊區塊</li>
                </ul>
              </div>
              <div>
                <h3 className="font-semibold mb-2">使用流程：</h3>
                <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
                  <li>進入編輯器，從左側元件列表拖曳元件到畫布</li>
                  <li>在右側屬性面板調整元件設定</li>
                  <li>匯出為播放簡報（單一 HTML 檔案）</li>
                  <li>使用播放器預覽或分享給學員</li>
                </ol>
              </div>
              <div className="flex gap-3 pt-4">
                <Button onClick={() => setActiveTab("editor")}>開始使用編輯器</Button>
                <Button variant="outline" onClick={() => setActiveTab("player")}>
                  預覽播放器
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="editor">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>簡報編輯器</span>
                <Button variant="ghost" size="sm" asChild>
                  <a href="/tools/presentation/editor.html" target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="w-4 h-4 mr-2" />
                    在新視窗開啟
                  </a>
                </Button>
              </CardTitle>
              <CardDescription>拖曳元件到畫布，建立互動式教學簡報</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="w-full h-[calc(100vh-280px)] min-h-[600px] border rounded-lg overflow-hidden">
                <iframe
                  src="/tools/presentation/editor.html"
                  className="w-full h-full"
                  title="互動簡報編輯器"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="player">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>簡報播放器</span>
                <Button variant="ghost" size="sm" asChild>
                  <a href="/tools/presentation/player.html" target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="w-4 h-4 mr-2" />
                    在新視窗開啟
                  </a>
                </Button>
              </CardTitle>
              <CardDescription>預覽播放效果</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="w-full h-[calc(100vh-280px)] min-h-[600px] border rounded-lg overflow-hidden">
                <iframe
                  src="/tools/presentation/player.html"
                  className="w-full h-full"
                  title="互動簡報播放器"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

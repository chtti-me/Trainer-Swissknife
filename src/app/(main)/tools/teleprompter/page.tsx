"use client";

/**
 * 【讀稿提詞機】
 * 全螢幕捲動講稿、字體與速度調整（純前端工具）。
 */
import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Play, Pause, RotateCcw, X, Maximize2 } from "lucide-react";
import { PageHeading } from "@/components/layout/page-heading";

const themes = {
  dark: { bg: "#070b1c", text: "#f5f8ff", name: "深色夜幕" },
  light: { bg: "#f6f8ff", text: "#0f1424", name: "明亮白板" },
  warm: { bg: "#2b160c", text: "#ffe9d4", name: "暖色舞台" },
  mint: { bg: "#0c2823", text: "#defff6", name: "薄荷霓光" },
};

export default function TeleprompterPage() {
  const [script, setScript] = useState("");
  const [theme, setTheme] = useState<keyof typeof themes>("dark");
  const [fontSize, setFontSize] = useState(56);
  const [speed, setSpeed] = useState(14);
  const [lineHeight, setLineHeight] = useState(16);
  const [isRunning, setIsRunning] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [estimate, setEstimate] = useState({ m: 0, s: 0 });

  const viewportRef = useRef<HTMLDivElement>(null);
  const rafIdRef = useRef<number | null>(null);
  const lastTsRef = useRef<number>(0);

  const pixelsPerSecond = speed * 4.5;

  const updateEstimate = () => {
    if (!viewportRef.current) return;
    const vp = viewportRef.current;
    const maxScroll = Math.max(0, vp.scrollHeight - vp.clientHeight);
    const remain = Math.max(0, maxScroll - vp.scrollTop);
    const sec = Math.ceil(remain / pixelsPerSecond);
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    setEstimate({ m, s });
  };

  const tick = (ts: number) => {
    if (!viewportRef.current || !isRunning) return;
    if (!lastTsRef.current) lastTsRef.current = ts;
    const dt = (ts - lastTsRef.current) / 1000;
    lastTsRef.current = ts;

    viewportRef.current.scrollTop += pixelsPerSecond * dt;
    updateEstimate();

    const maxScroll = viewportRef.current.scrollHeight - viewportRef.current.clientHeight;
    if (viewportRef.current.scrollTop >= maxScroll) {
      setIsRunning(false);
      return;
    }
    rafIdRef.current = requestAnimationFrame(tick);
  };

  useEffect(() => {
    if (isRunning) {
      lastTsRef.current = 0;
      rafIdRef.current = requestAnimationFrame(tick);
    } else if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    return () => {
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
    };
  }, [isRunning, pixelsPerSecond]);

  useEffect(() => {
    updateEstimate();
  }, [script, fontSize, lineHeight, speed]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isFullscreen) return;
      if (e.code === "Space") {
        e.preventDefault();
        setIsRunning((prev) => !prev);
      }
      if (e.key === "Escape") {
        e.preventDefault();
        exitFullscreen();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isFullscreen]);

  const enterFullscreen = () => {
    setIsFullscreen(true);
    if (viewportRef.current) {
      viewportRef.current.scrollTop = 0;
      updateEstimate();
    }
  };

  const exitFullscreen = () => {
    setIsRunning(false);
    setIsFullscreen(false);
  };

  const resetScroll = () => {
    if (viewportRef.current) {
      viewportRef.current.scrollTop = 0;
      updateEstimate();
    }
  };

  if (isFullscreen) {
    const selectedTheme = themes[theme];
    return (
      <div className="fixed inset-0 z-50 flex flex-col" style={{ background: selectedTheme.bg }}>
        <div className="flex items-center justify-between p-4 border-b border-white/10 bg-black/20 backdrop-blur-sm">
          <div className="flex gap-2 items-center flex-wrap">
            <Badge variant="outline" className="text-white border-white/20">
              狀態：{isRunning ? "播放中" : "暫停"}
            </Badge>
            <Badge variant="outline" className="text-white border-white/20">
              預估：{estimate.m}m {String(estimate.s).padStart(2, "0")}s
            </Badge>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={isRunning ? "destructive" : "default"}
              onClick={() => setIsRunning(!isRunning)}
            >
              {isRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </Button>
            <Button size="sm" variant="secondary" onClick={resetScroll}>
              <RotateCcw className="w-4 h-4" />
            </Button>
            <Button size="sm" variant="destructive" onClick={exitFullscreen}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
        <div className="relative flex-1 overflow-hidden">
          <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-white/70 to-transparent z-10 pointer-events-none" />
          <div
            ref={viewportRef}
            className="h-full overflow-y-auto px-[9%]"
            style={{ paddingTop: "44vh", paddingBottom: "44vh" }}
            onScroll={updateEstimate}
          >
            <div
              className="mx-auto whitespace-pre-wrap break-words"
              style={{
                color: selectedTheme.text,
                fontSize: `${fontSize}px`,
                lineHeight: lineHeight / 10,
                maxWidth: "min(96vw, 1320px)",
              }}
            >
              {script || "（尚未貼上稿件）"}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <PageHeading
        title="讀稿提詞機"
        description="用於演講或錄影時讀稿，支援自動捲動、配色主題、快捷鍵操作。"
        titleClassName="text-3xl font-bold mb-2"
        descriptionClassName="text-muted-foreground mt-2"
      />

      <Card>
        <CardHeader>
          <CardTitle>步驟 1：貼上稿件</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={script}
            onChange={(e) => setScript(e.target.value)}
            placeholder="請貼上你的講稿內容..."
            rows={10}
            className="font-mono"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>步驟 2：設定提詞樣式</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label>配色主題</Label>
              <Select value={theme} onValueChange={(v) => setTheme(v as keyof typeof themes)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(themes).map(([key, val]) => (
                    <SelectItem key={key} value={key}>
                      {val.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>字體大小：{fontSize}</Label>
              <Slider
                value={[fontSize]}
                onValueChange={(v) => setFontSize(v[0])}
                min={30}
                max={110}
                step={1}
              />
            </div>

            <div className="space-y-2">
              <Label>捲動速度：{speed}</Label>
              <Slider value={[speed]} onValueChange={(v) => setSpeed(v[0])} min={1} max={80} step={1} />
            </div>

            <div className="space-y-2">
              <Label>行距：{(lineHeight / 10).toFixed(1)}</Label>
              <Slider
                value={[lineHeight]}
                onValueChange={(v) => setLineHeight(v[0])}
                min={12}
                max={24}
                step={1}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>步驟 3：進入提詞機畫面</CardTitle>
          <CardDescription>
            快捷鍵：<strong>Space</strong> 開始/暫停，<strong>Esc</strong> 退出提詞畫面
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button size="lg" className="w-full" onClick={enterFullscreen}>
            <Maximize2 className="w-5 h-5 mr-2" />
            進入全螢幕提詞
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

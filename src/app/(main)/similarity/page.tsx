"use client";

/**
 * 【開班相似度檢測】
 * 輸入待開課程描述，與全院班次比對；呼叫 /api/similarity/check。
 */
import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import {
  Loader2,
  Search,
  GitCompareArrows,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  BarChart3,
  Target,
} from "lucide-react";
import { formatDate, getStatusColor, getCampusColor } from "@/lib/utils";
import { PageHeading } from "@/components/layout/page-heading";
import { useToast } from "@/components/ui/toaster";

interface SimilarityResult {
  classId: string;
  className: string;
  classCode: string | null;
  startDate: string | null;
  campus: string | null;
  category: string | null;
  trainerName: string | null;
  mentorName: string | null;
  instructorNames: string | null;
  totalScore: number;
  lexicalScore: number;
  ruleScore: number;
  reason: string;
  suggestedAction: string;
}

export default function SimilarityPage() {
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SimilarityResult[]>([]);
  const [totalCompared, setTotalCompared] = useState(0);
  const [hasSearched, setHasSearched] = useState(false);

  // 查詢欄位
  const [className, setClassName] = useState(searchParams.get("className") || "");
  const [summary, setSummary] = useState(searchParams.get("summary") || "");
  const [difficultyLevel, setDifficultyLevel] = useState("");
  const [audience, setAudience] = useState("");
  const [campus, setCampus] = useState("");
  const [category, setCategory] = useState("");
  const [deliveryMode, setDeliveryMode] = useState(searchParams.get("deliveryMode") || "");

  // 篩選條件
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 6);
    return d.toISOString().split("T")[0];
  });
  const [endDate, setEndDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 6);
    return d.toISOString().split("T")[0];
  });
  const [filterCampuses, setFilterCampuses] = useState<string[]>([]);
  const [filterCategories, setFilterCategories] = useState<string[]>([]);
  const [filterDeliveryModes, setFilterDeliveryModes] = useState<string[]>([]);
  const [includeOthers, setIncludeOthers] = useState(true);
  const [threshold, setThreshold] = useState(0.3);

  const toggleFilter = (arr: string[], setArr: (v: string[]) => void, val: string) => {
    setArr(arr.includes(val) ? arr.filter((v) => v !== val) : [...arr, val]);
  };

  const handleSearch = async () => {
    if (!className.trim()) {
      toast("請輸入班名", "error");
      return;
    }
    if (!startDate || !endDate) {
      toast("請指定日期區間", "error");
      return;
    }

    setLoading(true);
    setHasSearched(true);
    try {
      const res = await fetch("/api/similarity/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: { className, summary, difficultyLevel, audience, campus, category, deliveryMode },
          filters: {
            startDate,
            endDate,
            campuses: filterCampuses.length > 0 ? filterCampuses : undefined,
            categories: filterCategories.length > 0 ? filterCategories : undefined,
            deliveryModes: filterDeliveryModes.length > 0 ? filterDeliveryModes : undefined,
            includeOthers,
            threshold,
          },
        }),
      });
      const data = await res.json();
      setResults(data.results || []);
      setTotalCompared(data.totalCompared || 0);
    } catch {
      toast("查詢失敗", "error");
    }
    setLoading(false);
  };

  const getActionColor = (action: string) => {
    switch (action) {
      case "風險高": return "bg-red-100 text-red-800 border-red-300";
      case "建議合併": return "bg-orange-100 text-orange-800 border-orange-300";
      case "建議改版": return "bg-yellow-100 text-yellow-800 border-yellow-300";
      default: return "bg-blue-100 text-blue-800 border-blue-300";
    }
  };

  return (
    <div className="space-y-6">
      <PageHeading
        title="開班相似度檢測"
        description="比對規劃中的班次與全院既有開班資料，找出相似班次"
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* 左側：輸入與篩選 */}
        <div className="lg:col-span-4 space-y-4">
          {/* 待比較班次 */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Target className="w-4 h-4 text-primary" />
                待比較班次
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">班名 *</Label>
                <Input placeholder="例：資安事件分析實務班" value={className} onChange={(e) => setClassName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">課程內容摘要</Label>
                <Textarea placeholder="簡述課程內容..." className="min-h-[80px]" value={summary} onChange={(e) => setSummary(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">難度</Label>
                  <Select value={difficultyLevel} onValueChange={setDifficultyLevel}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="選擇" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="基礎">基礎</SelectItem>
                      <SelectItem value="進階">進階</SelectItem>
                      <SelectItem value="高級">高級</SelectItem>
                      <SelectItem value="專精">專精</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">授課方式</Label>
                  <Select value={deliveryMode} onValueChange={setDeliveryMode}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="選擇" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="課堂">課堂</SelectItem>
                      <SelectItem value="直播">直播</SelectItem>
                      <SelectItem value="遠距">遠距</SelectItem>
                      <SelectItem value="混成">混成</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">培訓對象</Label>
                <Input placeholder="例：SOC 新進人員" value={audience} onChange={(e) => setAudience(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">院所別</Label>
                  <Select value={campus} onValueChange={setCampus}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="選擇" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="院本部">院本部</SelectItem>
                      <SelectItem value="台中所">台中所</SelectItem>
                      <SelectItem value="高雄所">高雄所</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">課程類別</Label>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="選擇" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="資訊安全">資訊安全</SelectItem>
                      <SelectItem value="數位轉型">數位轉型</SelectItem>
                      <SelectItem value="網路技術">網路技術</SelectItem>
                      <SelectItem value="管理技能">管理技能</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 篩選條件 */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Search className="w-4 h-4 text-primary" />
                比對篩選條件
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">起始日期 *</Label>
                  <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-9" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">結束日期 *</Label>
                  <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-9" />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">院所別篩選（可複選）</Label>
                <div className="flex flex-wrap gap-2">
                  {["院本部", "台中所", "高雄所"].map((c) => (
                    <label key={c} className="flex items-center gap-1.5 text-xs cursor-pointer">
                      <Checkbox checked={filterCampuses.includes(c)} onCheckedChange={() => toggleFilter(filterCampuses, setFilterCampuses, c)} />
                      {c}
                    </label>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">課程類別篩選（可複選）</Label>
                <div className="flex flex-wrap gap-2">
                  {["資訊安全", "數位轉型", "網路技術", "管理技能"].map((c) => (
                    <label key={c} className="flex items-center gap-1.5 text-xs cursor-pointer">
                      <Checkbox checked={filterCategories.includes(c)} onCheckedChange={() => toggleFilter(filterCategories, setFilterCategories, c)} />
                      {c}
                    </label>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">開班方式篩選（可複選）</Label>
                <div className="flex flex-wrap gap-2">
                  {["課堂", "直播", "遠距", "混成"].map((m) => (
                    <label key={m} className="flex items-center gap-1.5 text-xs cursor-pointer">
                      <Checkbox checked={filterDeliveryModes.includes(m)} onCheckedChange={() => toggleFilter(filterDeliveryModes, setFilterDeliveryModes, m)} />
                      {m}
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Checkbox checked={includeOthers} onCheckedChange={(c) => setIncludeOthers(!!c)} id="include-others" />
                <Label htmlFor="include-others" className="text-xs cursor-pointer">包含其他培訓師班次</Label>
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between">
                  <Label className="text-xs">相似度門檻</Label>
                  <span className="text-xs text-muted-foreground">{(threshold * 100).toFixed(0)}%</span>
                </div>
                <Slider value={[threshold]} onValueChange={([v]) => setThreshold(v)} min={0.1} max={1} step={0.05} />
              </div>

              <Button className="w-full" onClick={handleSearch} disabled={loading}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <GitCompareArrows className="w-4 h-4" />}
                {loading ? "比對中..." : "執行相似度檢測"}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* 右側：結果 */}
        <div className="lg:col-span-8 space-y-4">
          {!hasSearched ? (
            <Card className="h-96 flex items-center justify-center">
              <div className="text-center space-y-3">
                <GitCompareArrows className="w-12 h-12 text-muted-foreground/30 mx-auto" />
                <p className="text-muted-foreground">請在左側輸入待比較的班次資料，並設定篩選條件後執行檢測</p>
              </div>
            </Card>
          ) : loading ? (
            <Card className="h-96 flex items-center justify-center">
              <div className="text-center space-y-3">
                <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
                <p className="text-muted-foreground">正在比對全院班次資料...</p>
              </div>
            </Card>
          ) : (
            <>
              {/* 統計摘要 */}
              <Card className="bg-secondary">
                <CardContent className="p-4">
                  <div className="flex items-center gap-6 text-sm">
                    <div>
                      <span className="text-muted-foreground">比對班次數：</span>
                      <span className="font-semibold">{totalCompared}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">相似班次數：</span>
                      <span className="font-semibold text-primary">{results.length}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">門檻值：</span>
                      <span className="font-semibold">{(threshold * 100).toFixed(0)}%</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* 結果列表 */}
              {results.length === 0 ? (
                <Card className="py-12">
                  <div className="text-center space-y-2">
                    <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto" />
                    <p className="font-medium">未發現高度相似班次</p>
                    <p className="text-sm text-muted-foreground">在指定條件下，沒有超過門檻值 {(threshold * 100).toFixed(0)}% 的相似班次</p>
                  </div>
                </Card>
              ) : (
                <div className="space-y-3">
                  {results.map((r, i) => (
                    <Card key={r.classId} className="hover:shadow-md transition-shadow">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-lg font-bold text-primary">{(r.totalScore * 100).toFixed(0)}%</span>
                              <Badge variant="outline" className={getActionColor(r.suggestedAction)}>{r.suggestedAction}</Badge>
                            </div>
                            <p className="font-medium">{r.className}</p>
                            <p className="text-sm text-muted-foreground">{r.classCode || ""}</p>
                          </div>
                          <div className="text-right text-xs text-muted-foreground space-y-1">
                            {r.startDate && <p>開班：{r.startDate}</p>}
                            {r.campus && <Badge variant="outline" className={getCampusColor(r.campus)}>{r.campus}</Badge>}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3 text-xs mb-3">
                          <div>
                            <span className="text-muted-foreground">課程類別：</span>
                            <span>{r.category || "-"}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">培訓師（帳號／TIS 導師）：</span>
                            <span>{r.trainerName || r.mentorName || "-"}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">授課講師（班次欄位）：</span>
                            <span>{r.instructorNames || "-"}</span>
                          </div>
                        </div>

                        {/* 分數分解 */}
                        <div className="bg-muted/50 rounded-lg p-3 space-y-2">
                          <p className="text-xs font-medium flex items-center gap-1">
                            <BarChart3 className="w-3 h-3" />相似度分解
                          </p>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <div className="flex justify-between text-xs mb-1">
                                <span className="text-muted-foreground">內容重疊（字詞，60%）</span>
                                <span>{(r.lexicalScore * 100).toFixed(0)}%</span>
                              </div>
                              <Progress value={r.lexicalScore * 100} className="h-1.5" />
                            </div>
                            <div>
                              <div className="flex justify-between text-xs mb-1">
                                <span className="text-muted-foreground">規則欄位（40%）</span>
                                <span>{(r.ruleScore * 100).toFixed(0)}%</span>
                              </div>
                              <Progress value={r.ruleScore * 100} className="h-1.5" />
                            </div>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">{r.reason}</p>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

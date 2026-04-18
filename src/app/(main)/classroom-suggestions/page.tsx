"use client";

/**
 * 【教室預約建議】
 * 查詢條件送 /api/classroom/suggestions；可選 TIS session 或 DEMO 模式。
 */
import { useMemo, useState } from "react";
import { format, parse } from "date-fns";
import { zhTW } from "date-fns/locale/zh-TW";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Loader2, ExternalLink, ShieldCheck, Search, Clock3, AlertCircle, CheckCircle2, CalendarIcon } from "lucide-react";
import { PageHeading } from "@/components/layout/page-heading";
import { cn } from "@/lib/utils";
import {
  buildQuarterHourTimeOptions,
  CLASSROOM_TYPE_OPTIONS,
  DEPARTMENT_OPTIONS,
  FEATURE_OPTIONS,
} from "@/lib/classroom/suggest-form-options";

interface Suggestion {
  roomId: string;
  roomName: string;
  building: string;
  capacity: number;
  score: number;
  reasons: string[];
  reserveUrl: string;
}

const BUILDINGS = [
  { value: "0", label: "綜合大樓" },
  { value: "1", label: "實驗大樓" },
  { value: "11", label: "服務大樓" },
  { value: "12", label: "文康中心" },
  { value: "13", label: "國際學苑" },
  { value: "6", label: "教學大樓" },
  { value: "7", label: "板橋會館" },
];

const TIME_OPTIONS = buildQuarterHourTimeOptions();

function todayYmd(): string {
  return format(new Date(), "yyyy-MM-dd");
}

export default function ClassroomSuggestionsPage() {
  const [sessionId, setSessionId] = useState("");
  const [sessionToken, setSessionToken] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [sessionStatus, setSessionStatus] = useState<"idle" | "valid" | "invalid">("idle");

  const [department, setDepartment] = useState("P");
  const [building, setBuilding] = useState("0");
  const [date, setDate] = useState(todayYmd);
  const [dateOpen, setDateOpen] = useState(false);
  const [timeStart, setTimeStart] = useState("09:00");
  const [timeEnd, setTimeEnd] = useState("12:00");
  const [attendees, setAttendees] = useState(30);
  const [selectedClassroomTypes, setSelectedClassroomTypes] = useState<string[]>([]);
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>(["projector", "mic"]);
  const [demoProfile, setDemoProfile] = useState<"" | "hq" | "taichung" | "kaohsiung">("");

  const [loadingSession, setLoadingSession] = useState(false);
  const [loadingValidate, setLoadingValidate] = useState(false);
  const [loadingSuggest, setLoadingSuggest] = useState(false);

  const [errorMessage, setErrorMessage] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [debugInfo, setDebugInfo] = useState<{ candidateCount: number; excludedCount: number } | null>(null);

  const canSuggest = useMemo(() => (!!sessionToken || !!demoProfile) && !!date, [sessionToken, demoProfile, date]);

  const dateValue = useMemo(() => {
    if (!date) return undefined;
    const d = parse(date, "yyyy-MM-dd", new Date());
    return Number.isNaN(d.getTime()) ? undefined : d;
  }, [date]);

  function toggleType(code: string) {
    setSelectedClassroomTypes((prev) =>
      prev.includes(code) ? prev.filter((x) => x !== code) : [...prev, code].sort()
    );
  }

  function toggleFeature(code: string) {
    setSelectedFeatures((prev) =>
      prev.includes(code) ? prev.filter((x) => x !== code) : [...prev, code].sort()
    );
  }

  async function saveSession() {
    if (!sessionId.trim()) return;
    setLoadingSession(true);
    setErrorMessage("");
    try {
      const res = await fetch("/api/classroom/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || data?.error || "建立失敗");
      setSessionToken(data.sessionToken);
      setExpiresAt(data.expiresAt);
      setSessionStatus("idle");
    } catch (error) {
      const msg = error instanceof Error ? error.message : "建立 session（工作階段）失敗";
      setErrorMessage(msg);
    } finally {
      setLoadingSession(false);
    }
  }

  async function validateSession() {
    if (!sessionToken) return;
    setLoadingValidate(true);
    setErrorMessage("");
    try {
      const res = await fetch("/api/classroom/session/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionToken }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || data?.error || "驗證失敗");
      setSessionStatus(data.tisSessionValid ? "valid" : "invalid");
    } catch (error) {
      const msg = error instanceof Error ? error.message : "驗證 session（工作階段）失敗";
      setErrorMessage(msg);
      setSessionStatus("invalid");
    } finally {
      setLoadingValidate(false);
    }
  }

  async function fetchSuggestions() {
    if (!canSuggest) return;
    setLoadingSuggest(true);
    setErrorMessage("");
    setSuggestions([]);
    setDebugInfo(null);
    try {
      const res = await fetch("/api/classroom/suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionToken,
          department,
          building,
          date,
          timeStart,
          timeEnd,
          attendees,
          classroomTypes: selectedClassroomTypes,
          requiredFeatures: selectedFeatures,
          demoProfile: demoProfile || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || data?.error || "查詢失敗");
      if (!data.ok && data.error === "NO_SUGGESTION_FOUND") {
        setErrorMessage(data.message || "查無符合條件教室");
      }
      const list = data.suggestions || [];
      if (data.ok && list.length === 0 && demoProfile && demoProfile !== "hq") {
        setErrorMessage("此 DEMO 情境尚無教室資料，請改選院本部或改用 TIS session（工作階段）。");
      } else if (data.ok && list.length === 0 && demoProfile === "hq") {
        setErrorMessage("查無符合條件的院本部教室，建議放寬人數、教室性質或設備條件後再試。");
      }
      setSuggestions(list);
      setDebugInfo(data.debug || null);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "查詢建議失敗";
      setErrorMessage(msg);
    } finally {
      setLoadingSuggest(false);
    }
  }

  return (
    <div className="space-y-8 w-full max-w-6xl">
      <PageHeading
        title="教室預約建議"
        description="本功能僅提供可借用教室建議，最終預約請由人員於 TIS（培訓資訊系統）完成。"
        descriptionClassName="text-sm text-muted-foreground mt-1"
      />

      {/* 查詢條件置頂、全寬 */}
      <Card className="border-primary/20 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Search className="w-5 h-5 text-primary" />
            查詢條件
          </CardTitle>
          <CardDescription>先設定日期、時段與教室條件，再產生建議；日期可點開月曆選取，時間以下拉選單選 15 分鐘一格。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 所別、樓別 */}
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <div className="space-y-2 w-full sm:w-[min(100%,13rem)] sm:shrink-0">
              <Label>所別（department）</Label>
              <Select value={department} onValueChange={setDepartment}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DEPARTMENT_OPTIONS.map((d) => (
                    <SelectItem key={d.value} value={d.value}>
                      {d.label}（{d.hint}）
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 w-full sm:w-[min(100%,13rem)] sm:shrink-0">
              <Label>樓別（建物）</Label>
              <Select value={building} onValueChange={setBuilding}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BUILDINGS.map((b) => (
                    <SelectItem key={b.value} value={b.value}>
                      {b.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* 日期、起迄時間、人數同一列；日期顯示最長約「2026年12月31日」再加約 2 字元寬 */}
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <div className="space-y-2 shrink-0 w-full sm:w-auto">
              <Label>日期</Label>
              <Popover open={dateOpen} onOpenChange={setDateOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className={cn(
                      "h-10 justify-start gap-1.5 px-3 text-left text-sm font-normal",
                      "w-full sm:w-auto",
                      !date && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="h-4 w-4 shrink-0 opacity-70" />
                    <span className="whitespace-nowrap tabular-nums">
                      {date
                        ? format(parse(date, "yyyy-MM-dd", new Date()), "yyyy年M月d日", { locale: zhTW })
                        : "選擇日期"}
                    </span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dateValue}
                    onSelect={(d) => {
                      setDate(d ? format(d, "yyyy-MM-dd") : "");
                      setDateOpen(false);
                    }}
                    defaultMonth={dateValue}
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2 shrink-0">
              <Label>起始時間</Label>
              <Select value={timeStart} onValueChange={setTimeStart}>
                <SelectTrigger className="w-[7rem]">
                  <SelectValue placeholder="選擇時間" />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {TIME_OPTIONS.map((t) => (
                    <SelectItem key={`s-${t}`} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 shrink-0">
              <Label>結束時間</Label>
              <Select value={timeEnd} onValueChange={setTimeEnd}>
                <SelectTrigger className="w-[7rem]">
                  <SelectValue placeholder="選擇時間" />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {TIME_OPTIONS.map((t) => (
                    <SelectItem key={`e-${t}`} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 w-full sm:w-[4.75rem] shrink-0">
              <Label>預估人數</Label>
              <Input
                type="number"
                min={1}
                max={999}
                className="w-full text-center tabular-nums px-2"
                value={attendees}
                onChange={(e) => setAttendees(Number(e.target.value || 0))}
              />
            </div>
          </div>

          <div className="space-y-2 pt-1">
            <div>
              <Label className="text-base">教室性質（可複選）</Label>
              <p className="text-xs text-muted-foreground mt-1">
                未勾選時不篩教室性質。複選為「且」關係（邏輯上的 AND（且））：須同時符合所勾選的性質；例如同時勾「電腦教室」與「遠距／直播專用」時，只會列出兩者皆符合的教室（不會出現僅遠距、非電腦教室的 G100）。送出時使用 TIS 對應代碼（code）；若與貴單位 TIS 設定不同，請以實際系統為準。
              </p>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-3">
              {CLASSROOM_TYPE_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className="flex items-center gap-2 cursor-pointer rounded-md border border-transparent px-2 py-1.5 hover:bg-muted/60"
                >
                  <Checkbox
                    checked={selectedClassroomTypes.includes(opt.value)}
                    onCheckedChange={() => toggleType(opt.value)}
                  />
                  <span className="text-sm">
                    {opt.label}
                    <span className="text-muted-foreground text-xs ml-1">({opt.hint})</span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <div>
              <Label className="text-base">設備需求（可複選）</Label>
              <p className="text-xs text-muted-foreground mt-1">關鍵字用於建議評分與條件說明，無需手動輸入英文代碼。</p>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-3">
              {FEATURE_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className="flex items-center gap-2 cursor-pointer rounded-md border border-transparent px-2 py-1.5 hover:bg-muted/60"
                >
                  <Checkbox
                    checked={selectedFeatures.includes(opt.value)}
                    onCheckedChange={() => toggleFeature(opt.value)}
                  />
                  <span className="text-sm">
                    {opt.label}
                    <span className="text-muted-foreground text-xs ml-1">({opt.hint})</span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          <Separator />

          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <Button size="lg" onClick={fetchSuggestions} disabled={loadingSuggest || !canSuggest} className="w-full sm:w-auto min-w-[200px]">
              {loadingSuggest ? <Loader2 className="w-4 h-4 animate-spin" /> : "產生教室建議"}
            </Button>
            {!sessionToken && !demoProfile && (
              <p className="text-sm text-amber-700 dark:text-amber-500">請先於下方設定 TIS session 或選擇 DEMO 測試情境。</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 建議結果 */}
      <Card className="min-h-[320px]">
        <CardHeader>
          <CardTitle>建議結果</CardTitle>
          <CardDescription>依照條件回傳可借用教室建議（不會自動預約）</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {errorMessage && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 flex items-start gap-2 dark:bg-red-950/30 dark:text-red-200 dark:border-red-900">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {debugInfo && (
            <div className="rounded-md border p-3 text-xs text-muted-foreground">
              候選總數：{debugInfo.candidateCount}，排除數：{debugInfo.excludedCount}
            </div>
          )}

          {suggestions.length === 0 && !errorMessage && (
            <div className="text-sm text-muted-foreground py-10 text-center border border-dashed rounded-lg bg-muted/20">
              尚未產生建議。請於上方設定查詢條件後按「產生教室建議」。
            </div>
          )}

          <div className="space-y-3">
            {suggestions.map((s, idx) => (
              <div key={`${s.roomId}-${idx}`} className="rounded-lg border p-4 space-y-2 bg-card">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">
                      {idx + 1}. {s.roomName}（{s.roomId}）
                    </p>
                    <p className="text-xs text-muted-foreground">
                      樓別代碼：{s.building} ・ 預估容量：{s.capacity}
                    </p>
                  </div>
                  <Badge variant={s.score >= 85 ? "default" : "secondary"}>分數 {s.score}</Badge>
                </div>

                <ul className="text-sm space-y-1">
                  {s.reasons.map((r, ridx) => (
                    <li key={`${s.roomId}-r-${ridx}`} className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>

                <Button variant="outline" size="sm" asChild>
                  <a href={s.reserveUrl} target="_blank" rel="noopener noreferrer">
                    前往 TIS 預約頁面
                    <ExternalLink className="w-4 h-4 ml-1" />
                  </a>
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* TIS / DEMO 置底 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pb-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">DEMO 測試情境（免 TIS session）</CardTitle>
            <CardDescription>
              開發階段以院本部（hq）教室設備表 JSON（JSON 檔）為準；院本部 DEMO 可離線試流程。台中／高雄尚無對應匯入資料。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label>測試院所情境</Label>
              <Select value={demoProfile} onValueChange={(v) => setDemoProfile(v as "" | "hq" | "taichung" | "kaohsiung")}>
                <SelectTrigger>
                  <SelectValue placeholder="請選擇 DEMO 情境" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hq">院本部（hq 設備表 JSON）</SelectItem>
                  <SelectItem value="taichung">台中所（尚未匯入設備表）</SelectItem>
                  <SelectItem value="kaohsiung">高雄所（尚未匯入設備表）</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">
              選擇 DEMO 情境後，即可在沒有 session（工作階段）的情況下產生教室建議。
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-primary" />
              TIS session（工作階段）設定
            </CardTitle>
            <CardDescription>平台有效期 8 小時，若 TIS 先失效仍需重新提供。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label>Session ID / Cookie（工作階段識別）</Label>
              <Input
                value={sessionId}
                onChange={(e) => setSessionId(e.target.value)}
                placeholder="例如：JSESSIONID=..."
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={saveSession} disabled={loadingSession || !sessionId.trim()}>
                {loadingSession ? <Loader2 className="w-4 h-4 animate-spin" /> : "儲存 session"}
              </Button>
              <Button variant="outline" onClick={validateSession} disabled={loadingValidate || !sessionToken}>
                {loadingValidate ? <Loader2 className="w-4 h-4 animate-spin" /> : "驗證 TIS 狀態"}
              </Button>
            </div>

            {sessionToken && (
              <div className="rounded-md border p-3 bg-muted/30 space-y-2 text-sm">
                <p className="font-medium">已建立本地 sessionToken（工作階段權杖）</p>
                <p className="text-xs text-muted-foreground break-all">{sessionToken}</p>
                {expiresAt && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock3 className="w-3 h-3 shrink-0" />
                    到期時間：{new Date(expiresAt).toLocaleString("zh-TW")}
                  </p>
                )}
                <div>
                  {sessionStatus === "valid" && <Badge className="bg-green-600">TIS session 有效</Badge>}
                  {sessionStatus === "invalid" && <Badge variant="destructive">TIS session 無效</Badge>}
                  {sessionStatus === "idle" && <Badge variant="secondary">尚未驗證</Badge>}
                </div>
              </div>
            )}

            <Separator />

            <div className="rounded-md bg-muted/40 border p-3 text-xs text-muted-foreground space-y-2 leading-relaxed">
              <p className="font-medium text-foreground">關於 CORS（跨來源資源共用）與資料來源</p>
              <p>
                瀏覽器只會對<strong>同一網站</strong>（例如本機{" "}
                <code className="text-[11px] bg-background px-1 rounded">localhost:3000</code>）的{" "}
                <code className="text-[11px] bg-background px-1 rounded">/api/...</code>{" "}
                發出請求；實際向 TIS 伺服器取數是由 <strong>Next.js 後端（server）</strong>轉送，因此一般<strong>不會</strong>在您的瀏覽器端對{" "}
                <code className="text-[11px] bg-background px-1 rounded">tis.cht.com.tw</code>{" "}
                觸發 CORS 阻擋。若改為從前端網頁<strong>直接</strong>呼叫外站 API，才可能需要對方允許 CORS。
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

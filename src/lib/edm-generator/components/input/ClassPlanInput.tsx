import * as React from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@edm/components/ui/tabs';
import { Button } from '@edm/components/ui/button';
import { Textarea } from '@edm/components/ui/textarea';
import { Input } from '@edm/components/ui/input';
import { Label } from '@edm/components/ui/label';
import { useEdmStore } from '@edm/store/edmStore';
import { useSettingsStore } from '@edm/store/settingsStore';
import { parseClassPlan, type ParseInput } from '@edm/lib/ai/parseClassPlan';
import { hasGeminiKey } from '@edm/lib/ai/client';
import { autoEnrichAfterParse } from '@edm/lib/ai/autoEnrich';
import { toast } from '@edm/components/ui/toast';
import { Loader2, Image as ImgIcon, Globe, FileText, FileType, Upload, Sparkles } from 'lucide-react';
import { isElectron } from '@edm/lib/utils';

export function ClassPlanInput(): React.JSX.Element {
  return (
    <div className="space-y-3">
      <header>
        <h2 className="text-sm font-semibold">輸入開班計畫表</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          支援四種來源，由 Gemini 自動抽取為結構化欄位。
        </p>
      </header>

      <Tabs defaultValue="text" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="text" className="text-xs">
            <FileText className="mr-1 h-3 w-3" />
            筆記
          </TabsTrigger>
          <TabsTrigger value="image" className="text-xs">
            <ImgIcon className="mr-1 h-3 w-3" />
            截圖
          </TabsTrigger>
          <TabsTrigger value="html" className="text-xs">
            <FileType className="mr-1 h-3 w-3" />
            HTML
          </TabsTrigger>
          <TabsTrigger value="url" className="text-xs">
            <Globe className="mr-1 h-3 w-3" />
            網址
          </TabsTrigger>
        </TabsList>

        <TabsContent value="text">
          <TextInput />
        </TabsContent>
        <TabsContent value="image">
          <ImageInput />
        </TabsContent>
        <TabsContent value="html">
          <HtmlInput />
        </TabsContent>
        <TabsContent value="url">
          <UrlInput />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function useParseAction() {
  const setPlan = useEdmStore((s) => s.setPlan);
  const rebuild = useEdmStore((s) => s.rebuildFromTemplate);
  const setCopy = useEdmStore((s) => s.setCopy);
  const setHeroImage = useEdmStore((s) => s.setHeroImage);
  const templateId = useEdmStore((s) => s.templateId);

  /**
   * v0.7.0：autoEnrichOnInput 偏好。預設關閉；使用者於設定中勾選後，
   * 解析完成會接著自動跑 generateCopy + generateImage 並套到對應區塊，
   * 達成「貼一次資料、整份 EDM 一鍵長成」。
   */
  const autoEnrich = useSettingsStore((s) => s.autoEnrichOnInput);
  const preferredCopyModel = useSettingsStore((s) => s.preferredCopyModel);

  const [loading, setLoading] = React.useState(false);
  const [enriching, setEnriching] = React.useState(false);

  const run = async (input: ParseInput) => {
    if (!hasGeminiKey()) {
      toast({ title: '尚未設定 Gemini API Key', description: '請在 .env 填入 GEMINI_API_KEY 並重啟伺服器', variant: 'error' });
      return;
    }
    setLoading(true);
    let parsedPlan: Awaited<ReturnType<typeof parseClassPlan>> | null = null;
    try {
      parsedPlan = await parseClassPlan(input);
      setPlan(parsedPlan);
      rebuild();
      toast({
        title: '解析完成',
        description: `班代號：${parsedPlan.classCode || '—'}　${parsedPlan.title}`,
        variant: 'success',
      });
    } catch (err) {
      toast({ title: '解析失敗', description: (err as Error).message, variant: 'error' });
      setLoading(false);
      return;
    }
    setLoading(false);

    if (!autoEnrich || !parsedPlan) return;

    // ---------- 自動 AI enrich 階段 ----------
    setEnriching(true);
    toast({
      title: 'AI 自動生成中…',
      description: '正在依據解析結果產生文案與主視覺，完成後將自動套用',
      variant: 'info',
    });
    try {
      const result = await autoEnrichAfterParse({
        plan: parsedPlan,
        templateId,
        preferredCopyModel,
      });
      // 文案
      if (result.copy) {
        setCopy(result.copy);
        rebuild();
      }
      // Hero 圖
      if (result.heroImage) {
        setHeroImage(result.heroImage.dataUrl, {
          source: 'ai',
          aiTemplateId: templateId,
          aiPrompt: result.heroImage.aiPrompt,
          aiStyle: result.heroImage.aiStyle,
          aiRatio: result.heroImage.aiRatio,
          aiWithText: result.heroImage.aiWithText,
        });
      }
      const okCount = (result.copy ? 1 : 0) + (result.heroImage ? 1 : 0);
      if (okCount === 0) {
        toast({
          title: 'AI 自動生成未完成',
          description:
            result.errors.map((e) => `${e.stage}：${e.message}`).join('；') || '未知原因',
          variant: 'error',
        });
      } else {
        toast({
          title: `AI 自動生成完成（${okCount}/2）`,
          description:
            result.errors.length > 0
              ? `部分成功；失敗：${result.errors.map((e) => e.stage).join('、')}`
              : '文案 + 主視覺已套用，可直接到中央 Canvas 微調',
          variant: 'success',
        });
      }
    } catch (err) {
      toast({ title: 'AI 自動生成失敗', description: (err as Error).message, variant: 'error' });
    } finally {
      setEnriching(false);
    }
  };

  return { run, loading, enriching, autoEnrich };
}

function TextInput(): React.JSX.Element {
  const [text, setText] = React.useState('');
  const { run, loading, enriching, autoEnrich } = useParseAction();

  const busy = loading || enriching;
  const buttonLabel = enriching
    ? 'AI 生成文案 / 配圖中…'
    : loading
      ? '解析中…'
      : autoEnrich
        ? 'AI 解析筆記 + 自動文案 + 配圖'
        : 'AI 解析筆記';

  return (
    <div className="space-y-3">
      <Textarea
        rows={10}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={`貼上整理好的純文字筆記，例如：\n\n班代號 CR25AP003\n主題 進階 Vibe Coding 初體驗\n上課日期 115/05/06、05/13\n上課時間 09:30-11:30\n導師 黃建豪\n課程：\n1. 認識 Google AI Studio (2hr) - 徐國堂\n2. 把你的作品放上網 (2hr) - 徐國堂\n...`}
      />
      <Button className="w-full" onClick={() => run({ kind: 'text', text })} disabled={!text.trim() || busy}>
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : autoEnrich ? (
          <Sparkles className="h-4 w-4" />
        ) : (
          <Upload className="h-4 w-4" />
        )}
        {buttonLabel}
      </Button>
    </div>
  );
}

function ImageInput(): React.JSX.Element {
  const [preview, setPreview] = React.useState<string | null>(null);
  const [file, setFile] = React.useState<{ base64: string; mime: string } | null>(null);
  const { run, loading, enriching, autoEnrich } = useParseAction();
  const busy = loading || enriching;

  const onFile = async (f: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(',')[1];
      setPreview(dataUrl);
      setFile({ base64, mime: f.type });
    };
    reader.readAsDataURL(f);
  };

  return (
    <div className="space-y-3">
      <label className="flex h-32 cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-border bg-secondary/40 hover:bg-secondary">
        {preview ? (
          <img src={preview} alt="preview" className="max-h-full max-w-full rounded" />
        ) : (
          <>
            <ImgIcon className="mb-2 h-6 w-6 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">點擊或拖放開班計畫表截圖</span>
          </>
        )}
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
        />
      </label>
      <Button
        className="w-full"
        onClick={() => file && run({ kind: 'image', base64: file.base64, mimeType: file.mime })}
        disabled={!file || busy}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : autoEnrich ? <Sparkles className="h-4 w-4" /> : <Upload className="h-4 w-4" />}
        {enriching ? 'AI 生成文案 / 配圖中…' : autoEnrich ? 'AI 解析截圖 + 自動文案 + 配圖' : 'AI 解析截圖'}
      </Button>
    </div>
  );
}

function HtmlInput(): React.JSX.Element {
  const [html, setHtml] = React.useState('');
  const { run, loading, enriching, autoEnrich } = useParseAction();
  const busy = loading || enriching;

  const pickFile = async () => {
    if (isElectron()) {
      const f = await window.edm.openFile([{ name: 'HTML', extensions: ['html', 'htm'] }]);
      if (f) {
        const text = atob(f.data);
        setHtml(text);
      }
    } else {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.html,.htm,text/html';
      input.onchange = async () => {
        const f = input.files?.[0];
        if (!f) return;
        setHtml(await f.text());
      };
      input.click();
    }
  };

  return (
    <div className="space-y-3">
      <Button variant="outline" size="sm" className="w-full" onClick={pickFile}>
        <Upload className="h-4 w-4" />
        選擇離線 HTML 檔
      </Button>
      <Textarea
        rows={8}
        value={html}
        onChange={(e) => setHtml(e.target.value)}
        placeholder="或在這裡貼上開班計畫表 HTML 原始碼..."
      />
      <Button className="w-full" onClick={() => run({ kind: 'html', html })} disabled={!html.trim() || busy}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : autoEnrich ? <Sparkles className="h-4 w-4" /> : <Upload className="h-4 w-4" />}
        {enriching ? 'AI 生成文案 / 配圖中…' : autoEnrich ? 'AI 解析 HTML + 自動文案 + 配圖' : 'AI 解析 HTML'}
      </Button>
    </div>
  );
}

function UrlInput(): React.JSX.Element {
  const [url, setUrl] = React.useState('');
  const { run, loading, enriching, autoEnrich } = useParseAction();
  const [fetching, setFetching] = React.useState(false);
  const busy = loading || enriching;

  const fetchAndParse = async () => {
    if (!isElectron()) {
      toast({
        title: '此功能需要桌面版',
        description: '瀏覽器版受 CORS 限制，請改用截圖或 HTML 檔案上傳。',
        variant: 'info',
      });
      return;
    }
    setFetching(true);
    try {
      const r = await window.edm.fetchTisHtml(url);
      if (!r.ok || !r.html) {
        throw new Error(r.error ?? '抓取失敗');
      }
      await run({ kind: 'html', html: r.html });
    } catch (err) {
      toast({ title: '抓取網址失敗', description: (err as Error).message, variant: 'error' });
    } finally {
      setFetching(false);
    }
  };

  return (
    <div className="space-y-3">
      <Label className="text-xs text-muted-foreground">
        貼上 TIS 開班計畫表網址（需在學院內網）
      </Label>
      <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://tis.cht.com.tw/..." />
      <Button className="w-full" onClick={fetchAndParse} disabled={!url.trim() || fetching || busy}>
        {fetching || busy ? <Loader2 className="h-4 w-4 animate-spin" /> : autoEnrich ? <Sparkles className="h-4 w-4" /> : <Globe className="h-4 w-4" />}
        {enriching
          ? 'AI 生成文案 / 配圖中…'
          : autoEnrich
            ? '抓取 + AI 解析 + 自動文案 + 配圖'
            : '抓取並 AI 解析'}
      </Button>
      {!isElectron() && (
        <p className="text-xs text-muted-foreground">桌面版可直接抓取內網網址；瀏覽器版請改用截圖或檔案上傳。</p>
      )}
    </div>
  );
}

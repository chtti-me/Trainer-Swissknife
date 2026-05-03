import * as React from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@edm/components/ui/tabs';
import { Button } from '@edm/components/ui/button';
import { Input } from '@edm/components/ui/input';
import { Label } from '@edm/components/ui/label';
import { Textarea } from '@edm/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@edm/components/ui/select';
import { useEdmStore } from '@edm/store/edmStore';
import { useSettingsStore } from '@edm/store/settingsStore';
import { generateImage, STYLE_LABELS, type ImageStyle, type ImageRatio } from '@edm/lib/ai/generateImage';
import { getTemplateImageProfile, recommendedImageStyleFor, templateStockKeywordsFor } from '@edm/lib/ai/templateImageProfile';
import { searchUnsplash } from '@edm/lib/stock/unsplash';
import { searchPexels } from '@edm/lib/stock/pexels';
import type { StockPhoto } from '@edm/lib/stock/unsplash';
import { generateGeoSvg, svgToDataUrl, PATTERNS, type GeoPattern } from '@edm/lib/geometric/svgPatterns';
import { hasGeminiKey } from '@edm/lib/ai/client';
import { toast } from '@edm/components/ui/toast';
import { Sparkles, Loader2, RefreshCw, Upload, Search } from 'lucide-react';

export function ImagePanel(): React.JSX.Element {
  return (
    <div className="space-y-3">
      <header>
        <h2 className="text-sm font-semibold">主視覺圖片</h2>
        <p className="mt-1 text-xs text-muted-foreground">設定後將套用至 Hero 區塊。</p>
      </header>

      <Tabs defaultValue="ai">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="ai" className="text-xs">AI</TabsTrigger>
          <TabsTrigger value="stock" className="text-xs">圖庫</TabsTrigger>
          <TabsTrigger value="geo" className="text-xs">幾何</TabsTrigger>
          <TabsTrigger value="upload" className="text-xs">上傳</TabsTrigger>
        </TabsList>
        <TabsContent value="ai">
          <AiImageGen />
        </TabsContent>
        <TabsContent value="stock">
          <StockImageGen />
        </TabsContent>
        <TabsContent value="geo">
          <GeoImageGen />
        </TabsContent>
        <TabsContent value="upload">
          <UploadImage />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function AiImageGen(): React.JSX.Element {
  const plan = useEdmStore((s) => s.plan);
  const templateId = useEdmStore((s) => s.templateId);
  const setHeroImage = useEdmStore((s) => s.setHeroImage);
  const heroImage = useEdmStore((s) => s.heroImage);

  const profile = getTemplateImageProfile(templateId);
  const [prompt, setPrompt] = React.useState('');
  // style 預設跟模板走；使用者一旦選過就鎖住，與 CopyPanel 的 toneTouched 邏輯一致
  const [style, setStyleState] = React.useState<ImageStyle>(() => recommendedImageStyleFor(templateId));
  const [styleTouched, setStyleTouched] = React.useState(false);
  const setStyle = (s: ImageStyle) => {
    setStyleState(s);
    setStyleTouched(true);
  };
  React.useEffect(() => {
    if (!styleTouched) setStyleState(recommendedImageStyleFor(templateId));
  }, [templateId, styleTouched]);

  const [ratio, setRatio] = React.useState<ImageRatio>('16:9');
  const [withText, setWithText] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (!prompt && plan.title) {
      setPrompt(`一張代表「${plan.title}」課程主題的視覺，傳達學習與成長`);
    }
  }, [plan.title]);

  const run = async () => {
    if (!hasGeminiKey()) {
      toast({ title: '尚未設定 Gemini API Key', description: '請在 .env 填入 GEMINI_API_KEY 並重啟伺服器', variant: 'error' });
      return;
    }
    setLoading(true);
    try {
      // 把 templateId 傳進去，generateImage 會 append 模板專屬 visual cue
      const img = await generateImage({ prompt, style, ratio, withText, templateId });
      // 記下 AI metadata，讓使用者切模板後 HeroAdaptBanner 能一鍵重生
      setHeroImage(img.dataUrl, {
        source: 'ai',
        aiTemplateId: templateId,
        aiPrompt: prompt,
        aiStyle: style,
        aiRatio: ratio,
        aiWithText: withText,
      });
      toast({ title: 'AI 圖片已套用至 Hero', variant: 'success' });
    } catch (err) {
      toast({ title: '生圖失敗', description: (err as Error).message, variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="rounded-md border border-border/60 bg-muted/30 px-2 py-1.5 text-[11px] text-muted-foreground">
        模板覺察：<span className="text-foreground/90">{profile.label}</span>
        <span className="ml-1 opacity-60">· prompt 會自動附帶該模板的視覺氣質</span>
      </div>
      <Field label="圖片描述（中英文皆可）">
        <Textarea rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label={styleTouched ? '風格' : '風格（已套用模板推薦）'}>
          <Select value={style} onValueChange={(v) => setStyle(v as ImageStyle)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(STYLE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="比例">
          <Select value={ratio} onValueChange={(v) => setRatio(v as ImageRatio)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="16:9">16:9 寬幅</SelectItem>
              <SelectItem value="4:3">4:3</SelectItem>
              <SelectItem value="1:1">1:1 方形</SelectItem>
              <SelectItem value="3:4">3:4 直幅</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <input type="checkbox" checked={withText} onChange={(e) => setWithText(e.target.checked)} />
        圖片內含中文字（使用 Nano Banana 模型）
      </label>
      <Button className="w-full" onClick={run} disabled={loading}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        {heroImage ? '重新產生' : '生成 AI 圖片'}
      </Button>
      {heroImage && <img src={heroImage} className="rounded border border-border" alt="hero preview" />}
    </div>
  );
}

function StockImageGen(): React.JSX.Element {
  const plan = useEdmStore((s) => s.plan);
  const templateId = useEdmStore((s) => s.templateId);
  const setHeroImage = useEdmStore((s) => s.setHeroImage);
  const settings = useSettingsStore();
  const [query, setQuery] = React.useState('');
  const [results, setResults] = React.useState<StockPhoto[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [source, setSource] = React.useState<'unsplash' | 'pexels'>('unsplash');
  /** 是否自動把模板偏好的英文 keyword 補在使用者 query 之後 */
  const [useTemplateKeywords, setUseTemplateKeywords] = React.useState(true);

  React.useEffect(() => {
    if (!query && plan.title) setQuery(plan.title);
  }, [plan.title]);

  const run = async () => {
    setLoading(true);
    try {
      const fn = source === 'unsplash' ? searchUnsplash : searchPexels;
      const extra = useTemplateKeywords ? templateStockKeywordsFor(templateId) : undefined;
      const r = await fn(query, 12, extra);
      setResults(r);
    } catch (err) {
      toast({ title: '圖庫搜尋失敗', description: (err as Error).message, variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const hasKey = source === 'unsplash' ? !!settings.unsplashApiKey : !!settings.pexelsApiKey;

  return (
    <div className="space-y-3">
      <Field label="圖庫">
        <Select value={source} onValueChange={(v) => setSource(v as 'unsplash' | 'pexels')}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="unsplash">Unsplash</SelectItem>
            <SelectItem value="pexels">Pexels</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field label="關鍵字（建議用英文）">
        <div className="flex gap-2">
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="learning, ai, technology" />
          <Button onClick={run} disabled={loading || !query.trim() || !hasKey} size="icon">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          </Button>
        </div>
      </Field>
      <label className="flex items-start gap-2 text-[11px] text-muted-foreground">
        <input
          type="checkbox"
          checked={useTemplateKeywords}
          onChange={(e) => setUseTemplateKeywords(e.target.checked)}
          className="mt-0.5"
        />
        <span>
          自動加入模板覺察關鍵字
          {useTemplateKeywords && (
            <span className="ml-1 italic text-foreground/70">
              （+ {templateStockKeywordsFor(templateId)}）
            </span>
          )}
        </span>
      </label>
      {!hasKey && <p className="text-xs text-muted-foreground">請至設定填入對應 API Key。</p>}
      <div className="grid grid-cols-2 gap-2">
        {results.map((p) => (
          <button
            key={p.id}
            className="group overflow-hidden rounded border border-border hover:border-primary"
            onClick={() => {
              setHeroImage(p.full, { source: 'stock' });
              toast({ title: `已套用 ${p.source} 圖片`, description: `攝影：${p.author}`, variant: 'success' });
            }}
          >
            <img src={p.thumb} alt="" className="aspect-video w-full object-cover transition-transform group-hover:scale-105" />
            <div className="px-2 py-1 text-[10px] text-muted-foreground">{p.author}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

function GeoImageGen(): React.JSX.Element {
  const tokens = useEdmStore((s) => s.tokens);
  const setHeroImage = useEdmStore((s) => s.setHeroImage);
  const [pattern, setPattern] = React.useState<GeoPattern>('mesh');

  const apply = (p: GeoPattern) => {
    setPattern(p);
    const svg = generateGeoSvg({
      pattern: p,
      width: 1280,
      height: 720,
      primary: tokens.primary,
      accent: tokens.accent,
      bg: tokens.secondary,
    });
    setHeroImage(svgToDataUrl(svg), { source: 'geo' });
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">使用當前配色即時生成 SVG 幾何圖形。</p>
      <div className="grid grid-cols-2 gap-2">
        {PATTERNS.map((p) => {
          const previewSvg = generateGeoSvg({
            pattern: p.id,
            width: 320,
            height: 180,
            primary: tokens.primary,
            accent: tokens.accent,
            bg: tokens.secondary,
          });
          return (
            <button
              key={p.id}
              onClick={() => apply(p.id)}
              className={`overflow-hidden rounded border ${pattern === p.id ? 'border-primary' : 'border-border'}`}
            >
              <img src={svgToDataUrl(previewSvg)} alt={p.label} className="aspect-video w-full" />
              <div className="bg-card px-2 py-1 text-xs">{p.label}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function UploadImage(): React.JSX.Element {
  const setHeroImage = useEdmStore((s) => s.setHeroImage);
  const heroImage = useEdmStore((s) => s.heroImage);

  const onFile = (f: File) => {
    const reader = new FileReader();
    reader.onload = () => setHeroImage(reader.result as string, { source: 'upload' });
    reader.readAsDataURL(f);
  };

  return (
    <div className="space-y-3">
      <label className="flex h-32 cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-border bg-secondary/40 hover:bg-secondary">
        {heroImage ? (
          <img src={heroImage} alt="preview" className="max-h-full max-w-full rounded" />
        ) : (
          <>
            <Upload className="mb-2 h-6 w-6 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">點擊或拖放圖片</span>
          </>
        )}
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
        />
      </label>
      {heroImage && (
        <Button variant="outline" className="w-full" onClick={() => setHeroImage(undefined)}>
          移除圖片
        </Button>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

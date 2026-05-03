import * as React from 'react';
import { Button } from '@edm/components/ui/button';
import { Textarea } from '@edm/components/ui/textarea';
import { Label } from '@edm/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@edm/components/ui/select';
import { useEdmStore } from '@edm/store/edmStore';
import { generateCopy } from '@edm/lib/ai/generateCopy';
import { recommendedToneFor } from '@edm/lib/ai/templateCopyProfile';
import { TONE_LABELS, type CopyTone, type GeneratedCopy } from '@edm/types/copy';
import { hasGeminiKey } from '@edm/lib/ai/client';
import { toast } from '@edm/components/ui/toast';
import { Loader2, RefreshCw, Sparkles, ChevronLeft, ChevronRight, Check } from 'lucide-react';
import { useSettingsStore } from '@edm/store/settingsStore';

export function CopyPanel(): React.JSX.Element {
  const plan = useEdmStore((s) => s.plan);
  const templateId = useEdmStore((s) => s.templateId);
  const setCopy = useEdmStore((s) => s.setCopy);
  const currentCopy = useEdmStore((s) => s.copy);
  const rebuild = useEdmStore((s) => s.rebuildFromTemplate);
  const applyCopyVersion = useEdmStore((s) => s.applyCopyVersion);
  const preferredModel = useSettingsStore((s) => s.preferredCopyModel);
  const setPreferredModel = useSettingsStore((s) => s.setPreferredCopyModel);

  // tone 預設跟著模板走；使用者一旦手動選過，就尊重使用者選擇（toneTouched 為 true）
  const [tone, setToneState] = React.useState<CopyTone>(() => recommendedToneFor(templateId));
  const [toneTouched, setToneTouched] = React.useState(false);
  const setTone = (t: CopyTone) => {
    setToneState(t);
    setToneTouched(true);
  };
  React.useEffect(() => {
    if (!toneTouched) {
      setToneState(recommendedToneFor(templateId));
    }
  }, [templateId, toneTouched]);

  const [customPrompt, setCustomPrompt] = React.useState('');
  const [versions, setVersions] = React.useState<GeneratedCopy[]>([]);
  const [activeIdx, setActiveIdx] = React.useState(0);
  const [loading, setLoading] = React.useState(false);

  const generate = async () => {
    if (!hasGeminiKey()) {
      toast({ title: '尚未設定 Gemini API Key', description: '請在 .env 填入 GEMINI_API_KEY 並重啟伺服器', variant: 'error' });
      return;
    }
    if (!plan.title) {
      toast({ title: '請先輸入或解析開班計畫表', description: '至少需要主題與課程資訊', variant: 'info' });
      return;
    }
    setLoading(true);
    try {
      const v = await generateCopy({
        plan,
        tone,
        customPrompt,
        model: preferredModel,
        versions: 3,
        templateId,
      });
      setVersions(v);
      setActiveIdx(0);
      if (v[0]) {
        // 第一次（currentCopy 為 null）：從 fallback 文字切到 AI 文案，需整個 rebuild
        // 後續「重新產生」：partial update，保留使用者已手動修改的 block
        if (currentCopy === null) {
          setCopy(v[0]);
          rebuild();
          toast({ title: `已產生 ${v.length} 組文案`, variant: 'success' });
        } else {
          const result = applyCopyVersion(v[0]);
          toast({
            title: `已產生 ${v.length} 組文案，已套用第 1 組`,
            description:
              result.preservedCount > 0
                ? `保留你修改過的 ${result.preservedCount} 個區塊；其餘 ${result.updatedCount} 個自動更新`
                : `${result.updatedCount} 個區塊已更新`,
            variant: 'success',
          });
        }
      }
    } catch (err) {
      toast({ title: '文案生成失敗', description: (err as Error).message, variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const applyVersion = (i: number) => {
    setActiveIdx(i);
    if (!versions[i]) return;
    // v0.4.0：用 partial update 取代 setCopy + rebuild，保留使用者的手動編輯
    const result = applyCopyVersion(versions[i]);
    toast({
      title: `已切到第 ${i + 1} 版文案`,
      description:
        result.preservedCount > 0
          ? `保留你修改過的 ${result.preservedCount} 個區塊；其餘 ${result.updatedCount} 個自動更新`
          : `${result.updatedCount} 個區塊已更新`,
      variant: 'success',
    });
  };

  return (
    <div className="space-y-4">
      <header>
        <h2 className="text-sm font-semibold">AI 文案生成</h2>
        <p className="mt-1 text-xs text-muted-foreground">挑選語調，可加入自訂提示，產出 3 組任選。</p>
      </header>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs text-muted-foreground">語調</Label>
          {!toneTouched && (
            <span className="text-[10px] text-muted-foreground/70" title="會跟著當前模板自動切換；手動選後就會固定">
              已套用模板推薦
            </span>
          )}
          {toneTouched && (
            <button
              type="button"
              className="text-[10px] text-primary/80 hover:text-primary"
              title="恢復「跟著模板自動切換」"
              onClick={() => {
                setToneState(recommendedToneFor(templateId));
                setToneTouched(false);
              }}
            >
              恢復模板推薦
            </button>
          )}
        </div>
        <Select value={tone} onValueChange={(v) => setTone(v as CopyTone)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(TONE_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">模型品質</Label>
        <Select value={preferredModel} onValueChange={(v) => setPreferredModel(v as 'gemini-2.5-flash' | 'gemini-2.5-pro')}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="gemini-2.5-flash">快速 — Gemini 2.5 Flash</SelectItem>
            <SelectItem value="gemini-2.5-pro">高品質 — Gemini 2.5 Pro</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">自訂提示詞（可空白）</Label>
        <Textarea
          rows={3}
          value={customPrompt}
          onChange={(e) => setCustomPrompt(e.target.value)}
          placeholder="例如：強調對非工程背景同仁友善、提到能立刻在工作中應用..."
        />
      </div>

      <Button className="w-full" onClick={generate} disabled={loading}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        {versions.length > 0 ? '重新產生' : '生成 3 組文案'}
      </Button>

      {versions.length > 0 && (
        <div className="space-y-3 rounded-md border border-border bg-card/40 p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              版本 {activeIdx + 1} / {versions.length}
            </span>
            <div className="flex gap-1">
              <Button
                size="icon"
                variant="ghost"
                disabled={activeIdx === 0}
                onClick={() => applyVersion(activeIdx - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                disabled={activeIdx === versions.length - 1}
                onClick={() => applyVersion(activeIdx + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <CopyPreview copy={versions[activeIdx]} />
          <div className="flex items-center justify-between">
            {currentCopy === versions[activeIdx] ? (
              <span className="flex items-center gap-1 text-xs text-emerald-400">
                <Check className="h-3 w-3" />
                已套用此版本
              </span>
            ) : (
              <Button size="sm" variant="outline" onClick={() => applyVersion(activeIdx)}>
                <RefreshCw className="h-3 w-3" />
                套用此版本
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function CopyPreview({ copy }: { copy: GeneratedCopy }): React.JSX.Element {
  return (
    <div className="space-y-2 text-xs">
      <div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">主標</div>
        <div className="mt-0.5 font-bold text-foreground">{copy.headline}</div>
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">副標</div>
        <div className="mt-0.5 text-foreground/90">{copy.subheadline}</div>
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">痛點</div>
        <div className="mt-0.5 text-foreground/80">{copy.pain}</div>
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">解方</div>
        <div className="mt-0.5 text-foreground/80">{copy.solution}</div>
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">為什麼適合您</div>
        <ul className="mt-0.5 list-disc pl-4 text-foreground/80">
          {copy.whyForYou.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">CTA</div>
        <div className="mt-0.5 inline-block rounded bg-primary/20 px-2 py-0.5 text-primary">{copy.cta}</div>
      </div>
    </div>
  );
}

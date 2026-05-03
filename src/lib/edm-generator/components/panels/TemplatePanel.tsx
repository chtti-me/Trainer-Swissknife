import * as React from 'react';
import { useEdmStore, TEMPLATES } from '@edm/store/edmStore';
import { cn } from '@edm/lib/utils';
import { Button } from '@edm/components/ui/button';
import { Sparkles, Loader2 } from 'lucide-react';
import { autoLayout } from '@edm/lib/ai/autoLayout';
import { hasGeminiKey } from '@edm/lib/ai/client';
import { toast } from '@edm/components/ui/toast';

export function TemplatePanel(): React.JSX.Element {
  const templateId = useEdmStore((s) => s.templateId);
  const setTemplate = useEdmStore((s) => s.setTemplate);
  const plan = useEdmStore((s) => s.plan);
  const copy = useEdmStore((s) => s.copy);
  const setPalette = useEdmStore((s) => s.setPalette);
  const [aiBusy, setAiBusy] = React.useState(false);

  const aiLayout = async () => {
    if (!hasGeminiKey()) {
      toast({ title: '尚未設定 Gemini API Key', description: '請在 .env 填入 GEMINI_API_KEY 並重啟伺服器', variant: 'error' });
      return;
    }
    setAiBusy(true);
    try {
      const choice = await autoLayout(plan, copy);
      setTemplate(choice.templateId);
      setPalette(choice.paletteId);
      toast({
        title: 'AI 智慧排版完成',
        description: `模板：${TEMPLATES.find((t) => t.id === choice.templateId)?.name}　配色：${choice.paletteId}`,
        variant: 'success',
      });
    } catch (err) {
      toast({ title: 'AI 排版失敗', description: (err as Error).message, variant: 'error' });
    } finally {
      setAiBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <header>
        <h2 className="text-sm font-semibold">選擇排版模板</h2>
        <p className="mt-1 text-xs text-muted-foreground">點擊套用，會依現有資料重建區塊。</p>
      </header>

      <Button onClick={aiLayout} variant="outline" className="w-full" disabled={aiBusy}>
        {aiBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        AI 智慧排版
      </Button>

      <div className="grid grid-cols-1 gap-2">
        {TEMPLATES.map((t) => (
          <button
            key={t.id}
            data-template-id={t.id}
            onClick={() => setTemplate(t.id)}
            className={cn(
              'flex items-start gap-3 rounded-md border p-3 text-left transition-colors hover:bg-secondary/60',
              templateId === t.id ? 'border-primary bg-primary/5' : 'border-border bg-card/40',
            )}
          >
            <TemplatePreview kind={t.preview} active={templateId === t.id} />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium leading-tight">{t.name}</div>
              <div className="mt-1 text-xs text-muted-foreground line-clamp-2">{t.description}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function TemplatePreview({ kind, active }: { kind: string; active: boolean }): React.JSX.Element {
  const c = active ? 'hsl(199 89% 56%)' : 'hsl(220 20% 28%)';
  const c2 = active ? 'hsl(199 89% 36%)' : 'hsl(220 20% 18%)';

  const elements: Record<string, React.JSX.Element> = {
    classic: (
      <>
        <rect x="0" y="0" width="64" height="20" fill={c} />
        <rect x="14" y="26" width="36" height="4" rx="2" fill={c2} />
        <rect x="10" y="34" width="44" height="3" rx="1.5" fill={c2} opacity="0.6" />
        <rect x="22" y="42" width="20" height="6" rx="3" fill={c} />
      </>
    ),
    modern: (
      <>
        <rect x="0" y="0" width="64" height="48" fill={c2} />
        <rect x="0" y="0" width="64" height="20" fill={c} opacity="0.4" />
        <rect x="6" y="24" width="40" height="4" rx="2" fill={c} />
        <rect x="6" y="32" width="52" height="3" rx="1.5" fill="white" opacity="0.5" />
        <rect x="6" y="40" width="22" height="5" rx="2.5" fill={c} />
      </>
    ),
    minimal: (
      <>
        <rect x="6" y="8" width="22" height="3" rx="1.5" fill={c} />
        <rect x="6" y="16" width="40" height="6" rx="2" fill={c2} />
        <rect x="6" y="28" width="52" height="2" rx="1" fill={c2} opacity="0.4" />
        <rect x="6" y="34" width="48" height="2" rx="1" fill={c2} opacity="0.4" />
        <rect x="6" y="42" width="14" height="4" rx="2" fill={c} />
      </>
    ),
    magazine: (
      <>
        <rect x="0" y="0" width="32" height="48" fill={c2} />
        <rect x="36" y="6" width="24" height="4" rx="2" fill={c} />
        <rect x="36" y="14" width="22" height="3" rx="1.5" fill={c2} opacity="0.6" />
        <rect x="36" y="22" width="22" height="3" rx="1.5" fill={c2} opacity="0.6" />
        <rect x="36" y="36" width="14" height="5" rx="2.5" fill={c} />
      </>
    ),
    academic: (
      <>
        <rect x="0" y="0" width="64" height="6" fill={c2} />
        <rect x="10" y="12" width="44" height="4" rx="1" fill={c} />
        <rect x="6" y="22" width="52" height="2" rx="1" fill={c2} opacity="0.5" />
        <rect x="6" y="28" width="52" height="2" rx="1" fill={c2} opacity="0.5" />
        <rect x="6" y="36" width="52" height="6" rx="1" fill={c} opacity="0.2" stroke={c} />
      </>
    ),
    vibrant: (
      <>
        <circle cx="58" cy="6" r="10" fill={c} opacity="0.8" />
        <rect x="6" y="14" width="36" height="6" rx="3" fill={c2} />
        <rect x="6" y="24" width="48" height="3" rx="1.5" fill={c2} opacity="0.5" />
        <rect x="6" y="36" width="20" height="6" rx="3" fill={c} />
        <circle cx="6" cy="44" r="6" fill={c2} opacity="0.4" />
      </>
    ),
  };

  return (
    <svg viewBox="0 0 64 48" width="56" height="42" className="shrink-0 rounded border border-border bg-background">
      {elements[kind] ?? elements.classic}
    </svg>
  );
}

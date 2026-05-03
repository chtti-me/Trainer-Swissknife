/**
 * HeroAdaptBanner —— 切模板後的 hero 重生提示橫幅
 *
 * 使用者切到不同模板後，原本由 AI 生的 hero 圖很可能不再貼合新模板的視覺氣質
 * （例如 Magazine 的人文質感切到 Modern 的暗色霓虹）。本元件偵測到這個落差時
 * 顯示一條提示橫幅，讓使用者一鍵沿用「同一段 prompt，但用新模板的 visual cue」重生圖。
 *
 * 顯示條件：
 *   heroMeta.source === 'ai'
 *   且 heroMeta.aiTemplateId（生圖時記下的模板）!== 當前 templateId
 *
 * 不顯示的情境：
 *   - 沒有 hero 圖
 *   - hero 來自圖庫 / 幾何 / 上傳（圖庫換套搜尋語就好，使用者自己會處理）
 *   - heroMeta 缺 aiPrompt（理論上不會發生，但 fallback 仍允許「忽略」）
 *
 * 互動：
 *   - 「依新模板重生」：呼叫 generateImage(prompt, style, ratio, templateId=當前)
 *     成功後 setHeroImage 會把 aiTemplateId 同步成當前，banner 自動消失
 *   - 「忽略」：呼叫 acknowledgeHeroAdapted()，把 aiTemplateId 設為當前 templateId
 *     代表「使用者明白現在這張不貼新模板，但暫時不重生」，banner 消失直到下次切模板
 */
import * as React from 'react';
import { useEdmStore } from '@edm/store/edmStore';
import { generateImage } from '@edm/lib/ai/generateImage';
import { hasGeminiKey } from '@edm/lib/ai/client';
import { TEMPLATES } from '@edm/lib/templates';
import { toast } from '@edm/components/ui/toast';
import { Button } from '@edm/components/ui/button';
import { Loader2, Sparkles, X } from 'lucide-react';

function templateNameOf(id: string | undefined): string {
  if (!id) return '未知模板';
  return TEMPLATES.find((t) => t.id === id)?.name ?? id;
}

export function HeroAdaptBanner(): React.JSX.Element | null {
  const templateId = useEdmStore((s) => s.templateId);
  const heroImage = useEdmStore((s) => s.heroImage);
  const heroMeta = useEdmStore((s) => s.heroMeta);
  const setHeroImage = useEdmStore((s) => s.setHeroImage);
  const acknowledgeHeroAdapted = useEdmStore((s) => s.acknowledgeHeroAdapted);

  const [busy, setBusy] = React.useState(false);

  const shouldShow =
    heroImage &&
    heroMeta.source === 'ai' &&
    heroMeta.aiTemplateId &&
    heroMeta.aiTemplateId !== templateId;

  if (!shouldShow) return null;

  const oldName = templateNameOf(heroMeta.aiTemplateId);
  const newName = templateNameOf(templateId);

  const reroll = async () => {
    if (!heroMeta.aiPrompt) {
      // 沒記到 prompt 就直接忽略，避免空 prompt 重跑
      acknowledgeHeroAdapted();
      toast({ title: '已忽略提示', description: '原圖缺少 prompt 紀錄無法自動重生', variant: 'default' });
      return;
    }
    if (!hasGeminiKey()) {
      toast({ title: '尚未設定 Gemini API Key', description: '請在 .env 填入 GEMINI_API_KEY 並重啟伺服器', variant: 'error' });
      return;
    }
    setBusy(true);
    try {
      const img = await generateImage({
        prompt: heroMeta.aiPrompt,
        style: heroMeta.aiStyle ?? 'photo',
        ratio: heroMeta.aiRatio ?? '16:9',
        withText: heroMeta.aiWithText ?? false,
        templateId,
      });
      // 寫回時帶完整 metadata（aiTemplateId = 當前 templateId），banner 自動消失
      setHeroImage(img.dataUrl, {
        source: 'ai',
        aiTemplateId: templateId,
        aiPrompt: heroMeta.aiPrompt,
        aiStyle: heroMeta.aiStyle ?? 'photo',
        aiRatio: heroMeta.aiRatio ?? '16:9',
        aiWithText: heroMeta.aiWithText ?? false,
      });
      toast({
        title: `已依「${newName}」風格重生 Hero 圖`,
        description: '原 prompt 沿用，視覺氣質改套用新模板',
        variant: 'success',
      });
    } catch (err) {
      toast({ title: '重生失敗', description: (err as Error).message, variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      data-testid="hero-adapt-banner"
      className="mx-3 mt-2 flex flex-wrap items-center gap-2 rounded-md border border-amber-400/40 bg-amber-50/60 px-3 py-2 text-xs text-amber-900 shadow-sm dark:border-amber-300/30 dark:bg-amber-900/20 dark:text-amber-100"
    >
      <Sparkles className="h-3.5 w-3.5 shrink-0" />
      <span className="flex-1 leading-snug">
        目前 Hero 圖是依「<span className="font-semibold">{oldName}</span>」風格生成；
        模板已切到「<span className="font-semibold">{newName}</span>」，要不要沿用同一段 prompt 重生為新模板的視覺氣質？
      </span>
      <Button
        size="sm"
        variant="default"
        className="h-7 gap-1 px-2.5 text-xs"
        onClick={reroll}
        disabled={busy}
      >
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
        依「{newName}」重生
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="h-7 gap-1 px-2 text-xs"
        onClick={acknowledgeHeroAdapted}
        disabled={busy}
        title="這次先不重生，下次切換模板才會再提示"
      >
        <X className="h-3 w-3" />
        忽略
      </Button>
    </div>
  );
}

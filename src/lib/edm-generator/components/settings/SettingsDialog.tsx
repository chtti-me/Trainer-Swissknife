import * as React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@edm/components/ui/dialog';
import { Input } from '@edm/components/ui/input';
import { Label } from '@edm/components/ui/label';
import { Button } from '@edm/components/ui/button';
import { Separator } from '@edm/components/ui/separator';
import { useSettingsStore } from '@edm/store/settingsStore';
import { toast } from '@edm/components/ui/toast';
import { ExternalLink, Eye, EyeOff, Sparkles } from 'lucide-react';
import { getSettingsAdapter } from '@edm/lib/settings/registry';

export function SettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}): React.JSX.Element {
  const settings = useSettingsStore();
  const [gemini, setGemini] = React.useState('');
  const [unsplash, setUnsplash] = React.useState('');
  const [pexels, setPexels] = React.useState('');
  const [showSecrets, setShowSecrets] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setGemini(settings.geminiApiKey);
      setUnsplash(settings.unsplashApiKey);
      setPexels(settings.pexelsApiKey);
    }
  }, [open, settings.geminiApiKey, settings.unsplashApiKey, settings.pexelsApiKey]);

  const adapterName = React.useMemo(() => getSettingsAdapter().describe().name, []);

  const save = async () => {
    await Promise.all([
      settings.setGeminiApiKey(gemini),
      settings.setUnsplashApiKey(unsplash),
      settings.setPexelsApiKey(pexels),
    ]);
    toast({ title: '設定已儲存', description: `儲存於：${adapterName}`, variant: 'success' });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/*
        v0.7.0.1（hotfix）：SettingsDialog 隨著 v0.7.0 加入「偏好設定」區塊後，
        在較矮的視窗（例如 13 吋筆電 + 桌面側邊欄）內容會超出 viewport，header / footer 被截斷。
        修法：
          - DialogContent 加 max-h:90vh + flex-col，並覆寫 dialog.tsx 預設的 grid 排版
          - 中段內容區改用 flex-1 + overflow-y-auto 自帶瀏覽器原生捲軸，確保標題 / 動作鈕固定可見
        這樣：API key 區塊很多 → 內部捲動；視窗夠高 → 一頁完整顯示。
      */}
      <DialogContent className="flex max-h-[90vh] max-w-xl flex-col gap-0 overflow-hidden">
        <DialogHeader className="shrink-0 pb-4">
          <DialogTitle>設定</DialogTitle>
          <DialogDescription>
            {`API Key 儲存方式：${adapterName}`}
          </DialogDescription>
        </DialogHeader>

        <div className="-mr-2 flex-1 space-y-4 overflow-y-auto pr-2">
          <SecretField
            label="Gemini API Key（必填）"
            hint="於 Google AI Studio 取得"
            link="https://aistudio.google.com/app/apikey"
            value={gemini}
            onChange={setGemini}
            visible={showSecrets}
          />
          <SecretField
            label="Unsplash Access Key（選填）"
            hint="免費圖庫搜尋"
            link="https://unsplash.com/developers"
            value={unsplash}
            onChange={setUnsplash}
            visible={showSecrets}
          />
          <SecretField
            label="Pexels API Key（選填）"
            hint="免費圖庫搜尋"
            link="https://www.pexels.com/api/"
            value={pexels}
            onChange={setPexels}
            visible={showSecrets}
          />

          <Button variant="ghost" size="sm" onClick={() => setShowSecrets((v) => !v)}>
            {showSecrets ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            {showSecrets ? '隱藏密鑰' : '顯示密鑰'}
          </Button>

          <Separator />

          <PreferencesSection />
        </div>

        <DialogFooter className="shrink-0 pt-4">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>取消</Button>
          <Button onClick={save}>儲存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * v0.7.0：偏好設定區塊。
 *
 * 第一個偏好項：「於輸入階段自動透過 AI 智慧生成文案與配圖」。
 * 預設關閉以避免無意中消耗 token；勾選後 InputPanel 解析完成會接著跑文案 + 配圖。
 */
function PreferencesSection(): React.JSX.Element {
  const autoEnrich = useSettingsStore((s) => s.autoEnrichOnInput);
  const setAutoEnrich = useSettingsStore((s) => s.setAutoEnrichOnInput);
  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold text-muted-foreground">偏好設定</div>
      <label className="flex cursor-pointer items-start gap-2 rounded-md border border-border/60 bg-card/30 p-3">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={autoEnrich}
          onChange={(e) => setAutoEnrich(e.target.checked)}
        />
        <div className="flex-1 space-y-1">
          <div className="flex items-center gap-1.5 text-xs font-medium">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            於輸入階段即自動透過 AI 智慧生成文案與配圖
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            勾選後，使用者於「輸入」分頁送入筆記 / 截圖 / HTML / 網址完成解析後，
            系統會接著呼叫 AI 文案 + 配圖並套用到對應區塊，「貼一次資料、整份 EDM 一鍵長成」。
            <br />
            <span className="text-amber-600 dark:text-amber-400">
              ⚠ 預設關閉：開啟後會額外消耗 Gemini token；若沒勾選則沿用舊行為（解析完只填入資料、不自動 AI）。
            </span>
          </p>
        </div>
      </label>
    </div>
  );
}

function SecretField({
  label,
  hint,
  link,
  value,
  onChange,
  visible,
}: {
  label: string;
  hint: string;
  link: string;
  value: string;
  onChange: (v: string) => void;
  visible: boolean;
}): React.JSX.Element {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-xs">{label}</Label>
        <a
          href={link}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
        >
          取得 Key <ExternalLink className="h-3 w-3" />
        </a>
      </div>
      <Input
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={hint}
      />
    </div>
  );
}

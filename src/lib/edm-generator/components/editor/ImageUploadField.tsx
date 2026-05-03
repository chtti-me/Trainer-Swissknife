import * as React from 'react';
import { Input } from '@edm/components/ui/input';
import { Textarea } from '@edm/components/ui/textarea';
import { Button } from '@edm/components/ui/button';
import { Upload, X, AlertTriangle } from 'lucide-react';
import { cn } from '@edm/lib/utils';

/**
 * 共用圖片上傳欄位（v0.7.0）
 *
 * 解決原本 EDM Generator 中圖片只能用「貼網址 / 貼 Data URL」的不直覺體驗。
 * 行為：
 *  1. 主輸入框（textarea / input）顯示當前值（URL or Data URL）。
 *  2. 「上傳圖片」按鈕觸發隱藏的 `<input type="file" accept="image/*" />`，
 *     使用 FileReader.readAsDataURL 把檔案轉成 Base64 Data URL，自動填回輸入框。
 *  3. 「清空」按鈕一鍵清值。
 *  4. 顯示大小指示：Base64 後尺寸 ≈ 原檔 × 1.33，太大時 (>500KB) 顯示警示，
 *     因為 Outlook 對 inline Base64 有限制（多數客戶端在 ~1MB 開始拒收）。
 *
 * 套用位置：Hero 背景圖、Image 區塊圖、Instructor 頭像、未來各種圖片欄位。
 */
export interface ImageUploadFieldProps {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  /** true 時用 Textarea（適合 Data URL 太長時），預設 false */
  multiline?: boolean;
  /** Textarea 高度（rows） */
  rows?: number;
  /** 警告閾值（bytes），預設 500KB */
  warnSizeBytes?: number;
}

const DEFAULT_WARN_SIZE = 500 * 1024;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export function ImageUploadField({
  value,
  onChange,
  placeholder,
  multiline = false,
  rows = 2,
  warnSizeBytes = DEFAULT_WARN_SIZE,
}: ImageUploadFieldProps): React.JSX.Element {
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleFile = React.useCallback(
    (file: File) => {
      if (!file.type.startsWith('image/')) {
        setError('請選擇圖片檔案（image/*）');
        return;
      }
      setPending(true);
      setError(null);
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        if (typeof result === 'string') {
          onChange(result);
        } else {
          setError('讀取失敗：FileReader 回傳格式異常');
        }
        setPending(false);
      };
      reader.onerror = () => {
        setError('讀取失敗：' + (reader.error?.message ?? '未知錯誤'));
        setPending(false);
      };
      reader.readAsDataURL(file);
    },
    [onChange],
  );

  const onPick = React.useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      // 重置 input 讓重複選同一檔也能觸發 change
      e.target.value = '';
      if (f) handleFile(f);
    },
    [handleFile],
  );

  const triggerPick = React.useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const clear = React.useCallback(() => {
    onChange('');
    setError(null);
  }, [onChange]);

  const isDataUrl = value.startsWith('data:');
  // Data URL 字串長度 ≈ Base64 長度，原始 bytes ≈ length × 0.75
  const approxBytes = isDataUrl ? Math.floor(value.length * 0.75) : 0;
  const oversized = approxBytes > warnSizeBytes;

  return (
    <div className="space-y-1.5">
      {multiline ? (
        <Textarea
          rows={rows}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder ?? '貼上圖片網址，或點下方「上傳圖片」自動轉 Base64'}
        />
      ) : (
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder ?? '貼上圖片網址，或點下方「上傳圖片」自動轉 Base64'}
        />
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={triggerPick}
          disabled={pending}
          className="h-7 gap-1 text-xs"
        >
          <Upload className="h-3.5 w-3.5" />
          {pending ? '讀取中…' : '上傳圖片'}
        </Button>

        {value && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={clear}
            className="h-7 gap-1 px-2 text-xs"
          >
            <X className="h-3.5 w-3.5" />
            清空
          </Button>
        )}

        {isDataUrl && (
          <span
            className={cn(
              'ml-auto text-[10px]',
              oversized ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground',
            )}
          >
            {oversized && <AlertTriangle className="mr-1 inline h-3 w-3" />}
            Base64 ≈ {formatBytes(approxBytes)}
            {oversized && '（過大可能被信件客戶端拒收，建議改貼網址）'}
          </span>
        )}
      </div>

      {error && <div className="text-[10px] text-destructive">{error}</div>}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onPick}
      />
    </div>
  );
}

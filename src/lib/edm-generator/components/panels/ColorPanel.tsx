import * as React from 'react';
import { useEdmStore } from '@edm/store/edmStore';
import { PALETTE_PRESETS } from '@edm/lib/palettes/presets';
import { Popover, PopoverContent, PopoverTrigger } from '@edm/components/ui/popover';
import { HexColorPicker } from 'react-colorful';
import { cn } from '@edm/lib/utils';
import { Label } from '@edm/components/ui/label';
import type { ColorTokens } from '@edm/types/theme';

const TOKEN_LABELS: Array<[keyof ColorTokens, string]> = [
  ['primary', '主色'],
  ['secondary', '副色'],
  ['accent', '強調'],
  ['bg', '背景'],
  ['surface', '面板'],
  ['textPrimary', '主文字'],
  ['textSecondary', '次文字'],
  ['border', '邊框'],
];

export function ColorPanel(): React.JSX.Element {
  const paletteId = useEdmStore((s) => s.paletteId);
  const tokens = useEdmStore((s) => s.tokens);
  const setPalette = useEdmStore((s) => s.setPalette);
  const patchTokens = useEdmStore((s) => s.patchTokens);

  return (
    <div className="space-y-4">
      <header>
        <h2 className="text-sm font-semibold">配色方案</h2>
        <p className="mt-1 text-xs text-muted-foreground">先挑預設，再個別替換喜歡的顏色。</p>
      </header>

      <div className="grid grid-cols-2 gap-2">
        {PALETTE_PRESETS.map((p) => (
          <button
            key={p.id}
            onClick={() => setPalette(p.id)}
            className={cn(
              'rounded-md border p-2 text-left transition-colors hover:bg-secondary/60',
              paletteId === p.id ? 'border-primary bg-primary/5' : 'border-border bg-card/40',
            )}
          >
            <div className="flex h-6 w-full overflow-hidden rounded">
              <div className="flex-1" style={{ backgroundColor: p.tokens.primary }} />
              <div className="flex-1" style={{ backgroundColor: p.tokens.secondary }} />
              <div className="flex-1" style={{ backgroundColor: p.tokens.accent }} />
              <div className="flex-1" style={{ backgroundColor: p.tokens.surface }} />
            </div>
            <div className="mt-1.5 text-xs font-medium leading-tight">{p.name}</div>
            <div className="text-[10px] text-muted-foreground line-clamp-1">{p.description}</div>
          </button>
        ))}
      </div>

      <div className="space-y-2 pt-2">
        <Label className="text-xs text-muted-foreground">微調個別顏色</Label>
        <div className="grid grid-cols-2 gap-2">
          {TOKEN_LABELS.map(([key, label]) => (
            <ColorSwatch
              key={key}
              label={label}
              value={tokens[key]}
              onChange={(v) => patchTokens({ [key]: v } as Partial<ColorTokens>)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function ColorSwatch({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}): React.JSX.Element {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-2 rounded-md border border-border bg-card/40 p-2 text-left hover:bg-secondary/60">
          <div className="h-6 w-6 shrink-0 rounded border border-border" style={{ backgroundColor: value }} />
          <div className="flex-1 min-w-0">
            <div className="text-xs leading-tight">{label}</div>
            <div className="text-[10px] text-muted-foreground">{value.toUpperCase()}</div>
          </div>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-3">
        <HexColorPicker color={value} onChange={onChange} />
        <input
          className="mt-2 w-full rounded-md border border-border bg-background px-2 py-1 text-xs"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </PopoverContent>
    </Popover>
  );
}

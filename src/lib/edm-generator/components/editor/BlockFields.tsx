import * as React from 'react';
import { Input } from '@edm/components/ui/input';
import { Textarea } from '@edm/components/ui/textarea';
import { Label } from '@edm/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@edm/components/ui/select';
import { Slider } from '@edm/components/ui/slider';
import { Button } from '@edm/components/ui/button';
import { Plus, Trash2, RotateCcw } from 'lucide-react';
import type { Block, CtaRadiusPreset, CtaShadowLevel, CtaStyleVariant, HeadlineEffect } from '@edm/types/blocks';
import { RichTextEditor } from './RichTextEditor';
import { ImageUploadField } from './ImageUploadField';
import { useEdmStore } from '@edm/store/edmStore';
import { getTemplateStyle } from '@edm/lib/templates/styles';

interface BlockFieldsProps {
  block: Block;
  update: (patch: Partial<Block>) => void;
}

export function BlockFields({ block, update }: BlockFieldsProps): React.JSX.Element {
  /**
   * v0.7.0：訂閱當前 templateId 取出該模板的 hero.imageHeight 預設值，
   * 用作 hero 高度欄位的 fallback。block.height 未設定時 → 顯示模板預設並標示「依模板」。
   * 之前 `block.height` 永遠不被讀取（渲染端只看 style.hero.imageHeight），高度永遠不變。
   */
  const templateId = useEdmStore((s) => s.templateId);
  const heroDefaultHeight = getTemplateStyle(templateId).hero.imageHeight;

  switch (block.type) {
    case 'hero': {
      const isHeroHeightOverridden = block.height !== undefined;
      const effectiveHeight = block.height ?? heroDefaultHeight;
      return (
        <>
          <Field label="標題">
            <Input value={block.title ?? ''} onChange={(e) => update({ title: e.target.value })} />
          </Field>
          <Field label="副標">
            <Input value={block.subtitle ?? ''} onChange={(e) => update({ subtitle: e.target.value })} />
          </Field>
          <Field label="標籤 (eyebrow)">
            <Input value={block.eyebrow ?? ''} onChange={(e) => update({ eyebrow: e.target.value })} />
          </Field>
          <Field label="背景圖網址 / Data URL（留空則使用漸層）">
            <ImageUploadField
              multiline
              rows={2}
              value={block.image ?? ''}
              onChange={(next) => update({ image: next || undefined })}
            />
          </Field>
          <Field
            label={
              <span className="flex items-center gap-2">
                <span>
                  高度 {effectiveHeight}px
                  {!isHeroHeightOverridden && (
                    <span className="ml-1 text-[10px] text-muted-foreground">（依模板）</span>
                  )}
                </span>
                {isHeroHeightOverridden && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-5 gap-1 px-1.5 text-[10px]"
                    onClick={() => update({ height: undefined })}
                  >
                    <RotateCcw className="h-3 w-3" />
                    重置為模板預設（{heroDefaultHeight}px）
                  </Button>
                )}
              </span>
            }
          >
            <Slider
              value={[effectiveHeight]}
              min={120}
              max={420}
              step={10}
              onValueChange={(v) => update({ height: v[0] })}
            />
          </Field>
        </>
      );
    }

    case 'headline':
      return <HeadlineFields block={block} update={update} />;

    case 'copy':
      return (
        <Field label="段落內容（所見即所得）">
          <RichTextEditor
            value={block.html}
            onChange={(html) => update({ html })}
            placeholder="輸入段落文字、項目清單、加粗等格式…"
            minHeight={140}
          />
        </Field>
      );

    case 'cta':
      return <CtaFields block={block} update={update} />;

    case 'image':
      return (
        <>
          <Field label="圖片網址 / Data URL">
            <ImageUploadField
              multiline
              rows={3}
              value={block.src}
              onChange={(next) => update({ src: next })}
            />
          </Field>
          <Field label="替代文字">
            <Input value={block.alt} onChange={(e) => update({ alt: e.target.value })} />
          </Field>
          <Field label={`寬度 ${block.width}px`}>
            <Slider
              value={[block.width]}
              min={120}
              max={600}
              step={10}
              onValueChange={(v) => update({ width: v[0] })}
            />
          </Field>
          <Field label="對齊">
            <Select
              value={block.align}
              onValueChange={(v) => update({ align: v as 'left' | 'center' | 'right' })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="left">靠左</SelectItem>
                <SelectItem value="center">置中</SelectItem>
                <SelectItem value="right">靠右</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="圖說">
            <Input
              value={block.caption ?? ''}
              onChange={(e) => update({ caption: e.target.value || undefined })}
            />
          </Field>
        </>
      );

    case 'instructor':
      return (
        <>
          <Field label="姓名">
            <Input value={block.name} onChange={(e) => update({ name: e.target.value })} />
          </Field>
          <Field label="角色">
            <Input value={block.role} onChange={(e) => update({ role: e.target.value })} />
          </Field>
          <Field label="簡介（支援字級 / 顏色 / 對齊）">
            <RichTextEditor
              value={block.bio ?? ''}
              onChange={(html) => update({ bio: html || undefined })}
              placeholder="輸入講師簡介…可在工具列調整字級、顏色、對齊與項目清單"
              minHeight={100}
            />
          </Field>
          <Field label="頭像網址 / Data URL">
            <ImageUploadField
              value={block.avatar ?? ''}
              onChange={(next) => update({ avatar: next || undefined })}
              placeholder="貼上頭像網址，或點「上傳圖片」自動轉 Base64"
            />
          </Field>
        </>
      );

    case 'footer':
      return (
        <Field label="頁尾文字">
          <Textarea rows={4} value={block.text} onChange={(e) => update({ text: e.target.value })} />
        </Field>
      );

    case 'divider':
      return (
        <Field label="樣式">
          <Select
            value={block.style}
            onValueChange={(v) => update({ style: v as 'solid' | 'dashed' | 'geometric' })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="solid">實線</SelectItem>
              <SelectItem value="dashed">虛線</SelectItem>
              <SelectItem value="geometric">幾何漸層</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      );

    case 'spacer':
      return <SpacerFields block={block} update={update} />;

    case 'courseTable':
      return <CourseTableFields block={block} update={update} />;

    case 'classDate':
      return <ClassDateFields block={block} update={update} />;

    case 'classTime':
      return <ClassTimeFields block={block} update={update} />;

    default:
      return <div className="text-xs text-muted-foreground">尚不支援此類型的屬性編輯</div>;
  }
}

function SecondaryCtaEditor({
  block,
  update,
}: {
  block: Extract<Block, { type: 'cta' }>;
  update: (patch: Partial<Block>) => void;
}): React.JSX.Element {
  const has = !!block.secondary;
  return (
    <div className="space-y-2 rounded-md border border-border/60 bg-card/30 p-2">
      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={has}
          onChange={(e) =>
            update({
              secondary: e.target.checked
                ? { label: '查看開班計畫表', url: '#' }
                : undefined,
            })
          }
        />
        <span className="text-muted-foreground">加入次要連結（按鈕下方）</span>
      </label>
      {has && block.secondary && (
        <div className="grid grid-cols-2 gap-2">
          <Input
            placeholder="連結文字"
            value={block.secondary.label}
            onChange={(e) =>
              update({ secondary: { ...block.secondary!, label: e.target.value } })
            }
          />
          <Input
            placeholder="連結網址"
            value={block.secondary.url}
            onChange={(e) => update({ secondary: { ...block.secondary!, url: e.target.value } })}
          />
        </div>
      )}
    </div>
  );
}

function ClassDateFields({
  block,
  update,
}: {
  block: Extract<Block, { type: 'classDate' }>;
  update: (patch: Partial<Block>) => void;
}): React.JSX.Element {
  const addDate = () => {
    const today = new Date().toISOString().slice(0, 10);
    update({ dates: [...block.dates, today] });
  };

  return (
    <>
      <Field label="標籤文字">
        <Input value={block.label} onChange={(e) => update({ label: e.target.value })} />
      </Field>

      <Field label="顯示樣式">
        <Select
          value={block.display}
          onValueChange={(v) => update({ display: v as 'range' | 'list' })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="list">逐日列出</SelectItem>
            <SelectItem value="range">起訖區間（共 N 天）</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      <Field label="年份顯示">
        <Select
          value={block.yearFormat ?? 'roc'}
          onValueChange={(v) => update({ yearFormat: v as 'roc' | 'gregorian' })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="roc">民國年（115 年；同年只顯示一次）</SelectItem>
            <SelectItem value="gregorian">西元年（2026 年；同年只顯示一次）</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs text-muted-foreground">上課日期清單</Label>
          <Button size="sm" variant="outline" onClick={addDate}>
            <Plus className="h-3 w-3" />
            新增日期
          </Button>
        </div>
        {block.dates.length === 0 && (
          <p className="text-xs text-muted-foreground">尚未設定，點「新增日期」加入。</p>
        )}
        <div className="space-y-1.5">
          {block.dates.map((d, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                type="date"
                value={d}
                onChange={(e) => {
                  const next = [...block.dates];
                  next[i] = e.target.value;
                  update({ dates: next });
                }}
                className="flex-1"
              />
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={() => update({ dates: block.dates.filter((_, j) => j !== i) })}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function ClassTimeFields({
  block,
  update,
}: {
  block: Extract<Block, { type: 'classTime' }>;
  update: (patch: Partial<Block>) => void;
}): React.JSX.Element {
  return (
    <>
      <Field label="標籤文字">
        <Input value={block.label} onChange={(e) => update({ label: e.target.value })} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="開始時間">
          <Input
            type="time"
            value={block.startTime}
            onChange={(e) => update({ startTime: e.target.value })}
          />
        </Field>
        <Field label="結束時間">
          <Input
            type="time"
            value={block.endTime}
            onChange={(e) => update({ endTime: e.target.value })}
          />
        </Field>
      </div>
      <Field label="顯示時長">
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={block.showDuration}
            onChange={(e) => update({ showDuration: e.target.checked })}
          />
          <span className="text-muted-foreground">在時間後加上「共 N 小時」</span>
        </label>
      </Field>
    </>
  );
}

/**
 * v0.7.0：課程表編輯器升級
 *
 * 之前只有「顯示主講人」單一開關，課程內容（名稱 / 時數 / 班代號）只能透過左側「資料」分頁
 * 改 ClassPlan，再「依當前資料 + 模板重新生成區塊」一次刷新整份 EDM。
 * 此版本允許在 BlockEditDialog 內直接編輯每門課的：
 *   - 課程名稱 (`name`)
 *   - 時數 (`hours`，number；改動後自動重算 `block.totalHours`)
 *   - 班代號 (`code`，例如「CR25AX」)
 *   - 主講人 (`instructor`)
 * 並新增：
 *   - 「顯示班代號」開關（block.showCode；undefined 視為 true 沿用舊行為）
 *   - 新增 / 刪除課程
 *   - 一鍵「依時數重算總時數」（極端情況例如使用者想把 totalHours 留空時用）
 */
function CourseTableFields({
  block,
  update,
}: {
  block: Extract<Block, { type: 'courseTable' }>;
  update: (patch: Partial<Block>) => void;
}): React.JSX.Element {
  const courses = block.courses;
  const showCode = block.showCode !== false; // undefined → true

  /** 變更某一列課程後，自動重算 totalHours（之前 totalHours 是寫死，改 hours 不會更新） */
  const writeCourses = (next: typeof courses) => {
    const sum = next.reduce((acc, c) => acc + (Number.isFinite(c.hours) ? c.hours : 0), 0);
    update({ courses: next, totalHours: sum });
  };

  const updateRow = (idx: number, patch: Partial<typeof courses[number]>) => {
    const next = courses.map((c, i) => (i === idx ? { ...c, ...patch } : c));
    writeCourses(next);
  };

  const addRow = () => {
    writeCourses([
      ...courses,
      { code: '', name: '新課程', hours: 2, instructor: '' },
    ]);
  };

  const removeRow = (idx: number) => {
    writeCourses(courses.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-3">
      <div className="space-y-2 rounded-md border border-border/60 bg-card/30 p-2.5">
        <div className="text-[11px] font-semibold text-muted-foreground">顯示選項</div>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={block.showInstructor}
            onChange={(e) => update({ showInstructor: e.target.checked })}
          />
          <span className="text-muted-foreground">顯示「主講」欄位</span>
        </label>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={showCode}
            onChange={(e) => update({ showCode: e.target.checked })}
          />
          <span className="text-muted-foreground">顯示班代號（如「CR25AX」，附在課程名稱後）</span>
        </label>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs text-muted-foreground">課程清單（{courses.length} 門）</Label>
          <Button size="sm" variant="outline" onClick={addRow} className="h-7 px-2 text-xs">
            <Plus className="h-3 w-3" />
            新增課程
          </Button>
        </div>

        {courses.length === 0 && (
          <div className="rounded-md border border-dashed border-border/50 p-3 text-center text-[11px] text-muted-foreground">
            尚未建立任何課程。請點「新增課程」開始編輯。
          </div>
        )}

        {courses.map((c, i) => (
          <div
            key={i}
            className="space-y-1.5 rounded-md border border-border/60 bg-card/40 p-2"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold text-muted-foreground">第 {i + 1} 門</span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => removeRow(i)}
                className="h-6 gap-1 px-1.5 text-[10px] text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="h-3 w-3" />
                刪除
              </Button>
            </div>
            <Input
              value={c.name}
              onChange={(e) => updateRow(i, { name: e.target.value })}
              placeholder="課程名稱"
              className="h-8 text-xs"
            />
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <Input
                value={c.code}
                onChange={(e) => updateRow(i, { code: e.target.value })}
                placeholder="班代號（例如 CR25AX）"
                className="h-8 text-xs"
              />
              <Input
                type="number"
                min={0}
                step={0.5}
                value={c.hours}
                onChange={(e) =>
                  updateRow(i, { hours: e.target.value === '' ? 0 : Number(e.target.value) })
                }
                placeholder="時數"
                className="h-8 w-20 text-xs"
              />
            </div>
            {block.showInstructor && (
              <Input
                value={c.instructor}
                onChange={(e) => updateRow(i, { instructor: e.target.value })}
                placeholder="主講人"
                className="h-8 text-xs"
              />
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between rounded-md border border-border/60 bg-card/30 px-3 py-2 text-xs">
        <span className="text-muted-foreground">合計時數（依清單自動重算）</span>
        <span className="font-semibold">{block.totalHours ?? 0} 小時</span>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: React.ReactNode; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground" asChild>
        <div>{label}</div>
      </Label>
      {children}
    </div>
  );
}

/**
 * 空白行屬性面板（v0.7.2.1）。
 * 三個欄位：
 *   - 高度（slider 4 ~ 200 px + 直接輸入框）
 *   - 背景色（color input + hex 文字框；可一鍵「重置為透明」）
 *   - 透明度（slider 0 ~ 100% + 數字顯示）
 *
 * 設計：背景色 + 透明度分離，使用者可以「先選色、再拉透明度」獨立操作。
 * 完全透明（opacity 0）時，色彩值仍保留（方便使用者快速「半開半關」）。
 */
function SpacerFields({
  block,
  update,
}: {
  block: Extract<Block, { type: 'spacer' }>;
  update: (patch: Partial<Block>) => void;
}): React.JSX.Element {
  const height = Math.max(4, Math.min(200, block.height || 24));
  const opacityPct = Math.round(((typeof block.opacity === 'number' ? block.opacity : 0)) * 100);
  const background = block.background ?? '#000000';
  const isTransparent = !block.opacity;

  // v0.7.4：常用高度快捷組（呼應排版常用的 8/16/24/40/64/80/120 px 系列）
  // 8 = 微縫；16 = 段間；24 = 預設；40 = 區塊間；64 = 大段；80 = 章節隔；120 = 海報級空白
  const heightPresets: number[] = [8, 16, 24, 40, 64, 80, 120];

  return (
    <div className="space-y-3">
      <Field label={`高度 ${height}px`}>
        <div className="flex items-center gap-2">
          <Slider
            value={[height]}
            min={4}
            max={200}
            step={2}
            onValueChange={(v) => update({ height: v[0] })}
            className="flex-1"
          />
          <Input
            type="number"
            min={4}
            max={400}
            step={2}
            value={height}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (Number.isFinite(v)) update({ height: Math.max(1, Math.min(400, v)) });
            }}
            className="h-8 w-20 text-xs"
          />
        </div>
        {/* v0.7.4：常用高度快捷一鍵 — 拖 slider 太慢，給 7 個高頻值快速跳轉 */}
        <div className="mt-1.5 flex flex-wrap gap-1">
          {heightPresets.map((px) => {
            const active = height === px;
            return (
              <Button
                key={px}
                type="button"
                size="sm"
                variant={active ? 'default' : 'outline'}
                className="h-6 px-2 text-[10px] font-mono"
                onClick={() => update({ height: px })}
              >
                {px}px
              </Button>
            );
          })}
        </div>
      </Field>

      <Field
        label={
          <span className="flex items-center gap-2">
            <span>
              背景色
              {isTransparent && (
                <span className="ml-1 text-[10px] text-muted-foreground">（透明度 0 → 不可見）</span>
              )}
            </span>
            {(block.background !== undefined || block.opacity !== undefined) && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-5 gap-1 px-1.5 text-[10px]"
                onClick={() => update({ background: undefined, opacity: undefined })}
              >
                <RotateCcw className="h-3 w-3" />
                重置為透明
              </Button>
            )}
          </span>
        }
      >
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={background}
            onChange={(e) => update({ background: e.target.value })}
            className="h-8 w-14 cursor-pointer rounded border border-border bg-transparent"
          />
          <Input
            value={background}
            onChange={(e) => update({ background: e.target.value })}
            placeholder="#000000"
            className="h-8 flex-1 font-mono text-xs"
          />
        </div>
      </Field>

      <Field label={`透明度 ${opacityPct}%`}>
        <Slider
          value={[opacityPct]}
          min={0}
          max={100}
          step={1}
          onValueChange={(v) => update({ opacity: v[0] / 100 })}
        />
      </Field>

      <div className="rounded-md border border-border/60 bg-card/30 p-2 text-[11px] text-muted-foreground leading-relaxed">
        提示：
        <br />
        ・<span className="font-semibold">純間距</span>：保持透明度 0%（預設）
        <br />
        ・<span className="font-semibold">柔和分隔</span>：透明度 10%、背景色選 primary
        <br />
        ・<span className="font-semibold">強調色帶</span>：透明度 100%、背景色選 accent、高度 8px
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CtaFields（v0.7.3 新增）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * CTA 細粒度編輯欄位（v0.7.3）。
 *
 * 設計原則：
 *   - **所有覆寫都「未設則 fallback」**：使用者沒主動改的欄位永遠回到模板預設，
 *     讓「切模板」時 CTA 自動跟著新模板走，不會留下舊模板的奇怪設定。
 *   - **gradient 樣式才顯示 gradient 色 picker**：避免一般使用者被「為何有兩個顏色」迷惑。
 *   - **每個覆寫欄位都有「重置為預設」按鈕**：明確的逃生口，跟 hero.height / spacer 一致。
 *
 * 結構：
 *   1) 內容（label / url）
 *   2) 樣式 picker（5 種，含視覺預覽塊）
 *   3) 漸層色 pair（only when style === 'gradient'）
 *   4) 圓角（6 種 preset）
 *   5) 文字大小 slider + reset
 *   6) 陰影（4 級）
 *   7) 透明度 slider + reset
 *   8) 滿版按鈕 toggle
 *   9) 次要連結（沿用既有 SecondaryCtaEditor）
 */
function CtaFields({
  block,
  update,
}: {
  block: Extract<Block, { type: 'cta' }>;
  update: (patch: Partial<Block>) => void;
}): React.JSX.Element {
  const fontSize = block.fontSize ?? 15;
  const opacityPct = Math.round((block.opacity ?? 1) * 100);

  return (
    <div className="space-y-3">
      {/* 1) 內容 */}
      <Field label="按鈕文字">
        <Input value={block.label} onChange={(e) => update({ label: e.target.value })} />
      </Field>
      <Field label="連結網址">
        <Input value={block.url} onChange={(e) => update({ url: e.target.value })} placeholder="https://…" />
      </Field>

      {/* 2) 樣式 picker —— 用 grid 5 欄做視覺預覽，比 dropdown 直觀 */}
      <Field label="樣式">
        <div className="grid grid-cols-5 gap-1">
          {CTA_STYLE_OPTIONS.map((opt) => {
            const active = block.style === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => update({ style: opt.id })}
                className={`flex flex-col items-center gap-1 rounded border p-1.5 text-[10px] transition-colors ${
                  active
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border/60 hover:border-border hover:bg-secondary/40'
                }`}
                title={opt.description}
              >
                <span
                  className="block h-4 w-full rounded"
                  style={opt.previewStyle}
                />
                {opt.label}
              </button>
            );
          })}
        </div>
      </Field>

      {/* 3) 漸層色 pair —— 只在 gradient 樣式顯示 */}
      {block.style === 'gradient' && (
        <Field
          label={
            <span className="flex items-center gap-2">
              <span>漸層顏色</span>
              {(block.gradientFrom !== undefined || block.gradientTo !== undefined) && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-5 gap-1 px-1.5 text-[10px]"
                  onClick={() => update({ gradientFrom: undefined, gradientTo: undefined })}
                >
                  <RotateCcw className="h-3 w-3" />
                  重置（用 primary → accent）
                </Button>
              )}
            </span>
          }
        >
          <div className="flex items-center gap-2">
            <ColorPickerInline
              label="起"
              value={block.gradientFrom ?? '#FF6B35'}
              onChange={(v) => update({ gradientFrom: v })}
            />
            <span className="text-[10px] text-muted-foreground">→</span>
            <ColorPickerInline
              label="迄"
              value={block.gradientTo ?? '#F7931E'}
              onChange={(v) => update({ gradientTo: v })}
            />
          </div>
        </Field>
      )}

      {/* 4) 圓角 preset */}
      <Field
        label={
          <span className="flex items-center gap-2">
            <span>圓角</span>
            {block.radius && block.radius !== 'inherit' && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-5 gap-1 px-1.5 text-[10px]"
                onClick={() => update({ radius: undefined })}
              >
                <RotateCcw className="h-3 w-3" />
                重置（依模板）
              </Button>
            )}
          </span>
        }
      >
        <Select
          value={block.radius ?? 'inherit'}
          onValueChange={(v) => update({ radius: v as CtaRadiusPreset })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="inherit">依模板（預設）</SelectItem>
            <SelectItem value="square">方角（0px）</SelectItem>
            <SelectItem value="sm">微圓（4px）</SelectItem>
            <SelectItem value="md">中圓（8px）</SelectItem>
            <SelectItem value="lg">大圓（16px）</SelectItem>
            <SelectItem value="pill">膠囊（全圓）</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      {/* 5) 文字大小 slider */}
      <Field
        label={
          <span className="flex items-center gap-2">
            <span>文字大小 {fontSize}px</span>
            {block.fontSize !== undefined && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-5 gap-1 px-1.5 text-[10px]"
                onClick={() => update({ fontSize: undefined })}
              >
                <RotateCcw className="h-3 w-3" />
                重置（15px）
              </Button>
            )}
          </span>
        }
      >
        <Slider
          value={[fontSize]}
          min={12}
          max={24}
          step={1}
          onValueChange={(v) => update({ fontSize: v[0] })}
        />
      </Field>

      {/* 6) 陰影 */}
      <Field label="陰影（Outlook desktop 不支援會自動忽略）">
        <Select
          value={block.shadow ?? 'none'}
          onValueChange={(v) => update({ shadow: v as CtaShadowLevel })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">無</SelectItem>
            <SelectItem value="sm">輕</SelectItem>
            <SelectItem value="md">中</SelectItem>
            <SelectItem value="lg">重</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      {/* 7) 透明度 */}
      <Field
        label={
          <span className="flex items-center gap-2">
            <span>透明度 {opacityPct}%</span>
            {block.opacity !== undefined && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-5 gap-1 px-1.5 text-[10px]"
                onClick={() => update({ opacity: undefined })}
              >
                <RotateCcw className="h-3 w-3" />
                重置（100%）
              </Button>
            )}
          </span>
        }
      >
        <Slider
          value={[opacityPct]}
          min={10}
          max={100}
          step={5}
          onValueChange={(v) => update({ opacity: v[0] / 100 })}
        />
      </Field>

      {/* 8) 滿版按鈕 toggle */}
      <Field label="">
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={block.fullWidth === true}
            onChange={(e) => update({ fullWidth: e.target.checked || undefined })}
          />
          <span className="text-muted-foreground">滿版按鈕（width: 100%）</span>
        </label>
      </Field>

      {/* 9) 次要連結 */}
      <SecondaryCtaEditor block={block} update={update} />
    </div>
  );
}

/**
 * CTA 樣式 5 種選項的視覺預覽塊定義。
 * previewStyle 直接套到 picker 內的小色塊，讓使用者一眼看出每種樣式的視覺特徵。
 */
const CTA_STYLE_OPTIONS: Array<{
  id: CtaStyleVariant;
  label: string;
  description: string;
  previewStyle: React.CSSProperties;
}> = [
  {
    id: 'primary',
    label: '實心',
    description: '經典實心按鈕：背景 primary、文字反白',
    previewStyle: { background: '#1F2937' },
  },
  {
    id: 'outline',
    label: '外框',
    description: '透明背景 + primary 邊框',
    previewStyle: { background: 'transparent', border: '2px solid #1F2937' },
  },
  {
    id: 'gradient',
    label: '漸層',
    description: '雙色漸層（135° linear）；Outlook desktop 退化為實心中間色',
    previewStyle: { background: 'linear-gradient(135deg, #FF6B35, #F7931E)' },
  },
  {
    id: 'ghost',
    label: '幽靈',
    description: '12% primary 疊在 surface 上，無邊框 —— 最淡',
    previewStyle: { background: 'rgba(31,41,55,0.12)' },
  },
  {
    id: 'soft',
    label: '柔和',
    description: '18% primary 疊在 surface 上，比 ghost 飽和度高一點',
    previewStyle: { background: 'rgba(31,41,55,0.18)' },
  },
];

/**
 * 內聯版 color picker：色板 + hex 文字輸入並排。
 * 跟 SpacerFields 用的 inline color picker 一致，但加上 label 前綴提示。
 */
function ColorPickerInline({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-1">
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 w-10 cursor-pointer rounded border border-border bg-transparent"
      />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 w-20 font-mono text-[10px]"
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// HeadlineFields（v0.7.3 新增）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Headline 進階編輯欄位（v0.7.3）。
 *
 * 升級內容（vs v0.7.2）：
 *   - **eyebrow**：新增小肩標欄位（在 title 上方的小字）
 *   - **3 段獨立色彩覆寫**：title color / subtitle color / eyebrow color，各自有「重置依模板」按鈕
 *   - **customSize**：自訂主標字級（12 ~ 64 px），完全覆蓋 size preset
 *   - **weight**：自訂字重（300 ~ 900）
 *   - **effect**：5 種文字效果（none / typewriter / blink / fade-in / gradient-text），含預覽按鈕
 *
 * 設計原則同 CtaFields：所有覆寫都「未設則 fallback 模板預設」+ 重置按鈕。
 */
function HeadlineFields({
  block,
  update,
}: {
  block: Extract<Block, { type: 'headline' }>;
  update: (patch: Partial<Block>) => void;
}): React.JSX.Element {
  // 讀模板色作為各 color picker 的「依模板（預設）」hint 顯示
  const templateId = useEdmStore((s) => s.templateId);
  const _templateStyle = getTemplateStyle(templateId);
  // 純參考 — render 不需要顯示具體 hex（因為 token 是動態的，依當前 palette），
  // 我們只在「色彩有覆寫」時顯示「重置」按鈕，重置即把該欄位設 undefined → fallback 到 token。
  void _templateStyle;

  const sizeMap = { sm: 14, md: 18, lg: 24, xl: 30 } as const;
  const sizePreset = block.size ?? 'lg';
  const baseSize = block.customSize ?? sizeMap[sizePreset];
  const titleWeight = block.weight ?? 700;

  return (
    <div className="space-y-3">
      {/* 1) eyebrow（v0.7.3 新增） */}
      <Field
        label={
          <span className="flex items-center gap-2">
            <span>肩標 / Eyebrow</span>
            {block.eyebrow !== undefined && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-5 gap-1 px-1.5 text-[10px]"
                onClick={() => update({ eyebrow: undefined })}
              >
                <RotateCcw className="h-3 w-3" />
                移除肩標
              </Button>
            )}
          </span>
        }
      >
        <Input
          value={block.eyebrow ?? ''}
          onChange={(e) => update({ eyebrow: e.target.value || undefined })}
          placeholder="例：第三章、Featured、最新公告"
        />
      </Field>

      {/* 2) 主標題 */}
      <Field label="標題">
        <Input value={block.text} onChange={(e) => update({ text: e.target.value })} />
      </Field>

      {/* 3) 副標 */}
      <Field label="副標">
        <Input
          value={block.subtitle ?? ''}
          onChange={(e) => update({ subtitle: e.target.value || undefined })}
        />
      </Field>

      {/* 4) 對齊 */}
      <Field label="對齊">
        <Select value={block.align} onValueChange={(v) => update({ align: v as 'left' | 'center' })}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="left">靠左</SelectItem>
            <SelectItem value="center">置中</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      {/* 5) 大小 preset（仍保留，customSize 為 undefined 時生效） */}
      <Field
        label={
          <span className="flex items-center gap-2">
            <span>
              大小 preset {block.customSize !== undefined && (
                <span className="text-[10px] text-muted-foreground">（被自訂字級覆蓋中）</span>
              )}
            </span>
          </span>
        }
      >
        <Select
          value={sizePreset}
          onValueChange={(v) => update({ size: v as 'sm' | 'md' | 'lg' | 'xl' })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="sm">小（14px）</SelectItem>
            <SelectItem value="md">中（18px）</SelectItem>
            <SelectItem value="lg">大（24px）</SelectItem>
            <SelectItem value="xl">特大（30px）</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      {/* 6) 自訂字級 customSize（v0.7.3） */}
      <Field
        label={
          <span className="flex items-center gap-2">
            <span>自訂字級 {baseSize}px</span>
            {block.customSize !== undefined && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-5 gap-1 px-1.5 text-[10px]"
                onClick={() => update({ customSize: undefined })}
              >
                <RotateCcw className="h-3 w-3" />
                重置（用 preset）
              </Button>
            )}
          </span>
        }
      >
        <Slider
          value={[baseSize]}
          min={12}
          max={64}
          step={1}
          onValueChange={(v) => update({ customSize: v[0] })}
        />
      </Field>

      {/* 7) 字重 weight（v0.7.3） */}
      <Field
        label={
          <span className="flex items-center gap-2">
            <span>字重 {titleWeight}</span>
            {block.weight !== undefined && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-5 gap-1 px-1.5 text-[10px]"
                onClick={() => update({ weight: undefined })}
              >
                <RotateCcw className="h-3 w-3" />
                重置（依模板）
              </Button>
            )}
          </span>
        }
      >
        <Slider
          value={[titleWeight]}
          min={300}
          max={900}
          step={100}
          onValueChange={(v) => update({ weight: v[0] })}
        />
      </Field>

      {/* 8) 三段色彩覆寫（v0.7.3） */}
      <div className="rounded-md border border-border/60 bg-card/30 p-2 space-y-2">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          色彩覆寫
        </div>
        <HeadlineColorRow
          label="主標題色"
          value={block.color}
          onChange={(v) => update({ color: v })}
          onReset={() => update({ color: undefined })}
        />
        <HeadlineColorRow
          label="副標色"
          value={block.subtitleColor}
          onChange={(v) => update({ subtitleColor: v })}
          onReset={() => update({ subtitleColor: undefined })}
        />
        <HeadlineColorRow
          label="肩標色"
          value={block.eyebrowColor}
          onChange={(v) => update({ eyebrowColor: v })}
          onReset={() => update({ eyebrowColor: undefined })}
        />
      </div>

      {/* 9) 文字效果 picker（v0.7.3） —— grid 5 欄含預覽 */}
      <Field label="文字效果">
        <div className="grid grid-cols-5 gap-1">
          {HEADLINE_EFFECT_OPTIONS.map((opt) => {
            const active = (block.effect ?? 'none') === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => update({ effect: opt.id })}
                title={opt.description}
                className={`flex flex-col items-center gap-1 rounded border p-1.5 text-[10px] transition-colors ${
                  active
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border/60 hover:border-border hover:bg-secondary/40'
                }`}
              >
                <span className="text-base leading-none">{opt.icon}</span>
                {opt.label}
              </button>
            );
          })}
        </div>
      </Field>

      {/* 10) 提示 */}
      <div className="rounded-md border border-border/60 bg-card/30 p-2 text-[11px] text-muted-foreground leading-relaxed">
        提示：<br />
        ・<span className="font-semibold">動畫效果</span>在 Outlook desktop 不會跑（會直接顯示靜態文字），其他客戶端正常<br />
        ・<span className="font-semibold">漸層文字</span>在 Outlook desktop 會 fallback 到主標題色<br />
        ・<span className="font-semibold">customSize 設定後</span>會完全覆蓋大小 preset
      </div>
    </div>
  );
}

const HEADLINE_EFFECT_OPTIONS: Array<{
  id: HeadlineEffect;
  label: string;
  description: string;
  /** 用 emoji / unicode 做小圖示，不引入 lucide 額外圖示，保持 bundle 體積 */
  icon: string;
}> = [
  { id: 'none', label: '無', description: '無效果（預設）', icon: '—' },
  { id: 'typewriter', label: '打字機', description: '逐字出現，搭配閃爍游標。Outlook desktop 看到完整靜態文字。', icon: '⌨' },
  { id: 'blink', label: '閃爍', description: 'opacity 在 1 ↔ 0.4 之間循環，吸引注意。Outlook desktop 看到 opacity:1 完整文字。', icon: '✨' },
  { id: 'fade-in', label: '淡入', description: 'opacity 從 0 → 1 + 上浮 8px，一次性效果。', icon: '⤴' },
  { id: 'gradient-text', label: '漸層字', description: 'primary → accent 漸層套到字上。Outlook desktop fallback 到主標題色。', icon: '🌈' },
];

/**
 * Headline 三色 row 組件（共用：主標題色 / 副標色 / 肩標色）。
 * 未設定時顯示「使用模板色」灰色 hint；設定後顯示色板 + hex + 重置按鈕。
 */
function HeadlineColorRow({
  label,
  value,
  onChange,
  onReset,
}: {
  label: string;
  value: string | undefined;
  onChange: (v: string) => void;
  onReset: () => void;
}): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="w-16 shrink-0 text-muted-foreground">{label}</span>
      {value === undefined ? (
        <button
          type="button"
          onClick={() => onChange('#000000')}
          className="flex flex-1 items-center justify-between rounded border border-dashed border-border/60 px-2 py-1.5 text-[10px] text-muted-foreground hover:border-border hover:bg-secondary/40"
        >
          <span>使用模板色</span>
          <span className="text-[10px]">點此覆寫</span>
        </button>
      ) : (
        <div className="flex flex-1 items-center gap-1.5">
          <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="h-7 w-10 cursor-pointer rounded border border-border bg-transparent"
          />
          <Input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="h-7 flex-1 font-mono text-[10px]"
          />
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 w-7 shrink-0 px-0"
            onClick={onReset}
            title="重置（依模板）"
          >
            <RotateCcw className="h-3 w-3" />
          </Button>
        </div>
      )}
    </div>
  );
}

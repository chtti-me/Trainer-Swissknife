import * as React from 'react';
import { Input } from '@edm/components/ui/input';
import { Label } from '@edm/components/ui/label';
import { Textarea } from '@edm/components/ui/textarea';
import { Button } from '@edm/components/ui/button';
import { useEdmStore } from '@edm/store/edmStore';
import { Plus, Trash2, RefreshCw } from 'lucide-react';
import { nanoid } from 'nanoid';
import { Separator } from '@edm/components/ui/separator';

export function DataPanel(): React.JSX.Element {
  const plan = useEdmStore((s) => s.plan);
  const patchPlan = useEdmStore((s) => s.patchPlan);
  const rebuild = useEdmStore((s) => s.rebuildFromTemplate);

  const updateField = <K extends keyof typeof plan>(k: K, v: (typeof plan)[K]) => {
    patchPlan({ [k]: v } as any);
  };

  return (
    <div className="space-y-4">
      <header>
        <h2 className="text-sm font-semibold">解析結果（可手動微調）</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          所有欄位修改後會即時套用至 EDM 預覽。
        </p>
      </header>

      <Field label="班代號">
        <Input value={plan.classCode} onChange={(e) => updateField('classCode', e.target.value)} />
      </Field>
      <Field label="主題（班名）">
        <Input value={plan.title} onChange={(e) => updateField('title', e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="期數">
          <Input value={plan.termNumber} onChange={(e) => updateField('termNumber', e.target.value)} />
        </Field>
        <Field label="總時數">
          <Input
            type="number"
            value={plan.totalHours}
            onChange={(e) => updateField('totalHours', Number(e.target.value))}
          />
        </Field>
      </div>

      <Field label="上課日期（每行一筆）">
        <Textarea
          rows={3}
          value={plan.classDays.join('\n')}
          onChange={(e) =>
            updateField(
              'classDays',
              e.target.value
                .split('\n')
                .map((s) => s.trim())
                .filter(Boolean),
            )
          }
        />
      </Field>

      <div className="grid grid-cols-2 gap-2">
        <Field label="開始時間">
          <Input value={plan.startTime} onChange={(e) => updateField('startTime', e.target.value)} placeholder="09:30" />
        </Field>
        <Field label="結束時間">
          <Input value={plan.endTime} onChange={(e) => updateField('endTime', e.target.value)} placeholder="11:30" />
        </Field>
      </div>

      <Field label="上課方式 / 地點">
        <Input value={plan.location} onChange={(e) => updateField('location', e.target.value)} />
      </Field>

      <Field label="目標對象（每行一筆）">
        <Textarea
          rows={3}
          value={plan.audience.join('\n')}
          onChange={(e) =>
            updateField(
              'audience',
              e.target.value
                .split('\n')
                .map((s) => s.trim())
                .filter(Boolean),
            )
          }
        />
      </Field>

      <Field label="預備知識">
        <Textarea
          rows={2}
          value={plan.prerequisites}
          onChange={(e) => updateField('prerequisites', e.target.value)}
        />
      </Field>

      <Field label="學習目標（每行一筆）">
        <Textarea
          rows={3}
          value={plan.objectives.join('\n')}
          onChange={(e) =>
            updateField(
              'objectives',
              e.target.value
                .split('\n')
                .map((s) => s.trim())
                .filter(Boolean),
            )
          }
        />
      </Field>

      <Separator />
      <h3 className="text-xs font-semibold text-muted-foreground">導師（培訓師）</h3>
      <Field label="姓名">
        <Input
          value={plan.mentor.name}
          onChange={(e) => patchPlan({ mentor: { ...plan.mentor, name: e.target.value } })}
        />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="電話">
          <Input
            value={plan.mentor.phone ?? ''}
            onChange={(e) => patchPlan({ mentor: { ...plan.mentor, phone: e.target.value } })}
          />
        </Field>
        <Field label="Email">
          <Input
            value={plan.mentor.email ?? ''}
            onChange={(e) => patchPlan({ mentor: { ...plan.mentor, email: e.target.value } })}
          />
        </Field>
      </div>

      <Separator />
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-muted-foreground">課程列表</h3>
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            patchPlan({
              courses: [...plan.courses, { code: '', name: '新課程', hours: 2, instructor: '' }],
            })
          }
        >
          <Plus className="h-3 w-3" />
          新增
        </Button>
      </div>
      {plan.courses.map((c, i) => (
        <div key={i} className="space-y-2 rounded-md border border-border bg-card/40 p-2">
          <div className="flex gap-2">
            <Input
              className="flex-1 text-xs"
              placeholder="課程名稱"
              value={c.name}
              onChange={(e) => {
                const arr = [...plan.courses];
                arr[i] = { ...c, name: e.target.value };
                patchPlan({ courses: arr });
              }}
            />
            <Button
              size="icon"
              variant="ghost"
              onClick={() => patchPlan({ courses: plan.courses.filter((_, j) => j !== i) })}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Input
              className="text-xs"
              placeholder="代號"
              value={c.code}
              onChange={(e) => {
                const arr = [...plan.courses];
                arr[i] = { ...c, code: e.target.value };
                patchPlan({ courses: arr });
              }}
            />
            <Input
              type="number"
              className="text-xs"
              placeholder="時數"
              value={c.hours}
              onChange={(e) => {
                const arr = [...plan.courses];
                arr[i] = { ...c, hours: Number(e.target.value) };
                patchPlan({ courses: arr });
              }}
            />
            <Input
              className="text-xs"
              placeholder="主講人"
              value={c.instructor}
              onChange={(e) => {
                const arr = [...plan.courses];
                arr[i] = { ...c, instructor: e.target.value };
                patchPlan({ courses: arr });
              }}
            />
          </div>
        </div>
      ))}

      <Separator />
      <h3 className="text-xs font-semibold text-muted-foreground">連結</h3>
      <Field label="報名網址">
        <Input
          value={plan.registrationUrl ?? ''}
          onChange={(e) => updateField('registrationUrl', e.target.value)}
        />
      </Field>
      <Field label="開班計畫表網址">
        <Input
          value={plan.syllabusUrl ?? ''}
          onChange={(e) => updateField('syllabusUrl', e.target.value)}
        />
      </Field>

      <Separator />
      {/* v0.7.0：Button 預設 whitespace-nowrap + h-10 在窄面板下會讓「依當前資料 + 模板重新生成區塊」13 字溢出。
          這顆按鈕就是會在窄寬下需要換行的長按鈕，所以解除 nowrap、改自適應高度，並把文字包進可 wrap 的 span。 */}
      <Button
        variant="outline"
        className="h-auto w-full min-w-0 whitespace-normal py-2 text-left leading-snug"
        onClick={rebuild}
      >
        <RefreshCw className="h-4 w-4 shrink-0" />
        <span className="min-w-0 flex-1">依當前資料 + 模板重新生成區塊</span>
      </Button>
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

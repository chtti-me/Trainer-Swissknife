"use client";

/**
 * 【模板與配色選擇器】
 */
import * as React from "react";
import { useReportStore } from "../../store/reportStore";
import { TEMPLATES } from "../../lib/templates";
import { PALETTES } from "../../lib/palettes";
import { Button } from "@/components/ui/button";

export function TemplatePicker() {
  const report = useReportStore((s) => s.report);
  const setTemplateId = useReportStore((s) => s.setTemplateId);
  const setPaletteId = useReportStore((s) => s.setPaletteId);

  return (
    <div className="space-y-3 px-1">
      <section>
        <h3 className="mb-2 text-xs font-bold text-muted-foreground">模板</h3>
        <div className="grid grid-cols-2 gap-2">
          {TEMPLATES.map((t) => {
            const active = report.templateId === t.id;
            return (
              <button
                key={t.id}
                onClick={() => {
                  setTemplateId(t.id);
                  // 切模板時自動採用該模板的預設配色
                  if (t.defaultPaletteId !== report.paletteId) {
                    setPaletteId(t.defaultPaletteId);
                  }
                }}
                className={`flex flex-col items-start rounded-md border p-2 text-left transition-colors ${
                  active ? "border-primary bg-primary/5 ring-2 ring-primary/30" : "hover:border-primary/50"
                }`}
              >
                <span className="text-xs font-bold">{t.name}</span>
                <span className="mt-1 line-clamp-2 text-[10px] text-muted-foreground">{t.description}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-xs font-bold text-muted-foreground">配色</h3>
        <div className="grid grid-cols-3 gap-2">
          {PALETTES.map((p) => {
            const active = report.paletteId === p.id;
            return (
              <button
                key={p.id}
                onClick={() => setPaletteId(p.id)}
                title={p.name}
                className={`flex flex-col items-stretch overflow-hidden rounded-md border ${
                  active ? "ring-2 ring-primary/40" : ""
                }`}
              >
                <span style={{ backgroundColor: p.primary, height: 14 }} />
                <span style={{ backgroundColor: p.accent, height: 8 }} />
                <span style={{ backgroundColor: p.paper, height: 8 }} />
                <span className="px-1 py-0.5 text-[10px] text-muted-foreground">{p.name}</span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

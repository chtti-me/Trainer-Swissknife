"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import type { AuxiliaryDocs } from "@/lib/course-planner/schemas/form";
import { Megaphone, Mail, FileBox, ClipboardCheck } from "lucide-react";

export interface AuxiliaryDocsPanelProps {
  docs: AuxiliaryDocs;
}

export function AuxiliaryDocsPanel({ docs }: AuxiliaryDocsPanelProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">輔助文件</CardTitle>
        <div className="text-xs text-slate-500 dark:text-slate-400">
          這 4 份不會進開班計畫表，但可下載／複製給後續流程（EDM、課前通知等）使用。
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="promo">
          <TabsList className="grid grid-cols-4">
            <TabsTrigger value="promo" className="text-xs">
              <Megaphone className="h-3 w-3 mr-1" /> 課程文案
            </TabsTrigger>
            <TabsTrigger value="notification" className="text-xs">
              <Mail className="h-3 w-3 mr-1" /> 課前通知
            </TabsTrigger>
            <TabsTrigger value="materials" className="text-xs">
              <FileBox className="h-3 w-3 mr-1" /> 教材資源
            </TabsTrigger>
            <TabsTrigger value="assessment" className="text-xs">
              <ClipboardCheck className="h-3 w-3 mr-1" /> 課程評量
            </TabsTrigger>
          </TabsList>

          <TabsContent value="promo" className="space-y-2 mt-4">
            {docs.promo ? (
              <>
                <div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">標題</div>
                  <div className="font-medium">{docs.promo.title}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">一句話介紹</div>
                  <div>{docs.promo.shortIntro}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">完整介紹</div>
                  <div className="whitespace-pre-wrap text-sm">{docs.promo.fullDescription}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">學員效益</div>
                  <ul className="list-disc list-inside text-sm space-y-0.5">
                    {docs.promo.benefitBullets.map((b, i) => <li key={i}>{b}</li>)}
                  </ul>
                </div>
                <div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">CTA</div>
                  <div className="text-sm font-medium text-violet-700 dark:text-violet-300">{docs.promo.callToAction}</div>
                </div>
              </>
            ) : (
              <Empty />
            )}
          </TabsContent>

          <TabsContent value="notification" className="space-y-2 mt-4">
            {docs.notification ? (
              <>
                <div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">主旨</div>
                  <div className="font-medium">{docs.notification.subject}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">內文</div>
                  <pre className="whitespace-pre-wrap text-sm bg-slate-50 p-3 rounded border dark:bg-slate-800/60 dark:border-slate-700 dark:text-slate-100">{docs.notification.body}</pre>
                </div>
                <div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">課前準備清單</div>
                  <ul className="list-disc list-inside text-sm space-y-0.5">
                    {docs.notification.checklistBeforeClass.map((b, i) => <li key={i}>{b}</li>)}
                  </ul>
                </div>
              </>
            ) : (
              <Empty />
            )}
          </TabsContent>

          <TabsContent value="materials" className="space-y-3 mt-4">
            {docs.materials ? (
              <>
                <MaterialList title="投影片" items={docs.materials.slides} />
                <MaterialList title="講義" items={docs.materials.handouts} />
                <MaterialList title="範例檔" items={docs.materials.examples} />
                <MaterialList title="練習資料" items={docs.materials.exercises} />
              </>
            ) : (
              <Empty />
            )}
          </TabsContent>

          <TabsContent value="assessment" className="space-y-3 mt-4">
            {docs.assessment ? (
              <>
                {docs.assessment.preAssessment && (
                  <Field label="課前評估" value={docs.assessment.preAssessment} />
                )}
                <div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">課中實作任務</div>
                  <ul className="space-y-2">
                    {docs.assessment.inClassTasks.map((t, i) => (
                      <li key={i} className="border border-slate-200 dark:border-slate-700 rounded p-2">
                        <div className="font-medium text-sm">{t.name}</div>
                        <div className="text-xs text-slate-600 dark:text-slate-300 mt-1">{t.description}</div>
                        <div className="text-xs text-violet-700 dark:text-violet-300 mt-1">
                          <Badge variant="outline" className="text-[10px] mr-1">證明學會</Badge>
                          {t.evidenceOfLearning}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
                {docs.assessment.postAssessment && (
                  <Field label="課後評估" value={docs.assessment.postAssessment} />
                )}
                {docs.assessment.finalProject && (
                  <Field label="結業專案" value={docs.assessment.finalProject} />
                )}
                {docs.assessment.managerObservationForm && (
                  <Field label="主管觀察表" value={docs.assessment.managerObservationForm} />
                )}
              </>
            ) : (
              <Empty />
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function Empty() {
  return <div className="text-sm text-slate-400 dark:text-slate-500">尚未產出。</div>;
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">{label}</div>
      <div className="text-sm">{value}</div>
    </div>
  );
}

function MaterialList({ title, items }: { title: string; items: Array<{ name: string; purpose: string }> }) {
  if (items.length === 0) return null;
  return (
    <div>
      <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">{title}</div>
      <ul className="space-y-1 text-sm">
        {items.map((m, i) => (
          <li key={i} className="border-l-2 border-violet-300 dark:border-violet-600 pl-2">
            <div className="font-medium">{m.name}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">{m.purpose}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}

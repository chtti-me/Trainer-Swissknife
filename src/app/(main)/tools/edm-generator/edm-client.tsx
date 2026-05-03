"use client";

/**
 * 【EDM 產生器：整合用 client wrapper】
 *
 * 把 EDM-Generator 元件 (`<EdmGenerator />`) 嵌進培訓師瑞士刀的 (main) 版面，
 * 注入：
 *   - aiAdapter：透過 server proxy（OPENAI / GEMINI 走 server route）
 *   - settingsAdapter：NoopSettingsAdapter（不在 client 存任何 key）
 *   - hostConfig：隱藏設定面板 + 注入 AI 技能脈絡與品牌指示
 *   - initialPlan：從 ?classId={id} 動態抓取（fetch from-class API）
 *
 * 因為 (main)/layout.tsx 的 <main> 有 `p-6 overflow-auto`，
 * 我們用 `-m-6 h-[calc(100%+3rem)] overflow-hidden` 把 EDM Generator 撐回
 * 整個內容區，並阻止外層產生 scrollbar（內部捲動由 EDM 自己處理）。
 */

import { useEffect, useState } from "react";
import { EdmGenerator } from "@edm/index";
import type { HostConfig } from "@edm/index";
import type { SettingsAdapter } from "@edm/lib/settings/adapter";
import type { ClassPlan } from "@edm/types/classPlan";
import { trainerAcademyAiAdapter } from "@/lib/ai/edm-adapter";
import { setAiAdapter } from "@edm/lib/ai/registry";
import { setSettingsAdapter } from "@edm/lib/settings/registry";
import { useSettingsStore } from "@edm/store/settingsStore";
import { useToast } from "@/components/ui/toaster";

/**
 * 整合層專用 SettingsAdapter（不繼承 NoopSettingsAdapter，避免 TS contravariance 衝突）。
 *
 * - getSecret('gemini_api_key') 回傳非空字串 'server-proxy'，讓 settingsStore.geminiApiKey
 *   有值（truthy）。這是防禦性設計：即使 React Strict Mode 模擬卸載/重掛載導致
 *   AiAdapter 暫時從 registry 消失，hasGeminiKey() 仍可透過備用路徑回傳 true。
 * - 其他方法等同 noop（不實際儲存 key）。
 */
class TrainerAcademySettingsAdapter implements SettingsAdapter {
  async getSecret(key: string): Promise<string> {
    if (key === 'gemini_api_key') return 'server-proxy';
    return '';
  }
  async setSecret(): Promise<void> {
    // no-op
  }
  async deleteSecret(): Promise<void> {
    // no-op
  }
  supportsApiKeyUI(): boolean {
    return false;
  }
  describe(): { name: string } {
    return { name: '培訓師瑞士刀（伺服器代理）' };
  }
}

const settingsAdapter = new TrainerAcademySettingsAdapter();

// 模組載入時立即注入 adapter，確保使用者點選 AI 功能前已就緒（不依賴 React 渲染時序）
setAiAdapter(trainerAcademyAiAdapter);
setSettingsAdapter(settingsAdapter);

interface Props {
  initialPlan?: ClassPlan;
  skillsAppend: string;
  classId?: string;
  stockKeys?: { pexels: string; unsplash: string };
}

export function EdmClient({ initialPlan: initialPlanFromServer, skillsAppend, classId, stockKeys }: Props) {
  const [initialPlan, setInitialPlan] = useState<ClassPlan | undefined>(initialPlanFromServer);
  const { toast } = useToast();

  // 把從 server 傳入的圖庫 API Key 注入 settingsStore（僅在記憶體中，不存 localStorage）
  useEffect(() => {
    if (!stockKeys) return;
    const store = useSettingsStore.getState();
    if (stockKeys.pexels) store.setPexelsApiKey(stockKeys.pexels);
    if (stockKeys.unsplash) store.setUnsplashApiKey(stockKeys.unsplash);
  }, [stockKeys]);

  // 若 server 端尚未撈取（例如沒有 classId），但 client 端後續想透過 query 載入：
  // 目前路徑下 server 已負責，這個 effect 僅作為 future-proof（例如使用者改 URL 時）。
  useEffect(() => {
    if (initialPlanFromServer) {
      setInitialPlan(initialPlanFromServer);
      return;
    }
    if (!classId) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(
          `/api/tools/edm-generator/plan-from-class/${encodeURIComponent(classId)}`,
          { credentials: "include" }
        );
        if (!r.ok) {
          throw new Error((await r.json())?.error || `HTTP ${r.status}`);
        }
        const plan = (await r.json()) as ClassPlan;
        if (!cancelled) setInitialPlan(plan);
      } catch (err) {
        console.error("[EdmClient] 從班次帶入失敗：", err);
        toast(
          `從班次帶入失敗：${err instanceof Error ? err.message : "未知錯誤"}`,
          "error"
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [classId, initialPlanFromServer, toast]);

  const hostConfig: HostConfig = {
    hideSettingsPanel: true,
    poweredByLabel: "Powered by 培訓師瑞士刀",
    extraSystemInstructions: skillsAppend,
    extraImageInstructions: "Brand: Chunghwa Telecom navy & white.",
  };

  return (
    <div className="-m-6 h-[calc(100%+3rem)] overflow-hidden">
      <EdmGenerator
        aiAdapter={trainerAcademyAiAdapter}
        settingsAdapter={settingsAdapter}
        hostConfig={hostConfig}
        initialPlan={initialPlan}
      />
    </div>
  );
}

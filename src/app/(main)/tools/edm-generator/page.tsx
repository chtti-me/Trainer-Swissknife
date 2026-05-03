/**
 * 【EDM／DM 產生器】v4.1
 *
 * 整合 EDM-Generator v0.7.5+ 元件取代舊版三步驟卡片：
 *   - 完整視覺化編輯器（12 模板 / 10 配色 / 區塊拖曳 / RTE / 多版本切換）
 *   - 自動存檔（Autosave）+ 重置 EDM
 *   - AI 文案 + Hero 圖片生成（走 server proxy，client 不接觸 API Key）
 *   - 從班次直接帶入 ClassPlan（?classId=xxx）
 *
 * 此 page 為 Server Component：
 *   - 拿 next-auth session
 *   - 從 ?classId 撈班次並對映 ClassPlan
 *   - 組 AI 技能脈絡 prompt 注入文字
 *   - 把上述 props 交給 <EdmClient /> 渲染 <EdmGenerator />
 */
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildAiSkillPromptAppend } from "@/lib/ai-skills";
import { toClassPlan } from "@/lib/edm/from-db";
import type { ClassPlan } from "@edm/types/classPlan";
import { EdmClient } from "./edm-client";

export const dynamic = "force-dynamic";

export default async function EdmGeneratorPage({
  searchParams,
}: {
  searchParams: Promise<{ classId?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }
  const { classId } = await searchParams;

  let initialPlan: ClassPlan | undefined = undefined;
  if (classId) {
    try {
      const cls = await prisma.trainingClass.findUnique({ where: { id: classId } });
      if (cls) {
        initialPlan = toClassPlan(cls);
      }
    } catch (err) {
      console.error("[EDM page] 從班次帶入失敗：", err);
    }
  }

  const userId = (session.user as { id?: string }).id || "";
  const skillsAppend = userId ? await buildAiSkillPromptAppend(userId) : "";

  return (
    <EdmClient
      initialPlan={initialPlan}
      skillsAppend={skillsAppend}
      classId={classId}
      stockKeys={{
        pexels: process.env.PEXELS_API_KEY ?? "",
        unsplash: process.env.UNSPLASH_ACCESS_KEY ?? "",
      }}
    />
  );
}

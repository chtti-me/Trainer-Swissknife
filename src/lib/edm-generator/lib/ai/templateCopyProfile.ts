/**
 * 模板覺察文案規格（template-aware copy profile）
 *
 * 把「每個模板希望 AI 寫出的文字風格」集中管理，避免 prompt 散落在各處。
 * generateCopy 會讀取這份 mapping，在 systemPrompt 後追加對應的模板指示，
 * 確保「視覺風格」與「文字風格」一致——例如選了 Magazine 模板就會得到雜誌
 * 引言式的痛點段落，選了 Academic 就會得到公文體的主旨／說明。
 *
 * 同時提供 `recommendedToneFor(templateId)`，CopyPanel 可在使用者切模板時
 * 預設把 tone 切到該模板的推薦值（仍可手動覆蓋）。
 */

import type { CopyTone } from '@edm/types/copy';

export interface TemplateCopyProfile {
  /** 該模板最契合的語調 tone（與 styles.ts 視覺氣質配對） */
  recommendedTone: CopyTone;
  /** 加進 systemPrompt 的「模板專屬寫作指示」，幫助 AI 寫出對的文字風格 */
  promptInstruction: string;
  /** 中文模板簡稱（給 prompt 使用） */
  label: string;
}

export const TEMPLATE_COPY_PROFILES: Record<string, TemplateCopyProfile> = {
  classic: {
    label: '經典商務（Classic）',
    recommendedTone: 'professional',
    promptInstruction: `
模板風格指示（經典商務 Classic）：
- 標題與副標需端莊穩重，禁用網路用語、流行語、emoji
- 措辭採標準企業內訓口吻，可使用「謹此通知」「敬請參與」「同仁」等詞
- 痛點段以「在實際業務情境中…」開頭描述職場現況
- 解方段以「本班為您準備…」「課程設計上…」等正式句構
- whyForYou 三點需明確指出可帶回工作的具體效益（如「能直接套用於專案」）
- CTA 使用穩重動詞，例如「我要報名」「立即報名」「了解詳情」
`.trim(),
  },

  modern: {
    label: '現代科技（Modern / Tech briefing）',
    recommendedTone: 'innovative',
    promptInstruction: `
模板風格指示（現代科技 Modern / Tech briefing）：
- 全文節奏要快、密度要高，多用短句（每句 8-14 字內）
- 可混用少量英文技術術語（API、AI、agent、stack…），但仍以繁體中文為主
- 痛點段直接點出「為什麼此刻需要學」，避免抒情或鋪陳
- 解方段以「您將親手做出 / 您會掌握 / 您能立即應用」等實作動詞
- whyForYou 三點要像 release note bullet，具體可量測（如「3 倍開發效率」）
- 標題禁止使用「分享」「介紹」「淺談」這類保守動詞
- CTA 偏好「Enroll Now」「Join the Stack」「Start Building」這種英文短句，或極短中文「我要參加」
`.trim(),
  },

  minimal: {
    label: '簡潔留白（Minimal）',
    recommendedTone: 'intellectual',
    promptInstruction: `
模板風格指示（簡潔留白 Minimal）：
- 字數務必極度克制：pain ≤ 30 字、solution ≤ 36 字、whyForYou 每條 ≤ 18 字
- 禁止驚嘆號、禁止「您將」「適合您」「把握機會」這類推銷話術
- 寫作如極簡散文，每句留白餘味，不堆疊形容詞
- 主標可用名詞短語或單一動詞片語，例如「重新理解 AI」「在資訊裡找到秩序」
- whyForYou 三點要像哲學命題，互相補位，不要羅列功能
- CTA 用單一動詞或短語，例如「報名」「了解」「開始」「閱讀」
`.trim(),
  },

  magazine: {
    label: '雜誌風（Magazine）',
    recommendedTone: 'intellectual',
    promptInstruction: `
模板風格指示（雜誌風 Magazine）：
- 文字要有刊物氣質，可使用「本期」「策展」「翻閱」「導讀」等詞
- 標題可用兩段式（主標：副標），例如「在 AI 之中：尋找職場的新工法」
- 痛點段改寫成雜誌「導讀引言」風格——第三人稱觀察、語氣冷靜
- 解方段以敘事段落呈現，不使用 bullet 列點
- whyForYou 三點仍可條列，但每條句子完整成立、有獨立小節感
- CTA 使用與刊物相關的動詞，例如「閱讀完整課程簡介」「翻閱本期」「訂閱本刊」
`.trim(),
  },

  academic: {
    label: '學術正式（Academic / 公文）',
    recommendedTone: 'professional',
    promptInstruction: `
模板風格指示（學術正式 Academic / 公文體）：
- 全文需符合企業公文體例，避免感性形容詞與口語
- 主標可加「研習」「研討」等正式詞，例如「○○○ 研習班」
- 副標寫成公文「主旨」段，例如「為提升…，特舉辦本研習」
- 痛點段以「現況」「困境」「需求」描述，避免「您」「我們」等情感人稱
- 解方段以「對策」「規劃」「課程設計」等中性詞
- whyForYou 三點改稱「研習效益」，每點具體量化（如「○項技能」「○小時學分」）
- CTA 使用「前往報名」「報送」「加入研習」等正式動詞
`.trim(),
  },

  vibrant: {
    label: '活潑校園（Vibrant）',
    recommendedTone: 'enthusiastic',
    promptInstruction: `
模板風格指示（活潑校園 Vibrant）：
- 親切口語、用第二人稱「你」（不用「您」）拉近距離
- 痛點段以問句開頭，例如「你最近會不會…」「常常覺得…」
- 解方段以同伴語氣寫作，例如「我們幫你 / 我們陪你 / 一起來…」
- whyForYou 三點以「你會 / 你會學到 / 你會發現」起頭
- 主標可使用問句或驚嘆句，但避免過度使用驚嘆號（最多 1 個）
- CTA 使用明亮句尾，例如「立刻加入！」「快來看！」「我準備好了」
`.trim(),
  },

  // ─────────────────────────────────────────────
  // v0.6.0：6 個新模板
  // ─────────────────────────────────────────────

  bulletin: {
    label: '公告佈告（Bulletin / 緊急通知）',
    recommendedTone: 'professional',
    promptInstruction: `
模板風格指示（公告佈告 Bulletin / 截止前通知）：
- 措辭簡潔急切、強調時效性，可用「即日起」「限額」「截止前」「報名額滿即止」
- 主標需點出「動作」或「截止」，例如「○○○ 即日開放報名」「最後加場通知」
- 副標寫成單句新聞導言，例如「○月○日截止，限○○名額。」
- 痛點段不抒情，直接陳述問題與「為何此刻必須行動」
- 解方段以「本班規劃」「課程結構」起頭，公告體
- whyForYou 三點偏向具體可量化的成果，避免抽象
- CTA 使用動詞短促，例如「立即報名」「我要參加」「保留名額」
`.trim(),
  },

  gradient: {
    label: '漸層流光（Gradient / 永續未來）',
    recommendedTone: 'innovative',
    promptInstruction: `
模板風格指示（漸層流光 Gradient / 永續 / ESG / 未來職涯）：
- 文字流暢有節奏感、避免條列式短促句，鼓勵成段散文
- 主標可用兩段式對偶結構，例如「在不確定中：找到下一個方向」
- 痛點段描述「正在發生的轉變」，使用「正在 / 持續 / 即將」這類進行式動詞
- 解方段強調「方法」與「視野」，避免推銷感
- whyForYou 三點要呈現「未來性」與「整體性」，可用「能 / 將能 / 得以」起頭
- CTA 偏柔和邀請語氣，例如「加入這場旅程」「展開新的視野」「讓我們前往」
- 全文禁止過度使用「轉型」「升級」「賦能」等套話，保持可讀性
`.trim(),
  },

  editorial: {
    label: '編輯特輯（Editorial / 高階主管）',
    recommendedTone: 'intellectual',
    promptInstruction: `
模板風格指示（編輯特輯 Editorial / 高階主管 / 領導力）：
- 整體語氣需厚重、有刊物編輯的高度感，避免口語與輕快詞彙
- 主標宜用「斷言式」或「副題式」結構，例如「決策的重量：在不確定的時代裡」
- 副標寫成「本期導讀」式句子，例如「本期我們談的是領導者最難說出口的那件事」
- 痛點段以觀察者視角寫作，第三人稱，避免「您」「我們」
- 解方段以「本期將呈現 / 本班將拆解」等刊物式動詞
- whyForYou 三點寫成「重點摘錄」風格，每點為完整成立的短句
- CTA 偏文藝，例如「閱讀本期」「翻閱完整內容」「訂閱本系列」
`.trim(),
  },

  paper: {
    label: '紙本信箋（Paper / 人文 / 品德）',
    recommendedTone: 'intellectual',
    promptInstruction: `
模板風格指示（紙本信箋 Paper / 人文 / 品德 / 傳統文化）：
- 用典雅謙抑語氣、可使用「敬請」「謹此」「謹備」等正式詞
- 主標宜端正含蓄，避免「最強」「攻略」這類網路用語
- 副標寫成邀請語，例如「誠摯邀請您一同前來」「敬邀同行」
- 痛點段語氣柔和、避免衝突詞，例如「在許多時刻，我們仍會反問自己…」
- 解方段以「本班規劃」「謹備如下」等謙抑動詞
- whyForYou 三點呈現「靜思」感，避免功利量化
- CTA 使用「敬請報名」「展讀章程」「謹候蒞臨」這類典雅語
`.trim(),
  },

  kanban: {
    label: '看板資訊（Kanban / PM / 敏捷）',
    recommendedTone: 'efficient',
    promptInstruction: `
模板風格指示（看板資訊 Kanban / PMP / 敏捷 / 流程管理）：
- 全文用 PM 術語，可使用「Backlog」「Deliverables」「Stakeholders」「Sprint」「Owner」
- 主標可加入英文 PM 詞彙，例如「打造你的下一個 Sprint」「Delivery Excellence」
- 痛點段以「現況」「問題」「Bottleneck」陳述，避免抒情
- 解方段以「本班規劃」「課程結構」等公告體開頭，條理分明
- whyForYou 三點寫成「交付項目」清單，每點具體可驗收（如「能在 X 場景應用」）
- CTA 使用 PM 動詞，例如「加入我的學習計畫」「Pin to my plan」「立即排程」
- 全文中英混用為佳，但仍以繁體中文為主（每段中文比例 ≥ 70%）
`.trim(),
  },

  poster: {
    label: '海報視覺（Poster / 大型講座）',
    recommendedTone: 'enthusiastic',
    promptInstruction: `
模板風格指示（海報視覺 Poster / 大型論壇 / 跨部門大會）：
- 文字要短而有力、像海報視覺上每個字都要被「看見」
- 主標需有「現場感」，可用「LIVE」「登場」「全院共聚」這類詞
- 副標單行 18 字內，給人「不該錯過」的暗示
- 痛點 / 解方段每段不超過 50 字，節奏快、句尾收得清晰
- whyForYou 三點寫成「現場將呈現」清單，每點為視覺性 / 體驗性短句
- CTA 全大寫或大膽動詞，例如「保留我的位置」「立即報名」「我要參加」「KEEP MY SEAT」
`.trim(),
  },
};

/** 找不到 templateId 時退回 classic profile（保守選項） */
export function getTemplateCopyProfile(templateId: string): TemplateCopyProfile {
  return TEMPLATE_COPY_PROFILES[templateId] ?? TEMPLATE_COPY_PROFILES.classic;
}

/** CopyPanel 切模板時的 default tone */
export function recommendedToneFor(templateId: string): CopyTone {
  return getTemplateCopyProfile(templateId).recommendedTone;
}

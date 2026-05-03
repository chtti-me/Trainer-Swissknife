export type CopyTone =
  | 'enthusiastic'
  | 'professional'
  | 'friendly'
  | 'efficient'
  | 'intellectual'
  | 'innovative';

export const TONE_LABELS: Record<CopyTone, string> = {
  enthusiastic: '熱情積極',
  professional: '專業權威',
  friendly: '輕鬆友善',
  efficient: '強調效率',
  intellectual: '知性深度',
  innovative: '創新前衛',
};

export const TONE_HINTS: Record<CopyTone, string> = {
  enthusiastic: '充滿活力、鼓舞人心、具感染力，多用驚嘆語氣',
  professional: '正式、可信、條理分明，著重專業權威感',
  friendly: '親切口語、平易近人，像同事的真誠推薦',
  efficient: '直擊痛點、強調投入產出比與時間效益',
  intellectual: '探討本質、引用原則，文字節奏沉穩有思考性',
  innovative: '使用前沿術語、強調未來趨勢與突破性',
};

export interface GeneratedCopy {
  headline: string;
  subheadline: string;
  pain: string;
  solution: string;
  whyForYou: string[];
  cta: string;
}

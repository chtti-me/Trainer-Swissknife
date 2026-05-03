import { render } from '@react-email/render';
import { EmailTemplate, type EmailTemplateProps } from './EmailTemplate';
import { applyOutlookFixes } from './outlookFixes';
import { beautifyEdmHtml } from './beautify';
import * as React from 'react';

export interface RenderOpts {
  /** React Email 內建的「pretty」（控制 SSR 縮排）。多用於確保 outlookFixes 接到的 html 較好處理。 */
  pretty?: boolean;
  /**
   * 用 js-beautify 把最終 HTML 美化成易讀格式（含 inline `<style>` 內 CSS）。
   * 適合「複製 HTML」、「下載 HTML」、「ZIP 匯出」這類給人類閱讀／微調的場景。
   * 渲染結果與未美化版本完全等價（僅 whitespace 差異）。
   */
  beautify?: boolean;
  plainText?: boolean;
}

export async function renderEdmHtml(props: EmailTemplateProps, opts: RenderOpts = {}): Promise<string> {
  const html = await render(<EmailTemplate {...props} />, { pretty: opts.pretty ?? false });
  const fixed = applyOutlookFixes(html);
  return opts.beautify ? beautifyEdmHtml(fixed) : fixed;
}

export async function renderEdmPlainText(props: EmailTemplateProps): Promise<string> {
  return await render(<EmailTemplate {...props} />, { plainText: true });
}

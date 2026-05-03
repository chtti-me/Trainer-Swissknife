import {
  Body,
  Container,
  Head,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Tailwind,
  Text,
  Button as EmailButton,
} from '@react-email/components';
import * as React from 'react';
import type { Block, ClassDateBlock, ClassTimeBlock, CopyBlock, CtaBlock, CourseTableBlock, DividerBlock, FooterBlock, HeadlineBlock, HeroBlock, ImageBlock, InstructorBlock, SpacerBlock } from '@edm/types/blocks';
import type { ColorTokens, Typography } from '@edm/types/theme';
import type { TemplateStyle } from '@edm/types/template';
import { getTemplateStyle } from '@edm/lib/templates/styles';
import { formatDateList, type YearFormat } from '@edm/lib/utils/dates';
import {
  deriveScaleFromHex,
  isDarkHex,
  mixHex,
  readableOn,
} from '@edm/lib/theme/colorScale';
import {
  buildCornerBlobSvg,
  buildDiagonalBlocksSvg,
  buildGradientBarSvg,
  buildTriBandSvg,
  buildWaveDividerSvg,
} from '@edm/lib/theme/decorations';
import { computeCtaColors, getCtaRadiusPx, getCtaShadowCss, getCtaOpacity } from '@edm/lib/blocks/ctaColors';
import { computeHeroTextColors } from '@edm/lib/blocks/heroColors';
import { inlineCopyHtml } from '@edm/lib/blocks/copyInline';
import { prepareInstructorBio, injectParagraphMargin } from './prepareInstructorBio';
import { buildGoogleFontsUrl, getEssentialFonts } from '@edm/lib/fonts/registry';
import { HEADLINE_EFFECT_CSS } from './headlineEffects';
import { withEmojiFallbackTypography } from '@edm/lib/fonts/emojiFallback';

const WIDTH = 640;
const MOBILE_BREAKPOINT_PX = 480;

/**
 * v0.7.0：Hero 高度的有效值 = 使用者覆寫（block.height） ?? 模板預設（style.hero.imageHeight）。
 *
 * 在這之前，所有 hero variant 渲染都直接讀 style.hero.imageHeight，完全沒看 block.height
 * → 使用者在 BlockEditDialog 改高度永遠不會生效。這支函式集中修正此 bug，全 hero 渲染共用。
 */
function heroH(b: HeroBlock, s: TemplateStyle): number {
  return b.height ?? s.hero.imageHeight;
}

/**
 * 手機端響應式 CSS：Hybrid Responsive 模式
 *
 * 設計原則：
 * 1. 桌面樣式維持 inline，Outlook desktop 忽略 @media 但會吃 inline，自然顯示為 640px 寬
 * 2. 支援 @media 的客戶端（Gmail / Apple Mail / Outlook for iOS / Outlook.com / Yahoo / 預覽 iframe）
 *    在 ≤480px 時套用以下覆寫，配合 !important 才能蓋過 inline style
 * 3. 主容器 maxWidth:100% 已自然縮放；以下主要在做：
 *    a) 縮小 padding（避免兩側 inline 32-40px 把內容擠到剩 300px 以下）
 *    b) Magazine 左圖右文 → 上下堆疊
 *    c) Hero / Headline 字級縮小、行高調整
 *    d) CTA 變整列大按鈕（thumb-friendly）
 *    e) 課程表格 padding 縮小、講師欄退讓
 */
const RESPONSIVE_STYLE = `
  body { margin:0; padding:0; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; mso-line-height-rule:exactly; }
  table { border-collapse:collapse; mso-table-lspace:0pt; mso-table-rspace:0pt; }
  img { border:0; outline:none; text-decoration:none; -ms-interpolation-mode:bicubic; display:block; }
  .btn:hover { opacity:0.9; }

  @media only screen and (max-width: ${MOBILE_BREAKPOINT_PX}px) {
    /* 主容器強制 100% 寬 */
    .edm-container { width:100% !important; max-width:100% !important; }

    /*
     * Section padding（≤480px 手機）
     * v0.7.0.1：從 20px → 24px（≈ 1.5 個 16px 中文字寬），避免文字緊貼螢幕邊緣造成壓迫感。
     * 套用範圍：headline / paragraph / courseTable / instructor / classDate / classTime 等文字導向區塊。
     * 不影響：hero 圖片（滿版）、CTA wrap（自有 .edm-cta-wrap，維持 20px）、image 區塊（自有寬度）。
     */
    .edm-section { padding-left:24px !important; padding-right:24px !important; }
    .edm-section-tight { padding-left:24px !important; padding-right:24px !important; padding-top:12px !important; padding-bottom:12px !important; }

    /* Hero padding 縮小，避免大留白模板（Minimal）行不通；v0.7.0.1：tight 版水平也提升到 24px 與 .edm-section 一致 */
    .edm-hero-pad { padding:32px 24px !important; }
    .edm-hero-pad-tight { padding:24px 24px !important; }

    /* 多欄堆疊：左圖右文 → 上下排（Magazine hero / 教師資訊區等通用） */
    .edm-stack, .edm-stack > tbody, .edm-stack > tbody > tr { display:block !important; width:100% !important; }
    .edm-stack > tbody > tr > td { display:block !important; width:100% !important; box-sizing:border-box !important; }
    /* v0.7.0.1：堆疊文字 cell 水平 padding 同步提升到 24px（≈ 1.5 個中文字） */
    .edm-stack-cell { padding:16px 24px !important; }
    .edm-stack-cell-image { padding:0 !important; }
    .edm-stack-cell-image img { width:100% !important; max-width:100% !important; height:auto !important; }

    /* 字體尺寸縮放 */
    .edm-hero-title { font-size:30px !important; line-height:1.18 !important; letter-spacing:0 !important; }
    .edm-hero-title-lg { font-size:34px !important; line-height:1.15 !important; letter-spacing:0 !important; }
    .edm-hero-subtitle { font-size:15px !important; line-height:1.5 !important; }
    .edm-headline { font-size:22px !important; line-height:1.3 !important; letter-spacing:0 !important; }
    .edm-headline-sm { font-size:16px !important; }
    .edm-eyebrow { font-size:10px !important; letter-spacing:0.16em !important; }
    .edm-section-number { font-size:48px !important; }
    .edm-body-text { font-size:15px !important; line-height:1.7 !important; }

    /* CTA：手機改為整列大按鈕 */
    .edm-cta-wrap { padding-left:20px !important; padding-right:20px !important; }
    .edm-cta-btn { display:block !important; width:auto !important; max-width:none !important; padding-top:14px !important; padding-bottom:14px !important; font-size:16px !important; text-align:center !important; }

    /* 課程表格：padding 縮小，講師欄改為次要顯示 */
    .edm-th, .edm-td { padding:10px 8px !important; font-size:13px !important; }
    .edm-th-instructor, .edm-td-instructor { font-size:12px !important; }

    /* 上課日期/時間：標籤欄手機版字體微縮、padding-right 縮小，nowrap 已由 inline 處理 */
    .edm-meta-label { font-size:12px !important; padding-right:8px !important; letter-spacing:0.08em !important; }
    .edm-meta-value { font-size:13px !important; }

    /* 通用：強制單行不斷字（給短標籤、Email、電話等用） */
    .edm-nowrap { white-space:nowrap !important; }

    /* 通用工具 */
    .edm-hide-mobile { display:none !important; }
  }

  /* 超小螢幕（iPhone SE 等 320-360px） */
  @media only screen and (max-width: 360px) {
    .edm-hero-title { font-size:26px !important; }
    .edm-hero-title-lg { font-size:30px !important; }
    .edm-headline { font-size:20px !important; }
    .edm-section, .edm-cta-wrap { padding-left:16px !important; padding-right:16px !important; }
    .edm-stack-cell { padding:14px 16px !important; }
  }

  /*
   * v0.7.3：Headline 文字效果 CSS 從 src/lib/email/headlineEffects.ts 引入，
   * 確保 EmailTemplate 與 EditableCanvas 兩端用同一份 keyframes / class definitions。
   * 詳細的「漸進增強」設計理念 → headlineEffects.ts 檔案註解。
   */
  ${HEADLINE_EFFECT_CSS}
`;

export interface EmailTemplateProps {
  blocks: Block[];
  tokens: ColorTokens;
  typography: Typography;
  templateId: string;
  previewText?: string;
}

/** Render context：避免每個 block 渲染都重算一次衍生資料 */
interface RenderCtx {
  tokens: ColorTokens;
  typography: Typography;
  style: TemplateStyle;
  /** 由 primary 推導出的色階 */
  primaryScale: ReturnType<typeof deriveScaleFromHex>;
  /** 由 accent 推導出的色階 */
  accentScale: ReturnType<typeof deriveScaleFromHex>;
  /** 預先算好的 headline 編號表（block id → 第幾個 headline） */
  headlineNumberOf: Map<string, number>;
}

export function EmailTemplate({
  blocks,
  tokens,
  typography,
  templateId,
  previewText,
}: EmailTemplateProps): React.JSX.Element {
  const style = getTemplateStyle(templateId);
  const primaryScale = deriveScaleFromHex(tokens.primary);
  const accentScale = deriveScaleFromHex(tokens.accent);
  const isDarkBg = isDarkHex(tokens.bg);

  // v0.7.2：在入口一次性把所有 fontFamily stack 末端附加 emoji fallback。
  // 這樣 37 處 inline `style={{ fontFamily: typography.bodyFont }}` 完全不用改，
  // 但每一處的 stack 末端都會是 `..., Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji`，
  // 確保即便在 Win 7 / 舊 Outlook desktop 也能正確 render emoji 字元。
  const enrichedTypography = withEmojiFallbackTypography(typography);

  // 預先計算每個 headline 區塊的序號（給 Magazine 章節編號用）
  const headlineNumberOf = new Map<string, number>();
  let n = 0;
  for (const b of blocks) {
    if (b.type === 'headline') headlineNumberOf.set(b.id, ++n);
  }

  const ctx: RenderCtx = {
    tokens,
    typography: enrichedTypography,
    style,
    primaryScale,
    accentScale,
    headlineNumberOf,
  };

  return (
    <Html lang="zh-Hant">
      <Head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="x-apple-disable-message-reformatting" />
        <meta name="format-detection" content="telephone=no, date=no, address=no, email=no" />
        {/*
         * v0.7.2：嵌入 Google Fonts essentials（5 個字型）。
         *
         * 信件客戶端字型支援度：
         *   - Apple Mail / iOS Mail：完全支援 web font ✓
         *   - Gmail web / Gmail iOS / Gmail Android：支援 ✓
         *   - Outlook web (owa)：部分支援
         *   - Outlook desktop（Windows）：**不支援 web font** → fallback 到 stack 中
         *     第一個可用的 system font（cssFamily 都帶完整 fallback，所以 Outlook 也能讀）
         *
         * 我們在 EDM 匯出 HTML 時嵌入這 5 個 essentials 對應的 <link>，
         * 客戶端能讀就讀、不能讀就 fallback。
         */}
        <link
          rel="stylesheet"
          href={buildGoogleFontsUrl(getEssentialFonts().map((f) => f.id)) ?? ''}
        />
        {/*
         * 用 dangerouslySetInnerHTML 而非 children 多行字串，避免 React 18 SSR 把多行 text 拆成多個 node、
         * 觸發 streaming Suspense reveal 機制（會塞 $RC/$RS script），iframe srcDoc 內執行該 script 時找不到對應節點 → 整個 EDM 隱藏在 hidden div 中。
         */}
        <style
          dangerouslySetInnerHTML={{
            __html: `a { color: ${tokens.primary}; text-decoration: none; }\n${RESPONSIVE_STYLE}`,
          }}
        />
      </Head>
      {previewText && <Preview>{previewText}</Preview>}
      <Tailwind>
        <Body
          style={{
            margin: 0,
            padding: 0,
            backgroundColor: isDarkBg ? tokens.bg : '#F1F4F8',
            fontFamily: enrichedTypography.bodyFont,
            color: tokens.textPrimary,
          }}
        >
          <Container
            className="edm-container"
            style={{
              width: WIDTH,
              maxWidth: '100%',
              margin: '0 auto',
              backgroundColor: tokens.bg,
              padding: 0,
            }}
          >
            {blocks.map((b) => (
              <BlockRenderer key={b.id} block={b} ctx={ctx} />
            ))}
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}

/**
 * v0.4.2.1：當 block 帶 `tokensOverride` 時，merge 出 per-block ctx，並且**重算衍生色階**。
 *
 * 重點：不能只 merge `ctx.tokens`，因為 `RenderCtx.primaryScale` / `accentScale` 是用 tokens
 * 預先衍生的色階。沒重算的話，雖然 tokens.primary 變了，但 hero 的淡背景、accent rule 等
 * 用 scale 的地方仍會用全域舊色，視覺會出現不一致。
 */
function deriveBlockCtx(block: Block, ctx: RenderCtx): RenderCtx {
  if (!block.tokensOverride) return ctx;
  const merged: ColorTokens = { ...ctx.tokens, ...block.tokensOverride };
  return {
    ...ctx,
    tokens: merged,
    primaryScale: deriveScaleFromHex(merged.primary),
    accentScale: deriveScaleFromHex(merged.accent),
  };
}

function BlockRenderer({ block, ctx }: { block: Block; ctx: RenderCtx }): React.JSX.Element | null {
  const c = deriveBlockCtx(block, ctx);
  switch (block.type) {
    case 'hero':
      return <HeroRenderer block={block} ctx={c} />;
    case 'headline':
      return <HeadlineRenderer block={block} ctx={c} />;
    case 'copy':
      return <CopyRenderer block={block} ctx={c} />;
    case 'courseTable':
      return <CourseTableRenderer block={block} ctx={c} />;
    case 'instructor':
      return <InstructorRenderer block={block} ctx={c} />;
    case 'cta':
      return <CtaRenderer block={block} ctx={c} />;
    case 'image':
      return <ImageRenderer block={block} ctx={c} />;
    case 'divider':
      return <DividerRenderer block={block} ctx={c} />;
    case 'spacer':
      return <SpacerRenderer block={block} />;
    case 'classDate':
      return <ClassDateRenderer block={block} ctx={c} />;
    case 'classTime':
      return <ClassTimeRenderer block={block} ctx={c} />;
    case 'footer':
      return <FooterRenderer block={block} ctx={c} />;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------

function HeroRenderer({ block, ctx }: { block: HeroBlock; ctx: RenderCtx }): React.JSX.Element {
  const v = ctx.style.hero.variant;
  switch (v) {
    case 'modern':
      return <HeroModern block={block} ctx={ctx} />;
    case 'minimal':
      return <HeroMinimal block={block} ctx={ctx} />;
    case 'magazine':
      return <HeroMagazine block={block} ctx={ctx} />;
    case 'academic':
      return <HeroAcademic block={block} ctx={ctx} />;
    case 'vibrant':
      return <HeroVibrant block={block} ctx={ctx} />;
    case 'classic':
    default:
      return <HeroClassic block={block} ctx={ctx} />;
  }
}

/** Classic：滿版圖 + 底部 secondary 色塊容納標題；金色細線分隔 */
function HeroClassic({ block, ctx }: { block: HeroBlock; ctx: RenderCtx }): React.JSX.Element {
  const { tokens, style, typography } = ctx;
  // v0.4.3：title / subtitle / eyebrow 改用 computeHeroTextColors，使用者明確覆寫 textPrimary / textSecondary 一律勝出
  const heroColors = computeHeroTextColors(block, tokens, 'classic');
  return (
    <Section style={{ padding: 0 }}>
      {block.image ? (
        <Img
          src={block.image}
          alt=""
          width={WIDTH}
          height={heroH(block, style)}
          style={{ width: '100%', height: heroH(block, style), objectFit: 'cover', display: 'block' }}
        />
      ) : (
        <div
          style={{
            background: `linear-gradient(135deg, ${tokens.primary} 0%, ${tokens.secondary} 100%)`,
            height: heroH(block, style),
            width: '100%',
          }}
        />
      )}
      {(block.eyebrow || block.title || block.subtitle) && (
        <div
          className="edm-hero-pad-tight"
          style={{ padding: '24px 32px', backgroundColor: tokens.secondary, textAlign: 'center' as const }}
        >
          {block.eyebrow && (
            <Text
              className="edm-eyebrow"
              style={{
                margin: 0,
                color: heroColors.eyebrow,
                fontSize: 11,
                letterSpacing: '0.22em',
                fontWeight: 600,
                textTransform: 'uppercase',
              }}
            >
              · {block.eyebrow} ·
            </Text>
          )}
          {block.title && (
            <Text
              className="edm-hero-title-lg"
              style={{
                margin: block.eyebrow ? '10px 0 0 0' : 0,
                color: heroColors.title,
                fontSize: style.hero.titleSize,
                fontWeight: style.hero.titleWeight,
                lineHeight: 1.2,
                letterSpacing: `${style.hero.titleLetterSpacing}em`,
                fontFamily: typography.headingFont,
              }}
            >
              {block.title}
            </Text>
          )}
          {style.hero.showAccentRule && (
            <div
              style={{
                width: 48,
                height: 1,
                backgroundColor: tokens.accent,
                margin: '14px auto',
              }}
            />
          )}
          {block.subtitle && (
            <Text
              className="edm-hero-subtitle"
              style={{
                margin: 0,
                color: heroColors.subtitle,
                fontSize: style.hero.subtitleSize,
                letterSpacing: '0.04em',
              }}
            >
              {block.subtitle}
            </Text>
          )}
        </div>
      )}
    </Section>
  );
}

/** Modern：深底 + 角落漸層光暈 + 大膽白色標題 */
function HeroModern({ block, ctx }: { block: HeroBlock; ctx: RenderCtx }): React.JSX.Element {
  const { tokens, style, typography } = ctx;
  // v0.4.3：title 預設白字、subtitle 預設衍生灰白；使用者明確覆寫一律勝出
  const heroColors = computeHeroTextColors(block, tokens, 'modern');
  const blobUrl = buildCornerBlobSvg(tokens.primary, tokens.accent, WIDTH, heroH(block, style));
  return (
    <Section style={{ padding: 0 }}>
      <table
        role="presentation"
        cellPadding={0}
        cellSpacing={0}
        border={0}
        width="100%"
        style={{ width: '100%', backgroundColor: tokens.secondary }}
      >
        <tbody>
          <tr>
            <td
              style={{
                position: 'relative' as const,
                padding: 0,
                backgroundColor: tokens.secondary,
                backgroundImage: `url("${blobUrl}")`,
                backgroundRepeat: 'no-repeat',
                backgroundSize: '100% 100%',
              }}
              height={block.image ? heroH(block, style) : heroH(block, style) + 60}
            >
              {block.image && (
                <Img
                  src={block.image}
                  alt=""
                  width={WIDTH}
                  height={heroH(block, style)}
                  style={{
                    width: '100%',
                    height: heroH(block, style),
                    objectFit: 'cover',
                    display: 'block',
                    opacity: 0.55,
                  }}
                />
              )}
            </td>
          </tr>
          {(block.eyebrow || block.title || block.subtitle) && (
            <tr>
              <td
                className="edm-hero-pad-tight"
                style={{ padding: '28px 32px 32px 32px', backgroundColor: tokens.secondary }}
              >
                {block.eyebrow && (
                  <span
                    className="edm-eyebrow"
                    style={{
                      display: 'inline-block',
                      backgroundColor: tokens.accent,
                      color: heroColors.eyebrow,
                      padding: '4px 12px',
                      borderRadius: 999,
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: '0.16em',
                      textTransform: 'uppercase',
                    }}
                  >
                    {block.eyebrow}
                  </span>
                )}
                {block.title && (
                  <Text
                    className="edm-hero-title-lg"
                    style={{
                      margin: block.eyebrow ? '14px 0 0 0' : 0,
                      color: heroColors.title,
                      fontSize: style.hero.titleSize,
                      fontWeight: style.hero.titleWeight,
                      lineHeight: 1.15,
                      letterSpacing: `${style.hero.titleLetterSpacing}em`,
                      fontFamily: typography.headingFont,
                    }}
                  >
                    {block.title}
                  </Text>
                )}
                {block.subtitle && (
                  <Text
                    className="edm-hero-subtitle"
                    style={{
                      margin: '8px 0 0 0',
                      color: heroColors.subtitle,
                      fontSize: style.hero.subtitleSize,
                      fontFamily: typography.accentFont ?? typography.bodyFont,
                      letterSpacing: '0.06em',
                    }}
                  >
                    {block.subtitle}
                  </Text>
                )}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </Section>
  );
}

/** Minimal：沒有大圖，超大留白 + 細字大標題 + 細水平線 */
function HeroMinimal({ block, ctx }: { block: HeroBlock; ctx: RenderCtx }): React.JSX.Element {
  const { tokens, style, typography } = ctx;
  // v0.4.3：title / subtitle 改用 computeHeroTextColors（minimal 預設用 textPrimary / textSecondary）
  const heroColors = computeHeroTextColors(block, tokens, 'minimal');
  return (
    <Section style={{ padding: 0 }}>
      <div
        className="edm-hero-pad"
        style={{ padding: '64px 48px 48px 48px', textAlign: 'left' as const }}
      >
        {block.eyebrow && (
          <Text
            className="edm-eyebrow"
            style={{
              margin: 0,
              fontSize: 11,
              letterSpacing: '0.32em',
              color: heroColors.eyebrow,
              fontWeight: 600,
              textTransform: 'uppercase',
            }}
          >
            {block.eyebrow}
          </Text>
        )}
        {block.title && (
          <Text
            className="edm-hero-title-lg"
            style={{
              margin: block.eyebrow ? '24px 0 0 0' : 0,
              color: heroColors.title,
              fontSize: style.hero.titleSize,
              fontWeight: style.hero.titleWeight,
              lineHeight: 1.15,
              fontFamily: typography.displayFont ?? typography.headingFont,
            }}
          >
            {block.title}
          </Text>
        )}
        {block.subtitle && (
          <Text
            className="edm-hero-subtitle"
            style={{
              margin: '12px 0 0 0',
              color: heroColors.subtitle,
              fontSize: style.hero.subtitleSize,
              letterSpacing: '0.04em',
            }}
          >
            {block.subtitle}
          </Text>
        )}
        <div style={{ width: 64, height: 1, backgroundColor: heroColors.title, marginTop: 32 }} />
      </div>
      {block.image && (
        <div className="edm-hero-pad-tight" style={{ padding: '0 48px 48px 48px' }}>
          <Img
            src={block.image}
            alt=""
            width={WIDTH - 96}
            height={heroH(block, style)}
            style={{
              width: '100%',
              height: heroH(block, style),
              objectFit: 'cover',
              display: 'block',
            }}
          />
        </div>
      )}
    </Section>
  );
}

/** Magazine：左圖右文不對稱 + 巨型 ISSUE 編號 */
function HeroMagazine({ block, ctx }: { block: HeroBlock; ctx: RenderCtx }): React.JSX.Element {
  const { tokens, style, typography } = ctx;
  // v0.4.3：title / subtitle / eyebrow 改用 computeHeroTextColors
  const heroColors = computeHeroTextColors(block, tokens, 'magazine');
  return (
    <Section style={{ padding: 0 }}>
      {/* 上半部：ISSUE 字樣 */}
      <table role="presentation" cellPadding={0} cellSpacing={0} border={0} width="100%">
        <tbody>
          <tr>
            <td
              className="edm-section-tight"
              style={{
                padding: '36px 40px 12px 40px',
                borderBottom: `1px solid ${tokens.border}`,
                fontFamily: typography.accentFont ?? typography.headingFont,
              }}
            >
              <table role="presentation" width="100%">
                <tbody>
                  <tr>
                    <td
                      style={{
                        fontSize: 11,
                        letterSpacing: '0.24em',
                        color: heroColors.eyebrow,
                        textTransform: 'uppercase',
                        fontWeight: 700,
                      }}
                    >
                      {block.eyebrow || 'ISSUE · COURSE'}
                    </td>
                    <td
                      align="right"
                      style={{
                        fontSize: 11,
                        letterSpacing: '0.24em',
                        color: heroColors.eyebrow,
                        textTransform: 'uppercase',
                      }}
                    >
                      中華電信學院
                    </td>
                  </tr>
                </tbody>
              </table>
            </td>
          </tr>
        </tbody>
      </table>
      {/* 主體：左圖右文（手機端透過 .edm-stack 自動堆疊為上下排） */}
      <table
        className="edm-stack"
        role="presentation"
        cellPadding={0}
        cellSpacing={0}
        border={0}
        width="100%"
      >
        <tbody>
          <tr>
            <td
              className="edm-stack-cell-image"
              width={260}
              style={{ verticalAlign: 'top' as const, padding: '32px 0 32px 40px' }}
            >
              {block.image ? (
                <Img
                  src={block.image}
                  alt=""
                  width={240}
                  height={heroH(block, style)}
                  style={{ width: 240, height: heroH(block, style), objectFit: 'cover', display: 'block' }}
                />
              ) : (
                <div
                  style={{
                    width: 240,
                    height: heroH(block, style),
                    background: `linear-gradient(135deg, ${tokens.primary} 0%, ${tokens.accent} 100%)`,
                  }}
                />
              )}
            </td>
            <td
              className="edm-stack-cell"
              style={{ verticalAlign: 'top' as const, padding: '32px 40px 32px 24px' }}
            >
              {block.title && (
                <Text
                  className="edm-hero-title-lg"
                  style={{
                    margin: 0,
                    color: heroColors.title,
                    fontSize: style.hero.titleSize,
                    fontWeight: style.hero.titleWeight,
                    lineHeight: 1.1,
                    letterSpacing: `${style.hero.titleLetterSpacing}em`,
                    fontFamily: typography.displayFont ?? typography.headingFont,
                  }}
                >
                  {block.title}
                </Text>
              )}
              {block.subtitle && (
                <Text
                  className="edm-hero-subtitle"
                  style={{
                    margin: '14px 0 0 0',
                    color: heroColors.subtitle,
                    fontSize: style.hero.subtitleSize,
                    fontFamily: typography.accentFont ?? typography.bodyFont,
                    letterSpacing: '0.04em',
                  }}
                >
                  — {block.subtitle}
                </Text>
              )}
            </td>
          </tr>
        </tbody>
      </table>
    </Section>
  );
}

/** Academic：頂部三色彩帶 + 公文表頭 + 班代號欄位 */
function HeroAcademic({ block, ctx }: { block: HeroBlock; ctx: RenderCtx }): React.JSX.Element {
  const { tokens, style, typography } = ctx;
  // v0.4.3：academic 班代號（subtitle 位置）預設用 tokens.primary 強調，但使用者覆寫 textSecondary 一律勝出
  const heroColors = computeHeroTextColors(block, tokens, 'academic');
  const triBand = buildTriBandSvg(tokens.primary, tokens.accent, tokens.secondary, WIDTH, 6);
  return (
    <Section style={{ padding: 0 }}>
      {/* 頂部三色色帶 */}
      <Img src={triBand} alt="" width={WIDTH} height={6} style={{ width: '100%', height: 6, display: 'block' }} />

      {/* 公文表頭 */}
      <table role="presentation" cellPadding={0} cellSpacing={0} border={0} width="100%">
        <tbody>
          <tr>
            <td
              className="edm-section-tight edm-eyebrow"
              style={{
                padding: '14px 32px',
                borderBottom: `1px solid ${tokens.border}`,
                backgroundColor: tokens.surface,
                fontSize: 12,
                color: heroColors.eyebrow,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                fontWeight: 700,
              }}
            >
              {block.eyebrow || '公告 NOTICE'}
              {block.subtitle && (
                <span style={{ float: 'right' as const, color: heroColors.subtitle, fontWeight: 700 }}>
                  {block.subtitle}
                </span>
              )}
            </td>
          </tr>
        </tbody>
      </table>

      {/* 主視覺圖 */}
      {block.image ? (
        <Img
          src={block.image}
          alt=""
          width={WIDTH}
          height={heroH(block, style)}
          style={{ width: '100%', height: heroH(block, style), objectFit: 'cover', display: 'block' }}
        />
      ) : (
        <div
          style={{
            background: `linear-gradient(135deg, ${tokens.primary} 0%, ${tokens.secondary} 100%)`,
            height: heroH(block, style),
            width: '100%',
          }}
        />
      )}

      {/* 標題區 */}
      <div className="edm-hero-pad-tight" style={{ padding: '24px 32px', textAlign: 'center' as const }}>
        {block.title && (
          <Text
            className="edm-hero-title"
            style={{
              margin: 0,
              color: heroColors.title,
              fontSize: style.hero.titleSize,
              fontWeight: style.hero.titleWeight,
              lineHeight: 1.3,
              letterSpacing: `${style.hero.titleLetterSpacing}em`,
              fontFamily: typography.headingFont,
            }}
          >
            {block.title}
          </Text>
        )}
        {style.hero.showAccentRule && (
          <div
            style={{
              width: 64,
              height: 2,
              backgroundColor: tokens.accent,
              margin: '14px auto 0 auto',
            }}
          />
        )}
      </div>
    </Section>
  );
}

/** Vibrant：彩色斜切色塊 hero + 大膽圓潤標題 */
function HeroVibrant({ block, ctx }: { block: HeroBlock; ctx: RenderCtx }): React.JSX.Element {
  const { tokens, style, typography } = ctx;
  // v0.4.3：title / subtitle / eyebrow 改用 computeHeroTextColors
  const heroColors = computeHeroTextColors(block, tokens, 'vibrant');
  const bgUrl = block.image
    ? undefined
    : buildDiagonalBlocksSvg(tokens.primary, tokens.secondary, tokens.accent, WIDTH, heroH(block, style));

  return (
    <Section style={{ padding: 0 }}>
      <table role="presentation" cellPadding={0} cellSpacing={0} border={0} width="100%">
        <tbody>
          <tr>
            <td
              height={heroH(block, style)}
              style={{
                position: 'relative' as const,
                backgroundColor: tokens.primary,
                backgroundImage: bgUrl ? `url("${bgUrl}")` : undefined,
                backgroundRepeat: 'no-repeat',
                backgroundSize: '100% 100%',
              }}
            >
              {block.image && (
                <Img
                  src={block.image}
                  alt=""
                  width={WIDTH}
                  height={heroH(block, style)}
                  style={{
                    width: '100%',
                    height: heroH(block, style),
                    objectFit: 'cover',
                    display: 'block',
                  }}
                />
              )}
            </td>
          </tr>
          <tr>
            <td
              className="edm-hero-pad-tight"
              style={{ padding: '24px 32px 28px 32px', backgroundColor: tokens.bg }}
            >
              {block.eyebrow && (
                <span
                  className="edm-eyebrow"
                  style={{
                    display: 'inline-block',
                    backgroundColor: tokens.accent,
                    color: heroColors.eyebrow,
                    padding: '6px 14px',
                    borderRadius: 999,
                    fontSize: 12,
                    fontWeight: 700,
                    letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                  }}
                >
                  {block.eyebrow}
                </span>
              )}
              {block.title && (
                <Text
                  className="edm-hero-title-lg"
                  style={{
                    margin: block.eyebrow ? '14px 0 0 0' : 0,
                    color: heroColors.title,
                    fontSize: style.hero.titleSize,
                    fontWeight: style.hero.titleWeight,
                    lineHeight: 1.15,
                    letterSpacing: `${style.hero.titleLetterSpacing}em`,
                    fontFamily: typography.headingFont,
                  }}
                >
                  {block.title}
                </Text>
              )}
              {block.subtitle && (
                <Text
                  className="edm-hero-subtitle"
                  style={{
                    margin: '8px 0 0 0',
                    color: heroColors.subtitle,
                    fontSize: style.hero.subtitleSize,
                  }}
                >
                  {block.subtitle}
                </Text>
              )}
            </td>
          </tr>
        </tbody>
      </table>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Headline
// ---------------------------------------------------------------------------

function HeadlineRenderer({ block, ctx }: { block: HeadlineBlock; ctx: RenderCtx }): React.JSX.Element {
  const { tokens, typography, style } = ctx;
  const sizeMap = { sm: 14, md: 18, lg: 24, xl: 30 } as const;
  // v0.7.3：customSize 完全覆蓋 size 對應的 sizeMap 值
  const baseSize = block.customSize ?? sizeMap[block.size ?? 'lg'];
  const align = block.align || style.headline.align;
  const sectionNumber = style.headline.showSectionNumber
    ? pad2(ctx.headlineNumberOf.get(block.id) ?? 1)
    : null;
  const eyebrowFontFamily =
    style.id === 'magazine' ? typography.accentFont ?? typography.headingFont : typography.bodyFont;
  const titleFontFamily = style.headline.useDisplayFont
    ? typography.displayFont ?? typography.headingFont
    : typography.headingFont;

  const isSmall = (block.size ?? 'lg') === 'sm';

  // v0.7.3：色彩覆寫 —— 三段都各自獨立可覆寫
  const titleColor = block.color ?? tokens.textPrimary;
  const subtitleColor = block.subtitleColor ?? tokens.textSecondary;
  const eyebrowColor = block.eyebrowColor ?? tokens.accent;
  const titleWeight = block.weight ?? style.headline.weight;

  // v0.7.3：effect className —— 對應 RESPONSIVE_STYLE 中注入的 keyframes
  const effectClassName = block.effect && block.effect !== 'none'
    ? `edm-effect-${block.effect}`
    : '';

  // gradient-text 需要 background-image 才能 background-clip:text 出色
  // 用 primary → accent 的漸層，跟 CTA gradient 預設一致
  const gradientTextStyle: React.CSSProperties = block.effect === 'gradient-text'
    ? {
        backgroundImage: `linear-gradient(135deg, ${tokens.primary} 0%, ${tokens.accent} 100%)`,
        // 關鍵：Outlook desktop 不支援 background-clip:text 會 fallback 到 color，
        // 所以這個 inline color 不能丟，否則 Outlook 看到的是 color:transparent 變空白
        // → 我們不在 inline 設 color:transparent，改用 className edm-effect-gradient-text 加 !important
      }
    : {};

  return (
    <Section
      className="edm-section"
      style={{
        padding: `${style.section.paddingY}px ${style.section.paddingX}px 8px ${style.section.paddingX}px`,
        textAlign: align as React.CSSProperties['textAlign'],
      }}
    >
      {sectionNumber && (
        <Text
          className="edm-section-number"
          style={{
            margin: 0,
            fontSize: 64,
            lineHeight: 1,
            color: tokens.accent,
            fontFamily: typography.displayFont ?? typography.headingFont,
            opacity: 0.18,
            fontWeight: 700,
          }}
        >
          {sectionNumber}
        </Text>
      )}

      {/* v0.7.3：eyebrow（小肩標）—— 視覺上比 title 小、比 subtitle 更強調，常用於章節標籤 */}
      {block.eyebrow && (
        <Text
          className="edm-eyebrow"
          style={{
            margin: sectionNumber ? '-12px 0 6px 0' : '0 0 6px 0',
            fontSize: 11,
            letterSpacing: '0.18em',
            textTransform: 'uppercase' as const,
            fontWeight: 700,
            color: eyebrowColor,
            fontFamily: eyebrowFontFamily,
          }}
        >
          {block.eyebrow}
        </Text>
      )}

      <Text
        className={[
          isSmall ? 'edm-headline-sm' : 'edm-headline',
          effectClassName,
        ].filter(Boolean).join(' ')}
        style={{
          // 有 eyebrow 時 margin-top 縮小（因為 eyebrow 已撐開空間）；
          // 否則維持原行為（有 sectionNumber 拉回 -16px）
          margin: block.eyebrow ? 0 : sectionNumber ? '-16px 0 0 0' : 0,
          fontSize: baseSize,
          fontWeight: titleWeight,
          letterSpacing: `${style.headline.letterSpacing}em`,
          lineHeight: 1.3,
          color: titleColor,
          fontFamily: titleFontFamily,
          fontStyle: style.id === 'magazine' && isSmall ? ('italic' as const) : ('normal' as const),
          ...gradientTextStyle,
        }}
      >
        {block.text}
      </Text>

      {style.headline.showAccentRule && (
        <div
          style={{
            width: 36,
            height: 2,
            backgroundColor: tokens.accent,
            margin: align === 'center' ? '12px auto 0 auto' : '12px 0 0 0',
          }}
        />
      )}

      {block.subtitle && (
        <Text
          style={{
            margin: '10px 0 0 0',
            color: subtitleColor,
            fontSize: 14,
            lineHeight: 1.6,
            fontFamily: eyebrowFontFamily,
          }}
        >
          {block.subtitle}
        </Text>
      )}
    </Section>
  );
}

const pad2 = (n: number): string => String(n).padStart(2, '0');

// ---------------------------------------------------------------------------
// Copy
// ---------------------------------------------------------------------------

function CopyRenderer({ block, ctx }: { block: CopyBlock; ctx: RenderCtx }): React.JSX.Element {
  const { tokens, typography, style } = ctx;
  return (
    <Section className="edm-section" style={{ padding: `12px ${style.section.paddingX}px` }}>
      <div
        className="edm-body-text"
        style={{
          color: tokens.textPrimary,
          fontSize: typography.baseSize,
          lineHeight: 1.75,
          fontFamily: typography.bodyFont,
        }}
        dangerouslySetInnerHTML={{ __html: inlineCopyHtml(block.html, tokens) }}
      />
    </Section>
  );
}

// v0.7.4.3：sanitizeCopy 拆出至 src/lib/blocks/copyInline.ts 並重新命名為 inlineCopyHtml。
// 拆出原因：EditableCanvas 的「編輯模式」、本 EmailTemplate 的「預覽 / 匯出」、RTE 的「編輯器內」
// 三端要視覺一致，必須共用同一條 inline style 注入邏輯。詳見 copyInline.ts 檔頭說明。

// ---------------------------------------------------------------------------
// CourseTable
// ---------------------------------------------------------------------------

function CourseTableRenderer({
  block,
  ctx,
}: {
  block: CourseTableBlock;
  ctx: RenderCtx;
}): React.JSX.Element {
  switch (ctx.style.courseTable) {
    case 'card':
      return <CourseTableCard block={block} ctx={ctx} />;
    case 'banded':
      return <CourseTableBanded block={block} ctx={ctx} />;
    case 'minimal':
      return <CourseTableMinimal block={block} ctx={ctx} />;
    case 'formal':
      return <CourseTableFormal block={block} ctx={ctx} />;
    case 'classic':
    default:
      return <CourseTableClassic block={block} ctx={ctx} />;
  }
}

function SectionTitle({ children, ctx }: { children: React.ReactNode; ctx: RenderCtx }): React.JSX.Element {
  const { tokens } = ctx;
  return (
    <Text
      style={{
        margin: '0 0 10px 0',
        fontSize: 12,
        letterSpacing: '0.18em',
        color: tokens.accent,
        fontWeight: 700,
        textTransform: 'uppercase',
      }}
    >
      {children}
    </Text>
  );
}

function CourseTableClassic({
  block,
  ctx,
}: {
  block: CourseTableBlock;
  ctx: RenderCtx;
}): React.JSX.Element {
  const { tokens, style } = ctx;
  return (
    <Section className="edm-section" style={{ padding: `16px ${style.section.paddingX}px` }}>
      <SectionTitle ctx={ctx}>· 課程內容 ·</SectionTitle>
      <table
        role="presentation"
        cellPadding={0}
        cellSpacing={0}
        border={0}
        width="100%"
        style={{
          borderCollapse: 'collapse',
          border: `1px solid ${tokens.border}`,
        }}
      >
        <thead>
          <tr style={{ backgroundColor: tokens.surface }}>
            <th align="left" style={thStyle(tokens)}>
              課程
            </th>
            <th align="center" style={{ ...thStyle(tokens), width: 60 }}>
              時數
            </th>
            {block.showInstructor && (
              <th align="left" style={{ ...thStyle(tokens), width: 100 }}>
                主講
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {block.courses.map((c, i) => (
            <tr key={i}>
              <td style={tdStyle(tokens)}>
                {c.name}
                {block.showCode !== false && c.code && (
                  <span style={{ color: tokens.textSecondary, fontSize: 11, marginLeft: 8 }}>{c.code}</span>
                )}
              </td>
              <td align="center" style={tdStyle(tokens)}>
                {c.hours}
              </td>
              {block.showInstructor && (
                <td style={{ ...tdStyle(tokens), color: tokens.textSecondary, fontSize: 13 }}>
                  {c.instructor || '—'}
                </td>
              )}
            </tr>
          ))}
          {typeof block.totalHours === 'number' && (
            <tr style={{ backgroundColor: tokens.surface }}>
              <td style={{ padding: '10px 12px', fontSize: 13, fontWeight: 700 }}>合計</td>
              <td align="center" style={{ padding: '10px 12px', fontSize: 13, fontWeight: 700 }}>
                {block.totalHours}
              </td>
              {block.showInstructor && <td />}
            </tr>
          )}
        </tbody>
      </table>
    </Section>
  );
}

function CourseTableBanded({
  block,
  ctx,
}: {
  block: CourseTableBlock;
  ctx: RenderCtx;
}): React.JSX.Element {
  const { tokens, style } = ctx;
  return (
    <Section className="edm-section" style={{ padding: `16px ${style.section.paddingX}px` }}>
      <SectionTitle ctx={ctx}>課程內容</SectionTitle>
      <table role="presentation" cellPadding={0} cellSpacing={0} border={0} width="100%">
        <tbody>
          {block.courses.map((c, i) => (
            <tr key={i} style={{ backgroundColor: i % 2 === 0 ? tokens.surface : tokens.bg }}>
              <td style={{ padding: '14px 16px', fontSize: 14, color: tokens.textPrimary, borderRadius: 8 }}>
                <strong style={{ color: tokens.primary }}>{String(i + 1).padStart(2, '0')}</strong>
                <span style={{ marginLeft: 12 }}>{c.name}</span>
                {block.showCode !== false && c.code && (
                  <span style={{ color: tokens.textSecondary, fontSize: 11, marginLeft: 8 }}>{c.code}</span>
                )}
              </td>
              <td align="right" style={{ padding: '14px 16px', fontSize: 13, color: tokens.textSecondary }}>
                {c.hours} 小時
                {block.showInstructor && c.instructor && (
                  <span style={{ marginLeft: 12, color: tokens.textPrimary, fontWeight: 600 }}>
                    {c.instructor}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {typeof block.totalHours === 'number' && (
        <Text
          style={{
            margin: '12px 0 0 0',
            textAlign: 'right' as const,
            fontSize: 13,
            color: tokens.textPrimary,
            fontWeight: 700,
          }}
        >
          合計 {block.totalHours} 小時
        </Text>
      )}
    </Section>
  );
}

function CourseTableCard({
  block,
  ctx,
}: {
  block: CourseTableBlock;
  ctx: RenderCtx;
}): React.JSX.Element {
  const { tokens, style, primaryScale } = ctx;
  const cardBg = isDarkHex(tokens.bg) ? mixHex(tokens.primary, tokens.bg, 0.1) : tokens.surface;
  const accentLine = primaryScale[400];
  return (
    <Section className="edm-section" style={{ padding: `16px ${style.section.paddingX}px` }}>
      <SectionTitle ctx={ctx}>COURSE LINEUP</SectionTitle>
      {block.courses.map((c, i) => (
        <table
          key={i}
          role="presentation"
          cellPadding={0}
          cellSpacing={0}
          border={0}
          width="100%"
          style={{
            borderCollapse: 'separate',
            backgroundColor: cardBg,
            marginBottom: 10,
            borderLeft: `3px solid ${accentLine}`,
          }}
        >
          <tbody>
            <tr>
              <td style={{ padding: '14px 16px' }}>
                <Text
                  style={{
                    margin: 0,
                    fontSize: 11,
                    letterSpacing: '0.16em',
                    color: tokens.accent,
                    fontWeight: 700,
                  }}
                >
                  MODULE {pad2(i + 1)} · {c.hours} HRS
                </Text>
                <Text
                  style={{
                    margin: '4px 0 0 0',
                    fontSize: 15,
                    color: tokens.textPrimary,
                    fontWeight: 700,
                  }}
                >
                  {c.name}
                </Text>
                {block.showInstructor && c.instructor && (
                  <Text
                    style={{
                      margin: '2px 0 0 0',
                      fontSize: 12,
                      color: tokens.textSecondary,
                    }}
                  >
                    主講：{c.instructor}
                  </Text>
                )}
              </td>
            </tr>
          </tbody>
        </table>
      ))}
      {typeof block.totalHours === 'number' && (
        <Text
          style={{
            margin: '8px 0 0 0',
            textAlign: 'right' as const,
            fontSize: 13,
            color: tokens.textSecondary,
            letterSpacing: '0.06em',
          }}
        >
          TOTAL · {block.totalHours} HOURS
        </Text>
      )}
    </Section>
  );
}

function CourseTableMinimal({
  block,
  ctx,
}: {
  block: CourseTableBlock;
  ctx: RenderCtx;
}): React.JSX.Element {
  const { tokens, style, typography } = ctx;
  return (
    <Section className="edm-section" style={{ padding: `16px ${style.section.paddingX}px` }}>
      {block.courses.map((c, i) => (
        <table
          key={i}
          role="presentation"
          cellPadding={0}
          cellSpacing={0}
          border={0}
          width="100%"
          style={{
            borderTop: i === 0 ? `1px solid ${tokens.border}` : 'none',
            borderBottom: `1px solid ${tokens.border}`,
          }}
        >
          <tbody>
            <tr>
              <td width={36} style={{ padding: '14px 0', verticalAlign: 'top' as const }}>
                <Text
                  style={{
                    margin: 0,
                    fontSize: 11,
                    color: tokens.textSecondary,
                    fontFamily: typography.accentFont ?? typography.bodyFont,
                  }}
                >
                  {pad2(i + 1)}
                </Text>
              </td>
              <td style={{ padding: '14px 0' }}>
                <Text
                  style={{
                    margin: 0,
                    fontSize: 15,
                    color: tokens.textPrimary,
                    fontFamily: typography.displayFont ?? typography.headingFont,
                    fontWeight: 500,
                  }}
                >
                  {c.name}
                </Text>
                {block.showInstructor && c.instructor && (
                  <Text style={{ margin: '2px 0 0 0', fontSize: 12, color: tokens.textSecondary }}>
                    {c.instructor}
                  </Text>
                )}
              </td>
              <td
                width={70}
                align="right"
                style={{ padding: '14px 0', fontSize: 13, color: tokens.textSecondary }}
              >
                {c.hours}h
              </td>
            </tr>
          </tbody>
        </table>
      ))}
    </Section>
  );
}

function CourseTableFormal({
  block,
  ctx,
}: {
  block: CourseTableBlock;
  ctx: RenderCtx;
}): React.JSX.Element {
  const { tokens, style } = ctx;
  return (
    <Section className="edm-section" style={{ padding: `16px ${style.section.paddingX}px` }}>
      <SectionTitle ctx={ctx}>課程內容</SectionTitle>
      <table
        role="presentation"
        cellPadding={0}
        cellSpacing={0}
        border={0}
        width="100%"
        style={{
          borderCollapse: 'collapse',
          border: `2px solid ${tokens.primary}`,
        }}
      >
        <thead>
          <tr style={{ backgroundColor: tokens.primary }}>
            <th
              align="left"
              style={{
                ...thStyle(tokens),
                color: '#FFFFFF',
                borderBottom: 'none',
                padding: '12px 12px',
              }}
            >
              課程名稱
            </th>
            <th
              align="center"
              style={{
                ...thStyle(tokens),
                color: '#FFFFFF',
                borderBottom: 'none',
                width: 60,
                padding: '12px 12px',
              }}
            >
              時數
            </th>
            {block.showInstructor && (
              <th
                align="left"
                style={{
                  ...thStyle(tokens),
                  color: '#FFFFFF',
                  borderBottom: 'none',
                  width: 100,
                  padding: '12px 12px',
                }}
              >
                主講
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {block.courses.map((c, i) => (
            <tr key={i}>
              <td
                style={{
                  ...tdStyle(tokens),
                  borderRight: `1px solid ${tokens.border}`,
                }}
              >
                {c.name}
              </td>
              <td
                align="center"
                style={{
                  ...tdStyle(tokens),
                  borderRight: `1px solid ${tokens.border}`,
                }}
              >
                {c.hours}
              </td>
              {block.showInstructor && (
                <td style={{ ...tdStyle(tokens), color: tokens.textSecondary, fontSize: 13 }}>
                  {c.instructor || '—'}
                </td>
              )}
            </tr>
          ))}
          {typeof block.totalHours === 'number' && (
            <tr style={{ backgroundColor: tokens.surface }}>
              <td style={{ padding: '10px 12px', fontSize: 13, fontWeight: 700, color: tokens.primary }}>
                合計
              </td>
              <td align="center" style={{ padding: '10px 12px', fontSize: 13, fontWeight: 700, color: tokens.accent }}>
                {block.totalHours}
              </td>
              {block.showInstructor && <td />}
            </tr>
          )}
        </tbody>
      </table>
    </Section>
  );
}

function thStyle(tokens: ColorTokens): React.CSSProperties {
  return {
    padding: '10px 12px',
    fontSize: 12,
    color: tokens.textSecondary,
    fontWeight: 600,
    borderBottom: `1px solid ${tokens.border}`,
  };
}

function tdStyle(tokens: ColorTokens): React.CSSProperties {
  return {
    padding: '12px',
    fontSize: 14,
    color: tokens.textPrimary,
    borderBottom: `1px solid ${tokens.border}`,
  };
}

// ---------------------------------------------------------------------------
// Instructor / Image / ClassDate / ClassTime（沿用既有風格，輕度套用 style）
// ---------------------------------------------------------------------------

function InstructorRenderer({
  block,
  ctx,
}: {
  block: InstructorBlock;
  ctx: RenderCtx;
}): React.JSX.Element {
  const { tokens, style } = ctx;
  return (
    <Section className="edm-section" style={{ padding: `20px ${style.section.paddingX}px` }}>
      <table role="presentation" cellPadding={0} cellSpacing={0} border={0} width="100%">
        <tbody>
          <tr>
            {block.avatar && (
              <td width={72} style={{ verticalAlign: 'top' as const }}>
                <Img
                  src={block.avatar}
                  alt={block.name}
                  width={56}
                  height={56}
                  style={{ borderRadius: '50%', display: 'block' }}
                />
              </td>
            )}
            <td style={{ verticalAlign: 'top' as const }}>
              <Text
                style={{
                  margin: 0,
                  fontSize: 11,
                  letterSpacing: '0.18em',
                  color: tokens.accent,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                }}
              >
                {block.role}
              </Text>
              <Text
                style={{ margin: '4px 0 0 0', fontSize: 16, fontWeight: 700, color: tokens.textPrimary }}
              >
                {block.name}
              </Text>
              {block.bio && (
                <div
                  className="edm-instructor-bio"
                  style={{
                    margin: '6px 0 0 0',
                    fontSize: 13,
                    color: tokens.textSecondary,
                    lineHeight: 1.6,
                  }}
                  dangerouslySetInnerHTML={{
                    __html: injectParagraphMargin(prepareInstructorBio(block.bio), '0 0 6px 0'),
                  }}
                />
              )}
            </td>
          </tr>
        </tbody>
      </table>
    </Section>
  );
}

function CtaRenderer({ block, ctx }: { block: CtaBlock; ctx: RenderCtx }): React.JSX.Element {
  const { tokens, style } = ctx;
  const cta = style.cta;
  /**
   * v0.4.2.3：bg / fg / border 計算抽到 `computeCtaColors` 純函式，與編輯端共用同一份邏輯，
   * 避免兩端各自實作而失對稱（v0.4.2.2 修了預覽，但編輯漏修，造成「編輯沒變預覽有變」）。
   *
   * v0.7.3：升級支援 gradient / ghost / soft 三種新樣式，以及 block-level 圓角 / 文字大小 / 陰影 /
   * 透明度 / 滿版按鈕覆寫。所有覆寫都「未設則 fallback 到模板預設」，向下相容。
   */
  const { bg, gradientCss, fg, border } = computeCtaColors(block, tokens);
  const text = cta.uppercase ? block.label.toUpperCase() : block.label;

  // 模板預設 radius 仍受 cta.shape='square' 影響（保留舊行為）
  const templateDefaultRadius = cta.shape === 'square' ? 0 : cta.radius;
  const radius = getCtaRadiusPx(block.radius, templateDefaultRadius);
  const shadow = getCtaShadowCss(block.shadow);
  const opacity = getCtaOpacity(block.opacity);
  const fontSize = block.fontSize ?? 15;

  // 滿版按鈕：寬度 100%，但 padding 仍維持，所以實際內容區域是 100% - 2*paddingX。
  // 注意 EmailButton 會用 <table> 包裹，display:block 可讓 table 撐滿寬度。
  const fullWidth = block.fullWidth === true;

  // 漸層 + Outlook fallback：bg 是已計算好的「中間實心色」（mixHex(from, to, 0.5)），
  // backgroundImage 才是真正的漸層。Outlook desktop 不支援 background-image 會自動退化到 bg。
  return (
    <Section
      className="edm-cta-wrap"
      style={{ padding: `24px ${style.section.paddingX}px`, textAlign: 'center' as const }}
    >
      <EmailButton
        href={block.url}
        className="btn edm-cta-btn"
        style={{
          backgroundColor: bg,
          ...(gradientCss ? { backgroundImage: gradientCss } : {}),
          color: fg,
          padding: `${cta.paddingY}px ${cta.paddingX}px`,
          fontSize,
          fontWeight: cta.weight,
          letterSpacing: `${cta.letterSpacing}em`,
          borderRadius: radius,
          border,
          textDecoration: 'none',
          display: fullWidth ? 'block' : 'inline-block',
          width: fullWidth ? '100%' : undefined,
          textAlign: 'center' as const,
          boxSizing: 'border-box' as const,
          ...(shadow !== 'none' ? { boxShadow: shadow } : {}),
          ...(opacity < 1 ? { opacity } : {}),
        }}
      >
        {text}
      </EmailButton>
      {block.secondary && (
        <div style={{ marginTop: 12 }}>
          <Link
            href={block.secondary.url}
            style={{ color: tokens.textSecondary, fontSize: 13, textDecoration: 'underline' }}
          >
            {block.secondary.label}
          </Link>
        </div>
      )}
    </Section>
  );
}

function ImageRenderer({ block, ctx }: { block: ImageBlock; ctx: RenderCtx }): React.JSX.Element {
  const { tokens, style } = ctx;
  return (
    <Section
      className="edm-section"
      style={{
        padding: `12px ${style.section.paddingX}px`,
        textAlign: block.align as React.CSSProperties['textAlign'],
      }}
    >
      <Img
        src={block.src}
        alt={block.alt}
        width={block.width}
        style={{
          maxWidth: '100%',
          height: 'auto',
          display: 'inline-block',
          borderRadius: 6,
        }}
      />
      {block.caption && (
        <Text style={{ margin: '8px 0 0 0', fontSize: 12, color: tokens.textSecondary }}>
          {block.caption}
        </Text>
      )}
    </Section>
  );
}

function ClassDateRenderer({
  block,
  ctx,
}: {
  block: ClassDateBlock;
  ctx: RenderCtx;
}): React.JSX.Element {
  const { tokens, style } = ctx;
  return (
    <Section className="edm-section" style={{ padding: `8px ${style.section.paddingX}px` }}>
      <table role="presentation" cellPadding={0} cellSpacing={0} border={0} width="100%">
        <tbody>
          <tr>
            <td
              className="edm-meta-label edm-nowrap"
              style={{
                padding: '6px 12px 6px 0',
                // width:1% 是 HTML table 經典手法：在 width:100% 的 table 中讓該 cell 自動縮到 content 寬度
                width: '1%',
                whiteSpace: 'nowrap',
                fontSize: 13,
                fontWeight: 700,
                color: tokens.accent,
                letterSpacing: '0.12em',
                verticalAlign: 'top' as const,
              }}
            >
              {block.label}
            </td>
            <td
              className="edm-meta-value"
              style={{
                padding: '6px 0',
                fontSize: 14,
                color: tokens.textPrimary,
                lineHeight: 1.7,
              }}
            >
              {formatDateList(block.dates, {
                display: block.display,
                yearFormat: (block.yearFormat as YearFormat | undefined) ?? 'roc',
              })}
            </td>
          </tr>
        </tbody>
      </table>
    </Section>
  );
}

function ClassTimeRenderer({
  block,
  ctx,
}: {
  block: ClassTimeBlock;
  ctx: RenderCtx;
}): React.JSX.Element {
  const { tokens, style } = ctx;
  return (
    <Section className="edm-section" style={{ padding: `8px ${style.section.paddingX}px` }}>
      <table role="presentation" cellPadding={0} cellSpacing={0} border={0} width="100%">
        <tbody>
          <tr>
            <td
              className="edm-meta-label edm-nowrap"
              style={{
                padding: '6px 12px 6px 0',
                // width:1% 是 HTML table 經典手法：在 width:100% 的 table 中讓該 cell 自動縮到 content 寬度
                width: '1%',
                whiteSpace: 'nowrap',
                fontSize: 13,
                fontWeight: 700,
                color: tokens.accent,
                letterSpacing: '0.12em',
                verticalAlign: 'top' as const,
              }}
            >
              {block.label}
            </td>
            <td
              className="edm-meta-value"
              style={{ padding: '6px 0', fontSize: 14, color: tokens.textPrimary }}
            >
              {block.startTime || '—'} – {block.endTime || '—'}
              {block.showDuration && computeDuration(block.startTime, block.endTime) && (
                <span style={{ color: tokens.textSecondary, marginLeft: 12, fontSize: 12 }}>
                  （共 {computeDuration(block.startTime, block.endTime)}）
                </span>
              )}
            </td>
          </tr>
        </tbody>
      </table>
    </Section>
  );
}

function computeDuration(start: string, end: string): string | null {
  const ms = (s: string): number | null => {
    const m = s.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  };
  const s = ms(start);
  const e = ms(end);
  if (s == null || e == null || e <= s) return null;
  const mins = e - s;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m} 分鐘`;
  if (m === 0) return `${h} 小時`;
  return `${h} 小時 ${m} 分`;
}

// ---------------------------------------------------------------------------
// Divider & Footer
// ---------------------------------------------------------------------------

/**
 * 空白行（v0.7.2.1）。純粹一個固定高度的 div，背景色與透明度由 block 控制。
 *
 * Outlook desktop 對 div height 不友善時，<table cellpadding> 才能保證高度。
 * 這裡為了相容性，我們同時用 `<table role="presentation"><tr><td height>`。
 *
 * line-height + font-size = 1px 是 Outlook 防止 td 因為 default font 撐高的標準 trick。
 */
function SpacerRenderer({ block }: { block: SpacerBlock }): React.JSX.Element {
  const height = Math.max(1, Math.min(400, block.height || 1));
  const opacity = typeof block.opacity === 'number' ? Math.max(0, Math.min(1, block.opacity)) : 0;
  const background = block.background ?? '#000000';
  // 完全透明 → 不要寫 background 屬性，避免 Outlook 渲染未必相容的色彩值
  const visible = opacity > 0;
  // mso-line-height-rule:exactly 已由 EmailTemplate 全域 CSS 套用到所有 td；
  // 這裡只需 lineHeight + fontSize=1px 防止 default font 撐高
  const tdStyle: React.CSSProperties = {
    height,
    lineHeight: '1px',
    fontSize: 1,
    ...(visible ? { backgroundColor: background, opacity } : {}),
  };
  return (
    <table
      role="presentation"
      cellPadding={0}
      cellSpacing={0}
      border={0}
      width="100%"
      style={{ borderCollapse: 'collapse', width: '100%' }}
    >
      <tbody>
        <tr>
          <td height={height} style={tdStyle}>
            {/* 用一個 NBSP 避免某些客戶端把空 td 折疊成 0 高度 */}
            &nbsp;
          </td>
        </tr>
      </tbody>
    </table>
  );
}

function DividerRenderer({
  block,
  ctx,
}: {
  block: DividerBlock;
  ctx: RenderCtx;
}): React.JSX.Element {
  const { tokens, style, typography } = ctx;

  // 使用者若於屬性面板手動指定 style，仍以使用者選擇優先
  const userOverride = block.style;

  // 若使用者沒選或選預設 'solid'，依模板的 divider variant 渲染
  if (userOverride === 'solid' || userOverride === undefined) {
    return <DividerByTemplate ctx={ctx} variant={style.divider} />;
  }

  // 既有相容路徑：dashed / geometric
  if (userOverride === 'geometric') {
    const url = buildGradientBarSvg(tokens.primary, tokens.accent, 640, 6);
    return (
      <Section className="edm-section" style={{ padding: `20px ${style.section.paddingX}px` }}>
        <Img src={url} alt="" width={640} height={6} style={{ width: '100%', height: 6, display: 'block' }} />
      </Section>
    );
  }

  // 'dashed'
  return (
    <Section className="edm-section" style={{ padding: `8px ${style.section.paddingX}px` }}>
      <div
        style={{
          borderTop: `1px dashed ${tokens.border}`,
          margin: 0,
          fontFamily: typography.bodyFont,
        }}
      />
    </Section>
  );
}

function DividerByTemplate({
  ctx,
  variant,
}: {
  ctx: RenderCtx;
  variant: TemplateStyle['divider'];
}): React.JSX.Element {
  const { tokens, style, typography } = ctx;
  const padX = style.section.paddingX;

  switch (variant) {
    case 'thin-line':
      return (
        <Section className="edm-section" style={{ padding: `12px ${padX}px` }}>
          <div style={{ borderTop: `1px solid ${tokens.border}`, margin: 0 }} />
        </Section>
      );
    case 'double-line':
      return (
        <Section className="edm-section" style={{ padding: `16px ${padX}px` }}>
          <div style={{ borderTop: `1px solid ${tokens.accent}`, margin: 0 }} />
          <div style={{ borderTop: `1px solid ${tokens.accent}`, margin: '4px 0 0 0' }} />
        </Section>
      );
    case 'gradient-bar': {
      const url = buildGradientBarSvg(tokens.primary, tokens.accent, 640, 6);
      return (
        <Section className="edm-section" style={{ padding: `20px ${padX}px` }}>
          <Img src={url} alt="" width={640} height={6} style={{ width: '100%', height: 6, display: 'block' }} />
        </Section>
      );
    }
    case 'wave': {
      const url = buildWaveDividerSvg(tokens.accent, 640, 32);
      return (
        <Section className="edm-section" style={{ padding: `12px ${padX}px` }}>
          <Img src={url} alt="" width={640} height={32} style={{ width: '100%', height: 32, display: 'block' }} />
        </Section>
      );
    }
    case 'dots':
      return (
        <Section className="edm-section" style={{ padding: `16px ${padX}px`, textAlign: 'center' as const }}>
          <Text style={{ margin: 0, color: tokens.accent, fontSize: 14, letterSpacing: '0.5em' }}>
            • • •
          </Text>
        </Section>
      );
    case 'serif-numeral':
      return (
        <Section className="edm-section" style={{ padding: `20px ${padX}px`, textAlign: 'center' as const }}>
          <Text
            style={{
              margin: 0,
              color: tokens.accent,
              fontSize: 18,
              letterSpacing: '0.3em',
              fontFamily: typography.accentFont ?? typography.headingFont,
              fontStyle: 'italic',
            }}
          >
            ※
          </Text>
        </Section>
      );
    case 'tri-band': {
      const url = buildTriBandSvg(tokens.primary, tokens.accent, tokens.secondary, 640, 6);
      return (
        <Section className="edm-section" style={{ padding: `12px ${padX}px` }}>
          <Img src={url} alt="" width={640} height={6} style={{ width: '100%', height: 6, display: 'block' }} />
        </Section>
      );
    }
    default:
      return (
        <Section className="edm-section" style={{ padding: `8px ${padX}px` }}>
          <div style={{ borderTop: `1px solid ${tokens.border}`, margin: 0 }} />
        </Section>
      );
  }
}

function FooterRenderer({ block, ctx }: { block: FooterBlock; ctx: RenderCtx }): React.JSX.Element {
  const { tokens, style } = ctx;
  const footerStyle = style.footer.style;

  if (footerStyle === 'accent') {
    const url = buildGradientBarSvg(tokens.primary, tokens.accent, 640, 4);
    return (
      <>
        <Img src={url} alt="" width={640} height={4} style={{ width: '100%', height: 4, display: 'block' }} />
        <Section
          className="edm-section"
          style={{
            padding: `20px ${style.section.paddingX}px 28px ${style.section.paddingX}px`,
            backgroundColor: tokens.surface,
            color: tokens.textSecondary,
          }}
        >
          <Text style={{ margin: 0, fontSize: 12, lineHeight: 1.7 }}>{block.text}</Text>
          {block.links && block.links.length > 0 && (
            <Text style={{ margin: '8px 0 0 0', fontSize: 12 }}>
              {block.links.map((l, i) => (
                <React.Fragment key={i}>
                  {i > 0 && <span style={{ margin: '0 8px', color: tokens.border }}>|</span>}
                  <Link href={l.url} style={{ color: tokens.primary, textDecoration: 'underline' }}>
                    {l.label}
                  </Link>
                </React.Fragment>
              ))}
            </Text>
          )}
        </Section>
      </>
    );
  }

  if (footerStyle === 'formal') {
    return (
      <Section
        className="edm-section"
        style={{
          padding: `20px ${style.section.paddingX}px 28px ${style.section.paddingX}px`,
          borderTop: `2px solid ${tokens.primary}`,
          color: tokens.textSecondary,
        }}
      >
        <div style={{ borderTop: `1px solid ${tokens.border}`, marginTop: 4, marginBottom: 14 }} />
        <Text style={{ margin: 0, fontSize: 12, lineHeight: 1.7 }}>{block.text}</Text>
        {block.links && block.links.length > 0 && (
          <Text style={{ margin: '8px 0 0 0', fontSize: 12 }}>
            {block.links.map((l, i) => (
              <React.Fragment key={i}>
                {i > 0 && <span style={{ margin: '0 8px', color: tokens.border }}>|</span>}
                <Link href={l.url} style={{ color: tokens.primary, textDecoration: 'underline' }}>
                  {l.label}
                </Link>
              </React.Fragment>
            ))}
          </Text>
        )}
      </Section>
    );
  }

  // minimal
  return (
    <Section
      className="edm-section"
      style={{
        padding: `28px ${style.section.paddingX}px 36px ${style.section.paddingX}px`,
        color: tokens.textSecondary,
      }}
    >
      <div style={{ width: 32, height: 1, backgroundColor: tokens.textSecondary, marginBottom: 16 }} />
      <Text style={{ margin: 0, fontSize: 12, lineHeight: 1.7 }}>{block.text}</Text>
      {block.links && block.links.length > 0 && (
        <Text style={{ margin: '8px 0 0 0', fontSize: 12 }}>
          {block.links.map((l, i) => (
            <React.Fragment key={i}>
              {i > 0 && <span style={{ margin: '0 8px', color: tokens.border }}>|</span>}
              <Link href={l.url} style={{ color: tokens.primary, textDecoration: 'underline' }}>
                {l.label}
              </Link>
            </React.Fragment>
          ))}
        </Text>
      )}
    </Section>
  );
}



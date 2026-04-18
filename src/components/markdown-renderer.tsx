"use client";

/**
 * 【Markdown 渲染元件】
 * 將 Markdown 內容渲染為格式化的 HTML，支援：
 * - GFM 表格、刪除線、任務清單
 * - HTML 標籤（<br> 等，經過 sanitize 安全處理）
 * - 程式碼區塊高亮
 * - 圖片、連結
 */
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import type { Components } from "react-markdown";
import { cn } from "@/lib/utils";

const markdownComponents: Components = {
  table: ({ children, ...props }) => (
    <div className="my-2 overflow-x-auto rounded-lg border">
      <table className="w-full text-xs border-collapse" {...props}>
        {children}
      </table>
    </div>
  ),
  thead: ({ children, ...props }) => (
    <thead className="bg-muted/50" {...props}>{children}</thead>
  ),
  th: ({ children, ...props }) => (
    <th className="px-3 py-1.5 text-left font-semibold border-b text-[11px]" {...props}>
      {children}
    </th>
  ),
  td: ({ children, ...props }) => (
    <td className="px-3 py-1.5 border-b border-border/50 text-[12px]" {...props}>
      {children}
    </td>
  ),
  tr: ({ children, ...props }) => (
    <tr className="hover:bg-muted/30 transition-colors" {...props}>{children}</tr>
  ),
  a: ({ children, href, ...props }) => {
    if (href && href.includes("/api/agent/workspace/download/")) {
      const fileName = decodeURIComponent(href.split("/").pop() || "檔案");
      return (
        <a
          href={href}
          download
          className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/10 transition-colors no-underline my-1"
          {...props}
        >
          <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
          下載：{fileName}
        </a>
      );
    }
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary underline underline-offset-2 hover:text-primary/80 break-all"
        {...props}
      >
        {children}
      </a>
    );
  },
  img: ({ src, alt, ...props }) => (
    <img
      src={src}
      alt={alt || ""}
      className="max-w-full h-auto rounded-lg border my-2"
      loading="lazy"
      {...props}
    />
  ),
  code: ({ children, className, ...props }) => {
    const isInline = !className;
    if (isInline) {
      return (
        <code className="rounded bg-muted px-1.5 py-0.5 text-[12px] font-mono text-foreground" {...props}>
          {children}
        </code>
      );
    }
    return (
      <code className={cn("block text-[12px] font-mono", className)} {...props}>
        {children}
      </code>
    );
  },
  pre: ({ children, ...props }) => (
    <pre
      className="my-2 overflow-x-auto rounded-lg border bg-muted/40 p-3 text-[12px] leading-relaxed"
      {...props}
    >
      {children}
    </pre>
  ),
  ul: ({ children, ...props }) => (
    <ul className="my-1.5 ml-4 list-disc space-y-0.5 text-[13px]" {...props}>{children}</ul>
  ),
  ol: ({ children, ...props }) => (
    <ol className="my-1.5 ml-4 list-decimal space-y-0.5 text-[13px]" {...props}>{children}</ol>
  ),
  li: ({ children, ...props }) => (
    <li className="leading-relaxed" {...props}>{children}</li>
  ),
  blockquote: ({ children, ...props }) => (
    <blockquote
      className="my-2 border-l-[3px] border-primary/40 pl-3 text-muted-foreground italic text-[13px]"
      {...props}
    >
      {children}
    </blockquote>
  ),
  h1: ({ children, ...props }) => (
    <h1 className="text-lg font-bold mt-3 mb-1.5" {...props}>{children}</h1>
  ),
  h2: ({ children, ...props }) => (
    <h2 className="text-base font-bold mt-2.5 mb-1" {...props}>{children}</h2>
  ),
  h3: ({ children, ...props }) => (
    <h3 className="text-sm font-bold mt-2 mb-1" {...props}>{children}</h3>
  ),
  hr: ({ ...props }) => (
    <hr className="my-3 border-border" {...props} />
  ),
  p: ({ children, ...props }) => (
    <p className="my-1 leading-relaxed" {...props}>{children}</p>
  ),
};

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  return (
    <div className={cn("prose-custom", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, rehypeSanitize]}
        components={markdownComponents}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

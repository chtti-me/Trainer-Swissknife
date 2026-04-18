"use client";

/**
 * 【共用元件】截斷文字 + hover 浮出完整內容
 */
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface TruncateCellProps {
  children: React.ReactNode;
  className?: string;
}

export function TruncateCell({ children, className = "" }: TruncateCellProps) {
  const textRef = useRef<HTMLDivElement>(null);
  const [isTruncated, setIsTruncated] = useState(false);

  useEffect(() => {
    const el = textRef.current;
    if (el) setIsTruncated(el.scrollWidth > el.clientWidth);
  }, [children]);

  return (
    <div className="relative group/cell">
      <div ref={textRef} className={cn("truncate", className)}>
        {children}
      </div>
      {isTruncated && (
        <div className="invisible group-hover/cell:visible absolute left-0 top-0 z-50 min-w-full w-max max-w-[400px] rounded-md border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-lg whitespace-normal break-words">
          {children}
        </div>
      )}
    </div>
  );
}

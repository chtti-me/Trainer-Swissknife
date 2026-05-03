import * as React from 'react';
import * as ScrollAreaPrimitive from '@radix-ui/react-scroll-area';
import { cn } from '@edm/lib/utils';

/**
 * v0.6.1：修 Radix ScrollArea 的 viewport 寬度坑。
 *
 * Radix Viewport 為了讓「水平捲軸不被內容撐到 100% 寬」，會把 children 包進
 * `<div style="display: table; min-width: 100%">`。這個 table 是 shrink-to-fit，
 * 子元件即使用 `w-full` / `truncate` 也會以「自然內容寬度」鋪展，造成右側面板
 * 內 `min-w-0 + truncate` 全部失效（內容會把 viewport 撐爆，然後被 overflow-hidden 切掉）。
 *
 * 解法：強制 viewport 內第一層 div 改成 `display: block` + `min-width: 0`，
 * 它就會繼承 viewport 寬度，子元件的 truncate 才能正常生效。
 *
 * 副作用：放棄水平捲軸（內容超寬時直接被父 overflow 切，但因為我們已 truncate 處理，
 * 這個 trade-off 是值得的；如果未來真的需要水平捲軸再用 prop 控制）。
 */
const ScrollArea = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root>
>(({ className, children, ...props }, ref) => (
  <ScrollAreaPrimitive.Root ref={ref} className={cn('relative overflow-hidden', className)} {...props}>
    <ScrollAreaPrimitive.Viewport
      className={cn(
        'h-full w-full rounded-[inherit]',
        // 關鍵 override：強制取消 Radix 預設的 display:table 行為
        '[&>div]:!block [&>div]:!min-w-0',
      )}
    >
      {children}
    </ScrollAreaPrimitive.Viewport>
    <ScrollBar />
    <ScrollAreaPrimitive.Corner />
  </ScrollAreaPrimitive.Root>
));
ScrollArea.displayName = ScrollAreaPrimitive.Root.displayName;

const ScrollBar = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>
>(({ className, orientation = 'vertical', ...props }, ref) => (
  <ScrollAreaPrimitive.ScrollAreaScrollbar
    ref={ref}
    orientation={orientation}
    className={cn(
      'flex touch-none select-none transition-colors',
      orientation === 'vertical' && 'h-full w-2.5 border-l border-l-transparent p-[1px]',
      orientation === 'horizontal' && 'h-2.5 flex-col border-t border-t-transparent p-[1px]',
      className,
    )}
    {...props}
  >
    <ScrollAreaPrimitive.ScrollAreaThumb className="relative flex-1 rounded-full bg-border" />
  </ScrollAreaPrimitive.ScrollAreaScrollbar>
));
ScrollBar.displayName = ScrollAreaPrimitive.ScrollAreaScrollbar.displayName;

export { ScrollArea, ScrollBar };

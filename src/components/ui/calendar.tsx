"use client";

/**
 * 【月曆 UI】react-day-picker 包一層；樣式來自 `globals.css` 的 `react-day-picker/style.css`。
 */
import * as React from "react";
import { DayPicker } from "react-day-picker";
import { zhTW } from "date-fns/locale/zh-TW";
import { cn } from "@/lib/utils";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

export function Calendar({ className, locale = zhTW, ...props }: CalendarProps) {
  return <DayPicker locale={locale} className={cn("p-2", className)} {...props} />;
}

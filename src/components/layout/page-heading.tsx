"use client";

/**
 * 【頁面標題列】
 * 統一顯示大標、說明小字，右側可放按鈕、使用者區塊（UserTray）。
 */
import type { ReactNode } from "react";
import { UserTray } from "@/components/layout/user-tray";
import { cn } from "@/lib/utils";

type PageHeadingProps = {
  title: string;
  description?: string;
  titleClassName?: string;
  descriptionClassName?: string;
  /** 標題列右側、UserTray（使用者區塊）左側的額外控制項（例如按鈕群） */
  trailing?: ReactNode;
  className?: string;
};

export function PageHeading({
  title,
  description,
  titleClassName = "text-2xl font-bold",
  descriptionClassName = "text-muted-foreground text-sm mt-1",
  trailing,
  className,
}: PageHeadingProps) {
  return (
    <div
      className={cn(
        // sm:flex-wrap：按鈕多時整塊換到下一列，避免左欄被壓成極窄而「一字一行」像直排
        "mb-6 flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between",
        className
      )}
    >
      {/* 左欄須保留橫排標題所需寬度；勿只用 min-w-0，否則在 shrink-0 的右欄擠壓下會縮到每字換行 */}
      <div className="w-full min-w-0 sm:min-w-[min(100%,18rem)] sm:flex-1">
        <h1 className={cn(titleClassName, "break-normal")}>{title}</h1>
        {description ? <p className={descriptionClassName}>{description}</p> : null}
      </div>
      <div className="flex w-full shrink-0 flex-wrap items-center justify-end gap-2 sm:w-auto sm:gap-3 sm:pl-2">
        {trailing}
        <UserTray />
      </div>
    </div>
  );
}

/**
 * 【小工具】
 * cn：合併 Tailwind class 名稱；formatDate／formatDateTime：畫面上顯示日期；
 * 狀態／院本部色系等輔助函式。
 */
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = new Date(date);
  return d.toLocaleDateString("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = new Date(date);
  return d.toLocaleString("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function getStatusColor(status: string): string {
  const map: Record<string, string> = {
    "規劃中": "bg-yellow-100 text-yellow-800 border-yellow-300",
    "已排定": "bg-blue-100 text-blue-800 border-blue-300",
    "即將開班": "bg-orange-100 text-orange-800 border-orange-300",
    "已結訓": "bg-green-100 text-green-800 border-green-300",
  };
  return map[status] || "bg-gray-100 text-gray-800 border-gray-300";
}

export function getCalendarEventColor(status: string): string {
  const map: Record<string, string> = {
    "規劃中": "#f59e0b",
    "已排定": "#3b82f6",
    "即將開班": "#f97316",
    "已結訓": "#22c55e",
  };
  return map[status] || "#6b7280";
}

export function getCampusColor(campus: string): string {
  const map: Record<string, string> = {
    "院本部": "bg-indigo-100 text-indigo-800",
    "台中所": "bg-emerald-100 text-emerald-800",
    "高雄所": "bg-rose-100 text-rose-800",
  };
  return map[campus] || "bg-gray-100 text-gray-800";
}

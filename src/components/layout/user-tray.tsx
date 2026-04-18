"use client";

/**
 * 【右上角使用者小面板】
 * 顯示姓名／單位、登出按鈕。像辦公桌名牌加上「下班打卡」。
 */
import { signOut, useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Power, User } from "lucide-react";
import { cn } from "@/lib/utils";

type UserWithDept = { name?: string | null; department?: string };

export function UserTray({ className }: { className?: string }) {
  const { data: session } = useSession();
  const user = session?.user as UserWithDept | undefined;

  if (!user) return null;

  return (
    <TooltipProvider delayDuration={120}>
      <div className={cn("flex items-center gap-3 rounded-md border bg-card px-3 py-1.5", className)}>
        <div className="flex items-center gap-2 text-sm">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <User className="w-4 h-4 text-primary" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-medium text-xs truncate">{user.name}</span>
            <span className="text-[10px] text-muted-foreground truncate">{user.department}</span>
          </div>
        </div>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={() => signOut({ callbackUrl: "/login" })}
              aria-label="登出"
            >
              <Power className="w-4 h-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">登出</TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}

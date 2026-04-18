"use client";

import { useState, useRef, useEffect } from "react";
import { Sun, Moon, Palette, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useTheme, THEME_COLORS } from "@/components/theme-provider";

export function ThemeSwitcher({ collapsed = false }: { collapsed?: boolean }) {
  const { theme, setThemeColor, toggleMode } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const currentSwatch = THEME_COLORS.find((t) => t.id === theme.color);
  const swatchColor = theme.mode === "dark" ? currentSwatch?.swatchDark : currentSwatch?.swatch;

  const modeButton = (
    <Button
      variant="ghost"
      size="icon"
      className="h-7 w-7 shrink-0"
      title={theme.mode === "light" ? "切換至深色模式" : "切換至淺色模式"}
      aria-label={theme.mode === "light" ? "切換至深色模式" : "切換至淺色模式"}
      onClick={toggleMode}
    >
      {theme.mode === "light" ? (
        <Sun className="h-3.5 w-3.5" />
      ) : (
        <Moon className="h-3.5 w-3.5" />
      )}
    </Button>
  );

  const paletteButton = (
    <Button
      variant="ghost"
      size="icon"
      className="h-7 w-7 shrink-0"
      title="選擇色彩主題"
      aria-label="選擇色彩主題"
      onClick={() => setOpen(!open)}
    >
      <Palette className="h-3.5 w-3.5" />
    </Button>
  );

  if (collapsed) {
    return (
      <div ref={ref} className="relative flex flex-col items-center gap-0.5">
        <Tooltip>
          <TooltipTrigger asChild>{modeButton}</TooltipTrigger>
          <TooltipContent side="right">
            {theme.mode === "light" ? "深色模式" : "淺色模式"}
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>{paletteButton}</TooltipTrigger>
          <TooltipContent side="right">色彩主題</TooltipContent>
        </Tooltip>

        {open && (
          <div className="absolute left-full bottom-0 ml-2 z-50 w-40 rounded-lg border bg-popover p-1.5 shadow-lg animate-in fade-in-0 zoom-in-95">
            <p className="px-2 py-1 text-[10px] font-semibold text-muted-foreground">
              色彩主題
            </p>
            {THEME_COLORS.map((t) => (
              <button
                key={t.id}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors",
                  "hover:bg-accent hover:text-accent-foreground",
                  theme.color === t.id && "bg-accent"
                )}
                onClick={() => {
                  setThemeColor(t.id);
                  setOpen(false);
                }}
              >
                <span
                  className="h-3 w-3 rounded-sm border shrink-0"
                  style={{
                    backgroundColor:
                      theme.mode === "dark" ? t.swatchDark : t.swatch,
                  }}
                />
                <span className="flex-1 text-left">{t.label}</span>
                {theme.color === t.id && (
                  <Check className="h-3 w-3 text-primary shrink-0" />
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div ref={ref} className="relative">
      <div className="flex items-center gap-0.5">
        {modeButton}
        <button
          className={cn(
            "flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
            "hover:bg-accent hover:text-accent-foreground",
            "text-muted-foreground"
          )}
          onClick={() => setOpen(!open)}
        >
          <span
            className="h-2.5 w-2.5 rounded-sm border shrink-0"
            style={{ backgroundColor: swatchColor }}
          />
          <span className="whitespace-nowrap">
            {currentSwatch?.label}
          </span>
        </button>
      </div>

      {open && (
        <div className="absolute bottom-full left-0 mb-1.5 z-50 w-44 rounded-lg border bg-popover p-1.5 shadow-lg animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-2">
          <p className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
            色彩主題
          </p>
          {THEME_COLORS.map((t) => (
            <button
              key={t.id}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-xs transition-colors",
                "hover:bg-accent hover:text-accent-foreground",
                theme.color === t.id && "bg-accent"
              )}
              onClick={() => {
                setThemeColor(t.id);
                setOpen(false);
              }}
            >
              <span
                className="h-3 w-3 rounded-sm border shrink-0"
                style={{
                  backgroundColor:
                    theme.mode === "dark" ? t.swatchDark : t.swatch,
                }}
              />
              <span className="flex-1 text-left">{t.label}</span>
              {theme.color === t.id && (
                <Check className="h-3 w-3 text-primary shrink-0" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

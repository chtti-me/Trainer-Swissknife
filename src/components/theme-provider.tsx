"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

export type ThemeColor =
  | "default"
  | "nord"
  | "rose-pine"
  | "monokai"
  | "gruvbox"
  | "high-contrast"
  | "crimson";

export type ThemeMode = "light" | "dark";

export interface ThemeConfig {
  color: ThemeColor;
  mode: ThemeMode;
}

export const THEME_COLORS: { id: ThemeColor; label: string; swatch: string; swatchDark: string }[] = [
  { id: "default",       label: "預設",      swatch: "#3b82f6", swatchDark: "#60a5fa" },
  { id: "nord",          label: "Nord",      swatch: "#5e81ac", swatchDark: "#81a1c1" },
  { id: "rose-pine",     label: "Rosé Pine", swatch: "#9065c0", swatchDark: "#c4a7e7" },
  { id: "monokai",       label: "Monokai",   swatch: "#a6e22e", swatchDark: "#a6e22e" },
  { id: "gruvbox",       label: "Gruvbox",   swatch: "#d65d0e", swatchDark: "#fe8019" },
  { id: "high-contrast", label: "高對比",    swatch: "#0000cc", swatchDark: "#3b8eea" },
  { id: "crimson",       label: "赤紅",      swatch: "#e05047", swatchDark: "#e05047" },
];

const STORAGE_KEY = "trainer-swissknife-theme";

function getInitialTheme(): ThemeConfig {
  if (typeof window === "undefined") return { color: "default", mode: "light" };
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as ThemeConfig;
      if (parsed.color && parsed.mode) return parsed;
    }
  } catch {}
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  return { color: "default", mode: prefersDark ? "dark" : "light" };
}

function applyTheme(config: ThemeConfig) {
  const root = document.documentElement;
  root.setAttribute("data-theme", config.color);
  root.classList.toggle("dark", config.mode === "dark");
}

interface ThemeContextValue {
  theme: ThemeConfig;
  setThemeColor: (color: ThemeColor) => void;
  setThemeMode: (mode: ThemeMode) => void;
  toggleMode: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<ThemeConfig>({ color: "default", mode: "light" });
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const initial = getInitialTheme();
    setTheme(initial);
    applyTheme(initial);
    setMounted(true);
  }, []);

  const persist = useCallback((next: ThemeConfig) => {
    setTheme(next);
    applyTheme(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {}
  }, []);

  const setThemeColor = useCallback(
    (color: ThemeColor) => persist({ ...theme, color }),
    [theme, persist]
  );

  const setThemeMode = useCallback(
    (mode: ThemeMode) => persist({ ...theme, mode }),
    [theme, persist]
  );

  const toggleMode = useCallback(
    () => persist({ ...theme, mode: theme.mode === "light" ? "dark" : "light" }),
    [theme, persist]
  );

  if (!mounted) return null;

  return (
    <ThemeContext.Provider value={{ theme, setThemeColor, setThemeMode, toggleMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme 必須在 ThemeProvider 內使用");
  return ctx;
}

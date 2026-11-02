"use client";
import { useEffect } from "react";
import { Moon, Sun } from "lucide-react";
import { clsx } from "clsx";

const STORAGE_KEY = "jojobot-theme";

// 只操作 <html data-theme>，颜色与图标都由 globals.css 决定，避免首帧闪烁
export function ThemeToggle({ className }: { className?: string }) {
  useEffect(() => {
    // 没手动选过时跟随系统；选过就固定
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (event: MediaQueryListEvent) => {
      try {
        if (localStorage.getItem(STORAGE_KEY)) return;
      } catch {}
      document.documentElement.dataset.theme = event.matches ? "dark" : "light";
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const toggle = () => {
    const next =
      document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {}
  };

  return (
    <button
      type="button"
      className={clsx("button icon-button theme-toggle", className)}
      onClick={toggle}
      aria-label="切换深色 / 浅色模式"
      title="切换深色 / 浅色模式"
    >
      <Moon className="theme-icon theme-icon-moon" size={17} />
      <Sun className="theme-icon theme-icon-sun" size={17} />
    </button>
  );
}

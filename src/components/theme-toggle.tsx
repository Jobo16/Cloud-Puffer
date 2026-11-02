"use client";
import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { clsx } from "clsx";

const STORAGE_KEY = "jojobot-theme";
const SYNC_EVENT = "jojobot:theme";

// 所有切换入口共用同一个真值来源：<html data-theme>
function useTheme() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  useEffect(() => {
    const read = () =>
      document.documentElement.dataset.theme === "dark" ? "dark" : "light";
    setTheme(read());
    // 一个页面里可能同时挂着图标按钮和菜单行，改完要互相通知
    const sync = () => setTheme(read());
    // 没手动选过时跟随系统；选过就固定
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (event: MediaQueryListEvent) => {
      try {
        if (localStorage.getItem(STORAGE_KEY)) return;
      } catch {}
      document.documentElement.dataset.theme = event.matches ? "dark" : "light";
      window.dispatchEvent(new Event(SYNC_EVENT));
    };
    window.addEventListener(SYNC_EVENT, sync);
    media.addEventListener("change", onChange);
    return () => {
      window.removeEventListener(SYNC_EVENT, sync);
      media.removeEventListener("change", onChange);
    };
  }, []);

  const toggle = () => {
    const next =
      document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {}
    window.dispatchEvent(new Event(SYNC_EVENT));
  };
  return { theme, toggle };
}

export function ThemeToggle({ className }: { className?: string }) {
  const { toggle } = useTheme();
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

// 菜单行里没有图标位置，写成一句动作更直接
export function ThemeRow({ className }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const dark = theme === "dark";
  return (
    <button
      type="button"
      className={clsx("drawer-action", className)}
      onClick={toggle}
      aria-pressed={dark}
    >
      {dark ? <Sun size={18} /> : <Moon size={18} />}
      <span>{dark ? "切到浅色" : "切到深色"}</span>
    </button>
  );
}

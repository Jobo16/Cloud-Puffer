"use client";
import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { clsx } from "clsx";

const STORAGE_KEY = "jojobot-theme";
const SYNC_EVENT = "jojobot:theme";

// 真值只存在 <html data-theme> 里；多个入口同时挂载时靠事件互相通知
function isDark() {
  return document.documentElement.dataset.theme === "dark";
}
function subscribe(onChange: () => void) {
  // 没手动选过时跟随系统；选过就固定
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const onSystemChange = (event: MediaQueryListEvent) => {
    try {
      if (localStorage.getItem(STORAGE_KEY)) return;
    } catch {
      // 隐私模式下读不到 localStorage，按未选择处理
    }
    document.documentElement.dataset.theme = event.matches ? "dark" : "light";
    onChange();
  };
  window.addEventListener(SYNC_EVENT, onChange);
  media.addEventListener("change", onSystemChange);
  return () => {
    window.removeEventListener(SYNC_EVENT, onChange);
    media.removeEventListener("change", onSystemChange);
  };
}

function useTheme() {
  const dark = useSyncExternalStore(subscribe, isDark, () => false);
  const toggle = () => {
    const next = isDark() ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // 存不下也能切换，只是刷新后回到系统偏好
    }
    window.dispatchEvent(new Event(SYNC_EVENT));
  };
  return { dark, toggle };
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
  const { dark, toggle } = useTheme();
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

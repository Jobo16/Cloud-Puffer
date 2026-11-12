"use client";
import { createContext, useContext, useState, type ReactNode } from "react";
import type { SiteLanguage } from "@/lib/site-language";

const LanguageContext = createContext<{
  language: SiteLanguage;
  change: (language: SiteLanguage) => void;
}>({ language: "zh", change: () => undefined });

export function LanguageProvider({
  language,
  children,
}: {
  language: SiteLanguage;
  children: ReactNode;
}) {
  const [current, setCurrent] = useState(language);
  const change = (next: SiteLanguage) => {
    document.cookie = `jojobot-language=${next}; Path=/; SameSite=Lax; Max-Age=31536000`;
    document.documentElement.lang = next === "en" ? "en" : "zh-CN";
    setCurrent(next);
  };
  return (
    <LanguageContext value={{ language: current, change }}>
      {children}
    </LanguageContext>
  );
}

export function useLanguage() {
  return useContext(LanguageContext).language;
}

export function useText() {
  const language = useLanguage();
  return (chinese: string, english: string) =>
    language === "en" ? english : chinese;
}

export function LanguageToggle({ className = "" }: { className?: string }) {
  const { language, change } = useContext(LanguageContext);
  const next = language === "en" ? "zh" : "en";
  return (
    <button
      type="button"
      className={`language-link ${className}`}
      onClick={() => change(next)}
      aria-label={language === "en" ? "切换到中文" : "Switch to English"}
    >
      {language === "en" ? "中文" : "English"}
    </button>
  );
}

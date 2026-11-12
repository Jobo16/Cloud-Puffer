"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, Search } from "lucide-react";
import { Button } from "./ui";
import { LanguageToggle, useLanguage, useText } from "./language";
import type { SiteLanguage } from "@/lib/site-language";
import { localizeError } from "@/lib/client-copy";

type Account = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  dailyPointLimit: number | null;
  pointLimit: number;
  usedPoints: number;
};
type Listing = { total: number; users: Account[] };

async function adminApi<T>(
  method: "GET" | "PATCH",
  search = "",
  body?: unknown,
  language: SiteLanguage = "zh",
) {
  const response = await fetch(
    `/api/admin${search ? `?search=${encodeURIComponent(search)}` : ""}`,
    {
      method,
      cache: "no-store",
      credentials: "same-origin",
      headers:
        body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
  );
  if (response.status === 401) {
    window.location.assign(`${language === "en" ? "/en" : ""}/?auth=login`);
    throw new Error(
      language === "en" ? "Please sign in again." : "请重新登录。",
    );
  }
  const data = await response.json();
  if (!response.ok) throw new Error(localizeError(data, language));
  return data as T;
}

function UserRow({
  account,
  onSaved,
}: {
  account: Account;
  onSaved: () => Promise<void>;
}) {
  const t = useText();
  const language = useLanguage();
  const [value, setValue] = useState(account.dailyPointLimit?.toString() ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const current = account.dailyPointLimit?.toString() ?? "";
  async function save() {
    setSaving(true);
    setError("");
    try {
      await adminApi(
        "PATCH",
        "",
        {
          userId: account.id,
          dailyPointLimit: value === "" ? null : Number(value),
        },
        language,
      );
      await onSaved();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : t("保存失败，请重试。", "Could not save. Please try again."),
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="admin-user">
      <div className="admin-user-main">
        <strong>{account.name}</strong>
        <span>{account.email}</span>
      </div>
      <span className="admin-user-usage">
        {t("今日", "Today")} {account.usedPoints} / {account.pointLimit}{" "}
        {t("分", "points")}
      </span>
      <div className="admin-user-limit">
        <label>
          {t(
            "每日额度（空为默认，0 暂停对话）",
            "Daily limit (blank for default, 0 to pause chat)",
          )}
          <input
            type="number"
            min={0}
            max={1000000}
            step={1}
            value={value}
            placeholder={t("默认额度", "Default limit")}
            onChange={(event) => setValue(event.target.value)}
          />
        </label>
        <Button
          disabled={
            saving ||
            value === current ||
            (value !== "" &&
              (!Number.isInteger(Number(value)) ||
                Number(value) < 0 ||
                Number(value) > 1000000))
          }
          onClick={save}
        >
          {saving ? t("保存中…", "Saving…") : t("保存", "Save")}
        </Button>
      </div>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function AdminPage({ initial }: { initial: Listing }) {
  const t = useText();
  const language = useLanguage();
  const [listing, setListing] = useState(initial);
  const [search, setSearch] = useState("");
  const [applied, setApplied] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  async function load(query: string) {
    setLoading(true);
    setError("");
    try {
      setListing(await adminApi<Listing>("GET", query, undefined, language));
      setApplied(query);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : t("加载失败，请重试。", "Could not load. Please try again."),
      );
    } finally {
      setLoading(false);
    }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    void load(search);
  }
  return (
    <main className="admin-page">
      <div className="admin-shell content-section">
        <header className="admin-heading">
          <Link href="/app" className="admin-back">
            <ArrowLeft size={18} /> {t("返回工作区", "Back to workspace")}
          </Link>
          <h1>{t("后台管理", "Admin")}</h1>
          <LanguageToggle />
        </header>
        <div className="admin-summary">
          {t("账号总数", "Accounts")} <strong>{listing?.total ?? "—"}</strong>
        </div>
        <form className="admin-search" onSubmit={submit}>
          <input
            type="search"
            aria-label={t("搜索邮箱", "Search email")}
            placeholder={t("搜索邮箱", "Search email")}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            maxLength={100}
          />
          <Button type="submit" disabled={loading}>
            <Search size={16} /> {t("搜索", "Search")}
          </Button>
        </form>
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
        <div className="admin-list">
          {listing.users.length === 0 ? (
            <p>{t("没有找到账号。", "No accounts found.")}</p>
          ) : (
            listing.users.map((account) => (
              <UserRow
                key={`${account.id}:${account.dailyPointLimit}`}
                account={account}
                onSaved={() => load(applied)}
              />
            ))
          )}
        </div>
        {!applied && listing.total > listing.users.length && (
          <p className="admin-more">
            {t(
              "只显示最近 50 个账号。可按邮箱搜索其他账号。",
              "Showing the 50 most recent accounts. Search by email to find others.",
            )}
          </p>
        )}
      </div>
    </main>
  );
}

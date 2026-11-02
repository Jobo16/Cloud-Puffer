"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, Search } from "lucide-react";
import { Button } from "./ui";

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
    window.location.assign("/?auth=login");
    throw new Error("请重新登录。");
  }
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "操作未完成，请重试。");
  return data as T;
}

function UserRow({
  account,
  onSaved,
}: {
  account: Account;
  onSaved: () => Promise<void>;
}) {
  const [value, setValue] = useState(account.dailyPointLimit?.toString() ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const current = account.dailyPointLimit?.toString() ?? "";
  async function save() {
    setSaving(true);
    setError("");
    try {
      await adminApi("PATCH", "", {
        userId: account.id,
        dailyPointLimit: value === "" ? null : Number(value),
      });
      await onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "保存失败，请重试。");
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
        今日 {account.usedPoints} / {account.pointLimit} 分
      </span>
      <div className="admin-user-limit">
        <label>
          每日额度（空为默认，0 暂停对话）
          <input
            type="number"
            min={0}
            max={1000000}
            step={1}
            value={value}
            placeholder="默认额度"
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
          {saving ? "保存中…" : "保存"}
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
  const [listing, setListing] = useState(initial);
  const [search, setSearch] = useState("");
  const [applied, setApplied] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  async function load(query: string) {
    setLoading(true);
    setError("");
    try {
      setListing(await adminApi<Listing>("GET", query));
      setApplied(query);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "加载失败，请重试。");
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
            <ArrowLeft size={18} /> 返回工作区
          </Link>
          <h1>后台管理</h1>
        </header>
        <div className="admin-summary">
          账号总数 <strong>{listing?.total ?? "—"}</strong>
        </div>
        <form className="admin-search" onSubmit={submit}>
          <input
            type="search"
            aria-label="搜索邮箱"
            placeholder="搜索邮箱"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            maxLength={100}
          />
          <Button type="submit" disabled={loading}>
            <Search size={16} /> 搜索
          </Button>
        </form>
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
        <div className="admin-list">
          {listing.users.length === 0 ? (
            <p>没有找到账号。</p>
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
            只显示最近 50 个账号。可按邮箱搜索其他账号。
          </p>
        )}
      </div>
    </main>
  );
}

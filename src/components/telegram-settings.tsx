"use client";
import { useState } from "react";
import { Send } from "lucide-react";
import type { AppState } from "@/server/state";
import { api } from "@/lib/api";
import { Button } from "./ui";
import type { Confirm, Mutate } from "./workspace";

export function TelegramSettings({
  state,
  mutate,
  confirm,
}: {
  state: AppState;
  mutate: Mutate;
  confirm: Confirm;
}) {
  const [binding, setBinding] = useState<{
    command: string;
    expiresAt: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function connect() {
    setBusy(true);
    setError("");
    try {
      setBinding(await api("telegram/binding", "POST"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="settings-card glass">
      <div className="row">
        <span className="settings-icon">
          <Send size={22} />
        </span>
        <h3>在 Telegram 里，接着聊</h3>
      </div>
      {state.telegram.connection ? (
        <>
          <p className="notice">
            {state.telegram.connection.active
              ? "Telegram 账号已绑定"
              : "Telegram 连接不可用，请断开后重新绑定"}
          </p>
          <Button
            onClick={() =>
              confirm(
                "断开 Telegram 连接？",
                "网页对话会保留，待发送的 Telegram 回复会停止。",
                async () => {
                  const ok = await mutate("telegram/connection", "DELETE");
                  if (ok) setBinding(null);
                  return ok;
                },
              )
            }
          >
            断开连接
          </Button>
        </>
      ) : (
        <>
          {!state.telegram.enabled && (
            <p className="muted small">Telegram 接入尚未开放。</p>
          )}
          <div className="row">
            {state.telegram.botUrl && (
              <a
                href={state.telegram.botUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                打开 Telegram 机器人
              </a>
            )}
            <Button
              className="primary"
              disabled={busy || !state.telegram.enabled}
              onClick={connect}
            >
              {busy ? "准备中…" : binding ? "重新生成绑定码" : "连接 Telegram"}
            </Button>
          </div>
          {binding && state.telegram.enabled && (
            <label>
              复制整行，在机器人私聊中发送
              <input
                readOnly
                value={binding.command}
                onFocus={(e) => e.currentTarget.select()}
              />
            </label>
          )}
        </>
      )}
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

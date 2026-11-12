"use client";
import { useState } from "react";
import { Send } from "lucide-react";
import type { AppState } from "@/server/state";
import { api } from "@/lib/api";
import { Button } from "./ui";
import type { Confirm, Mutate } from "./workspace";
import { useText } from "./language";

export function TelegramSettings({
  state,
  mutate,
  confirm,
}: {
  state: AppState;
  mutate: Mutate;
  confirm: Confirm;
}) {
  const t = useText();
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
    <div className="settings-card">
      <div className="row">
        <span className="settings-icon">
          <Send size={22} />
        </span>
        <h3>{t("在 Telegram 里，接着聊", "Continue in Telegram")}</h3>
      </div>
      {state.telegram.connection ? (
        <>
          <p className="notice">
            {state.telegram.connection.active
              ? t("Telegram 账号已绑定", "Telegram account linked")
              : t(
                  "Telegram 连接不可用，请断开后重新绑定",
                  "Telegram connection unavailable. Disconnect and link again.",
                )}
          </p>
          <Button
            onClick={() =>
              confirm(
                t("断开 Telegram 连接？", "Disconnect Telegram?"),
                t(
                  "网页对话会保留，待发送的 Telegram 回复会停止。",
                  "Your web conversation remains. Pending Telegram replies will stop.",
                ),
                async () => {
                  const ok = await mutate("telegram/connection", "DELETE");
                  if (ok) setBinding(null);
                  return ok;
                },
              )
            }
          >
            {t("断开连接", "Disconnect")}
          </Button>
        </>
      ) : (
        <>
          {!state.telegram.enabled && (
            <p className="muted small">
              {t(
                "Telegram 接入尚未开放。",
                "Telegram access is not enabled yet.",
              )}
            </p>
          )}
          <div className="row">
            {state.telegram.botUrl && (
              <a
                href={state.telegram.botUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t("打开 Telegram 机器人", "Open Telegram bot")}
              </a>
            )}
            <Button
              className="primary"
              disabled={busy || !state.telegram.enabled}
              onClick={connect}
            >
              {busy
                ? t("准备中…", "Preparing…")
                : binding
                  ? t("重新生成绑定码", "Generate a new code")
                  : t("连接 Telegram", "Connect Telegram")}
            </Button>
          </div>
          {binding && state.telegram.enabled && (
            <label>
              {t(
                "复制整行，在机器人私聊中发送",
                "Copy this line and send it in a private chat with the bot",
              )}
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

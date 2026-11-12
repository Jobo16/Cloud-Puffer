"use client";
import { useState } from "react";
import { MessageCircle } from "lucide-react";
import type { AppState } from "@/server/state";
import { api } from "@/lib/api";
import { Button } from "./ui";
import type { Confirm, Mutate } from "./workspace";
import { useLanguage, useText } from "./language";

export function QqSettings({
  state,
  mutate,
  confirm,
}: {
  state: AppState;
  mutate: Mutate;
  confirm: Confirm;
}) {
  const t = useText();
  const language = useLanguage();
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
      setBinding(await api("qq/binding", "POST"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="settings-card glass">
        <div className="row">
          <span className="settings-icon">
            <MessageCircle size={22} />
          </span>
          <h3>{t("在 QQ 里，接着聊", "Continue in QQ")}</h3>
        </div>
        {state.qq.connection ? (
          <>
            <p className="notice">
              {t("QQ 账号已绑定", "QQ account linked")}
              {!state.qq.enabled &&
                t(" · 渠道暂未开放", " · Channel unavailable")}
            </p>
            <Button
              onClick={() =>
                confirm(
                  t("断开 QQ 连接？", "Disconnect QQ?"),
                  t(
                    "网页对话和资料会保留，待发送的 QQ 回复会停止。",
                    "Your web conversation and data remain. Pending QQ replies will stop.",
                  ),
                  async () => {
                    const ok = await mutate("qq/connection", "DELETE");
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
            <p className="muted small">
              {state.qq.enabled
                ? t(
                    `生成绑定码，在 QQ 中私聊发送给${state.preferences.agentName}。`,
                    `Generate a binding code and send it to ${state.preferences.agentName} in a QQ private chat.`,
                  )
                : t(
                    "QQ 接入尚未开放，配置完成后可绑定。",
                    "QQ access is not enabled yet.",
                  )}
            </p>
            <div className="row">
              {state.qq.botUrl && (
                <a
                  href={state.qq.botUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t("打开 QQ 机器人", "Open QQ bot")}
                </a>
              )}
              <Button
                className="primary"
                disabled={busy || !state.qq.enabled}
                onClick={connect}
              >
                {busy
                  ? t("准备中…", "Preparing…")
                  : binding
                    ? t("重新生成绑定码", "Generate a new code")
                    : t("连接 QQ", "Connect QQ")}
              </Button>
            </div>
            {binding && state.qq.enabled && (
              <div className="form-stack">
                <label>
                  {t(
                    "复制整行，在 QQ 私聊中发送",
                    "Copy this line and send it in a QQ private chat",
                  )}
                  <input
                    readOnly
                    value={binding.command}
                    onFocus={(e) => e.currentTarget.select()}
                  />
                </label>
                <p className="muted small">
                  {t(
                    "仅用于绑定你的账号，请勿转发。有效至",
                    "For your account only. Do not share. Valid until",
                  )}{" "}
                  {new Date(binding.expiresAt).toLocaleTimeString(
                    language === "en" ? "en-US" : "zh-CN",
                    {
                      hour: "2-digit",
                      minute: "2-digit",
                    },
                  )}
                  {t(
                    "；重新生成会使旧码失效。",
                    ". Generating another code invalidates this one.",
                  )}
                </p>
              </div>
            )}
          </>
        )}
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
        <p className="fine-print">
          {t(
            "目前支持文字私聊和表情回复。群聊、读取图片与语音尚未开放。",
            "Private text chats and sticker replies are supported. Group chats, image reading, and voice are not available.",
          )}
        </p>
      </div>
    </>
  );
}

"use client";
import { useState } from "react";
import { MessageCircle } from "lucide-react";
import type { AppState } from "@/server/state";
import { api } from "@/lib/api";
import { Button } from "./ui";
import type { Confirm, Mutate } from "./workspace";

export function QqSettings({
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
          <h3>在 QQ 里，接着聊</h3>
        </div>
        {state.qq.connection ? (
          <>
            <p className="notice">
              QQ 账号已绑定{!state.qq.enabled && " · 渠道暂未开放"}
            </p>
            <Button
              onClick={() =>
                confirm(
                  "断开 QQ 连接？",
                  "网页对话和资料会保留，待发送的 QQ 回复会停止。",
                  async () => {
                    const ok = await mutate("qq/connection", "DELETE");
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
            <p className="muted small">
              {state.qq.enabled
                ? `生成绑定码，在 QQ 中私聊发送给${state.preferences.agentName}。`
                : "QQ 接入尚未开放，配置完成后可绑定。"}
            </p>
            <div className="row">
              {state.qq.botUrl && (
                <a
                  href={state.qq.botUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  打开 QQ 机器人
                </a>
              )}
              <Button
                className="primary"
                disabled={busy || !state.qq.enabled}
                onClick={connect}
              >
                {busy ? "准备中…" : binding ? "重新生成绑定码" : "连接 QQ"}
              </Button>
            </div>
            {binding && state.qq.enabled && (
              <div className="form-stack">
                <label>
                  复制整行，在 QQ 私聊中发送
                  <input
                    readOnly
                    value={binding.command}
                    onFocus={(e) => e.currentTarget.select()}
                  />
                </label>
                <p className="muted small">
                  仅用于绑定你的账号，请勿转发。有效至{" "}
                  {new Date(binding.expiresAt).toLocaleTimeString("zh-CN", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                  ；重新生成会使旧码失效。
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
          目前支持文字私聊和表情回复。群聊、读取图片与语音尚未开放。
        </p>
      </div>
    </>
  );
}

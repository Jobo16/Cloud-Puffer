"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowUp, Check, Square } from "lucide-react";
import { clsx } from "clsx";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { AppState } from "@/server/state";
import { api } from "@/lib/api";
import { Button, Mark } from "./ui";
import { useLanguage, useText } from "./language";
import { localizeActivity, localizeError } from "@/lib/client-copy";
const deliveryLabels = {
  pending: ["等待提交", "Pending"],
  submitting: ["正在提交", "Sending"],
  partial: ["部分内容已提交", "Partially sent"],
  unknown: [
    "投递结果不确定 · 不会自动重发",
    "Delivery uncertain · No automatic retry",
  ],
  failed: [
    "提交失败 · 完整回复见网页",
    "Send failed · Full reply is on the web",
  ],
  not_sent: ["未发送", "Not sent"],
} as const;

// 真实主对话。桌面和手机共用同一套面板，只是可用宽度不同。
export function ChatPanel({
  state,
  refresh,
  active,
}: {
  state: AppState;
  refresh: () => Promise<void>;
  active: boolean;
}) {
  const t = useText();
  const language = useLanguage();
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [older, setOlder] = useState<AppState["runs"]>([]);
  const [olderMore, setOlderMore] = useState<boolean | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const request = useRef<{ text: string; key: string } | null>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const last = state.runs.at(-1);
  useEffect(() => {
    if (follow.current && scroll.current)
      scroll.current.scrollTop = scroll.current.scrollHeight;
  }, [last?.output, last?.id, last?.status, active]);
  async function mutate(path: string, method: string, body?: unknown) {
    setError("");
    try {
      await api(path, method, body);
      await refresh();
      return true;
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : t(
              "暂时无法完成，请重试。",
              "Could not complete this request. Please try again.",
            ),
      );
      return false;
    }
  }
  async function send(event?: FormEvent) {
    event?.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;
    if (request.current?.text !== text)
      request.current = { text, key: crypto.randomUUID() };
    setSending(true);
    follow.current = true;
    if (
      await mutate("chat", "POST", { text, requestKey: request.current.key })
    ) {
      setDraft("");
      request.current = null;
    }
    setSending(false);
    composer.current?.focus();
  }
  async function loadHistory() {
    const first = older[0] ?? state.runs[0];
    if (!first) return;
    setLoadingHistory(true);
    try {
      const result = await api<{ runs: AppState["runs"]; hasMore: boolean }>(
        `history?time=${encodeURIComponent(first.createdAt)}&id=${first.id}`,
      );
      setOlder((rows) => [...result.runs, ...rows]);
      setOlderMore(result.hasMore);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingHistory(false);
    }
  }
  const allRuns = [
    ...older.filter((r) => !state.runs.some((s) => s.id === r.id)),
    ...state.runs,
  ];
  return (
    <div className="chat-layout">
      <div
        className="chat-scroll"
        ref={scroll}
        onScroll={(e) => {
          const el = e.currentTarget;
          follow.current =
            el.scrollHeight - el.scrollTop - el.clientHeight < 100;
        }}
      >
        {allRuns.length === 0 ? (
          <section className="welcome">
            <div className="welcome-symbol glass">
              <Mark large />
            </div>
            <h2>
              {t("把想到的，交给", "Tell")} {state.preferences.agentName}
              {t("。", " what is on your mind.")}
            </h2>
          </section>
        ) : (
          <div className="messages">
            {(olderMore ?? state.hasMore) && (
              <Button
                className="history-button"
                disabled={loadingHistory}
                onClick={loadHistory}
              >
                {loadingHistory
                  ? t("加载中…", "Loading…")
                  : t("查看更早的对话", "View earlier messages")}
              </Button>
            )}
            {allRuns.map((run) => (
              <article className="turn" key={run.id}>
                <div className="user-message">
                  <div className="message-text">{run.input}</div>
                  <small>
                    {run.source === "wechat"
                      ? t("来自微信 · ", "From WeChat · ")
                      : run.source === "qq"
                        ? t("来自 QQ · ", "From QQ · ")
                        : run.source === "telegram"
                          ? t("来自 Telegram · ", "From Telegram · ")
                          : ""}
                    {new Date(run.createdAt).toLocaleTimeString(
                      language === "en" ? "en-US" : "zh-CN",
                      {
                        hour: "2-digit",
                        minute: "2-digit",
                        timeZone: "Asia/Shanghai",
                      },
                    )}
                  </small>
                </div>
                <div className="assistant-message">
                  <Mark />
                  <div className="assistant-content">
                    {run.output && (
                      <div className="markdown">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            a: ({ children, href }) => (
                              <a
                                href={href}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                {children}
                              </a>
                            ),
                            img: () => null,
                          }}
                        >
                          {run.output}
                        </ReactMarkdown>
                      </div>
                    )}
                    {run.sticker && (
                      // Bundled original sticker; its URL is selected from the server's fixed catalog.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        className="chat-sticker"
                        src={run.sticker.src}
                        alt={run.sticker.label}
                        width={160}
                        height={160}
                      />
                    )}
                    {run.activities.length > 0 && (
                      <div className="activities">
                        {run.activities.map((activity) => (
                          <div key={activity.id}>
                            <Check size={14} />
                            <span>
                              {localizeActivity(activity.label, language)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                    {["running", "queued"].includes(run.status) && (
                      <div className="thinking" role="status">
                        <span />
                        {run.status === "queued"
                          ? t(
                              `等待 ${state.preferences.agentName} 处理…`,
                              `Waiting for ${state.preferences.agentName}…`,
                            )
                          : t(
                              `${state.preferences.agentName} 正在思考…`,
                              `${state.preferences.agentName} is thinking…`,
                            )}
                        <button
                          onClick={() =>
                            void mutate(`runs/${run.id}/cancel`, "POST")
                          }
                        >
                          <Square size={12} />
                          {t("停止", "Stop")}
                        </button>
                      </div>
                    )}
                    {run.error && (
                      <p className="inline-error">
                        {localizeError({ error: run.error }, language)}
                      </p>
                    )}
                    {run.status === "cancelled" && (
                      <p className="muted small">
                        {t(
                          "已停止 · 已完成的操作仍然保留",
                          "Stopped · Completed actions remain saved",
                        )}
                      </p>
                    )}
                    {run.source !== "web" && (
                      <small className="delivery">
                        {run.source === "qq"
                          ? "QQ"
                          : run.source === "telegram"
                            ? "Telegram"
                            : t("微信", "WeChat")}
                        {run.deliveryStatus !== "accepted" &&
                          ` · ${t(deliveryLabels[run.deliveryStatus][0], deliveryLabels[run.deliveryStatus][1])}`}
                      </small>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
      <div className="composer-area">
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
        {/* 用量只在快用完时出现，平时不占视线 */}
        {state.quota.available <= 10 && (
          <p
            className={clsx(
              "quota-hint",
              state.quota.used >= state.quota.limit && "spent",
            )}
            role="status"
          >
            {state.quota.limit === 0
              ? t("当前对话已暂停。", "Chat is paused.")
              : state.quota.available === 0
                ? t(
                    "今日积分已用完，北京时间零点恢复。",
                    "Today's points are used up. They reset at midnight Beijing time.",
                  )
                : t(
                    `今日还可用 ${state.quota.available} 积分。`,
                    `${state.quota.available} points left today.`,
                  )}
          </p>
        )}
        <form className="composer glass" onSubmit={send}>
          <textarea
            ref={composer}
            aria-label={t("给助手发消息", "Message the assistant")}
            placeholder={t(
              `有什么想交给 ${state.preferences.agentName}？`,
              `Message ${state.preferences.agentName}…`,
            )}
            value={draft}
            maxLength={12000}
            rows={2}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (
                e.key === "Enter" &&
                !e.shiftKey &&
                !e.nativeEvent.isComposing &&
                e.nativeEvent.keyCode !== 229
              ) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <div className="composer-actions">
            <Button
              type="submit"
              className="send-button"
              aria-label={t("发送消息", "Send message")}
              disabled={!draft.trim() || sending}
            >
              <ArrowUp size={20} />
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

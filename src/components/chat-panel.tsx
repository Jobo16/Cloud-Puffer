"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowUp,
  ArrowUpRight,
  Brain,
  Check,
  Plus,
  Square,
} from "lucide-react";
import { clsx } from "clsx";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { AppState } from "@/server/state";
import { api } from "@/lib/api";
import { Button, Mark } from "./ui";
const deliveryLabels = {
  pending: "等待提交",
  submitting: "正在提交",
  accepted: "已提交 · 未确认送达",
  partial: "部分提交成功 · 完整回复见网页",
  unknown: "投递结果不确定 · 不会自动重发",
  failed: "提交失败 · 完整回复见网页",
  not_sent: "未发送",
};

// 真实主对话。桌面和手机共用同一套面板，只是可用宽度不同。
export function ChatPanel({
  state,
  refresh,
  onManage,
  active,
}: {
  state: AppState;
  refresh: () => Promise<void>;
  onManage: (page: "tasks" | "memories") => void;
  active: boolean;
}) {
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
      setError(e instanceof Error ? e.message : "暂时无法完成，请重试。");
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
            <h2>把想到的，交给 {state.preferences.agentName}。</h2>
            <p>
              记一件事，理一个思路，或只是聊聊天。
              <br />
              不用一次想清楚，我们慢慢来。
            </p>
            <div className="suggestions">
              {[
                ...(state.preferences.tasksEnabled
                  ? [
                      {
                        icon: Plus,
                        title: "记下一个待办",
                        text: "帮我记一条待办：",
                      },
                    ]
                  : []),
                ...(state.preferences.memoryEnabled
                  ? [
                      {
                        icon: Brain,
                        title: "记住我的偏好",
                        text: "请记住我的偏好：",
                      },
                    ]
                  : []),
                {
                  icon: ArrowUpRight,
                  title: "一起理清思路",
                  text: "我想和你一起理清一个想法：",
                },
              ].map(({ icon: Icon, title, text }) => (
                <button
                  className="suggestion glass"
                  key={title}
                  onClick={() => {
                    setDraft(text);
                    composer.current?.focus();
                  }}
                >
                  <Icon size={19} />
                  <span>{title}</span>
                  <ArrowUpRight size={15} />
                </button>
              ))}
            </div>
          </section>
        ) : (
          <div className="messages">
            {(olderMore ?? state.hasMore) && (
              <Button
                className="history-button"
                disabled={loadingHistory}
                onClick={loadHistory}
              >
                {loadingHistory ? "加载中…" : "查看更早的对话"}
              </Button>
            )}
            {allRuns.map((run) => (
              <article className="turn" key={run.id}>
                <div className="user-message">
                  <div className="message-text">{run.input}</div>
                  <small>
                    {run.source === "wechat"
                      ? "来自微信 · "
                      : run.source === "qq"
                        ? "来自 QQ · "
                        : ""}
                    {new Date(run.createdAt).toLocaleTimeString("zh-CN", {
                      hour: "2-digit",
                      minute: "2-digit",
                      timeZone: "Asia/Shanghai",
                    })}
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
                            <span>{activity.label}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {["running", "queued"].includes(run.status) && (
                      <div className="thinking" role="status">
                        <span />
                        {run.status === "queued"
                          ? `等待 ${state.preferences.agentName} 处理…`
                          : `${state.preferences.agentName} 正在思考…`}
                        <button
                          onClick={() =>
                            void mutate(`runs/${run.id}/cancel`, "POST")
                          }
                        >
                          <Square size={12} />
                          停止
                        </button>
                      </div>
                    )}
                    {run.error && <p className="inline-error">{run.error}</p>}
                    {run.status === "cancelled" && (
                      <p className="muted small">
                        已停止 · 已完成的操作仍然保留
                      </p>
                    )}
                    {run.source !== "web" && (
                      <small className="delivery">
                        {run.source === "qq" ? "QQ · " : "微信 · "}
                        {deliveryLabels[run.deliveryStatus]}
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
        {!state.modelReady && (
          <div className="model-notice">
            <span className="status-dot offline" />
            对话服务未连接，可先整理
            <button onClick={() => onManage("tasks")}>待办</button>和
            <button onClick={() => onManage("memories")}>记忆</button>。
          </div>
        )}
        {/* 用量只在快用完时出现，平时不占视线 */}
        {state.quota.limit - state.quota.used <= 5 && (
          <p
            className={clsx(
              "quota-hint",
              state.quota.used >= state.quota.limit && "spent",
            )}
            role="status"
          >
            {state.quota.used >= state.quota.limit
              ? "今天的对话次数用完了，北京时间零点恢复。"
              : `今天还能聊 ${state.quota.limit - state.quota.used} 次。`}
          </p>
        )}
        <form className="composer glass" onSubmit={send}>
          <textarea
            ref={composer}
            aria-label="给助手发消息"
            placeholder={`有什么想交给 ${state.preferences.agentName}？`}
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
              aria-label="发送消息"
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

"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowUp,
  ArrowUpRight,
  Brain,
  Check,
  ListTodo,
  MessageCircle,
  Plus,
  Settings,
  Square,
  X,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { clsx } from "clsx";
import type { AppState } from "@/server/state";
import { api } from "@/lib/api";
import { Button, Mark, Modal } from "./ui";
import { TasksPanel, MemoryPanel, SettingsPanel } from "./workspace-panels";

type Page = "chat" | "tasks" | "memories" | "settings";
export type Mutate = (
  path: string,
  method: string,
  body?: unknown,
) => Promise<boolean>;
export type Confirm = (
  title: string,
  description: string,
  action: () => Promise<boolean>,
) => void;
const navigation = [
  { id: "chat", label: "和 JOJO 聊聊", icon: MessageCircle },
  { id: "tasks", label: "我的事项", icon: ListTodo },
  { id: "memories", label: "关于我的记忆", icon: Brain },
  { id: "settings", label: "设置与连接", icon: Settings },
] as const;
const deliveryLabels = {
  pending: "等待提交",
  submitting: "正在提交",
  accepted: "已提交 · 未确认送达",
  partial: "部分提交成功 · 完整回复见网页",
  unknown: "投递结果不确定 · 不会自动重发",
  failed: "提交失败 · 完整回复见网页",
  not_sent: "未发送",
};

export function Workspace({
  initial,
  user,
}: {
  initial: AppState;
  user: { name: string; email: string };
}) {
  const [state, setState] = useState(initial);
  const [page, setPage] = useState<Page>("chat");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(true);
  const [older, setOlder] = useState<AppState["runs"]>([]);
  const [olderMore, setOlderMore] = useState<boolean | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [confirmation, setConfirmation] = useState<{
    title: string;
    description: string;
    action: () => Promise<boolean>;
  } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const request = useRef<{ text: string; key: string } | null>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  useEffect(() => {
    const events = new EventSource("/api/app/events");
    events.onmessage = (event) => {
      setState(JSON.parse(event.data));
      setConnected(true);
    };
    events.onerror = () => {
      setConnected(false);
      void api<AppState>("state")
        .then(setState)
        .catch(() => undefined);
    };
    return () => events.close();
  }, []);
  const last = state.runs.at(-1);
  useEffect(() => {
    if (follow.current && scroll.current)
      scroll.current.scrollTop = scroll.current.scrollHeight;
  }, [last?.output, last?.id, last?.status, page]);
  async function refresh() {
    setState(await api<AppState>("state"));
  }
  const mutate: Mutate = async (path, method, body) => {
    setError("");
    try {
      await api(path, method, body);
      await refresh();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "暂时无法完成，请重试。");
      return false;
    }
  };
  const confirm: Confirm = (title, description, action) =>
    setConfirmation({ title, description, action });
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
  const pendingCount = state.tasks.filter((t) => !t.completed).length;
  return (
    <div className="workspace">
      <aside className="sidebar glass">
        <a className="wordmark" href="/app">
          <Mark />
          <span>JOJOBOT</span>
        </a>
        <span className="sidebar-caption">一点秩序，一点从容。</span>
        <nav aria-label="主导航">
          {navigation.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={clsx("nav-item", page === id && "active")}
              aria-current={page === id ? "page" : undefined}
              onClick={() => {
                setPage(id);
                setError("");
              }}
            >
              <Icon size={20} />
              <span>{label}</span>
              {id === "tasks" && pendingCount > 0 && (
                <span className="nav-count">{pendingCount}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="quota">
            <div className="row spread">
              <span>今日对话</span>
              <span>
                {state.quota.used}
                <span className="muted"> / {state.quota.limit}</span>
              </span>
            </div>
            <progress
              aria-label="今日对话用量"
              value={state.quota.used}
              max={state.quota.limit}
            />
            <span className="fine-print">每天零点更新 · 北京时间</span>
          </div>
          <button className="profile" onClick={() => setPage("settings")}>
            <span className="avatar">
              {user.name.slice(0, 1).toUpperCase()}
            </span>
            <span>
              <strong>{user.name}</strong>
              <small>我的个人空间</small>
            </span>
            <Settings size={17} />
          </button>
        </div>
      </aside>
      <main className="main-panel">
        <header className="topbar">
          <div>
            <span className="mobile-brand">
              <Mark />
            </span>
            <h1>{navigation.find((n) => n.id === page)?.label}</h1>
            <span className="topbar-subtitle">
              {page === "chat"
                ? "想到什么，都可以从这里开始。"
                : page === "tasks"
                  ? "给大大小小的事，找个落点。"
                  : page === "memories"
                    ? "你决定 JOJO 记住什么。"
                    : "让助手融入你的日常。"}
            </span>
          </div>
          <span className="connection">
            <span className={clsx("status-dot", !connected && "offline")} />
            {connected ? "已同步" : "正在重连"}
          </span>
        </header>
        {error && (
          <div className="workspace-notice notice error" role="alert">
            <span>{error}</span>
            <button aria-label="关闭提示" onClick={() => setError("")}>
              <X size={17} />
            </button>
          </div>
        )}
        {page === "chat" ? (
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
                  <span className="eyebrow">A SPACE FOR YOUR EVERYDAY</span>
                  <h2>把想到的，交给 JOJO。</h2>
                  <p>
                    记一件事，理一个思路，或只是聊聊天。
                    <br />
                    不用一次想清楚，我们慢慢来。
                  </p>
                  <div className="suggestions">
                    {[
                      {
                        icon: Plus,
                        title: "记下一个待办",
                        text: "帮我记一条待办：",
                      },
                      {
                        icon: Brain,
                        title: "记住我的偏好",
                        text: "请记住我的偏好：",
                      },
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
                                ? "等待 JOJO 处理…"
                                : "JOJO 正在思考…"}
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
                          {run.error && (
                            <p className="inline-error">{run.error}</p>
                          )}
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
              {!state.modelReady && (
                <div className="model-notice">
                  <span className="status-dot offline" />
                  对话服务尚未连接。你可以先管理
                  <span>
                    <button onClick={() => setPage("tasks")}>待办</button>和
                    <button onClick={() => setPage("memories")}>记忆</button>。
                  </span>
                </div>
              )}
              <form className="composer glass" onSubmit={send}>
                <textarea
                  ref={composer}
                  aria-label="给 JOJO 发消息"
                  placeholder="有什么想交给 JOJO？"
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
                <div className="row spread">
                  <span className="composer-hint">你的想法，在这里接着聊</span>
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
              <p className="composer-footnote">
                JOJO 也可能出错，重要信息记得确认。
              </p>
            </div>
          </div>
        ) : (
          <div className="page-scroll">
            {page === "tasks" ? (
              <TasksPanel
                tasks={state.tasks}
                mutate={mutate}
                confirm={confirm}
              />
            ) : page === "memories" ? (
              <MemoryPanel
                memories={state.memories}
                mutate={mutate}
                confirm={confirm}
              />
            ) : (
              <SettingsPanel
                state={state}
                user={user}
                mutate={mutate}
                confirm={confirm}
                onClear={() => {
                  setOlder([]);
                  setOlderMore(null);
                }}
              />
            )}
          </div>
        )}
      </main>
      {confirmation && (
        <Modal
          title={confirmation.title}
          description={confirmation.description}
          onClose={() => {
            if (!confirming) setConfirmation(null);
          }}
        >
          {error && (
            <p className="notice error" role="alert">
              {error}
            </p>
          )}
          <div className="dialog-actions">
            <Button disabled={confirming} onClick={() => setConfirmation(null)}>
              取消
            </Button>
            <Button
              className="danger"
              disabled={confirming}
              onClick={async () => {
                setConfirming(true);
                if (await confirmation.action()) setConfirmation(null);
                setConfirming(false);
              }}
            >
              {confirming ? "处理中…" : "确认"}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

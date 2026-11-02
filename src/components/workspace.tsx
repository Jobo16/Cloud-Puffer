"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Brain,
  ListTodo,
  MessageCircle,
  Settings,
  SlidersHorizontal,
  Smartphone,
  X,
} from "lucide-react";
import { clsx } from "clsx";
import type { AppState } from "@/server/state";
import { api } from "@/lib/api";
import { Button, Mark, Modal } from "./ui";
import { ChatPanel } from "./chat-panel";
import { AssistantEditor } from "./assistant-editor";
import { TasksPanel, MemoryPanel, SettingsPanel } from "./workspace-panels";

type Page = "assistant" | "chat" | "tasks" | "memories" | "settings";
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
  { id: "chat", label: "聊聊", icon: MessageCircle },
  { id: "assistant", label: "助手配置", icon: SlidersHorizontal },
  { id: "tasks", label: "我的事项", icon: ListTodo },
  { id: "memories", label: "记忆", icon: Brain },
  { id: "settings", label: "设置与连接", icon: Settings },
] as const;

export function Workspace({
  initial,
  user,
}: {
  initial: AppState;
  user: { name: string; email: string };
}) {
  const [state, setState] = useState(initial);
  const [page, setPage] = useState<Page>("chat");
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(true);
  const [chatKey, setChatKey] = useState(0);
  const [confirmation, setConfirmation] = useState<{
    title: string;
    description: string;
    action: () => Promise<boolean>;
  } | null>(null);
  const [confirming, setConfirming] = useState(false);
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
  const pendingCount = state.tasks.filter((t) => !t.completed).length;
  return (
    <div className="workspace" data-page={page}>
      <aside className="sidebar glass">
        <Link className="wordmark" href="/">
          <Mark />
          <span>JOJOBOT</span>
        </Link>
        <span className="sidebar-caption">一点秩序，一点从容。</span>
        <nav aria-label="主导航">
          {navigation.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              aria-label={label}
              title={label}
              className={clsx("nav-item", `nav-${id}`, page === id && "active")}
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
      <main
        className="main-panel configuration-panel"
        aria-label="助手配置与资料"
      >
        <header className="topbar">
          <div>
            <span className="mobile-brand">
              <Mark />
            </span>
            <h1>
              {page === "chat"
                ? "助手配置"
                : navigation.find((n) => n.id === page)?.label}
            </h1>
            <span className="topbar-subtitle">
              {page === "chat" || page === "assistant"
                ? "按你的习惯，塑造你的助手。"
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
        <div
          className="page-scroll"
          hidden={page !== "chat" && page !== "assistant"}
        >
          <AssistantEditor
            preferences={state.preferences}
            onSaved={(preferences) =>
              setState((current) => ({ ...current, preferences }))
            }
          />
        </div>
        {page !== "chat" && page !== "assistant" && (
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
                onClear={() => setChatKey((key) => key + 1)}
              />
            )}
          </div>
        )}
      </main>
      <aside className="preview-panel" aria-label="主对话实时预览">
        <header className="preview-heading">
          <span className="row">
            <Smartphone size={17} />
            实时预览
          </span>
          <span className="preview-badge">主对话</span>
        </header>
        <div className="phone-frame">
          <div className="phone-hardware" aria-hidden="true">
            <span />
          </div>
          <header className="phone-header">
            <Mark />
            <div>
              <strong>{state.preferences.agentName}</strong>
              <small>你的个人助手</small>
            </div>
            <span className="connection">
              <span className={clsx("status-dot", !connected && "offline")} />
              {connected ? "已同步" : "正在重连"}
            </span>
          </header>
          <ChatPanel
            key={chatKey}
            state={state}
            refresh={refresh}
            onManage={setPage}
            active={page === "chat"}
          />
          <div className="phone-home" aria-hidden="true">
            <span />
          </div>
        </div>
        <p className="preview-caption">与微信、QQ 共用真实对话和资料</p>
      </aside>
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

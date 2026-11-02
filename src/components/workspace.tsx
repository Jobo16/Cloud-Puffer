"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Brain,
  ListTodo,
  MessageCircle,
  Settings,
  SlidersHorizontal,
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
          </div>
          <button className="profile" onClick={() => setPage("settings")}>
            <span className="avatar">
              {user.name.slice(0, 1).toUpperCase()}
            </span>
            <span>
              <strong>{user.name}</strong>
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
          </div>
          {!connected && (
            <span className="connection" title="正在重连">
              <span className="status-dot offline" />
              <span className="sr-only">正在重连</span>
            </span>
          )}
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
        <div className="phone-frame">
          <div className="phone-hardware" aria-hidden="true">
            <span />
          </div>
          <header className="phone-header">
            <Mark />
            <div>
              <strong>{state.preferences.agentName}</strong>
            </div>
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

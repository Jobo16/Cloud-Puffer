"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Brain,
  ListTodo,
  MessageCircle,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import { clsx } from "clsx";
import type { AppState } from "@/server/state";
import { api } from "@/lib/api";
import { Button, Mark, Modal } from "./ui";
import { ChatPanel } from "./chat-panel";
import { AssistantEditor } from "./assistant-editor";
import { ChannelsPanel, MemoryPanel, TasksPanel } from "./workspace-panels";
import { ThemeToggle } from "./theme-toggle";
import { AccountMenu } from "./account-menu";

type Page = "chat" | "tasks" | "memories" | "assistant";
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
// 按发生的频率排：每天用的在前，一个月动一次的在后
const navigation = [
  {
    id: "chat",
    label: "对话",
    icon: MessageCircle,
    summary: "网页和微信共用这一条记录",
  },
  {
    id: "tasks",
    label: "事项",
    icon: ListTodo,
    summary: "随手记下，也可以让 JOJO 替你加",
  },
  { id: "memories", label: "记忆", icon: Brain, summary: "你说要记的，才会留下" },
  {
    id: "assistant",
    label: "助手",
    icon: SlidersHorizontal,
    summary: "名字、说话方式，以及在哪里找到它",
  },
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
  const [section, setSection] = useState<"profile" | "channels">("profile");
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
  const current = navigation.find((item) => item.id === page) ?? navigation[0];
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
          <AccountMenu
            user={user}
            quota={state.quota}
            direction="up"
            onError={setError}
          />
        </div>
      </aside>
      <main className="main-panel">
        <header className="topbar">
          <div className="topbar-title">
            <span className="mobile-brand">
              <Mark />
            </span>
            <div>
              <h1>{current.label}</h1>
              <p className="topbar-sub">{current.summary}</p>
            </div>
          </div>
          <div className="topbar-actions">
            {!connected && (
              <span className="connection" title="正在重连">
                <span className="status-dot offline" />
                <span className="sr-only">正在重连</span>
              </span>
            )}
            {page === "chat" && (
              <Button
                className="clear-chat"
                onClick={() =>
                  confirm(
                    "清空所有聊天记录？",
                    "这会删除网页与微信的主对话内容，无法恢复。事项、记忆和今日用量保留。",
                    async () => {
                      const ok = await mutate("history/clear", "POST", {
                        confirm: true,
                      });
                      if (ok) setChatKey((key) => key + 1);
                      return ok;
                    },
                  )
                }
              >
                <Trash2 size={15} />
                <span>清空对话</span>
              </Button>
            )}
            <ThemeToggle />
            <AccountMenu
              user={user}
              quota={state.quota}
              direction="down"
              compact
              className="topbar-account"
              onError={setError}
            />
          </div>
        </header>
        {error && (
          <div className="workspace-notice notice error" role="alert">
            <span>{error}</span>
            <button aria-label="关闭提示" onClick={() => setError("")}>
              <X size={17} />
            </button>
          </div>
        )}
        {/* 对话常驻挂载：切走再回来，草稿和滚动位置都还在 */}
        <div className="chat-page" hidden={page !== "chat"}>
          <ChatPanel
            key={chatKey}
            state={state}
            refresh={refresh}
            onManage={setPage}
            active={page === "chat"}
          />
        </div>
        {page !== "chat" && (
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
              <div className="content-section">
                <div className="segmented" aria-label="助手设置">
                  {[
                    ["profile", "设定"],
                    ["channels", "接入"],
                  ].map(([key, label]) => (
                    <button
                      key={key}
                      aria-pressed={section === key}
                      className={clsx(section === key && "selected")}
                      onClick={() => setSection(key as "profile" | "channels")}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {/* 设定面板常驻挂载：切到「接入」再回来，改了一半的字段还在 */}
                <div hidden={section !== "profile"}>
                  <AssistantEditor
                    preferences={state.preferences}
                    onSaved={(preferences) =>
                      setState((current) => ({ ...current, preferences }))
                    }
                  />
                </div>
                {section === "channels" && (
                  <ChannelsPanel
                    state={state}
                    mutate={mutate}
                    confirm={confirm}
                  />
                )}
              </div>
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

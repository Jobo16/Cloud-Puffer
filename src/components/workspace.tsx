"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Brain,
  ListTodo,
  Menu,
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
import { ThemeRow, ThemeToggle } from "./theme-toggle";
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
  { id: "chat", label: "对话", icon: MessageCircle },
  { id: "tasks", label: "事项", icon: ListTodo },
  { id: "memories", label: "记忆", icon: Brain },
  { id: "assistant", label: "助手", icon: SlidersHorizontal },
] as const;

export function Workspace({
  initial,
  user,
  admin,
}: {
  initial: AppState;
  user: { name: string; email: string };
  admin: boolean;
}) {
  const [state, setState] = useState(initial);
  const [page, setPage] = useState<Page>("chat");
  const [section, setSection] = useState<"profile" | "channels">("profile");
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(true);
  const [chatKey, setChatKey] = useState(0);
  const [drawer, setDrawer] = useState(false);
  const sidebar = useRef<HTMLElement>(null);
  const drawerToggle = useRef<HTMLButtonElement>(null);
  const drawerOpened = useRef(false);
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
  const showWechatGuide =
    state.channel.enabled &&
    !state.channel.connection &&
    state.runs.length === 0 &&
    !state.hasMore;
  function clearChat() {
    setDrawer(false);
    confirm(
      "清空所有聊天记录？",
      "这会删除网页与微信的主对话内容，无法恢复。事项、记忆和今日用量保留。",
      async () => {
        const ok = await mutate("history/clear", "POST", { confirm: true });
        if (ok) setChatKey((key) => key + 1);
        return ok;
      },
    );
  }
  // Esc 关抽屉；只在打开时挂监听，避免平时抢键盘。
  // 账号浮层和确认弹窗各自也响应 Esc，先让它们处理，别一次关两层
  useEffect(() => {
    if (!drawer) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (document.querySelector(".account-menu, [role='dialog']")) return;
      setDrawer(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [drawer]);
  // 打开时焦点落进菜单，关上还给按钮，键盘和读屏不用从头走一遍
  useEffect(() => {
    if (drawer) {
      drawerOpened.current = true;
      sidebar.current?.focus();
    } else if (drawerOpened.current) {
      drawerToggle.current?.focus();
    }
  }, [drawer]);
  return (
    <div
      className="workspace"
      data-page={page}
      data-drawer={drawer ? "open" : "closed"}
    >
      <aside className="sidebar glass" ref={sidebar} tabIndex={-1}>
        <Link className="wordmark" href="/">
          <Mark />
          <span>云上小肥鱼</span>
        </Link>
        <button
          type="button"
          className="drawer-close"
          aria-label="关闭菜单"
          onClick={() => setDrawer(false)}
        >
          <X size={18} />
        </button>
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
                setDrawer(false);
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
        <div className="sidebar-actions">
          <button type="button" className="drawer-action" onClick={clearChat}>
            <Trash2 size={18} />
            <span>清空对话</span>
          </button>
          <ThemeRow />
        </div>
        <div className="sidebar-bottom">
          <AccountMenu
            user={user}
            quota={state.quota}
            direction="up"
            onError={setError}
          />
        </div>
      </aside>
      {drawer && (
        <button
          type="button"
          className="drawer-backdrop"
          tabIndex={-1}
          aria-label="关闭菜单"
          onClick={() => setDrawer(false)}
        />
      )}
      <main className="main-panel">
        <header className="topbar">
          <div className="topbar-title">
            <button
              type="button"
              ref={drawerToggle}
              className="drawer-toggle"
              aria-label="打开菜单"
              aria-expanded={drawer}
              onClick={() => setDrawer(true)}
            >
              <Menu size={20} />
            </button>
            <h1>{current.label}</h1>
          </div>
          <div className="topbar-actions">
            {!connected && (
              <span className="connection" title="正在重连">
                <span className="status-dot offline" />
                <span className="sr-only">正在重连</span>
              </span>
            )}
            {page === "chat" && (
              <Button className="clear-chat" onClick={clearChat}>
                <Trash2 size={15} />
                <span>清空对话</span>
              </Button>
            )}
            <ThemeToggle />
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
        {showWechatGuide && page === "chat" && (
          <div className="setup-guide">
            <span>1 / 3</span>
            <p>先打开「助手」。</p>
            <Button
              onClick={() => {
                setPage("assistant");
                setError("");
              }}
            >
              打开助手
            </Button>
          </div>
        )}
        {/* 对话常驻挂载：切走再回来，草稿和滚动位置都还在 */}
        <div className="chat-page" hidden={page !== "chat"}>
          <ChatPanel
            key={chatKey}
            state={state}
            refresh={refresh}
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
                agentName={state.preferences.agentName}
                mutate={mutate}
                confirm={confirm}
              />
            ) : (
              <div className="content-section">
                {showWechatGuide && section === "profile" && (
                  <div className="setup-guide">
                    <span>2 / 3</span>
                    <p>接下来选择「接入」。</p>
                    <Button onClick={() => setSection("channels")}>
                      打开接入
                    </Button>
                  </div>
                )}
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
                    agentDevices={state.agentDevices}
                    onDevicesChanged={(agentDevices) =>
                      setState((current) => ({ ...current, agentDevices }))
                    }
                    preferences={state.preferences}
                    admin={admin}
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
                    showWechatGuide={showWechatGuide}
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

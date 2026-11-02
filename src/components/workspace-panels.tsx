"use client";
import { useEffect, useState, type FormEvent } from "react";
import {
  Brain,
  Check,
  Circle,
  CircleCheck,
  Link2,
  Pencil,
  Plus,
  Smartphone,
  Trash2,
} from "lucide-react";
import { clsx } from "clsx";
import type { AppState } from "@/server/state";
import { api } from "@/lib/api";
import { Button, Modal } from "./ui";
import type { Confirm, Mutate } from "./workspace";
import { QqSettings } from "./qq-settings";

type Task = AppState["tasks"][number];
type Memory = AppState["memories"][number];
type PanelProps = { mutate: Mutate; confirm: Confirm };
function localTime(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
function TaskForm({
  task,
  onSave,
  onClose,
}: {
  task?: Task;
  onSave: (data: {
    title: string;
    notes: string;
    dueAt: string | null;
  }) => Promise<boolean>;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(task?.title ?? "");
  const [notes, setNotes] = useState(task?.notes ?? "");
  const [due, setDue] = useState(localTime(task?.dueAt ?? null));
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFailed(false);
    if (
      await onSave({
        title,
        notes,
        dueAt: due ? new Date(due).toISOString() : null,
      })
    )
      onClose();
    else setFailed(true);
    setBusy(false);
  }
  return (
    <Modal
      title={task ? "编辑待办" : "记下一个待办"}
      description="截止时间仅用于记录，定时提醒仍在开发中。"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form className="form-stack" onSubmit={submit}>
        <label>
          要做什么
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            maxLength={200}
            placeholder="一件小事也可以"
          />
        </label>
        <label>
          补充说明
          <textarea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={4000}
            placeholder="可选"
          />
        </label>
        <label>
          截止时间（本地时区）
          <input
            type="datetime-local"
            value={due}
            onChange={(e) => setDue(e.target.value)}
          />
        </label>
        {failed && (
          <p className="notice error" role="alert">
            保存未完成，输入已保留。请重试；若记录已更新，请关闭后重新打开。
          </p>
        )}
        <Button
          className="primary"
          disabled={busy || !title.trim()}
          type="submit"
        >
          {busy ? "保存中…" : "保存待办"}
        </Button>
      </form>
    </Modal>
  );
}
export function TasksPanel({
  tasks,
  mutate,
  confirm,
}: { tasks: Task[] } & PanelProps) {
  const [editor, setEditor] = useState<{ task?: Task; key: string } | null>(
    null,
  );
  const [filter, setFilter] = useState("pending");
  const [working, setWorking] = useState<string | null>(null);
  const visible = tasks.filter(
    (t) => filter === "all" || (filter === "done" ? t.completed : !t.completed),
  );
  return (
    <section className="content-section">
      <div className="section-heading">
        <h2>慢慢来，一件一件。</h2>
        <Button
          className="primary"
          onClick={() => setEditor({ key: crypto.randomUUID() })}
        >
          <Plus size={17} />
          新待办
        </Button>
      </div>
      <div className="segmented glass" aria-label="筛选待办">
        {[
          ["pending", "待完成"],
          ["done", "已完成"],
          ["all", "全部"],
        ].map(([key, label]) => (
          <button
            key={key}
            aria-pressed={filter === key}
            className={clsx(filter === key && "selected")}
            onClick={() => setFilter(key)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="record-list">
        {visible.length === 0 ? (
          <div className="empty-state">
            <CircleCheck size={32} />
            <h3>
              {filter === "done" ? "完成的小事，会留在这里" : "给自己留点余地"}
            </h3>
            <p>想到要做的事，就随手记下来。</p>
          </div>
        ) : (
          visible.map((task) => (
            <div
              className={clsx("task-row", task.completed && "completed")}
              key={task.id}
            >
              <button
                className="task-check"
                aria-label={`${task.completed ? "取消完成" : "完成"}：${task.title}`}
                disabled={working === task.id}
                onClick={async () => {
                  setWorking(task.id);
                  await mutate(`tasks/${task.id}`, "PATCH", {
                    version: task.version,
                    completed: !task.completed,
                  });
                  setWorking(null);
                }}
              >
                {task.completed ? (
                  <CircleCheck size={23} />
                ) : (
                  <Circle size={23} />
                )}
              </button>
              <div className="record-content">
                <strong>{task.title}</strong>
                {task.notes && <p>{task.notes}</p>}
                {task.dueAt && (
                  <small>
                    {new Date(task.dueAt).toLocaleString("zh-CN", {
                      month: "long",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}{" "}
                    截止
                  </small>
                )}
              </div>
              <div className="record-actions">
                <Button
                  className="icon-button"
                  aria-label={`编辑：${task.title}`}
                  onClick={() => setEditor({ task, key: crypto.randomUUID() })}
                >
                  <Pencil size={16} />
                </Button>
                <Button
                  className="icon-button"
                  aria-label={`删除：${task.title}`}
                  onClick={() =>
                    confirm("删除这条待办？", task.title, () =>
                      mutate(`tasks/${task.id}`, "DELETE", {
                        version: task.version,
                      }),
                    )
                  }
                >
                  <Trash2 size={16} />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
      {tasks.length >= 200 && (
        <p className="muted small">当前展示最近的 200 条事项。</p>
      )}
      {editor && (
        <TaskForm
          key={editor.key}
          task={editor.task}
          onClose={() => setEditor(null)}
          onSave={(data) =>
            editor.task
              ? mutate(`tasks/${editor.task.id}`, "PATCH", {
                  ...data,
                  version: editor.task.version,
                })
              : mutate("tasks", "POST", { ...data, requestKey: editor.key })
          }
        />
      )}
    </section>
  );
}
function MemoryForm({
  memory,
  agentName,
  onSave,
  onClose,
}: {
  memory?: Memory;
  agentName: string;
  onSave: (content: string) => Promise<boolean>;
  onClose: () => void;
}) {
  const [content, setContent] = useState(memory?.content ?? "");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <Modal
      title={memory ? "编辑记忆" : `让${agentName}记住`}
      description={`保存后，${agentName}会在之后的对话中参考这条信息。`}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form
        className="form-stack"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setFailed(false);
          if (await onSave(content)) onClose();
          else setFailed(true);
          setBusy(false);
        }}
      >
        <label>
          希望记住的事
          <textarea
            autoFocus
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={4}
            required
            maxLength={1000}
            placeholder="例如：我喜欢简短、直接的回答。"
          />
        </label>
        {failed && (
          <p className="notice error" role="alert">
            保存未完成，输入已保留。请重试；若记录已更新，请关闭后重新打开。
          </p>
        )}
        <Button
          className="primary"
          type="submit"
          disabled={busy || !content.trim()}
        >
          {busy ? "保存中…" : "保存记忆"}
        </Button>
      </form>
    </Modal>
  );
}
export function MemoryPanel({
  memories,
  agentName,
  mutate,
  confirm,
}: { memories: Memory[]; agentName: string } & PanelProps) {
  const [editor, setEditor] = useState<{ memory?: Memory; key: string } | null>(
    null,
  );
  return (
    <section className="content-section">
      <div className="section-heading">
        <h2>被记住的，是你在意的。</h2>
        <Button
          className="primary"
          onClick={() => setEditor({ key: crypto.randomUUID() })}
        >
          <Plus size={17} />
          添加记忆
        </Button>
      </div>
      <div className="record-list">
        {memories.length === 0 ? (
          <div className="empty-state">
            <Brain size={32} />
            <h3>从认识你开始</h3>
            <p>你的习惯、偏好，由你决定留下哪些。</p>
          </div>
        ) : (
          memories.map((memory) => (
            <div className="memory-row" key={memory.id}>
              <span className="memory-icon">
                <Brain size={19} />
              </span>
              <p className="record-content">{memory.content}</p>
              <div className="record-actions">
                <Button
                  className="icon-button"
                  aria-label="编辑记忆"
                  onClick={() =>
                    setEditor({ memory, key: crypto.randomUUID() })
                  }
                >
                  <Pencil size={16} />
                </Button>
                <Button
                  className="icon-button"
                  aria-label="忘记这条记忆"
                  onClick={() =>
                    confirm(
                      "忘记这条记忆？",
                      "之后的对话不再引用这条记忆。过去的聊天记录仍然保留。",
                      () =>
                        mutate(`memories/${memory.id}`, "DELETE", {
                          version: memory.version,
                        }),
                    )
                  }
                >
                  <Trash2 size={16} />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
      <p className="muted small">{memories.length} / 100 条记忆</p>
      {editor && (
        <MemoryForm
          key={editor.key}
          memory={editor.memory}
          agentName={agentName}
          onClose={() => setEditor(null)}
          onSave={(content) =>
            editor.memory
              ? mutate(`memories/${editor.memory.id}`, "PATCH", {
                  content,
                  version: editor.memory.version,
                })
              : mutate("memories", "POST", { content, requestKey: editor.key })
          }
        />
      )}
    </section>
  );
}
// 只在绑定那一刻用一次，所以不占一级入口，收在助手的「接入」里。
export function ChannelsPanel({
  state,
  mutate,
  confirm,
  showWechatGuide,
}: { state: AppState; showWechatGuide: boolean } & PanelProps) {
  const [binding, setBinding] = useState<{
    id: string;
    image: string;
    status: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [code, setCode] = useState("");
  const bindingId = binding?.id;
  const bindingStatus = binding?.status;
  useEffect(() => {
    if (!bindingId || ["confirmed", "expired"].includes(bindingStatus ?? ""))
      return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const result = await api<{ status: string }>(
          `wechat/binding/${bindingId}`,
          "POST",
          {},
        );
        if (!stopped) {
          setBinding((value) =>
            value ? { ...value, status: result.status } : null,
          );
          setError("");
        }
      } catch (e) {
        if (!stopped) setError((e as Error).message);
      }
      if (!stopped) timer = setTimeout(poll, 2500);
    };
    timer = setTimeout(poll, 1000);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [bindingId, bindingStatus]);
  async function connect() {
    setBusy(true);
    setError("");
    try {
      setBinding(await api("wechat/binding", "POST"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="channel-list">
      <div className="settings-card glass">
        <div className="row">
          <span className="settings-icon">
            <Smartphone size={22} />
          </span>
          <h3>在微信里，接着聊</h3>
        </div>
        {state.channel.connection ? (
          <>
            <p className="notice">
              {state.channel.connection.status === "connected"
                ? "微信已连接"
                : "微信连接需要更新"}
              {state.channel.connection.error &&
                ` · ${state.channel.connection.error}`}
            </p>
            <div className="row">
              <Button disabled={busy} onClick={connect}>
                重新连接
              </Button>
              <Button
                onClick={() =>
                  confirm(
                    "断开微信连接？",
                    "网页对话和资料会保留，之后可以重新扫码绑定。",
                    () => mutate("wechat/connection", "DELETE"),
                  )
                }
              >
                断开连接
              </Button>
            </div>
          </>
        ) : (
          <>
            {showWechatGuide && (
              <p className="setup-guide-inline">3 / 3 点击「连接微信」，用手机扫码确认。</p>
            )}
            {!state.channel.enabled && (
              <p className="muted small">微信接入尚未开放，当前可通过网页使用。</p>
            )}
            <Button
              className="primary"
              disabled={!state.channel.enabled || busy}
              onClick={connect}
            >
              <Link2 size={16} />
              {busy ? "准备二维码…" : "连接微信"}
            </Button>
          </>
        )}
        <p className="fine-print">
          微信接收受平台限制。“已提交”不代表送达，完整记录始终保留在网页。
        </p>
      </div>
      <QqSettings state={state} mutate={mutate} confirm={confirm} />
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {binding && (
        <Modal
          title="连接你的微信"
          description="请使用希望绑定的微信扫码。"
          onClose={() => setBinding(null)}
        >
          {binding.status === "confirmed" ? (
            <p className="notice">
              <Check size={18} />
              微信已连接，可以开始聊天。
            </p>
          ) : binding.status === "expired" ? (
            <p className="notice">二维码已过期，请关闭后重新连接。</p>
          ) : (
            <>
              {/* QR is an in-memory data URL, never a third-party image request. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className="qr-image"
                src={binding.image}
                alt="微信绑定二维码"
                width={240}
                height={240}
              />
              <p className="muted">
                {binding.status === "scaned"
                  ? "已扫码，请在微信上确认。"
                  : "等待扫码确认…"}
              </p>
              <form
                className="form-stack"
                onSubmit={async (e) => {
                  e.preventDefault();
                  setBusy(true);
                  try {
                    const result = await api<{ status: string }>(
                      `wechat/binding/${binding.id}`,
                      "POST",
                      { verifyCode: code },
                    );
                    setBinding({ ...binding, status: result.status });
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <label>
                  微信要求验证码时填写
                  <input
                    value={code}
                    inputMode="numeric"
                    pattern="[0-9]{4,10}"
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="可选"
                  />
                </label>
                <Button type="submit" disabled={!code || busy}>
                  提交验证码
                </Button>
              </form>
            </>
          )}
          {error && (
            <p className="notice error" role="alert">
              {error}
            </p>
          )}
        </Modal>
      )}
    </div>
  );
}

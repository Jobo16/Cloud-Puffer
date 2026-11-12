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
import { TelegramSettings } from "./telegram-settings";
import { useLanguage, useText } from "./language";

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
  const t = useText();
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
      title={task ? t("编辑待办", "Edit task") : t("记下一个待办", "New task")}
      description={t(
        "截止时间仅用于记录，定时提醒仍在开发中。",
        "Due dates are for reference. Scheduled reminders are still in development.",
      )}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form className="form-stack" onSubmit={submit}>
        <label>
          {t("要做什么", "What needs doing")}
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            maxLength={200}
            placeholder={t("一件小事也可以", "Even a small task counts")}
          />
        </label>
        <label>
          {t("补充说明", "Notes")}
          <textarea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={4000}
            placeholder={t("可选", "Optional")}
          />
        </label>
        <label>
          {t("截止时间（本地时区）", "Due date (local time)")}
          <input
            type="datetime-local"
            value={due}
            onChange={(e) => setDue(e.target.value)}
          />
        </label>
        {failed && (
          <p className="notice error" role="alert">
            {t(
              "保存未完成，输入已保留。请重试；若记录已更新，请关闭后重新打开。",
              "Could not save. Your input is still here. Try again, or reopen this form if the record has changed.",
            )}
          </p>
        )}
        <Button
          className="primary"
          disabled={busy || !title.trim()}
          type="submit"
        >
          {busy ? t("保存中…", "Saving…") : t("保存待办", "Save task")}
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
  const t = useText();
  const language = useLanguage();
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
        <h2>{t("慢慢来，一件一件。", "One thing at a time.")}</h2>
        <Button
          className="primary"
          onClick={() => setEditor({ key: crypto.randomUUID() })}
        >
          <Plus size={17} />
          {t("新待办", "New task")}
        </Button>
      </div>
      <div
        className="segmented glass"
        aria-label={t("筛选待办", "Filter tasks")}
      >
        {[
          ["pending", t("待完成", "To do")],
          ["done", t("已完成", "Done")],
          ["all", t("全部", "All")],
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
              {filter === "done"
                ? t("完成的小事，会留在这里", "Completed tasks stay here")
                : t("给自己留点余地", "Make room for what matters")}
            </h3>
            <p>
              {t(
                "想到要做的事，就随手记下来。",
                "Add a task whenever something comes to mind.",
              )}
            </p>
          </div>
        ) : (
          visible.map((task) => (
            <div
              className={clsx("task-row", task.completed && "completed")}
              key={task.id}
            >
              <button
                className="task-check"
                aria-label={`${task.completed ? t("取消完成", "Mark incomplete") : t("完成", "Complete")}: ${task.title}`}
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
                    {new Date(task.dueAt).toLocaleString(
                      language === "en" ? "en-US" : "zh-CN",
                      {
                        month: "long",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      },
                    )}{" "}
                    {t("截止", "due")}
                  </small>
                )}
              </div>
              <div className="record-actions">
                <Button
                  className="icon-button"
                  aria-label={`${t("编辑", "Edit")}: ${task.title}`}
                  onClick={() => setEditor({ task, key: crypto.randomUUID() })}
                >
                  <Pencil size={16} />
                </Button>
                <Button
                  className="icon-button"
                  aria-label={`${t("删除", "Delete")}: ${task.title}`}
                  onClick={() =>
                    confirm(
                      t("删除这条待办？", "Delete this task?"),
                      task.title,
                      () =>
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
        <p className="muted small">
          {t(
            "当前展示最近的 200 条事项。",
            "Showing the 200 most recent tasks.",
          )}
        </p>
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
  const t = useText();
  const [content, setContent] = useState(memory?.content ?? "");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <Modal
      title={
        memory
          ? t("编辑记忆", "Edit memory")
          : t(`让${agentName}记住`, `Ask ${agentName} to remember`)
      }
      description={t(
        `保存后，${agentName}会在之后的对话中参考这条信息。`,
        `${agentName} may use this information in later conversations.`,
      )}
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
          {t("希望记住的事", "What to remember")}
          <textarea
            autoFocus
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={4}
            required
            maxLength={1000}
            placeholder={t(
              "例如：我喜欢简短、直接的回答。",
              "For example: I prefer short, direct answers.",
            )}
          />
        </label>
        {failed && (
          <p className="notice error" role="alert">
            {t(
              "保存未完成，输入已保留。请重试；若记录已更新，请关闭后重新打开。",
              "Could not save. Your input is still here. Try again, or reopen this form if the record has changed.",
            )}
          </p>
        )}
        <Button
          className="primary"
          type="submit"
          disabled={busy || !content.trim()}
        >
          {busy ? t("保存中…", "Saving…") : t("保存记忆", "Save memory")}
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
  const t = useText();
  const [editor, setEditor] = useState<{ memory?: Memory; key: string } | null>(
    null,
  );
  return (
    <section className="content-section">
      <div className="section-heading">
        <h2>{t("被记住的，是你在意的。", "Keep what matters to you.")}</h2>
        <Button
          className="primary"
          onClick={() => setEditor({ key: crypto.randomUUID() })}
        >
          <Plus size={17} />
          {t("添加记忆", "Add memory")}
        </Button>
      </div>
      <div className="record-list">
        {memories.length === 0 ? (
          <div className="empty-state">
            <Brain size={32} />
            <h3>{t("从认识你开始", "Start with what matters")}</h3>
            <p>
              {t(
                "你的习惯、偏好，由你决定留下哪些。",
                "You decide which preferences to keep.",
              )}
            </p>
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
                  aria-label={t("编辑记忆", "Edit memory")}
                  onClick={() =>
                    setEditor({ memory, key: crypto.randomUUID() })
                  }
                >
                  <Pencil size={16} />
                </Button>
                <Button
                  className="icon-button"
                  aria-label={t("忘记这条记忆", "Forget this memory")}
                  onClick={() =>
                    confirm(
                      t("忘记这条记忆？", "Forget this memory?"),
                      t(
                        "之后的对话不再引用这条记忆。过去的聊天记录仍然保留。",
                        "Future conversations will no longer use it. Earlier chat history remains.",
                      ),
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
      <p className="muted small">
        {memories.length} / 100 {t("条记忆", "memories")}
      </p>
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
  const t = useText();
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
          <h3>{t("在微信里，接着聊", "Continue in WeChat")}</h3>
        </div>
        {state.channel.connection ? (
          <>
            <p className="notice">
              {state.channel.connection.status === "connected"
                ? t("微信已连接", "WeChat connected")
                : t("微信连接需要更新", "WeChat needs reconnecting")}
              {state.channel.connection.error &&
                ` · ${state.channel.connection.error}`}
            </p>
            <div className="row">
              <Button disabled={busy} onClick={connect}>
                {t("重新连接", "Reconnect")}
              </Button>
              <Button
                onClick={() =>
                  confirm(
                    t("断开微信连接？", "Disconnect WeChat?"),
                    t(
                      "网页对话和资料会保留，之后可以重新扫码绑定。",
                      "Your web conversation and saved data remain. You can scan again later.",
                    ),
                    () => mutate("wechat/connection", "DELETE"),
                  )
                }
              >
                {t("断开连接", "Disconnect")}
              </Button>
            </div>
          </>
        ) : (
          <>
            {showWechatGuide && (
              <p className="setup-guide-inline">
                {t(
                  "3 / 3 点击「连接微信」，用手机扫码确认。",
                  "3 / 3 Choose Connect WeChat and confirm the QR code on your phone.",
                )}
              </p>
            )}
            {!state.channel.enabled && (
              <p className="muted small">
                {t(
                  "微信接入尚未开放，当前可通过网页使用。",
                  "WeChat access is not enabled. You can still use the web app.",
                )}
              </p>
            )}
            <Button
              className="primary"
              disabled={!state.channel.enabled || busy}
              onClick={connect}
            >
              <Link2 size={16} />
              {busy
                ? t("准备二维码…", "Preparing QR code…")
                : t("连接微信", "Connect WeChat")}
            </Button>
          </>
        )}
        <p className="fine-print">
          {t(
            "微信接收受平台限制。“已提交”不代表送达，完整记录始终保留在网页。",
            "WeChat delivery is subject to platform limits. A submitted reply may not arrive; the full record stays on the web.",
          )}
        </p>
      </div>
      <QqSettings state={state} mutate={mutate} confirm={confirm} />
      <TelegramSettings state={state} mutate={mutate} confirm={confirm} />
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {binding && (
        <Modal
          title={t("连接你的微信", "Connect your WeChat")}
          description={t(
            "请使用希望绑定的微信扫码。",
            "Scan with the WeChat account you want to link.",
          )}
          onClose={() => setBinding(null)}
        >
          {binding.status === "confirmed" ? (
            <p className="notice">
              <Check size={18} />
              {t(
                "微信已连接，可以开始聊天。",
                "WeChat is connected. You can start chatting.",
              )}
            </p>
          ) : binding.status === "expired" ? (
            <p className="notice">
              {t(
                "二维码已过期，请关闭后重新连接。",
                "QR code expired. Close this window and reconnect.",
              )}
            </p>
          ) : (
            <>
              {/* QR is an in-memory data URL, never a third-party image request. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className="qr-image"
                src={binding.image}
                alt={t("微信绑定二维码", "WeChat binding QR code")}
                width={240}
                height={240}
              />
              <p className="muted">
                {binding.status === "scaned"
                  ? t("已扫码，请在微信上确认。", "Scanned. Confirm in WeChat.")
                  : t("等待扫码确认…", "Waiting for scan…")}
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
                  {t(
                    "微信要求验证码时填写",
                    "Enter a code if WeChat asks for one",
                  )}
                  <input
                    value={code}
                    inputMode="numeric"
                    pattern="[0-9]{4,10}"
                    onChange={(e) => setCode(e.target.value)}
                    placeholder={t("可选", "Optional")}
                  />
                </label>
                <Button type="submit" disabled={!code || busy}>
                  {t("提交验证码", "Submit code")}
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

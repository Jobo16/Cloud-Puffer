"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Brain, ListTodo, Smile, Sparkles } from "lucide-react";
import type { AppState } from "@/server/state";
import { api } from "@/lib/api";
import { Button, Mark } from "./ui";
import { useText } from "./language";

type Preferences = AppState["preferences"];
const capabilities = [
  { key: "tasksEnabled", title: "待办事项", english: "Tasks", icon: ListTodo },
  {
    key: "memoryEnabled",
    title: "长期记忆",
    english: "Long-term memory",
    icon: Brain,
  },
  {
    key: "stickersEnabled",
    title: "表情回复",
    english: "Sticker replies",
    icon: Smile,
  },
] as const;

// 改完就存：停顿 500ms 落盘，连续输入只发一次请求
const SAVE_DELAY = 500;

// 服务端会 trim 文本字段，比较和提交都按 trim 后的值来，否则末尾空格会让自动保存反复触发
function trimAll(p: Preferences): Preferences {
  return {
    ...p,
    agentName: p.agentName.trim(),
    systemPrompt: p.systemPrompt.trim(),
  };
}

export function AssistantEditor({
  preferences,
  onSaved,
  admin,
  agentDevices,
  onDevicesChanged,
}: {
  preferences: Preferences;
  onSaved: (saved: Preferences) => void;
  admin: boolean;
  agentDevices: AppState["agentDevices"];
  onDevicesChanged: (value: AppState["agentDevices"]) => void;
}) {
  const t = useText();
  // A null draft follows synced settings. Keep an edited draft across navigation and SSE updates.
  const [draft, setDraft] = useState<Preferences | null>(null);
  const [error, setError] = useState("");
  const [newToken, setNewToken] = useState("");
  useEffect(() => {
    if (!newToken) return;
    const timer = setTimeout(() => setNewToken(""), 60_000);
    return () => clearTimeout(timer);
  }, [newToken]);
  const values = draft ?? preferences;
  // 保存请求串行：上一次没回来时只记下最新值，回来后再补一次，避免旧值覆盖新值
  const inFlight = useRef(false);
  const queued = useRef<Preferences | null>(null);
  const latest = useRef(values);
  const synced = useRef(preferences);
  // 在提交后同步最新值，供保存回调和卸载时补存读取
  useEffect(() => {
    latest.current = values;
    synced.current = preferences;
  });

  async function persist(payload: Preferences) {
    if (inFlight.current) {
      queued.current = payload;
      return;
    }
    inFlight.current = true;
    setError("");
    try {
      const result = await api<Preferences>("preferences", "PATCH", payload);
      onSaved(result);
      // 保存期间又改了就别清草稿，否则会把新输入顶掉
      if (JSON.stringify(trimAll(latest.current)) === JSON.stringify(payload)) {
        setDraft(null);
      }
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : t("保存失败，请重试。", "Could not save. Please try again."),
      );
      queued.current = null;
    } finally {
      inFlight.current = false;
      const next = queued.current;
      queued.current = null;
      if (next) void persist(next);
    }
  }

  const pending = JSON.stringify(trimAll(values));
  const settled = JSON.stringify(trimAll(preferences));

  useEffect(() => {
    if (pending === settled) return;
    // 名字清空的瞬间不落盘（服务端要求非空），等用户重新输入
    if (!trimAll(values).agentName) return;
    const timer = setTimeout(() => {
      void persist(JSON.parse(pending) as Preferences);
    }, SAVE_DELAY);
    return () => clearTimeout(timer);
    // persist 只读 ref，不需要进依赖
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, settled]);

  // 离开这一页时把没来得及落盘的那次补上
  useEffect(() => {
    return () => {
      const payload = trimAll(latest.current);
      if (
        payload.agentName &&
        JSON.stringify(payload) !== JSON.stringify(trimAll(synced.current))
      ) {
        void persist(payload);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function edit(patch: Partial<Preferences>) {
    setDraft({ ...values, ...patch });
    setError("");
  }

  return (
    <div className="assistant-editor content-section">
      <section
        className="editor-card glass"
        aria-labelledby="personality-heading"
      >
        <div className="editor-section-title">
          <span className="section-number">01</span>
          <h3 id="personality-heading">
            {t("性格与表达", "Personality and voice")}
          </h3>
          <Sparkles size={18} />
        </div>
        <div className="agent-identity">
          <span className="agent-avatar">
            <Mark large />
          </span>
          <label>
            {t("助手名字", "Assistant name")}
            <input
              value={values.agentName}
              maxLength={40}
              onChange={(e) => edit({ agentName: e.target.value })}
              placeholder={t("小肥鱼", "Puffer")}
            />
          </label>
        </div>
        <label>
          {t("系统提示词", "System prompt")}
          <textarea
            rows={5}
            maxLength={4000}
            value={values.systemPrompt}
            placeholder={t(
              "例如：你是一位温和、直接的生活搭子，回答简洁，偶尔带一点幽默。整理复杂问题时先给结论再列步骤；安排事项前先确认时间。",
              "For example: Be warm and direct. Keep answers concise, add a little humor when useful, and confirm dates before scheduling tasks.",
            )}
            onChange={(e) => edit({ systemPrompt: e.target.value })}
          />
        </label>
      </section>
      <section
        className="editor-card glass"
        aria-labelledby="capabilities-heading"
      >
        <div className="editor-section-title">
          <span className="section-number">02</span>
          <h3 id="capabilities-heading">{t("选择能力", "Capabilities")}</h3>
        </div>
        <div className="capabilities">
          {capabilities.map(({ key, title, english, icon: Icon }) => (
            <label className="capability" key={key}>
              <span className="capability-icon">
                <Icon size={20} />
              </span>
              <span className="capability-copy">
                <strong>{t(title, english)}</strong>
              </span>
              <input
                type="checkbox"
                role="switch"
                aria-label={t(title, english)}
                checked={values[key]}
                onChange={(e) => edit({ [key]: e.target.checked })}
              />
            </label>
          ))}
        </div>
        <p className="capability-note">
          {t(
            "关闭不会删除已有资料；待办截止时间暂不触发提醒。",
            "Turning a capability off does not delete saved data. Task due dates do not trigger reminders yet.",
          )}
        </p>
      </section>
      <section
        className="editor-card glass"
        aria-labelledby="agent-runtime-heading"
      >
        <div className="editor-section-title">
          <span className="section-number">03</span>
          <h3 id="agent-runtime-heading">{t("运行位置", "Run location")}</h3>
        </div>
        <label>
          {t("回复由谁处理", "Who handles replies")}
          <select
            value={agentDevices.selected ?? ""}
            onChange={async (event) => {
              try {
                const next = await api<AppState["agentDevices"]>(
                  "agent-devices",
                  "PATCH",
                  { id: event.target.value || null },
                );
                onDevicesChanged(next);
              } catch (e) {
                setError(
                  e instanceof Error
                    ? e.message
                    : t("切换失败", "Could not switch"),
                );
              }
            }}
          >
            <option value="">{t("云端小肥鱼", "Cloud assistant")}</option>
            {agentDevices.devices.map((device) => (
              <option key={device.id} value={device.id}>
                {device.kind === "codex"
                  ? t("本地 Codex", "Local Codex")
                  : t("本地 OpenClaw", "Local OpenClaw")}{" "}
                · {device.id.slice(0, 6)}
                {device.online
                  ? t(" · 已连接", " · Connected")
                  : t(" · 未连接", " · Offline")}
              </option>
            ))}
          </select>
        </label>
        <div className="row">
          {(["codex", "openclaw"] as const).map((kind) => (
            <Button
              key={kind}
              onClick={async () => {
                try {
                  const created = await api<{ id: string; token: string }>(
                    "agent-devices",
                    "POST",
                    { kind },
                  );
                  setNewToken(created.token);
                  onDevicesChanged(
                    await api<AppState["agentDevices"]>("agent-devices"),
                  );
                } catch (e) {
                  setError(
                    e instanceof Error
                      ? e.message
                      : t("创建失败", "Could not create"),
                  );
                }
              }}
            >
              {t("连接", "Connect")}
              {kind === "codex" ? " Codex" : " OpenClaw"}
            </Button>
          ))}
        </div>
        {newToken && (
          <label>
            {t("设备令牌（只显示一次）", "Device token (shown once)")}
            <input
              readOnly
              value={newToken}
              onFocus={(event) => event.target.select()}
            />
          </label>
        )}
        {agentDevices.devices.length > 0 && (
          <p className="capability-note">
            {t(
              "在自己的电脑设置 JOJOBOT_DEVICE_TOKEN 和 JOJOBOT_URL，然后运行 pnpm local-agent。每次收到请求需在电脑上确认。",
              "Set JOJOBOT_DEVICE_TOKEN and JOJOBOT_URL on your computer, then run pnpm local-agent. Confirm each request locally.",
            )}
          </p>
        )}
        {agentDevices.devices.map((device) => (
          <div className="row spread" key={device.id}>
            <span>
              {device.kind === "codex" ? "Codex" : "OpenClaw"} ·{" "}
              {device.id.slice(0, 6)} ·{" "}
              {device.online
                ? t("已连接", "Connected")
                : t("未连接", "Offline")}
            </span>
            <Button
              onClick={async () => {
                try {
                  onDevicesChanged(
                    await api<AppState["agentDevices"]>(
                      `agent-devices/${device.id}`,
                      "DELETE",
                    ),
                  );
                  setNewToken("");
                } catch (e) {
                  setError(
                    e instanceof Error
                      ? e.message
                      : t("移除失败", "Could not remove"),
                  );
                }
              }}
            >
              {t("移除", "Remove")}
            </Button>
          </div>
        ))}
      </section>
      {admin && (
        <Link className="admin-entry" href="/app/admin">
          {t("后台管理", "Admin")} <ArrowUpRight size={16} />
        </Link>
      )}
      {error && (
        <p className="editor-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

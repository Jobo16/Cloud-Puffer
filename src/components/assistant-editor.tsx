"use client";
import { useEffect, useRef, useState } from "react";
import { Brain, ListTodo, Smile, Sparkles } from "lucide-react";
import type { AppState } from "@/server/state";
import { api } from "@/lib/api";
import { Mark } from "./ui";

type Preferences = AppState["preferences"];
const capabilities = [
  { key: "tasksEnabled", title: "待办事项", icon: ListTodo },
  { key: "memoryEnabled", title: "长期记忆", icon: Brain },
  { key: "stickersEnabled", title: "表情回复", icon: Smile },
] as const;

// 改完就存：停顿 500ms 落盘，连续输入只发一次请求
const SAVE_DELAY = 500;

// 服务端会 trim 文本字段，比较和提交都按 trim 后的值来，否则末尾空格会让自动保存反复触发
function trimAll(p: Preferences): Preferences {
  return {
    ...p,
    agentName: p.agentName.trim(),
    persona: p.persona.trim(),
    instructions: p.instructions.trim(),
  };
}

export function AssistantEditor({
  preferences,
  onSaved,
}: {
  preferences: Preferences;
  onSaved: (saved: Preferences) => void;
}) {
  // A null draft follows synced settings. Keep an edited draft across navigation and SSE updates.
  const [draft, setDraft] = useState<Preferences | null>(null);
  const [error, setError] = useState("");
  const values = draft ?? preferences;
  // 保存请求串行：上一次没回来时只记下最新值，回来后再补一次，避免旧值覆盖新值
  const inFlight = useRef(false);
  const queued = useRef<Preferences | null>(null);
  const latest = useRef(values);
  const synced = useRef(preferences);
  latest.current = values;
  synced.current = preferences;

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
      setError(e instanceof Error ? e.message : "保存失败，请重试。");
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
      if (payload.agentName && JSON.stringify(payload) !== JSON.stringify(trimAll(synced.current))) {
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
          <h3 id="personality-heading">性格与表达</h3>
          <Sparkles size={18} />
        </div>
        <div className="agent-identity">
          <span className="agent-avatar">
            <Mark large />
          </span>
          <label>
            助手名字
            <input
              value={values.agentName}
              maxLength={40}
              onChange={(e) => edit({ agentName: e.target.value })}
              placeholder="JOJO"
            />
          </label>
        </div>
        <label>
          助手人设
          <textarea
            rows={3}
            maxLength={1000}
            value={values.persona}
            placeholder="例如：你是一位温和、直接的生活搭子。回答简洁，偶尔带一点幽默。"
            onChange={(e) => edit({ persona: e.target.value })}
          />
        </label>
        <label>
          自定义提示词
          <textarea
            rows={4}
            maxLength={4000}
            value={values.instructions}
            placeholder="例如：整理复杂问题时，先给结论再列步骤。帮我安排事项时，先确认时间。"
            onChange={(e) => edit({ instructions: e.target.value })}
          />
        </label>
      </section>
      <section
        className="editor-card glass"
        aria-labelledby="capabilities-heading"
      >
        <div className="editor-section-title">
          <span className="section-number">02</span>
          <h3 id="capabilities-heading">选择能力</h3>
        </div>
        <div className="capabilities">
          {capabilities.map(({ key, title, icon: Icon }) => (
            <label className="capability" key={key}>
              <span className="capability-icon">
                <Icon size={20} />
              </span>
              <span className="capability-copy">
                <strong>{title}</strong>
              </span>
              <input
                type="checkbox"
                role="switch"
                aria-label={title}
                checked={values[key]}
                onChange={(e) => edit({ [key]: e.target.checked })}
              />
            </label>
          ))}
        </div>
        <p className="capability-note">
          关闭不会删除已有资料；待办截止时间暂不触发提醒。
        </p>
      </section>
      {error && (
        <p className="editor-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

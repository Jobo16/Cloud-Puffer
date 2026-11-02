"use client";
import { useState, type FormEvent } from "react";
import { Brain, Check, ListTodo, Smile, Sparkles } from "lucide-react";
import type { AppState } from "@/server/state";
import { api } from "@/lib/api";
import { Button, Mark } from "./ui";

type Preferences = AppState["preferences"];
const capabilities = [
  {
    key: "tasksEnabled",
    title: "待办事项",
    description: "在聊天中记录、修改和完成待办。",
    icon: ListTodo,
  },
  {
    key: "memoryEnabled",
    title: "长期记忆",
    description: "读取你的偏好，在你要求时记住或忘记。",
    icon: Brain,
  },
  {
    key: "stickersEnabled",
    title: "表情回复",
    description: "合适时发一张表情，用于网页和 QQ。",
    icon: Smile,
  },
] as const;

export function AssistantEditor({
  preferences,
  onSaved,
}: {
  preferences: Preferences;
  onSaved: (saved: Preferences) => void;
}) {
  // A null draft follows synced settings. Keep an edited draft across navigation and SSE updates.
  const [draft, setDraft] = useState<Preferences | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const values = draft ?? preferences;
  const dirty = JSON.stringify(values) !== JSON.stringify(preferences);
  function edit(patch: Partial<Preferences>) {
    setDraft({ ...values, ...patch });
    setSaved(false);
    setError("");
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!dirty || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await api<Preferences>("preferences", "PATCH", values);
      onSaved(result);
      setDraft(null);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败，请重试。");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="assistant-editor content-section" onSubmit={save}>
      <div className="editor-intro">
        <span className="eyebrow">MAKE IT YOURS</span>
        <h2>你的助手，你来定义。</h2>
        <p>设定性格，选择能力，再聊聊看。</p>
      </div>
      <fieldset disabled={busy}>
        <section
          className="editor-card glass"
          aria-labelledby="personality-heading"
        >
          <div className="editor-section-title">
            <span className="section-number">01</span>
            <div>
              <h3 id="personality-heading">性格与表达</h3>
              <p>让每次对话，都更合你的习惯。</p>
            </div>
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
                required
                maxLength={40}
                onChange={(e) => edit({ agentName: e.target.value })}
                placeholder="JOJO"
              />
            </label>
          </div>
          <label>
            助手人设
            <span className="field-description">
              描述它的角色、性格和说话方式。
            </span>
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
            <span className="field-description">
              补充你希望它遵循的习惯；留空使用默认设置。
            </span>
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
            <div>
              <h3 id="capabilities-heading">选择能力</h3>
              <p>只开启你需要的，让助手轻装上阵。</p>
            </div>
            <span className="capability-count">
              {capabilities.filter(({ key }) => values[key]).length} / 3
            </span>
          </div>
          <div className="capabilities">
            {capabilities.map(({ key, title, description, icon: Icon }) => (
              <label className="capability" key={key}>
                <span className="capability-icon">
                  <Icon size={20} />
                </span>
                <span className="capability-copy">
                  <strong>{title}</strong>
                  <small>{description}</small>
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
            关闭后不删除已有资料，仍可手动管理。记忆关闭后不再读取记忆库，历史聊天仍保留。待办截止时间暂不触发提醒。
          </p>
        </section>
      </fieldset>
      <footer className="editor-save glass">
        <div aria-live="polite">
          <strong>
            {dirty ? (
              "有修改尚未保存"
            ) : saved ? (
              <>
                <Check size={14} />
                已保存
              </>
            ) : (
              "配置已同步"
            )}
          </strong>
          <span>保存后用于下一轮回复</span>
        </div>
        <Button type="submit" className="primary" disabled={!dirty || busy}>
          {busy ? "保存中…" : "保存配置"}
        </Button>
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
      </footer>
    </form>
  );
}

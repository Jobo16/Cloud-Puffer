"use client";
import { useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth-client";
import { Button } from "./ui";

type Mode = "login" | "register" | "forgot" | "reset";
const authErrors: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "邮箱或密码不正确。",
  EMAIL_NOT_VERIFIED: "请先打开邮件验证邮箱。",
  USER_ALREADY_EXISTS: "这个邮箱已注册，请直接登录。",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "这个邮箱已注册，请直接登录。",
  INVALID_TOKEN: "链接已失效，请重新申请。",
  PASSWORD_TOO_SHORT: "密码至少需要 10 个字符。",
};
const headings: Record<Mode, string> = {
  login: "登录",
  register: "创建账号",
  forgot: "重置密码",
  reset: "设置新密码",
};
export function AuthForm({
  token,
  linkError = false,
  initialMode = "login",
}: {
  token?: string;
  linkError?: boolean;
  initialMode?: Mode;
}) {
  const [mode, setMode] = useState<Mode>(token ? "reset" : initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [needsVerify, setNeedsVerify] = useState(false);
  const [error, setError] = useState(
    linkError ? "链接已失效，请重新发送验证邮件或重设密码。" : "",
  );
  const changeMode = (next: Mode) => {
    setMode(next);
    setError("");
    setMessage("");
    setNeedsVerify(false);
    setPassword("");
  };
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    setNeedsVerify(false);
    try {
      const result =
        mode === "register"
          ? await authClient.signUp.email({
              name: name.trim(),
              email,
              password,
              callbackURL: "/app",
            })
          : mode === "forgot"
            ? await authClient.requestPasswordReset({
                email,
                redirectTo: "/?auth=reset",
              })
            : mode === "reset"
              ? await authClient.resetPassword({
                  newPassword: password,
                  token: token!,
                })
              : await authClient.signIn.email({
                  email,
                  password,
                  callbackURL: "/app",
                });
      if (result.error) {
        setNeedsVerify(result.error.code === "EMAIL_NOT_VERIFIED");
        setError(
          authErrors[result.error.code ?? ""] ??
            (result.error.status === 429
              ? "操作较频繁，请稍后再试。"
              : "暂时无法完成，请检查输入或稍后重试。"),
        );
        return;
      }
      if (mode === "login") {
        window.location.assign("/app");
        return;
      }
      setMessage(
        mode === "register"
          ? "验证邮件已发送，请查收。"
          : mode === "forgot"
            ? "如果这个邮箱已注册，你会收到重置密码的邮件。"
            : "密码已更新，请用新密码登录。",
      );
      if (mode === "reset") {
        setMode("login");
        setPassword("");
      }
    } catch {
      setError("连接失败，请稍后重试。");
    } finally {
      setBusy(false);
    }
  }
  async function resend() {
    if (!email) {
      setError("请先输入邮箱。");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await authClient.sendVerificationEmail({
        email,
        callbackURL: "/app",
      });
      if (result.error) setError("发送失败，请稍后重试。");
      else setMessage("验证邮件已发送，请检查收件箱。");
    } catch {
      setError("连接失败，请稍后重试。");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-form">
      <h2 className="auth-title">{headings[mode]}</h2>
      {/* key 换模式时重挂表单，让第一个字段重新拿到焦点 */}
      <form key={mode} onSubmit={submit} className="form-stack auth-stack">
        {mode === "register" && (
          <label>
            怎么称呼你
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="nickname"
              autoFocus
              required
              maxLength={60}
              placeholder="你的名字"
            />
          </label>
        )}
        {mode !== "reset" && (
          <label>
            邮箱
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              autoFocus={mode !== "register"}
              required
              maxLength={254}
              placeholder="you@example.com"
            />
          </label>
        )}
        {mode !== "forgot" && (
          <label>
            密码
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
              autoFocus={mode === "reset"}
              required
              minLength={mode === "login" ? 1 : 10}
              maxLength={128}
              placeholder={mode === "login" ? "输入密码" : "至少 10 个字符"}
            />
          </label>
        )}
        {error && (
          <p role="alert" className="notice error">
            {error}
          </p>
        )}
        {message && (
          <p role="status" className="notice">
            {message}
          </p>
        )}
        <Button className="primary full" type="submit" disabled={busy}>
          {busy
            ? "请稍候…"
            : mode === "register"
              ? "创建账号"
              : mode === "forgot"
                ? "发送链接"
                : mode === "reset"
                  ? "保存密码"
                  : "登录"}
        </Button>
      </form>
      {mode === "login" ? (
        <div className="auth-links">
          <button type="button" onClick={() => changeMode("forgot")}>
            忘记密码
          </button>
          {needsVerify && (
            <button type="button" disabled={busy} onClick={resend}>
              重新发送验证邮件
            </button>
          )}
          <button
            type="button"
            className="auth-switch-link"
            onClick={() => changeMode("register")}
          >
            创建账号
          </button>
        </div>
      ) : (
        <div className="auth-links">
          <button type="button" onClick={() => changeMode("login")}>
            返回登录
          </button>
        </div>
      )}
    </div>
  );
}

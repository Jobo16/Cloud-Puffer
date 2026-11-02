"use client";
import { useState, type FormEvent } from "react";
import { ArrowUpRight } from "lucide-react";
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
  const [error, setError] = useState(
    linkError ? "链接已失效，请重新发送验证邮件或重设密码。" : "",
  );
  const changeMode = (next: Mode) => {
    setMode(next);
    setError("");
    setMessage("");
    setPassword("");
  };
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
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
          ? "验证邮件已发送。打开邮件里的链接，就可以开始了。"
          : mode === "forgot"
            ? "如果这个邮箱已注册，你会收到重设密码的邮件。"
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
      <span className="eyebrow">YOUR PERSONAL SPACE</span>
      <h3>
        {mode === "register"
          ? "认识一下吧"
          : mode === "forgot"
            ? "找回你的空间"
            : mode === "reset"
              ? "设置新密码"
              : "欢迎回来"}
      </h3>
      <p className="muted">
        {mode === "register"
          ? "用邮箱注册，让 JOJO 开始了解你。"
          : mode === "login"
            ? "留给自己的事，从这里继续。"
            : "我们会帮你安全地回到自己的账号。"}
      </p>
      <form onSubmit={submit} className="form-stack">
        {mode === "register" && (
          <label>
            怎么称呼你
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="nickname"
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
                ? "发送重设链接"
                : mode === "reset"
                  ? "更新密码"
                  : "进入我的空间"}
          <ArrowUpRight size={18} />
        </Button>
      </form>
      {mode === "login" ? (
        <>
          <div className="row spread auth-links">
            <button onClick={() => changeMode("forgot")}>忘记密码</button>
            <button disabled={busy} onClick={resend}>
              重新发送验证邮件
            </button>
          </div>
          <p className="auth-switch">
            第一次来？
            <button onClick={() => changeMode("register")}>创建账号</button>
          </p>
        </>
      ) : (
        <p className="auth-switch">
          <button onClick={() => changeMode("login")}>返回登录</button>
        </p>
      )}
      <p className="fine-print">开放注册 · 无需邀请码</p>
    </div>
  );
}

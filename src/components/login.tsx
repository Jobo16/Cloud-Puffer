"use client";
import { useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth-client";
import { Button } from "./ui";
import type { SiteLanguage } from "@/lib/site-language";

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
const english = {
  headings: {
    login: "Log in",
    register: "Create account",
    forgot: "Reset password",
    reset: "Set a new password",
  },
  errors: {
    INVALID_EMAIL_OR_PASSWORD: "Incorrect email or password.",
    EMAIL_NOT_VERIFIED: "Verify your email before logging in.",
    USER_ALREADY_EXISTS: "This email is already registered. Log in instead.",
    USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL:
      "This email is already registered. Log in instead.",
    INVALID_TOKEN: "This link has expired. Request a new one.",
    PASSWORD_TOO_SHORT: "Use at least 10 characters for your password.",
  } as Record<string, string>,
  linkError:
    "This link has expired. Request another verification or password reset email.",
  tooMany: "Too many attempts. Please try again later.",
  genericError:
    "Could not complete this request. Check your details and try again.",
  verifySent: "Verification email sent. Check your inbox.",
  resetSent:
    "If this address is registered, you will receive a password reset email.",
  passwordSaved: "Password updated. Log in with your new password.",
  connectionError: "Connection failed. Please try again later.",
  emailRequired: "Enter your email first.",
  sendError: "Could not send the email. Try again later.",
  nameLabel: "Your name",
  namePlaceholder: "Name",
  emailLabel: "Email",
  passwordLabel: "Password",
  passwordPlaceholder: "Enter password",
  newPasswordPlaceholder: "At least 10 characters",
  wait: "Please wait…",
  create: "Create account",
  sendLink: "Send link",
  savePassword: "Save password",
  login: "Log in",
  forgot: "Forgot password",
  resend: "Resend verification email",
  back: "Back to login",
};
export function AuthForm({
  language = "zh",
  token,
  linkError = false,
  initialMode = "login",
}: {
  language?: SiteLanguage;
  token?: string;
  linkError?: boolean;
  initialMode?: Mode;
}) {
  const en = language === "en";
  const [mode, setMode] = useState<Mode>(token ? "reset" : initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [needsVerify, setNeedsVerify] = useState(false);
  const [error, setError] = useState(
    linkError
      ? en
        ? english.linkError
        : "链接已失效，请重新发送验证邮件或重设密码。"
      : "",
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
                redirectTo: `${en ? "/en" : ""}/?auth=reset`,
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
          (en ? english.errors : authErrors)[result.error.code ?? ""] ??
            (result.error.status === 429
              ? en
                ? english.tooMany
                : "操作较频繁，请稍后再试。"
              : en
                ? english.genericError
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
          ? en
            ? english.verifySent
            : "验证邮件已发送，请查收。"
          : mode === "forgot"
            ? en
              ? english.resetSent
              : "如果这个邮箱已注册，你会收到重置密码的邮件。"
            : en
              ? english.passwordSaved
              : "密码已更新，请用新密码登录。",
      );
      if (mode === "reset") {
        setMode("login");
        setPassword("");
      }
    } catch {
      setError(en ? english.connectionError : "连接失败，请稍后重试。");
    } finally {
      setBusy(false);
    }
  }
  async function resend() {
    if (!email) {
      setError(en ? english.emailRequired : "请先输入邮箱。");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await authClient.sendVerificationEmail({
        email,
        callbackURL: "/app",
      });
      if (result.error)
        setError(en ? english.sendError : "发送失败，请稍后重试。");
      else
        setMessage(en ? english.verifySent : "验证邮件已发送，请检查收件箱。");
    } catch {
      setError(en ? english.connectionError : "连接失败，请稍后重试。");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-form">
      <h2 className="auth-title">
        {en ? english.headings[mode] : headings[mode]}
      </h2>
      {/* key 换模式时重挂表单，让第一个字段重新拿到焦点 */}
      <form key={mode} onSubmit={submit} className="form-stack auth-stack">
        {mode === "register" && (
          <label>
            {en ? english.nameLabel : "怎么称呼你"}
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="nickname"
              autoFocus
              required
              maxLength={60}
              placeholder={en ? english.namePlaceholder : "你的名字"}
            />
          </label>
        )}
        {mode !== "reset" && (
          <label>
            {en ? english.emailLabel : "邮箱"}
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
            {en ? english.passwordLabel : "密码"}
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
              placeholder={
                mode === "login"
                  ? en
                    ? english.passwordPlaceholder
                    : "输入密码"
                  : en
                    ? english.newPasswordPlaceholder
                    : "至少 10 个字符"
              }
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
            ? en
              ? english.wait
              : "请稍候…"
            : mode === "register"
              ? en
                ? english.create
                : "创建账号"
              : mode === "forgot"
                ? en
                  ? english.sendLink
                  : "发送链接"
                : mode === "reset"
                  ? en
                    ? english.savePassword
                    : "保存密码"
                  : en
                    ? english.login
                    : "登录"}
        </Button>
      </form>
      {mode === "login" ? (
        <div className="auth-links">
          <button type="button" onClick={() => changeMode("forgot")}>
            {en ? english.forgot : "忘记密码"}
          </button>
          {needsVerify && (
            <button type="button" disabled={busy} onClick={resend}>
              {en ? english.resend : "重新发送验证邮件"}
            </button>
          )}
          <button
            type="button"
            className="auth-switch-link"
            onClick={() => changeMode("register")}
          >
            {en ? english.create : "创建账号"}
          </button>
        </div>
      ) : (
        <div className="auth-links">
          <button type="button" onClick={() => changeMode("login")}>
            {en ? english.back : "返回登录"}
          </button>
        </div>
      )}
    </div>
  );
}

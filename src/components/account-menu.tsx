"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { ArrowUpRight, AtSign, KeyRound, LogOut, MoreHorizontal } from "lucide-react";
import { clsx } from "clsx";
import type { AppState } from "@/server/state";
import { authClient } from "@/lib/auth-client";
import { Button, Modal } from "./ui";

const repository = "https://github.com/Jobo16/Cloud-Puffer";

// 身份、用量和账号动作都收在这一个浮层里，不需要为它们再开一页。
export function AccountMenu({
  user,
  quota,
  direction = "up",
  compact = false,
  className,
  onError,
}: {
  user: { name: string; email: string };
  quota: AppState["quota"];
  direction?: "up" | "down";
  compact?: boolean;
  className?: string;
  onError: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<CSSProperties | null>(null);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const percent = quota.limit
    ? Math.min(100, Math.round((quota.used / quota.limit) * 100))
    : 0;

  // 菜单挂在 body 上：侧栏和主面板都会裁切溢出，就地绝对定位会被切掉
  function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    const rect = trigger.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(268, window.innerWidth - 24);
    setPosition(
      direction === "up"
        ? {
            width,
            left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)),
            bottom: window.innerHeight - rect.top + 8,
          }
        : {
            width,
            top: rect.bottom + 8,
            right: Math.max(12, window.innerWidth - rect.right),
          },
    );
    setOpen(true);
  }
  useEffect(() => {
    if (!open) return;
    panel.current?.focus();
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (panel.current?.contains(target) || trigger.current?.contains(target))
        return;
      setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      trigger.current?.focus();
    }
    function onViewportChange() {
      setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("scroll", onViewportChange, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("scroll", onViewportChange, true);
    };
  }, [open]);

  const menu = open && position && (
    <div
      className="account-menu"
      role="menu"
      aria-label="账号"
      tabIndex={-1}
      ref={panel}
      data-direction={direction}
      style={{ position: "fixed", ...position }}
    >
      <div className="account-head">
        <span className="avatar">{user.name.slice(0, 1).toUpperCase()}</span>
        <div>
          <strong>{user.name}</strong>
          <span>{user.email}</span>
        </div>
      </div>
      <div className="account-quota">
        <div className="row spread">
          <span>今日积分</span>
          <span>
            <strong>{quota.used}</strong> / {quota.limit}
          </span>
        </div>
        <span
          className="account-quota-bar"
          role="progressbar"
          aria-label="今日积分用量"
          aria-valuenow={quota.used}
          aria-valuemin={0}
          aria-valuemax={quota.limit}
        >
          <span style={{ width: `${percent}%` }} />
        </span>
      </div>
      <div className="account-items">
        <button
          role="menuitem"
          className="account-item"
          onClick={() => {
            setOpen(false);
            setError("");
            setPasswordOpen(true);
          }}
        >
          <KeyRound size={16} />
          修改密码
        </button>
        <a
          role="menuitem"
          className="account-item"
          href={repository}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => setOpen(false)}
        >
          <ArrowUpRight size={16} />
          关于与代码
          <span className="account-item-note">GitHub</span>
        </a>
        <a
          role="menuitem"
          className="account-item"
          href="https://jobo.ink"
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => setOpen(false)}
        >
          <AtSign size={16} />
          联系作者
          <span className="account-item-note">jobo.ink</span>
        </a>
      </div>
      <button
        role="menuitem"
        className="account-item account-signout"
        onClick={async () => {
          setOpen(false);
          const result = await authClient.signOut();
          if (result.error) onError("退出失败，请重试。");
          else window.location.assign("/");
        }}
      >
        <LogOut size={16} />
        退出登录
      </button>
      <p className="account-foot">开发预览版</p>
    </div>
  );

  return (
    <div className={clsx("account", compact && "account-compact", className)}>
      <button
        type="button"
        ref={trigger}
        className="account-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={compact ? `${user.name} 的账号` : undefined}
        title={compact ? user.name : undefined}
        onClick={toggle}
      >
        <span className="avatar">{user.name.slice(0, 1).toUpperCase()}</span>
        <span>
          <strong>{user.name}</strong>
        </span>
        <MoreHorizontal size={17} />
      </button>
      {menu && createPortal(menu, document.body)}
      {passwordOpen && (
        <Modal
          title="修改密码"
          description="更新后，其他设备需要重新登录。"
          onClose={() => {
            if (!busy) setPasswordOpen(false);
          }}
        >
          <form
            className="form-stack"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              try {
                const result = await authClient.changePassword({
                  currentPassword: oldPassword,
                  newPassword,
                  revokeOtherSessions: true,
                });
                if (result.error) setError("修改失败，请检查当前密码后重试。");
                else {
                  setPasswordOpen(false);
                  setOldPassword("");
                  setNewPassword("");
                }
              } catch {
                setError("连接失败，请稍后重试。");
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              当前密码
              <input
                type="password"
                autoComplete="current-password"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                required
              />
            </label>
            <label>
              新密码
              <input
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                minLength={10}
                maxLength={128}
                required
              />
            </label>
            {error && (
              <p role="alert" className="notice error">
                {error}
              </p>
            )}
            <Button className="primary" disabled={busy} type="submit">
              {busy ? "更新中…" : "更新密码"}
            </Button>
          </form>
        </Modal>
      )}
    </div>
  );
}

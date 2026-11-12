"use client";
import { Button as BaseButton } from "@base-ui/react/button";
import { Dialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import { clsx } from "clsx";
import Image from "next/image";
import type { ComponentProps, ReactNode } from "react";
import { useText } from "./language";

export function Button({
  className,
  ...props
}: ComponentProps<typeof BaseButton>) {
  return <BaseButton className={clsx("button", className)} {...props} />;
}
export function Mark({ large = false }: { large?: boolean }) {
  return (
    <span className={clsx("brand-mark", large && "large")} aria-hidden="true">
      <Image src="/brand-avatar.webp" alt="" width={64} height={64} />
    </span>
  );
}
export function Modal({
  title,
  description,
  children,
  onClose,
  bare = false,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
  /** 只留右上角关闭键，标题由内容自己排（登录这类单列表单） */
  bare?: boolean;
}) {
  const t = useText();
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="dialog-backdrop" />
        <Dialog.Popup className={bare ? "dialog dialog-bare" : "dialog"}>
          {bare ? (
            <>
              <Dialog.Title className="sr-only">{title}</Dialog.Title>
              <Dialog.Close
                className="button icon-button dialog-close"
                aria-label={t("关闭", "Close")}
              >
                <X size={16} />
              </Dialog.Close>
              {children}
            </>
          ) : (
            <>
              <div className="row spread">
                <Dialog.Title>{title}</Dialog.Title>
                <Dialog.Close
                  className="button icon-button"
                  aria-label={t("关闭", "Close")}
                >
                  <X size={18} />
                </Dialog.Close>
              </div>
              <Dialog.Description className={description ? "muted" : "sr-only"}>
                {description || title}
              </Dialog.Description>
              {children}
            </>
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

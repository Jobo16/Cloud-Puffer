"use client";
import { Button as BaseButton } from "@base-ui/react/button";
import { Dialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import { clsx } from "clsx";
import type { ComponentProps, ReactNode } from "react";

export function Button({
  className,
  ...props
}: ComponentProps<typeof BaseButton>) {
  return <BaseButton className={clsx("button", className)} {...props} />;
}
export function Mark({ large = false }: { large?: boolean }) {
  return (
    <span className={clsx("jojo-mark", large && "large")} aria-hidden="true">
      <span />
      <span />
    </span>
  );
}
export function Modal({
  title,
  description,
  children,
  onClose,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="dialog-backdrop" />
        <Dialog.Popup className="dialog glass">
          <div className="row spread">
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Close className="button icon-button" aria-label="关闭">
              <X size={18} />
            </Dialog.Close>
          </div>
          <Dialog.Description className={description ? "muted" : "sr-only"}>
            {description || title}
          </Dialog.Description>
          {children}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

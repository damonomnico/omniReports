"use client";

import { createContext, use, useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { buttonClass } from "./button";

const DialogContext = createContext<{ close: () => void } | null>(null);

/** Lets a form inside a dialog close it once its action succeeds. */
export function useDialog() {
  return use(DialogContext);
}

export function Dialog({
  trigger,
  triggerVariant = "primary",
  triggerSize = "md",
  triggerClassName,
  title,
  description,
  children,
  wide,
}: {
  trigger: ReactNode;
  triggerVariant?: "primary" | "secondary" | "ghost" | "danger";
  triggerSize?: "sm" | "md";
  triggerClassName?: string;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  const close = useCallback(() => setOpen(false), []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={triggerClassName ?? buttonClass(triggerVariant, triggerSize)}
      >
        {trigger}
      </button>
      <dialog
        ref={ref}
        onClose={close}
        onClick={(e) => {
          if (e.target === ref.current) close();
        }}
        className={cn(
          "m-auto w-[calc(100vw-2rem)] rounded-xl border border-line bg-surface p-0 text-ink shadow-pop",
          wide ? "max-w-2xl" : "max-w-md",
        )}
      >
        {open ? (
          <DialogContext value={{ close }}>
            <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
              <div>
                <h2 className="font-display text-lg font-semibold">{title}</h2>
                {description ? <p className="mt-0.5 text-sm text-muted">{description}</p> : null}
              </div>
              <button
                type="button"
                onClick={close}
                className="rounded-md p-1 text-muted hover:bg-brand-50 hover:text-ink"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="max-h-[75vh] overflow-y-auto px-5 py-4">{children}</div>
          </DialogContext>
        ) : null}
      </dialog>
    </>
  );
}

import * as RadixDialog from "@radix-ui/react-dialog";
import type { ReactNode } from "react";
import { cn, focusRing } from "../cn";

export interface DialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: ReactNode;
  title: string;
  description?: string;
  closeLabel: string;
  /** "drawer" slides in from the right edge; "dialog" is centered. */
  variant?: "dialog" | "drawer";
  children: ReactNode;
}

export function Dialog({
  trigger,
  title,
  description,
  closeLabel,
  variant = "dialog",
  children,
  ...root
}: DialogProps) {
  return (
    <RadixDialog.Root {...root}>
      {trigger ? <RadixDialog.Trigger asChild>{trigger}</RadixDialog.Trigger> : null}
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-40 bg-void/70 backdrop-blur-sm" />
        <RadixDialog.Content
          className={cn(
            "fixed z-50 flex flex-col gap-4 overflow-y-auto border border-rim-strong bg-surface p-6 text-ink shadow-float",
            variant === "drawer"
              ? "inset-y-0 right-0 w-full max-w-xl rounded-l-card"
              : "top-1/2 left-1/2 max-h-[85dvh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-card",
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <RadixDialog.Title className="font-display text-title font-semibold">{title}</RadixDialog.Title>
            <RadixDialog.Close
              className={cn(
                "glass-control min-h-10 shrink-0 rounded-full px-4 text-caption font-semibold text-ink hover:bg-glass-strong",
                focusRing,
              )}
            >
              {closeLabel}
            </RadixDialog.Close>
          </div>
          {description ? (
            <RadixDialog.Description className="text-ink-muted">
              {description}
            </RadixDialog.Description>
          ) : (
            <RadixDialog.Description className="sr-only">{title}</RadixDialog.Description>
          )}
          {children}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

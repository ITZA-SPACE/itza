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
        <RadixDialog.Overlay className="fixed inset-0 z-40 bg-ink/50" />
        <RadixDialog.Content
          className={cn(
            "fixed z-50 flex flex-col gap-3 overflow-y-auto bg-surface p-5 text-ink shadow-xl",
            variant === "drawer"
              ? "inset-y-0 right-0 w-full max-w-xl"
              : "top-1/2 left-1/2 max-h-[85dvh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-card",
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <RadixDialog.Title className="text-title font-semibold">{title}</RadixDialog.Title>
            <RadixDialog.Close
              className={cn(
                "min-h-11 shrink-0 rounded-control border border-line px-3 text-ink hover:bg-surface-muted",
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

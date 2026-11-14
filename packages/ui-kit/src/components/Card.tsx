import type { HTMLAttributes } from "react";
import { cn } from "../cn";

export function Card({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <section
      className={cn(
        "glass-panel min-w-0 rounded-card p-4 text-ink [overflow-wrap:break-word] sm:p-5",
        className,
      )}
      {...props}
    />
  );
}

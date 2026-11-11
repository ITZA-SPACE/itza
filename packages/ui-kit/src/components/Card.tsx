import type { HTMLAttributes } from "react";
import { cn } from "../cn";

export function Card({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <section
      className={cn("rounded-card border border-line-soft bg-surface p-4 text-ink", className)}
      {...props}
    />
  );
}

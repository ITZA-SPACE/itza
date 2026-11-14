import type { HTMLAttributes } from "react";
import { cn } from "../cn";

export function Card({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <section
      className={cn("glass-panel rounded-card p-5 text-ink", className)}
      {...props}
    />
  );
}

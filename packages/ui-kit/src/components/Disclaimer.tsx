import type { ReactNode } from "react";
import { cn } from "../cn";

export function Disclaimer({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("text-caption text-ink-muted", className)}>{children}</p>;
}

export function DisclaimerList({ items, className }: { items: string[]; className?: string }) {
  return (
    <ul className={cn("list-disc space-y-1 pl-5 text-caption text-ink-muted", className)}>
      {items.map((text) => (
        <li key={text}>{text}</li>
      ))}
    </ul>
  );
}

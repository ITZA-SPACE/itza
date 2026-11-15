import type { ReactNode } from "react";
import { cn } from "../cn";

export interface RotationCompareItem {
  id: string;
  isBaseline: boolean;
  /** Usually an `EvidenceCard`. */
  content: ReactNode;
}

export interface RotationCompareProps {
  items: readonly RotationCompareItem[];
  /** Accessible name of the group, e.g. "Rotations compared". */
  label: string;
  className?: string;
}

/**
 * Rotations side by side, stacked on a phone, with the current rotation (the baseline) always first
 * so every other card reads against it.
 */
export function RotationCompare({ items, label, className }: RotationCompareProps) {
  const ordered = [...items].sort((a, b) => Number(b.isBaseline) - Number(a.isBaseline));
  return (
    <ul
      aria-label={label}
      className={cn("grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3", className)}
    >
      {ordered.map((item) => (
        <li key={item.id} className="flex min-w-0 flex-col [&>*]:flex-1">
          {item.content}
        </li>
      ))}
    </ul>
  );
}

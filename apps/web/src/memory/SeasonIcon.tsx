import type { SeasonLabel } from "@itza/engine/memory";

/** A small picture per season label. Always next to the label text, so it is decoration. */
export function SeasonIcon({ label, className }: { label: SeasonLabel; className?: string }) {
  const common = {
    viewBox: "0 0 24 24",
    width: 24,
    height: 24,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
  };
  switch (label) {
    case "winter_crop":
      // An ear of grain.
      return (
        <svg aria-hidden="true" {...common}>
          <path d="M12 21V8" />
          <path d="M12 8c-2.5 0-4-1.5-4-4 2.5 0 4 1.5 4 4Zm0 0c2.5 0 4-1.5 4-4-2.5 0-4 1.5-4 4Z" />
          <path d="M12 14c-2.5 0-4-1.5-4-4 2.5 0 4 1.5 4 4Zm0 0c2.5 0 4-1.5 4-4-2.5 0-4 1.5-4 4Z" />
          <path d="M12 20c-2.5 0-4-1.5-4-4 2.5 0 4 1.5 4 4Zm0 0c2.5 0 4-1.5 4-4-2.5 0-4 1.5-4 4Z" />
        </svg>
      );
    case "summer_crop":
      // A sun over a row.
      return (
        <svg aria-hidden="true" {...common}>
          <circle cx="12" cy="10" r="3.5" />
          <path d="M12 2.5v2M12 15.5v2M4.5 10h2M17.5 10h2M6.7 4.7l1.4 1.4M15.9 13.9l1.4 1.4M17.3 4.7l-1.4 1.4M8.1 13.9l-1.4 1.4" />
          <path d="M3 21h18" />
        </svg>
      );
    case "double_crop":
      // Two ears.
      return (
        <svg aria-hidden="true" {...common}>
          <path d="M8 21V10M16 21V10" />
          <path d="M8 10c-2 0-3.2-1.2-3.2-3.2 2 0 3.2 1.2 3.2 3.2Zm0 0c2 0 3.2-1.2 3.2-3.2-2 0-3.2 1.2-3.2 3.2Z" />
          <path d="M16 10c-2 0-3.2-1.2-3.2-3.2 2 0 3.2 1.2 3.2 3.2Zm0 0c2 0 3.2-1.2 3.2-3.2-2 0-3.2 1.2-3.2 3.2Z" />
        </svg>
      );
    case "fallow_or_bare":
      // Bare furrows.
      return (
        <svg aria-hidden="true" {...common}>
          <path d="M3 8c3-2 6 2 9 0s6 2 9 0" />
          <path d="M3 13c3-2 6 2 9 0s6 2 9 0" />
          <path d="M3 18c3-2 6 2 9 0s6 2 9 0" />
        </svg>
      );
    default:
      // A question mark in a circle.
      return (
        <svg aria-hidden="true" {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 17h.01" />
        </svg>
      );
  }
}

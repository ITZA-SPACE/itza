import { cn, focusRing, Popover } from "@itza/ui-kit";
import { Link } from "@tanstack/react-router";
import { ChevronDown, MapPin, PencilLine } from "lucide-react";
import { t } from "../../copy";
import { HeroFieldPicker } from "../../data/HeroFieldPicker";
import { useActiveField } from "./useActiveField";

/** Figma "Field switcher": the active field as a glass pill that opens the demo fields. */
export function FieldSwitcher() {
  const field = useActiveField();
  return (
    <Popover
      className="w-[min(26rem,calc(100vw-2rem))] max-w-none space-y-3"
      trigger={
        <button
          type="button"
          aria-label={`${t("nav.switcher.label")}: ${field ? `${field.kind} · ${field.name}` : t("nav.switcher.empty")}`}
          className={cn(
            "glass-control flex h-11 min-w-0 items-center gap-2.5 rounded-full pr-3.5 pl-4 text-[0.875rem] font-semibold text-ink hover:bg-glass-strong lg:h-12",
            focusRing,
          )}
        >
          <MapPin aria-hidden className="size-[18px] shrink-0" />
          <span className="truncate">
            {field ? `${field.kind} · ${field.name}` : t("nav.switcher.empty")}
          </span>
          <ChevronDown aria-hidden className="size-4 shrink-0 text-ink-muted" />
        </button>
      }
    >
      <HeroFieldPicker />
      <Link
        to="/field"
        className={cn(
          "flex min-h-11 items-center gap-2 rounded-full px-1 text-body font-semibold text-accent hover:underline",
          focusRing,
        )}
      >
        <PencilLine aria-hidden className="size-[18px]" />
        {t("nav.switcher.draw")}
      </Link>
    </Popover>
  );
}

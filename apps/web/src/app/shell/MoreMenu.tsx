import { cn, focusRing } from "@itza/ui-kit";
import { Link } from "@tanstack/react-router";
import { Home, Layers, Presentation, Settings } from "lucide-react";
import { t } from "../../copy";
import { setMethodsOpen } from "../../methods";
import { NAV_SECTIONS } from "./nav";

const tile =
  "flex min-h-[4.5rem] w-full flex-col items-start justify-between gap-2 rounded-panel border border-line-soft bg-glass p-3 text-left text-caption font-semibold text-ink transition-colors hover:bg-glass-strong [&_svg]:size-5";
const activeTile = "glass-selected border-rain/60";

/** Places the bottom bar already shows; More lists only the rest. */
const IN_BOTTOM_BAR = new Set(["field", "past", "plan", "ask"]);

/** "More" on phones and tablets: every place the bottom bar lacks, so every page is at most two taps away. */
export function MoreMenu({ onNavigate }: { onNavigate: () => void }) {
  return (
    <ul className="grid list-none grid-cols-3 gap-2 p-0">
      {NAV_SECTIONS.filter((s) => !IN_BOTTOM_BAR.has(s.id)).map(({ id, to, label, icon: Icon }) => (
        <li key={id}>
          <Link
            to={to}
            onClick={onNavigate}
            className={cn(tile, focusRing)}
            activeProps={{ className: activeTile, "aria-current": "page" }}
          >
            <Icon aria-hidden />
            {t(label)}
          </Link>
        </li>
      ))}
      <li>
        <button
          type="button"
          aria-haspopup="dialog"
          className={cn(tile, focusRing)}
          onClick={() => {
            onNavigate();
            setMethodsOpen(true);
          }}
        >
          <Layers aria-hidden />
          {t("nav.sources")}
        </button>
      </li>
      {(
        [
          ["/demo", "nav.demo", Presentation],
          ["/settings", "nav.settings", Settings],
          ["/", "nav.home", Home],
        ] as const
      ).map(([to, label, Icon]) => (
        <li key={to}>
          <Link
            to={to}
            onClick={onNavigate}
            className={cn(tile, focusRing)}
            activeProps={{ className: activeTile, "aria-current": "page" }}
            activeOptions={{ exact: true }}
          >
            <Icon aria-hidden />
            {t(label)}
          </Link>
        </li>
      ))}
    </ul>
  );
}

import { cn, focusRing } from "@itza/ui-kit";
import { Link } from "@tanstack/react-router";
import { BookOpen, Home, Leaf, Presentation, Settings } from "lucide-react";
import type { ReactNode } from "react";
import { t } from "../../copy";
import { CREDITS_TAB, setMethodsOpen } from "../../methods";
import { useOnline } from "../../pwa/pwa";
import { NAV_GROUPS } from "./nav";

const tile =
  "flex min-h-[4.5rem] w-full flex-col items-start justify-between gap-2 rounded-panel border border-line-soft bg-glass p-3 text-left text-caption font-semibold text-ink transition-colors hover:bg-glass-strong [&_svg]:size-5";
const activeTile = "glass-selected border-rain/60";

function Group({ label, tone, children }: { label: string; tone: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3
        className={cn(
          "flex items-center gap-2 font-sans text-[0.75rem] leading-4 font-bold tracking-[0.06em] uppercase",
          tone,
        )}
      >
        <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
        {label}
      </h3>
      <ul className="grid list-none grid-cols-3 gap-2 p-0">{children}</ul>
    </section>
  );
}

/**
 * "More" on phones and tablets: every page as tappable tiles, grouped like the sidebar, so nothing
 * is more than two taps away.
 */
export function MoreMenu({ onNavigate }: { onNavigate: () => void }) {
  const online = useOnline();
  const tool = (action: () => void) => () => {
    onNavigate();
    action();
  };
  return (
    <div className="space-y-5">
      {NAV_GROUPS.map((group) => (
        <Group key={group.id} label={t(group.label)} tone={group.tone}>
          {group.links.map(({ to, label, icon: Icon }) => (
            <li key={to}>
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
        </Group>
      ))}
      <Group label={t("nav.group.tools")} tone="text-ink-muted">
        <li>
          <Link
            to="/"
            onClick={onNavigate}
            className={cn(tile, focusRing)}
            activeProps={{ className: activeTile, "aria-current": "page" }}
            activeOptions={{ exact: true }}
          >
            <Home aria-hidden />
            {t("nav.home")}
          </Link>
        </li>
        <li>
          <button
            type="button"
            aria-haspopup="dialog"
            className={cn(tile, focusRing)}
            onClick={tool(() => setMethodsOpen(true))}
          >
            <BookOpen aria-hidden />
            {t("nav.methods")}
          </button>
        </li>
        <li>
          <Link
            to="/demo"
            onClick={onNavigate}
            className={cn(tile, focusRing)}
            activeProps={{ className: activeTile, "aria-current": "page" }}
          >
            <Presentation aria-hidden />
            {t("nav.demo")}
          </Link>
        </li>
        <li>
          <Link
            to="/settings"
            onClick={onNavigate}
            className={cn(tile, focusRing)}
            activeProps={{ className: activeTile, "aria-current": "page" }}
          >
            <Settings aria-hidden />
            {t("nav.settings")}
          </Link>
        </li>
      </Group>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line-soft pt-4">
        <p role="status" className="flex items-center gap-2 text-caption text-ink-muted">
          <span
            aria-hidden="true"
            className={cn("size-[7px] rounded-full", online ? "bg-good-ink" : "bg-warn-ink")}
          />
          {t(online ? "nav.status.online" : "nav.status.offline")}
        </p>
        <button
          type="button"
          onClick={tool(() => setMethodsOpen(true, CREDITS_TAB))}
          className={cn(
            "flex min-h-11 items-center gap-2 rounded-control text-caption text-ink-muted underline hover:text-ink",
            focusRing,
          )}
        >
          <Leaf aria-hidden className="size-3.5 text-leaf" />
          {t("credits.footer")}
        </button>
      </div>
    </div>
  );
}

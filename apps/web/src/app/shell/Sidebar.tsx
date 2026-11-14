import { cn } from "@itza/ui-kit";
import { Link } from "@tanstack/react-router";
import { BookOpen, Leaf, Presentation, Settings, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import wordmark from "../../assets/itza-wordmark.svg";
import { useAssistantUi } from "../../assistant/ui";
import { t } from "../../copy";
import { CREDITS_TAB, setMethodsOpen } from "../../methods";
import { useOnline } from "../../pwa/pwa";
import { NAV_GROUPS } from "./nav";
import { useActiveField } from "./useActiveField";

const item =
  "flex min-h-10 w-full items-center gap-2.5 rounded-full border border-transparent pr-3 pl-3.5 text-[0.875rem] leading-5 font-medium text-ink-muted transition-colors hover:bg-glass hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus [&_svg]:size-[18px] [&_svg]:shrink-0";
const active = "glass-selected font-semibold text-ink";

function GroupLabel({ tone, children }: { tone: string; children: ReactNode }) {
  return (
    <p
      className={cn(
        "flex items-center gap-2 pb-1 pl-3 text-[0.75rem] leading-4 font-bold tracking-[0.06em] uppercase",
        tone,
      )}
    >
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {children}
    </p>
  );
}

/**
 * The Figma "Sidebar": brand, the grouped navigation over every route, the tools, and the active
 * field. `onNavigate` lets the phone drawer close after a choice.
 */
export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const openAssistant = useAssistantUi((s) => s.setOpen);
  const online = useOnline();
  const field = useActiveField();
  const tool = (action: () => void) => () => {
    onNavigate?.();
    action();
  };
  return (
    <div className="flex h-full flex-col gap-5 px-4 py-5">
      <Link
        to="/"
        onClick={onNavigate}
        aria-label={t("nav.brand")}
        className="flex flex-col gap-1.5 rounded-control pb-1 pl-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        <img src={wordmark} alt="" width={94} height={27} className="h-[27px] w-[94px]" />
        <span className="text-[0.75rem] leading-4 text-subtle">{t("app.tagline")}</span>
      </Link>

      <nav aria-label={t("nav.label")} className="flex flex-col gap-5">
        {NAV_GROUPS.map((group) => (
          <div key={group.id} className="flex flex-col gap-1">
            <GroupLabel tone={group.tone}>{t(group.label)}</GroupLabel>
            <ul className="flex list-none flex-col gap-1 p-0">
              {group.links.map(({ to, label, icon: Icon }) => (
                <li key={to}>
                  <Link
                    to={to}
                    onClick={onNavigate}
                    className={item}
                    activeProps={{ className: active, "aria-current": "page" }}
                  >
                    <Icon aria-hidden />
                    {t(label)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
        <div className="flex flex-col gap-1">
          <GroupLabel tone="text-ink-muted">{t("nav.group.tools")}</GroupLabel>
          <ul className="flex list-none flex-col gap-1 p-0">
            <li>
              <button
                type="button"
                aria-haspopup="dialog"
                className={item}
                onClick={tool(() => openAssistant(true))}
              >
                <Sparkles aria-hidden />
                {t("nav.assistant")}
              </button>
            </li>
            <li>
              <button
                type="button"
                aria-haspopup="dialog"
                className={item}
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
                className={item}
                activeProps={{ className: active, "aria-current": "page" }}
              >
                <Presentation aria-hidden />
                {t("nav.demo")}
              </Link>
            </li>
            <li>
              <Link
                to="/settings"
                onClick={onNavigate}
                className={item}
                activeProps={{ className: active, "aria-current": "page" }}
              >
                <Settings aria-hidden />
                {t("nav.settings")}
              </Link>
            </li>
          </ul>
        </div>
      </nav>

      <div className="min-h-2 flex-1" />

      <section
        aria-label={t("nav.active.label")}
        className="flex flex-col gap-1.5 rounded-[1rem] border border-[#1f3a66] bg-white/4 px-3.5 py-3"
      >
        <p className="flex items-center gap-2 text-[0.75rem] leading-4 font-bold tracking-[0.06em] text-subtle uppercase">
          <span
            aria-hidden="true"
            className={cn("size-1.5 rounded-full", field ? "bg-good-ink" : "bg-subtle")}
          />
          {t("nav.active.label")}
        </p>
        <p className="font-display text-[1.125rem] leading-6 font-bold text-ink">
          {field ? field.kind : t("nav.active.none")}
        </p>
        <p className="text-caption text-ink-muted">
          {field ? field.name : t("nav.active.noneBody")}
        </p>
      </section>

      <div className="flex flex-col gap-2 pl-3">
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
          className="flex min-h-8 items-center gap-2 self-start rounded-control text-caption text-ink-muted underline hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          <Leaf aria-hidden className="size-3.5 text-leaf" />
          {t("credits.footer")}
        </button>
      </div>
    </div>
  );
}

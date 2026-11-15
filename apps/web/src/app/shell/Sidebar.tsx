import { cn, focusRing, Tooltip } from "@itza/ui-kit";
import { Link, useRouterState } from "@tanstack/react-router";
import { PanelLeftClose, PanelLeftOpen, Presentation, Settings } from "lucide-react";
import type { ReactNode } from "react";
import wordmark from "../../assets/itza-wordmark.svg";
import { t } from "../../copy";
import { NAV_SECTIONS, sectionOf } from "./nav";

const item =
  "flex min-h-[46px] w-full items-center gap-3 rounded-full border border-transparent px-4 text-[0.9375rem] leading-5 font-medium text-ink-muted transition-colors hover:bg-glass hover:text-ink [&_svg]:size-5 [&_svg]:shrink-0";
const activeItem = "glass-selected font-semibold text-ink";

/** A nav row; collapsed, it shows its icon and names itself in a tooltip. */
function Row({
  collapsed,
  label,
  children,
}: {
  collapsed: boolean;
  label: string;
  children: ReactNode;
}) {
  return collapsed ? (
    <Tooltip content={label} side="right">
      {children}
    </Tooltip>
  ) : (
    children
  );
}

/**
 * The Figma sidebar: the wordmark, seven places and two small tools. `collapsed` narrows it to an
 * icon rail; `onNavigate` lets the phone drawer close after a choice.
 */
export function Sidebar({
  collapsed = false,
  onToggle,
  onNavigate,
}: {
  collapsed?: boolean;
  onToggle?: () => void;
  onNavigate?: () => void;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const current = sectionOf(pathname);
  const rowClass = (active: boolean) =>
    cn(item, focusRing, collapsed && "justify-center px-0", active && activeItem);
  return (
    <div className={cn("flex h-full flex-col gap-7 py-6", collapsed ? "px-3" : "px-4")}>
      <div
        className={cn("flex items-start", collapsed ? "justify-center" : "justify-between pl-2")}
      >
        {collapsed ? null : (
          <Link
            to="/"
            onClick={onNavigate}
            aria-label={t("nav.brand")}
            className={cn("flex flex-col gap-1.5 rounded-control", focusRing)}
          >
            <img src={wordmark} alt="" width={94} height={27} className="h-[27px] w-[94px]" />
            <span className="text-[0.75rem] leading-4 text-subtle">{t("app.tagline")}</span>
          </Link>
        )}
        {onToggle ? (
          <Tooltip content={t(collapsed ? "nav.expand" : "nav.collapse")} side="right">
            <button
              type="button"
              onClick={onToggle}
              aria-label={t(collapsed ? "nav.expand" : "nav.collapse")}
              aria-expanded={!collapsed}
              className={cn(
                "flex size-9 items-center justify-center rounded-full text-subtle hover:bg-glass hover:text-ink [&_svg]:size-[18px]",
                focusRing,
              )}
            >
              {collapsed ? <PanelLeftOpen aria-hidden /> : <PanelLeftClose aria-hidden />}
            </button>
          </Tooltip>
        ) : null}
      </div>

      <nav aria-label={t("nav.label")}>
        <ul className="flex list-none flex-col gap-1.5 p-0">
          {NAV_SECTIONS.map(({ id, to, label, icon: Icon }) => {
            const active = current?.id === id;
            return (
              <li key={id}>
                <Row collapsed={collapsed} label={t(label)}>
                  <Link
                    to={to}
                    onClick={onNavigate}
                    aria-label={collapsed ? t(label) : undefined}
                    aria-current={active ? "page" : undefined}
                    className={rowClass(active)}
                  >
                    <Icon aria-hidden />
                    {collapsed ? null : t(label)}
                  </Link>
                </Row>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="flex-1" />

      <div className={cn("flex gap-1", collapsed ? "flex-col items-center" : "pl-2")}>
        {(
          [
            ["/demo", "nav.demo", Presentation],
            ["/settings", "nav.settings", Settings],
          ] as const
        ).map(([to, label, Icon]) => (
          <Tooltip key={to} content={t(label)} side={collapsed ? "right" : "top"}>
            <Link
              to={to}
              onClick={onNavigate}
              aria-label={t(label)}
              className={cn(
                "flex size-10 items-center justify-center rounded-full text-subtle hover:bg-glass hover:text-ink [&_svg]:size-[18px]",
                focusRing,
              )}
              activeProps={{ className: "glass-selected text-ink", "aria-current": "page" }}
            >
              <Icon aria-hidden />
            </Link>
          </Tooltip>
        ))}
      </div>
    </div>
  );
}

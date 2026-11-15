import {
  CalendarClock,
  FileCheck2,
  Layers,
  Map as MapIcon,
  Repeat,
  Sparkles,
  Thermometer,
} from "lucide-react";
import type { ComponentType } from "react";
import type { CopyKey } from "../../copy";

export type SectionRoute =
  | "/field"
  | "/twin"
  | "/history"
  | "/climate"
  | "/inputs"
  | "/compare"
  | "/builder"
  | "/future"
  | "/arena"
  | "/validation"
  | "/ask"
  | "/sources";

export interface SectionTab {
  to: SectionRoute;
  label: CopyKey;
}

export interface NavSection {
  id: string;
  /** Where the sidebar item leads. */
  to: SectionRoute;
  label: CopyKey;
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  /** The section's pages, shown as tabs under the page title when there is more than one. */
  tabs: SectionTab[];
}

/**
 * The app's information architecture, from the Figma "Simple · Field" frame: seven places, each a
 * section whose pages sit side by side as tabs. Every route stays reachable in two clicks.
 */
export const NAV_SECTIONS: NavSection[] = [
  {
    id: "field",
    to: "/field",
    label: "nav.field",
    icon: MapIcon,
    tabs: [
      { to: "/field", label: "nav.tab.map" },
      { to: "/twin", label: "nav.tab.3d" },
    ],
  },
  {
    id: "past",
    to: "/history",
    label: "nav.past",
    icon: CalendarClock,
    tabs: [
      { to: "/history", label: "nav.tab.seasons" },
      { to: "/climate", label: "nav.tab.climate" },
    ],
  },
  {
    id: "plan",
    to: "/compare",
    label: "nav.plan",
    icon: Repeat,
    tabs: [
      { to: "/inputs", label: "nav.tab.farm" },
      { to: "/compare", label: "nav.tab.compare" },
      { to: "/builder", label: "nav.tab.build" },
    ],
  },
  {
    id: "future",
    to: "/future",
    label: "nav.future",
    icon: Thermometer,
    tabs: [{ to: "/future", label: "nav.future" }],
  },
  {
    id: "decide",
    to: "/arena",
    label: "nav.decide",
    icon: FileCheck2,
    tabs: [
      { to: "/arena", label: "nav.tab.models" },
      { to: "/validation", label: "nav.tab.proof" },
    ],
  },
  {
    id: "ask",
    to: "/ask",
    label: "nav.assistant",
    icon: Sparkles,
    tabs: [{ to: "/ask", label: "nav.assistant" }],
  },
  {
    id: "sources",
    to: "/sources",
    label: "nav.sources",
    icon: Layers,
    tabs: [{ to: "/sources", label: "nav.sources" }],
  },
];

/** The section a path belongs to, if any. */
export function sectionOf(pathname: string): NavSection | undefined {
  return NAV_SECTIONS.find((s) => s.tabs.some((tab) => pathname.startsWith(tab.to)));
}

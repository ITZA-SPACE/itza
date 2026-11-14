import {
  Box,
  CloudSun,
  Database,
  FlaskConical,
  Map as MapIcon,
  Play,
  Repeat,
  Scale,
  SlidersHorizontal,
  Thermometer,
} from "lucide-react";
import type { ComponentType } from "react";
import type { CopyKey } from "../../copy";

export interface NavLink {
  to:
    | "/field"
    | "/inputs"
    | "/twin"
    | "/history"
    | "/climate"
    | "/builder"
    | "/compare"
    | "/future"
    | "/arena"
    | "/validation";
  label: CopyKey;
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
}

export interface NavGroup {
  id: string;
  label: CopyKey;
  /** Text color of the group label and its dot (Figma sidebar groups). */
  tone: string;
  links: NavLink[];
}

/**
 * The app's information architecture, from the Figma "Sidebar": what the field is now, what it
 * remembers, what could happen, and how sure ITZA is. Every route of the workspace is reachable here.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    id: "present",
    label: "nav.group.present",
    tone: "text-rain",
    links: [
      { to: "/field", label: "nav.field", icon: MapIcon },
      { to: "/inputs", label: "nav.inputs", icon: SlidersHorizontal },
      { to: "/twin", label: "nav.twin", icon: Box },
    ],
  },
  {
    id: "past",
    label: "nav.group.past",
    tone: "text-harvest",
    links: [
      { to: "/history", label: "nav.history", icon: Database },
      { to: "/climate", label: "nav.climate", icon: CloudSun },
    ],
  },
  {
    id: "futures",
    label: "nav.group.futures",
    tone: "text-violet",
    links: [
      { to: "/compare", label: "nav.compare", icon: Play },
      { to: "/builder", label: "nav.builder", icon: Repeat },
      { to: "/future", label: "nav.future", icon: Thermometer },
    ],
  },
  {
    id: "decide",
    label: "nav.group.decide",
    tone: "text-lime",
    links: [
      { to: "/arena", label: "nav.arena", icon: Scale },
      { to: "/validation", label: "nav.validation", icon: FlaskConical },
    ],
  },
];

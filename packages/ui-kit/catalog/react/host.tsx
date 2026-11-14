import { createContext, type ReactNode, useContext } from "react";
import type { ComponentName } from "../schemas";

/** The data components the app draws; the catalog places them, the app knows how to show them. */
export type AppRenderedName = Exclude<
  ComponentName,
  "Caption" | "Column" | "Row" | "Card" | "ActionChips" | "SourceChips" | "TraceDrawer"
>;

export type RenderProps = { data?: unknown } & Record<string, unknown>;

export interface ChipAction {
  name: string;
  context?: Record<string, string | number | boolean>;
}

export interface CatalogLabels {
  /** Shown where the data for a component is missing or has an unexpected shape. */
  unavailable: string;
  sourcesHeading: string;
  traceOpen: string;
  traceClose: string;
  traceTitle: string;
  traceEmpty: string;
  provenance: { source: string; resolution: string; period: string };
}

export interface CatalogHost {
  labels: CatalogLabels;
  /** Draws a data component from its resolved data and extra props. */
  render: Partial<Record<AppRenderedName, (props: RenderProps) => ReactNode>>;
  /** A chip was pressed. The app maps it through the action allow-list. */
  onAction: (action: ChipAction) => void;
}

const HostContext = createContext<CatalogHost | null>(null);

export function CatalogHostProvider({
  host,
  children,
}: {
  host: CatalogHost;
  children: ReactNode;
}) {
  return <HostContext.Provider value={host}>{children}</HostContext.Provider>;
}

export function useCatalogHost(): CatalogHost {
  const host = useContext(HostContext);
  if (!host) throw new Error("Catalog components need a CatalogHostProvider");
  return host;
}

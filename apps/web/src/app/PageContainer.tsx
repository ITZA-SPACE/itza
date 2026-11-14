import type { ReactNode } from "react";

/** The column of the pages outside the map workspace, aligned with the top bar. */
export function PageContainer({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-7xl space-y-6 px-4 pt-3 pb-12">{children}</div>;
}

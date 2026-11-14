import type { ReactNode } from "react";

/** The centred column of the pages that are not the map workspace. */
export function PageContainer({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-6xl px-4 py-8">{children}</div>;
}

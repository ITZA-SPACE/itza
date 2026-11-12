import { Button, EmptyState } from "@itza/ui-kit";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { t } from "../copy";
import { useReadiness } from "./useReadiness";

/**
 * Holds the comparison back until the rotation and soil are set, or the farmer accepted the
 * defaults. Nothing downstream runs while it blocks.
 */
export function InputsGate({ children }: { children: ReactNode }) {
  const { ready, checking } = useReadiness();
  if (ready) return <>{children}</>;
  if (checking) {
    return (
      <p role="status" className="text-body text-ink-muted">
        {t("inputs.loading")}
      </p>
    );
  }
  return (
    <EmptyState
      title={t("inputs.gate.title")}
      description={t("inputs.gate.body")}
      action={
        <Button asChild>
          <Link to="/inputs">{t("inputs.gate.action")}</Link>
        </Button>
      }
    />
  );
}

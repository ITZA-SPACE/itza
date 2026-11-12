import { Link } from "@tanstack/react-router";
import { t } from "../../copy";
import { STEPS } from "./steps";

/** Field, History, Inputs, Compare as links; the current step is marked for assistive technology. */
export function FlowNav() {
  return (
    <nav aria-label={t("flow.label")}>
      <ol className="flex gap-1">
        {STEPS.map((step, i) => (
          <li key={step.id} className="flex-1">
            <Link
              to={step.to}
              activeProps={{
                "aria-current": "step",
                className: "border-accent-strong bg-accent-soft font-semibold text-accent-strong",
              }}
              inactiveProps={{ className: "border-line-soft text-ink hover:bg-surface-muted" }}
              className="flex min-h-11 items-center justify-center gap-1 rounded-control border px-2 text-caption focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              <span aria-hidden="true">{i + 1}</span>
              {t(step.label)}
            </Link>
          </li>
        ))}
      </ol>
    </nav>
  );
}

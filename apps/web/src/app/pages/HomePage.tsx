import { Button, cn, focusRing } from "@itza/ui-kit";
import { Link } from "@tanstack/react-router";
import { ArrowRight, CloudSun, Database, FileCheck, Play, Presentation } from "lucide-react";
import { type CopyKey, t } from "../../copy";
import { PageContainer } from "../PageContainer";

const PILLARS: {
  id: string;
  to: "/history" | "/climate" | "/compare" | "/arena";
  icon: typeof Database;
  tone: string;
}[] = [
  { id: "past", to: "/history", icon: Database, tone: "text-harvest" },
  { id: "present", to: "/climate", icon: CloudSun, tone: "text-rain" },
  { id: "futures", to: "/compare", icon: Play, tone: "text-violet" },
  { id: "decide", to: "/arena", icon: FileCheck, tone: "text-lime" },
];

/** The landing page: the promise in one line, the way in, and the four things ITZA does. */
export function HomePage() {
  return (
    <PageContainer>
      <section className="max-w-3xl space-y-6 pt-6 sm:pt-12">
        <p className="text-[0.75rem] leading-4 font-bold tracking-[0.12em] text-rain uppercase">
          {t("home.eyebrow")}
        </p>
        <h1 className="text-[2.5rem] leading-[2.875rem] font-bold text-ink sm:text-hero">
          {t("home.title")}
        </h1>
        <p className="max-w-2xl text-[1.125rem] leading-7 text-ink-muted">{t("home.body")}</p>
        <div className="flex flex-wrap gap-3">
          <Button asChild>
            <Link to="/field">
              {t("home.cta")}
              <ArrowRight aria-hidden />
            </Link>
          </Button>
          <Button asChild variant="secondary">
            <Link to="/demo">
              <Presentation aria-hidden />
              {t("home.demo")}
            </Link>
          </Button>
        </div>
      </section>
      <section aria-label={t("home.pillars.label")} className="pt-6">
        <ul className="grid list-none gap-4 p-0 sm:grid-cols-2 xl:grid-cols-4">
          {PILLARS.map(({ id, to, icon: Icon, tone }) => (
            <li key={id}>
              <Link
                to={to}
                className={cn(
                  "glass-panel group flex h-full flex-col gap-3 rounded-card p-6 transition-colors hover:border-rain/70",
                  focusRing,
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "inline-flex size-11 items-center justify-center rounded-full border border-rim bg-glass",
                    tone,
                  )}
                >
                  <Icon className="size-5" />
                </span>
                <span className="font-display text-title font-semibold text-ink">
                  {t(`home.pillar.${id}.title` as CopyKey)}
                </span>
                <span className="text-body text-ink-muted">
                  {t(`home.pillar.${id}.body` as CopyKey)}
                </span>
                <ArrowRight
                  aria-hidden
                  className="mt-auto size-5 text-ink-muted transition-transform group-hover:translate-x-1 group-hover:text-rain motion-reduce:transition-none"
                />
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <p className="max-w-3xl text-caption text-ink-muted">{t("home.note")}</p>
    </PageContainer>
  );
}

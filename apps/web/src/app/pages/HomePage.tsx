import { Button } from "@itza/ui-kit";
import { Link } from "@tanstack/react-router";
import { t } from "../../copy";
import { PageContainer } from "../PageContainer";

export function HomePage() {
  return (
    <PageContainer>
      <section className="max-w-2xl space-y-4">
        <h1 className="text-3xl font-semibold text-accent-strong">{t("home.title")}</h1>
        <p className="text-lg leading-relaxed text-ink-muted">{t("home.body")}</p>
        <Button asChild>
          <Link to="/field">{t("home.cta")}</Link>
        </Button>
      </section>
    </PageContainer>
  );
}

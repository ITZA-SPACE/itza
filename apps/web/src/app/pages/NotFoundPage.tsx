import { Link } from "@tanstack/react-router";
import { t } from "../../copy";
import { PageContainer } from "../PageContainer";

export function NotFoundPage() {
  return (
    <PageContainer>
      <section className="space-y-3">
        <h1 className="text-2xl font-semibold">{t("notFound.title")}</h1>
        <Link to="/" className="text-emerald-800 underline">
          {t("notFound.back")}
        </Link>
      </section>
    </PageContainer>
  );
}

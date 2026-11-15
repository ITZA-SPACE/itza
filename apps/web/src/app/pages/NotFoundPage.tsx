import { Button, EmptyState } from "@itza/ui-kit";
import { Link } from "@tanstack/react-router";
import { t } from "../../copy";
import { PageContainer } from "../PageContainer";

export function NotFoundPage() {
  return (
    <PageContainer>
      <EmptyState
        className="mt-12"
        title={t("notFound.title")}
        action={
          <Button asChild>
            <Link to="/">{t("notFound.back")}</Link>
          </Button>
        }
      />
    </PageContainer>
  );
}

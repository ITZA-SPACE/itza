import { useQuery } from "@tanstack/react-query";
import { type CopyKey, t } from "../../copy";
import { config } from "../../lib/config";
import { fetchHealth } from "../../lib/health";
import { PageContainer } from "../PageContainer";
import { PageHeader } from "../shell/PageHeader";

const SERVICES: { label: CopyKey; url: string }[] = [
  { label: "diagnostics.scienceApi", url: config.scienceApiUrl },
  { label: "diagnostics.siGateway", url: config.siGatewayUrl },
];

function ServiceRow({ label, url }: { label: CopyKey; url: string }) {
  const health = useQuery({
    queryKey: ["health", url],
    queryFn: ({ signal }) => fetchHealth(url, signal),
    retry: false,
    refetchInterval: 30_000,
  });
  const state = health.isPending ? "checking" : health.isSuccess ? "ok" : "down";
  const color = { checking: "bg-ink-muted", ok: "bg-good-ink", down: "bg-risk-ink" }[state];

  return (
    <li className="glass-panel flex flex-wrap items-center justify-between gap-2 rounded-panel px-5 py-4">
      <span className="min-w-0">
        <span className="font-semibold text-ink">{t(label)}</span>
        <span className="ml-2 break-all text-caption text-ink-muted">{url}</span>
      </span>
      <span className="flex items-center gap-2 text-caption text-ink">
        <span aria-hidden="true" className={`size-2.5 rounded-full ${color}`} />
        {t(`diagnostics.status.${state}`)}
      </span>
    </li>
  );
}

/** Hidden diagnostics panel (TECHNICAL_ARCHITECTURE §15): reachable at /diagnostics only. */
export function DiagnosticsPage() {
  return (
    <PageContainer>
      <PageHeader title={t("diagnostics.title")} subtitle={t("diagnostics.body")} />
      <section className="max-w-3xl">
        <ul className="list-none space-y-3 p-0">
          {SERVICES.map((service) => (
            <ServiceRow key={service.label} {...service} />
          ))}
        </ul>
      </section>
    </PageContainer>
  );
}

import { useQuery } from "@tanstack/react-query";
import { type CopyKey, t } from "../../copy";
import { config } from "../../lib/config";
import { fetchHealth } from "../../lib/health";
import { PageContainer } from "../PageContainer";

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
  const color = { checking: "bg-stone-400", ok: "bg-emerald-600", down: "bg-red-600" }[state];

  return (
    <li className="flex items-center justify-between rounded-lg border border-stone-200 bg-white px-4 py-3">
      <span>
        <span className="font-medium">{t(label)}</span>
        <span className="ml-2 text-sm text-stone-500">{url}</span>
      </span>
      <span className="flex items-center gap-2 text-sm">
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
      <section className="max-w-2xl space-y-4">
        <h1 className="text-2xl font-semibold">{t("diagnostics.title")}</h1>
        <p className="text-stone-600">{t("diagnostics.body")}</p>
        <ul className="space-y-2">
          {SERVICES.map((service) => (
            <ServiceRow key={service.label} {...service} />
          ))}
        </ul>
      </section>
    </PageContainer>
  );
}

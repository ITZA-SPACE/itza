import { Button, EmptyState } from "@itza/ui-kit";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { PageContainer } from "../app/PageContainer";
import { PageHeader } from "../app/shell/PageHeader";
import { t } from "../copy";
import { formatHectares } from "../lib/format";
import { type FieldSnapshot, listSnapshots, useFieldStore } from "../state";
import { installApp, isStandalone, useOnline, usePwaStore } from "./pwa";

function Install() {
  const canPrompt = usePwaStore((s) => s.installEvent !== null);
  const installed = usePwaStore((s) => s.installed) || isStandalone();
  return (
    <section aria-labelledby="pwa-install" className="glass-panel space-y-3 rounded-card p-6">
      <h2 id="pwa-install" className="text-title font-semibold text-ink">
        {t("pwa.install.title")}
      </h2>
      <p className="text-body text-ink-muted">{t("pwa.install.body")}</p>
      {installed ? (
        <p className="text-body font-semibold text-accent-strong">{t("pwa.install.done")}</p>
      ) : canPrompt ? (
        <Button onClick={() => void installApp()}>{t("pwa.install.action")}</Button>
      ) : (
        <p className="text-body text-ink-muted">{t("pwa.install.manual")}</p>
      )}
    </section>
  );
}

function CachedFields() {
  const [fields] = useState<FieldSnapshot[]>(listSnapshots);
  const selectField = useFieldStore((s) => s.selectField);
  const navigate = useNavigate();
  const online = useOnline();
  return (
    <section aria-labelledby="pwa-fields" className="glass-panel space-y-3 rounded-card p-6">
      <h2 id="pwa-fields" className="text-title font-semibold text-ink">
        {t("pwa.fields.title")}
      </h2>
      <p className="text-body text-ink-muted">
        {t(online ? "pwa.fields.body" : "pwa.fields.body.offline")}
      </p>
      {fields.length === 0 ? (
        <EmptyState title={t("pwa.fields.empty")} />
      ) : (
        <ul className="list-none divide-y divide-line-soft rounded-panel border border-line-soft bg-glass p-0">
          {fields.map(({ field }) => (
            <li key={field.id} className="flex items-center gap-3 p-3">
              <span className="flex-1 text-body text-ink">
                {formatHectares(field.areaHa)} {t("map.field.unit.ha")}
                <span className="block text-caption text-ink-muted">
                  {field.centroid[1].toFixed(3)}, {field.centroid[0].toFixed(3)}
                </span>
              </span>
              <Button
                variant="secondary"
                onClick={() => {
                  selectField(field);
                  void navigate({ to: "/field" });
                }}
              >
                {t("pwa.fields.open")}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function SettingsPage() {
  return (
    <PageContainer>
      <PageHeader eyebrow={t("nav.group.tools")} title={t("pwa.settings.title")} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Install />
        <CachedFields />
      </div>
    </PageContainer>
  );
}

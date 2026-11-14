import { t } from "../copy";

export function HomePage() {
  return (
    <section className="max-w-2xl space-y-4">
      <h1 className="text-3xl font-semibold text-emerald-950">{t("home.title")}</h1>
      <p className="text-lg leading-relaxed text-stone-700">{t("home.body")}</p>
    </section>
  );
}

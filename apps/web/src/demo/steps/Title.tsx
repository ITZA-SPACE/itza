import { t } from "../../copy";
import { FieldTwin } from "../../twin/FieldTwin";
import { storyField } from "../constants";

/** The opening shot (DEMO_STRATEGY.md §3, 0:00–0:15): the globe, the name and the tagline. */
export function TitleStep() {
  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-3">
      <div className="text-center">
        <p className="font-display text-display font-bold tracking-widest text-ink">
          {t("demo.title.name")}
        </p>
        <p className="text-title text-ink-muted">{t("app.tagline")}</p>
      </div>
      <div className="min-h-0 flex-1">
        <FieldTwin geometry={storyField().geometry} />
      </div>
    </div>
  );
}

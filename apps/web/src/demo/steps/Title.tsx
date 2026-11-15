import wordmark from "../../assets/itza-wordmark.svg";
import { t } from "../../copy";
import { FieldTwin } from "../../twin/FieldTwin";
import { storyField } from "../constants";

/** The opening shot (DEMO_STRATEGY.md §3, 0:00–0:15): the field in 3D, the name and the tagline. */
export function TitleStep() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center gap-3 pt-2 text-center">
        <img
          src={wordmark}
          alt={t("demo.title.name")}
          width={188}
          height={54}
          className="h-[54px] w-[188px]"
        />
        <p className="text-title text-ink-muted">{t("app.tagline")}</p>
      </div>
      <FieldTwin geometry={storyField().geometry} />
    </div>
  );
}

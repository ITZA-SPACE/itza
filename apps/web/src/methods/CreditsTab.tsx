import { t } from "../copy";
import { type CreditGroup, type CreditRow, credits } from "./credits";

const GROUPS: CreditGroup[] = ["nasa", "partner", "other"];
const SI_KEYS = ["assistant", "model", "never", "built"] as const;

function Row({ row }: { row: CreditRow }) {
  const link = row.doi ? `https://doi.org/${row.doi}` : row.url;
  return (
    <li className="space-y-1 border-t border-line-soft py-3 first:border-t-0">
      <p className="font-semibold">
        {row.name}
        {row.version ? <span className="font-normal text-ink-muted"> · v{row.version}</span> : null}
      </p>
      {row.role ? <p>{row.role}</p> : null}
      <p className="text-caption text-ink-muted">
        {t("credits.license")}: {row.license}
      </p>
      {row.citation ? <p className="text-caption text-ink-muted">{row.citation}</p> : null}
      {link ? (
        <a
          href={link}
          target="_blank"
          rel="noreferrer"
          className="text-caption text-accent-strong underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          {row.doi ? `DOI ${row.doi}` : t("credits.source")}
        </a>
      ) : null}
    </li>
  );
}

/** Every data source, partner source, tool and library with its license and citation, plus how ITZA uses SI. */
export function CreditsTab() {
  return (
    <div className="space-y-8">
      <p className="text-ink-muted">{t("credits.intro")}</p>
      <section className="space-y-2" aria-labelledby="credits-si">
        <h3 id="credits-si" className="text-body font-semibold">
          {t("credits.si.title")}
        </h3>
        <ul className="list-disc space-y-1 pl-5 text-ink-muted">
          {SI_KEYS.map((k) => (
            <li key={k}>{t(`credits.si.${k}`)}</li>
          ))}
        </ul>
      </section>
      {GROUPS.map((group) => (
        <section key={group} className="space-y-1" aria-labelledby={`credits-${group}`}>
          <h3 id={`credits-${group}`} className="text-body font-semibold">
            {t(`credits.group.${group}`)}
          </h3>
          <ul>
            {credits.groups[group].map((row) => (
              <Row key={row.key} row={row} />
            ))}
          </ul>
        </section>
      ))}
      <section className="space-y-2">
        <h3 className="text-body font-semibold">{t("credits.libraries")}</h3>
        {credits.libraries.map((list) => (
          <details key={list.title} className="rounded-control border border-line-soft p-2">
            <summary className="cursor-pointer text-caption font-semibold focus-visible:outline-2 focus-visible:outline-focus">
              {list.title}
            </summary>
            <ul className="mt-2 columns-1 gap-6 text-caption text-ink-muted sm:columns-2">
              {list.rows.map((r) => (
                <li key={`${r.name}@${r.version}`}>
                  {r.name} {r.version} · {r.license}
                </li>
              ))}
            </ul>
          </details>
        ))}
      </section>
    </div>
  );
}

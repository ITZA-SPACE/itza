import { useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { type CopyKey, hasCopy, t } from "../copy";

/** Paths with their own title and description in `copy/en/seo.json` (`seo.<page>.title`). */
const PAGES = [
  "demo",
  "field",
  "twin",
  "history",
  "climate",
  "inputs",
  "compare",
  "builder",
  "future",
  "arena",
  "validation",
  "ask",
  "sources",
  "settings",
] as const;

/** The page part of a path: `/future` and `/future/` give `future`, `/` gives `home`. */
export function pageOf(pathname: string): string {
  const first = pathname.split("/").filter(Boolean)[0] ?? "";
  return (PAGES as readonly string[]).includes(first) ? first : "home";
}

function setMeta(selector: string, attribute: string, value: string) {
  document.head.querySelector(selector)?.setAttribute(attribute, value);
}

/**
 * Keeps the document title, description and canonical URL in step with the route, so each page has
 * its own entry in search results and browser tabs. Social cards use the static tags in index.html.
 */
export function PageMeta() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  useEffect(() => {
    const page = pageOf(pathname);
    const title = t(`seo.${page}.title` as CopyKey);
    const description = hasCopy(`seo.${page}.description`)
      ? t(`seo.${page}.description` as CopyKey)
      : t("seo.home.description");
    document.title = page === "home" ? title : `${title} · ${t("seo.suffix")}`;
    setMeta('meta[name="description"]', "content", description);
    const canonical = new URL(page === "home" ? "/" : `/${page}`, "https://itza.microclub.info");
    setMeta('link[rel="canonical"]', "href", canonical.toString());
  }, [pathname]);
  return null;
}

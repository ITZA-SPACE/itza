import {
  Dialog,
  Disclosure,
  IconButton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@itza/ui-kit";
import { BookOpen } from "lucide-react";
import { lazy, Suspense } from "react";
import { type CopyKey, t } from "../copy";
import { CreditsTab } from "./CreditsTab";
import { type MethodSection, sections } from "./content";
import {
  CREDITS_TAB,
  SUMMARY_TAB,
  setMethodsOpen,
  setMethodsTab,
  useMethodsState,
} from "./registry";

const Formula = lazy(() => import("./Formula"));

function Section({ section }: { section: MethodSection }) {
  const { id, tex, steps, symbols, assumptions } = section;
  const key = (suffix: string) => `methods.${id}.${suffix}` as CopyKey;
  return (
    <section className="glass-panel min-w-0 space-y-3 rounded-card p-4">
      <h3 className="text-title font-semibold text-ink">{t(key("title"))}</h3>
      {tex ? (
        <div className="space-y-1 overflow-x-auto overscroll-x-contain rounded-panel border border-line-soft bg-glass px-3 py-1 text-ink">
          {tex.map((formula) => (
            <Suspense
              key={formula}
              fallback={<code className="block py-3 font-mono text-caption">{formula}</code>}
            >
              <Formula tex={formula} />
            </Suspense>
          ))}
        </div>
      ) : null}
      {steps ? (
        <ol className="flex list-none flex-wrap items-center gap-1.5 p-0 text-caption font-semibold text-ink">
          {Array.from({ length: steps }, (_, i) => (
            <li key={key(`step${i}`)} className="flex items-center gap-1.5">
              {i > 0 ? (
                <span aria-hidden="true" className="text-ink-muted">
                  →
                </span>
              ) : null}
              <span className="rounded-full border border-rim bg-glass px-3 py-1">
                {t(key(`step${i}`))}
              </span>
            </li>
          ))}
        </ol>
      ) : null}
      {symbols ? (
        <p className="text-caption text-ink-muted">
          <span className="font-semibold text-ink">{t("methods.where")}</span> {t(key("symbols"))}
        </p>
      ) : null}
      <Disclosure summary={t("methods.assumptions")} count={assumptions}>
        <ul className="list-disc space-y-1 pl-5 text-caption text-ink-muted">
          {Array.from({ length: assumptions }, (_, i) => (
            <li key={key(`assumption${i}`)}>{t(key(`assumption${i}`))}</li>
          ))}
        </ul>
      </Disclosure>
    </section>
  );
}

function Summary() {
  return (
    <div className="space-y-4">
      <p className="text-ink-muted">{t("methods.intro")}</p>
      {sections.map((section) => (
        <Section key={section.id} section={section} />
      ))}
    </div>
  );
}

export function MethodsDrawer() {
  const { open, tab: current, tabs } = useMethodsState();
  return (
    <Dialog
      variant="drawer"
      open={open}
      onOpenChange={setMethodsOpen}
      title={t("methods.title")}
      closeLabel={t("methods.close")}
    >
      <Tabs value={current} onValueChange={setMethodsTab}>
        <TabsList>
          <TabsTrigger value={SUMMARY_TAB}>{t("methods.tab.summary")}</TabsTrigger>
          {tabs.map((tab) => (
            <TabsTrigger key={tab.id} value={tab.id}>
              {tab.label}
            </TabsTrigger>
          ))}
          <TabsTrigger value={CREDITS_TAB}>{t("credits.tab")}</TabsTrigger>
        </TabsList>
        <TabsContent value={SUMMARY_TAB}>
          <Summary />
        </TabsContent>
        <TabsContent value={CREDITS_TAB}>
          <CreditsTab />
        </TabsContent>
        {tabs.map((tab) => (
          <TabsContent key={tab.id} value={tab.id}>
            {tab.render()}
          </TabsContent>
        ))}
      </Tabs>
    </Dialog>
  );
}

export function MethodsButton() {
  return (
    <IconButton
      label={t("methods.open")}
      aria-haspopup="dialog"
      onClick={() => setMethodsOpen(true)}
      className="lg:size-12"
    >
      <BookOpen aria-hidden />
    </IconButton>
  );
}

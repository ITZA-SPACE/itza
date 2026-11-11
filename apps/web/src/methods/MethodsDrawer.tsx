import { Button, Dialog, Tabs, TabsContent, TabsList, TabsTrigger } from "@itza/ui-kit";
import { type CopyKey, t } from "../copy";
import { sections } from "./content";
import { setMethodsOpen, useMethodsState } from "./registry";

const SUMMARY_TAB = "summary";

function Summary() {
  return (
    <div className="space-y-6">
      <p className="text-ink-muted">{t("methods.intro")}</p>
      {sections.map(({ id, assumptions }) => {
        const key = (suffix: string) => `methods.${id}.${suffix}` as CopyKey;
        return (
          <section key={id} className="space-y-2">
            <h3 className="text-body font-semibold">{t(key("title"))}</h3>
            <pre className="overflow-x-auto whitespace-pre-wrap rounded-control bg-surface-muted p-3 font-mono text-caption">
              {t(key("formula"))}
            </pre>
            <p className="text-caption font-semibold">{t("methods.assumptions")}</p>
            <ul className="list-disc space-y-1 pl-5 text-ink-muted">
              {Array.from({ length: assumptions }, (_, i) => (
                <li key={key(`assumption${i}`)}>{t(key(`assumption${i}`))}</li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

export function MethodsDrawer() {
  const { open, tabs } = useMethodsState();
  return (
    <Dialog
      variant="drawer"
      open={open}
      onOpenChange={setMethodsOpen}
      title={t("methods.title")}
      closeLabel={t("methods.close")}
    >
      <Tabs defaultValue={SUMMARY_TAB}>
        <TabsList>
          <TabsTrigger value={SUMMARY_TAB}>{t("methods.tab.summary")}</TabsTrigger>
          {tabs.map((tab) => (
            <TabsTrigger key={tab.id} value={tab.id}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value={SUMMARY_TAB}>
          <Summary />
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
    <Button variant="secondary" onClick={() => setMethodsOpen(true)}>
      {t("methods.open")}
    </Button>
  );
}

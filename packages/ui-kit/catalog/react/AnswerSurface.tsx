import { A2uiSurface, type ReactCatalogComponent } from "@a2ui/react/v0_9";
import { MessageProcessor } from "@a2ui/web_core/v0_9";
import { useEffect, useMemo, useState } from "react";
import type { A2uiMessage } from "../surface";
import { answerCatalog } from "./catalog";
import { type CatalogHost, CatalogHostProvider } from "./host";

export interface AnswerSurfaceProps {
  /** Messages already checked with `validateAnswer`. Data-model writes in them are ignored. */
  messages: readonly A2uiMessage[];
  /** Values by JSON Pointer, written by the app from tool results. They replace anything else. */
  data: Readonly<Record<string, unknown>>;
  host: CatalogHost;
}

/** Renders one validated answer surface with the app's data bound in. */
export function AnswerSurface({ messages, data, host }: AnswerSurfaceProps) {
  const processor = useMemo(() => {
    const p = new MessageProcessor<ReactCatalogComponent>([answerCatalog]);
    // The model never supplies numbers: the app fills the data model from tool results.
    p.processMessages(messages.filter((m) => !("updateDataModel" in m)) as never);
    return p;
  }, [messages]);
  useEffect(() => () => processor.dispose(), [processor]);

  useEffect(() => {
    const surfaceId = [...processor.model.surfacesMap.keys()][0];
    if (!surfaceId) return;
    processor.processMessages(
      Object.entries(data).map(([path, value]) => ({
        version: "v0.9",
        updateDataModel: { surfaceId, path, value },
      })) as never,
    );
  }, [processor, data]);

  const [surface] = useSurfaces(processor);
  if (!surface) return null;
  return (
    <CatalogHostProvider host={host}>
      <A2uiSurface surface={surface} />
    </CatalogHostProvider>
  );
}

function useSurfaces(processor: MessageProcessor<ReactCatalogComponent>) {
  const [surfaces, setSurfaces] = useState(() => [...processor.model.surfacesMap.values()]);
  useEffect(() => {
    const sync = () => setSurfaces([...processor.model.surfacesMap.values()]);
    sync();
    const created = processor.onSurfaceCreated(sync);
    const deleted = processor.onSurfaceDeleted(sync);
    return () => {
      created.unsubscribe();
      deleted.unsubscribe();
    };
  }, [processor]);
  return surfaces;
}

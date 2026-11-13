import type { FieldBundle } from "@itza/engine/contracts";
import { analyseFieldMemory } from "@itza/engine/memory";
import { useQueries } from "@tanstack/react-query";
import { useMemo } from "react";
import { HERO_FIELDS, type HeroField, loadFieldBundle } from "../data";
import { ndviSources } from "../memory/ndvi";
import { regionFor } from "../memory/region";
import type { ProofFieldHistory } from "./groundTruth";
import { type CdlLabel, compareHistory, parseCdl } from "./proofHistory";

/** The proof fields: sampling areas near Akron with public crop-type records. */
export const PROOF_FIELDS: readonly HeroField[] = HERO_FIELDS.filter((h) => h.role === "proof");

interface ProofData {
  hero: HeroField;
  bundle: FieldBundle;
  cdl: CdlLabel[];
}

const base = `${import.meta.env.BASE_URL}bundles`.replace(/\/\//g, "/");

/** One proof field's precomputed bundle (cached for offline use) and its public crop records. */
async function loadProof(hero: HeroField): Promise<ProofData> {
  let bundle: FieldBundle | undefined;
  for await (const snapshot of loadFieldBundle(hero.geometry, { heroId: hero.id })) {
    if (snapshot.complete) bundle = snapshot.bundle;
  }
  if (!bundle) throw new Error(`no bundle for ${hero.id}`);
  const response = await fetch(`${base}/${hero.id}/cdl.json`);
  if (!response.ok) throw new Error(`no crop records for ${hero.id}`);
  return { hero, bundle, cdl: parseCdl(await response.json()) };
}

export interface ProofState {
  status: "loading" | "ready" | "error";
  /** Field Memory vs the public record, one entry per proof field that loaded. */
  histories: ProofFieldHistory[];
  /** The bundles, for the ranking check. */
  bundles: { hero: HeroField; bundle: FieldBundle }[];
}

/** Loads every proof field and runs Field Memory on its NDVI. Works offline from precomputed files. */
export function useProofData(nameOf: (hero: HeroField) => string): ProofState {
  const queries = useQueries({
    queries: PROOF_FIELDS.map((hero) => ({
      queryKey: ["proof-data", hero.id],
      queryFn: () => loadProof(hero),
      staleTime: Number.POSITIVE_INFINITY,
      networkMode: "offlineFirst" as const,
      retry: false,
    })),
  });
  const failed = queries.some((q) => q.isError);
  const pending = queries.some((q) => q.isPending);
  const stamp = queries.map((q) => q.dataUpdatedAt).join(",");
  // biome-ignore lint/correctness/useExhaustiveDependencies: `stamp` changes exactly when query data does
  return useMemo(() => {
    const ready = queries.map((q) => q.data).filter((d): d is ProofData => d !== undefined);
    const histories = ready.map(({ hero, bundle, cdl }) => {
      const [lon, lat] = bundle.field.centroid;
      const region = regionFor(lon, lat);
      const memory = analyseFieldMemory({
        series: ndviSources(bundle),
        calendar: region.calendar,
        crops: region.crops,
      });
      return compareHistory({ id: hero.id, name: nameOf(hero) }, memory.seasons, cdl);
    });
    return {
      status: failed ? "error" : pending ? "loading" : "ready",
      histories,
      bundles: ready.map(({ hero, bundle }) => ({ hero, bundle })),
    } satisfies ProofState;
  }, [stamp, failed, pending, nameOf]);
}

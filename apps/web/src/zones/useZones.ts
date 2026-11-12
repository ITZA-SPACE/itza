import { useQuery } from "@tanstack/react-query";
import { create } from "zustand";
import { useLayers } from "../map/layers/useLayers";
import { fetchZones } from "./service";

/** Whether the zones panel is on screen; the map draws zones only then. */
export const useZoneState = create<{ shown: boolean; setShown: (shown: boolean) => void }>()(
  (set) => ({ shown: false, setShown: (shown) => set({ shown }) }),
);

/** Zones for the selected field, fetched once the field data and the panel are there. */
export function useZones() {
  const { bundle, bounds } = useLayers();
  const shown = useZoneState((s) => s.shown);
  const query = useQuery({
    queryKey: ["zones", bundle?.field.id, bounds],
    enabled: shown && bundle !== undefined && bounds !== null,
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
    queryFn: ({ signal }) => {
      if (!bundle || !bounds) throw new Error("field data is not ready");
      return fetchZones(bundle, bounds, signal);
    },
  });
  return { bundle, zones: query.data, loading: query.isFetching, failed: query.isError };
}

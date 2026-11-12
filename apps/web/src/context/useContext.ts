import { useQuery } from "@tanstack/react-query";
import { useLayers } from "../map/layers/useLayers";
import {
  fieldBbox,
  type GediResult,
  type GraceResult,
  getContext,
  parseGedi,
  parseGrace,
  parseScenes,
  type SceneResult,
  type Status,
} from "./service";

const POLL_MS = 5_000;
const DAY_MS = 86_400_000;

/** Poll while the API answers `pending` (202), stop once it has a result. */
const pollWhilePending = (query: { state: { data?: { status: Status } | undefined } }) =>
  query.state.data?.status === "pending" ? POLL_MS : false;

/** Scenes from the last year of the field's data period. */
function scenePeriod(end: string): { from: string; to: string } {
  const to = new Date(`${end}T00:00:00Z`);
  const from = new Date(to.getTime() - 365 * DAY_MS);
  return { from: from.toISOString().slice(0, 10), to: end };
}

function useField() {
  const { bundle, bounds } = useLayers();
  return bundle && bounds ? { bundle, bbox: fieldBbox(bundle), end: bounds.end } : null;
}

export function useScenes(kind: "nisar" | "ecostress") {
  const field = useField();
  const path = kind === "nisar" ? "/v1/nisar" : "/v1/context/ecostress";
  return useQuery<SceneResult>({
    queryKey: ["context", kind, field?.bbox, field?.end],
    enabled: field !== null,
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
    refetchInterval: pollWhilePending,
    queryFn: ({ signal }) => {
      if (!field) throw new Error("field data is not ready");
      const params = { bbox: field.bbox, ...scenePeriod(field.end), limit: "4" };
      return getContext(path, params, parseScenes, signal);
    },
  });
}

export function useGrace() {
  const field = useField();
  const [lon, lat] = field?.bundle.field.centroid ?? [0, 0];
  return useQuery<GraceResult>({
    queryKey: ["context", "grace", lon, lat],
    enabled: field !== null,
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
    refetchInterval: pollWhilePending,
    queryFn: ({ signal }) =>
      getContext("/v1/context/grace", { lat: String(lat), lon: String(lon) }, parseGrace, signal),
  });
}

export function useGedi() {
  const field = useField();
  return useQuery<GediResult>({
    queryKey: ["context", "gedi", field?.bbox],
    enabled: field !== null,
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
    refetchInterval: pollWhilePending,
    queryFn: ({ signal }) => {
      if (!field) throw new Error("field data is not ready");
      return getContext("/v1/context/gedi", { bbox: field.bbox, limit: "4" }, parseGedi, signal);
    },
  });
}

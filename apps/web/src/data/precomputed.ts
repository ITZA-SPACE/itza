import type { FieldGeometry } from "./geometry";
import { heroIdFor } from "./useFieldBundle";

const base = `${import.meta.env.BASE_URL}bundles`.replace(/\/\//g, "/");

/**
 * A precomputed file of a hero field (`public/bundles/<id>/<file>`), or null when the field is not
 * a hero field or the file cannot be read. Hero fields run fully offline from these files
 * (NFR-05); callers fall back to the live API for any other field.
 */
export async function heroStatic(
  geometry: FieldGeometry | undefined,
  file: string,
  signal?: AbortSignal,
): Promise<unknown | null> {
  const id = heroIdFor(geometry);
  if (!id) return null;
  try {
    const response = await fetch(`${base}/${id}/${file}`, { signal: signal ?? null });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

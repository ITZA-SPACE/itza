import { type FieldSnapshot, parseSnapshot } from "../state/persistence";

const KEY = "s=";
// A real snapshot is a few kB; these stop a hand-made link from inflating into memory.
const MAX_PAYLOAD_CHARS = 100_000;
const MAX_JSON_BYTES = 1_000_000;

/** What a share link carries: the field snapshot and the builder design scored with it, if any. */
export interface Shared {
  snapshot: FieldSnapshot;
  /** Crops of the design sent from the builder to the comparison; it changes the ranking. */
  design: string[] | null;
}

async function pipe(
  bytes: Uint8Array<ArrayBuffer>,
  stream: CompressionStream | DecompressionStream,
  maxBytes = Number.POSITIVE_INFINITY,
) {
  const reader = new Blob([bytes]).stream().pipeThrough(stream).getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > maxBytes) {
      await reader.cancel();
      throw new Error("too large");
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

/** A link comes from anyone: `parseSnapshot` checks the outline; the rest the screens read must be there too. */
function isWellFormed({ field, confirmedHistory }: FieldSnapshot): boolean {
  return (
    Array.isArray(field.centroid) &&
    field.centroid.every(Number.isFinite) &&
    Number.isFinite(field.areaHa) &&
    Array.isArray(confirmedHistory)
  );
}

/** The snapshot and design as compressed URL-safe text: the field outline and what the farmer entered, nothing else. */
export async function encodeShared({ snapshot, design }: Shared): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify({ ...snapshot, design }));
  return toBase64Url(await pipe(json, new CompressionStream("deflate-raw")));
}

/** Reads text made by `encodeShared`; anything else gives null. */
export async function decodeShared(payload: string): Promise<Shared | null> {
  if (payload.length > MAX_PAYLOAD_CHARS) return null;
  try {
    const text = new TextDecoder().decode(
      await pipe(fromBase64Url(payload), new DecompressionStream("deflate-raw"), MAX_JSON_BYTES),
    );
    const parsed = parseSnapshot(text) as (FieldSnapshot & { design?: unknown }) | null;
    if (!parsed || !isWellFormed(parsed)) return null;
    const { design, ...snapshot } = parsed;
    const crops =
      Array.isArray(design) && design.every((c) => typeof c === "string") ? design : null;
    return { snapshot, design: crops };
  } catch {
    return null;
  }
}

/** The link that opens the comparison with this payload. The payload sits after `#`, so it never reaches a server. */
export function shareUrl(origin: string, payload: string): string {
  return `${origin}/compare#${KEY}${payload}`;
}

/** The payload of a share link's hash, or null when the hash is not one. */
export function payloadOfHash(hash: string): string | null {
  const text = hash.replace(/^#/, "");
  return text.startsWith(KEY) && text.length > KEY.length ? text.slice(KEY.length) : null;
}

import { type FieldSnapshot, parseSnapshot } from "../state/persistence";

const KEY = "s=";

async function pipe(
  bytes: Uint8Array<ArrayBuffer>,
  stream: CompressionStream | DecompressionStream,
) {
  const piped = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(piped).arrayBuffer());
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

/** The snapshot as compressed URL-safe text: the field outline and what the farmer entered, nothing else. */
export async function encodeSnapshot(snapshot: FieldSnapshot): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(snapshot));
  return toBase64Url(await pipe(json, new CompressionStream("deflate-raw")));
}

/** Reads text made by `encodeSnapshot`; anything else gives null. */
export async function decodeSnapshot(payload: string): Promise<FieldSnapshot | null> {
  try {
    const json = await pipe(fromBase64Url(payload), new DecompressionStream("deflate-raw"));
    return parseSnapshot(new TextDecoder().decode(json));
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

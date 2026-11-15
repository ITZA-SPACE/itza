/**
 * A model sometimes writes its answer call as text instead of calling the tool: the reply then ends
 * with `{"intent": ..., "caption": ..., "chips": [...]}`. This finds that trailing JSON, removes it
 * from what the user reads and, when it is a complete call, returns it so the app can still draw
 * the answer. While a reply is still streaming the JSON is incomplete: it is hidden as well.
 */
const START = /(?:```(?:json)?\s*)?\{\s*"(?:intent|caption|messages|chips)"/;

export interface SplitReply {
  /** The reply without the leaked call. */
  text: string;
  /** The call, when the leaked JSON was complete. */
  call: Record<string, unknown> | null;
}

function parseObject(raw: string): Record<string, unknown> | null {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/, "")
    .replace(/\s*```$/, "");
  try {
    const value: unknown = JSON.parse(cleaned);
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function splitLeakedCall(reply: string): SplitReply {
  const match = START.exec(reply);
  if (!match) return { text: reply, call: null };
  const call = parseObject(reply.slice(match.index));
  const usable =
    call !== null &&
    (Array.isArray(call.messages) ||
      (typeof call.intent === "string" && typeof call.caption === "string"));
  return { text: reply.slice(0, match.index).trimEnd(), call: usable ? call : null };
}

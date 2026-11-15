/**
 * Grounding validator: every number or date in a caption must come from a tool output of the
 * same turn. Rounding and common unit changes are tolerated; anything else is unsupported.
 */
export interface GroundingResult {
  ok: boolean;
  /** Numbers found in the text that no tool output supports. */
  unsupported: string[];
}

/** Numbers the app itself names in plain words (the 2050 scenario). */
const ALLOWED = [2050];
// Scenario names such as "SSP2-4.5" carry digits that are not data.
const SCENARIO_NAME = /\bSSP\d-\d\.\d\b/g;
// A number not glued to a letter, so identifiers like "ET0" or "rot2" are skipped.
const NUMBER = /(?<![A-Za-z0-9.])\d{1,3}(?:,\d{3})+(?:\.\d+)?%?|(?<![A-Za-z0-9.])\d+(?:\.\d+)?%?/g;
const FACTORS = [1, 100, 0.01, 10, 0.1, 1000, 0.001];

interface Token {
  raw: string;
  value: number;
  decimals: number;
  percent: boolean;
}

/**
 * Writes every number the way the checker reads it: Western digits, "." as the decimal point and no
 * thousands separators. Answers in Arabic and French use Arabic-Indic digits, a decimal comma, a
 * space before "%" and (narrow) no-break or plain spaces between thousands; without this a number
 * written that way would not be seen, and would pass unchecked.
 */
export function normalizeDigits(text: string): string {
  return (
    text
      .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
      .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
      .replace(/\u066B/g, ".")
      .replace(/\u066C/g, ",")
      .replace(/\u066A/g, "%")
      // 1 200 or 1\u00A0200 or 1\u202F200: thousands, when the last group is exactly 3 digits.
      .replace(/(?<![\d.,])(\d{1,3})(?:[\u00A0\u202F ](\d{3}))+(?![\d])/g, (m) =>
        m.replace(/[\u00A0\u202F ]/g, ""),
      )
      // 0,58 is a decimal comma; 1,234 stays an English thousands separator.
      .replace(/(\d),(\d{1,2})(?!\d)/g, "$1.$2")
      .replace(/(\d)[\u00A0\u202F ]+%/g, "$1%")
  );
}

// Darija in Latin letters writes some letters as digits: "3ando", "7lib", "9ahwa". A single digit
// 2, 3, 5, 7, 8 or 9 glued to two or more letters is such a word, not a number (units such as
// "5mm" or "12ha" stay numbers).
const ARABIZI_WORD = /(?<![A-Za-z0-9.])[235789](?!(?:mm|cm|km|ha|kg)\b)[A-Za-z]{2,}\w*/gi;

export function extractNumbers(input: string): Token[] {
  const text = normalizeDigits(input).replace(ARABIZI_WORD, " ");
  const tokens: Token[] = [];
  for (const match of text.replace(SCENARIO_NAME, " ").matchAll(NUMBER)) {
    const raw = match[0];
    const percent = raw.endsWith("%");
    const clean = raw.replace(/[,%]/g, "");
    const dot = clean.indexOf(".");
    tokens.push({
      raw,
      value: Number(clean),
      decimals: dot < 0 ? 0 : clean.length - dot - 1,
      percent,
    });
  }
  return tokens;
}

/** Numbers in a tool output: numeric leaves, digits inside strings (dates), and array lengths. */
function collectSupported(value: unknown, out: number[]): void {
  if (typeof value === "number") {
    if (Number.isFinite(value)) out.push(value);
  } else if (typeof value === "string") {
    for (const token of extractNumbers(value)) out.push(token.value);
  } else if (Array.isArray(value)) {
    out.push(value.length);
    for (const item of value) collectSupported(item, out);
  } else if (value && typeof value === "object") {
    for (const item of Object.values(value)) collectSupported(item, out);
  }
}

/**
 * Captions say "fell by 0.07" or "-0.07" for the same tool value, so the sign is not compared: the
 * token has none (see NUMBER) and the output's value counts by its size.
 */
function supported(token: Token, pool: readonly number[]): boolean {
  const tolerance = 0.5 * 10 ** -token.decimals + 1e-9;
  return pool.some((m) =>
    FACTORS.some((f) => Math.abs(Math.abs(m) * f - token.value) <= tolerance),
  );
}

export function checkGrounding(
  texts: readonly string[],
  toolOutputs: readonly unknown[],
): GroundingResult {
  const pool: number[] = [...ALLOWED];
  for (const output of toolOutputs) collectSupported(output, pool);
  const unsupported = new Set<string>();
  for (const text of texts) {
    for (const token of extractNumbers(text))
      if (!supported(token, pool)) unsupported.add(token.raw);
  }
  return { ok: unsupported.size === 0, unsupported: [...unsupported] };
}

const area = new Intl.NumberFormat("en", { maximumFractionDigits: 2 });
const length = new Intl.NumberFormat("en", { maximumFractionDigits: 0 });
const km = new Intl.NumberFormat("en", { maximumFractionDigits: 2 });
const degrees = new Intl.NumberFormat("en", { minimumFractionDigits: 4, maximumFractionDigits: 4 });

/** Hectares with two decimals for a small field and one for a large one. */
export function formatHectares(ha: number): string {
  return ha >= 100
    ? new Intl.NumberFormat("en", { maximumFractionDigits: 0 }).format(ha)
    : area.format(ha);
}

/** Metres below a kilometre, kilometres above. */
export function formatDistance(meters: number): { value: string; unit: "m" | "km" } {
  return meters >= 1000
    ? { value: km.format(meters / 1000), unit: "km" }
    : { value: length.format(meters), unit: "m" };
}

/** One coordinate as degrees with a hemisphere letter, for example `36.1234° N`. */
export function formatDegrees(value: number, positive: string, negative: string): string {
  return `${degrees.format(Math.abs(value))}° ${value >= 0 ? positive : negative}`;
}

/** Fills `{name}` placeholders in a copy string. */
export function fmt(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? `{${key}}`));
}

const day = new Intl.DateTimeFormat("en", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** An ISO date as a person reads it, for example `14 Mar 2022`. */
export function formatDate(iso: string): string {
  return day.format(new Date(`${iso}T00:00:00Z`));
}

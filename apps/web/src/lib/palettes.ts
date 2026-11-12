/** Chart colors. All are color-blind safe and always shown together with numbers or a table. */

/** Sequential (low to high), ColorBrewer YlOrBr: for "how much", such as the share of bare days. */
export const SEQUENTIAL = ["#ffffd4", "#fed98e", "#fe9929", "#d95f0e", "#993404"] as const;

/** Diverging blue (low) to orange (high), the app's diverging tokens, for anomalies around zero. */
export const DIVERGING = [
  "#08519c",
  "#3182bd",
  "#9ecae1",
  "#f7f7f7",
  "#fdae6b",
  "#e6550d",
  "#a63603",
] as const;

/** Text and line colors of the app tokens, for chart axes. */
export const INK = "#1f2933";
export const INK_MUTED = "#4b5563";
export const LINE_SOFT = "#d9dde3";
export const ACCENT = "#0b5cad";
/** Okabe-Ito vermillion and orange, for markers and highlighted spans. */
export const MARK = "#d55e00";
export const MARK_SOFT = "rgba(230, 159, 0, 0.18)";

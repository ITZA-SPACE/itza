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
export const INK = "#f3f7ff";
export const INK_MUTED = "#a8b8d8";
export const LINE_SOFT = "rgba(237, 237, 237, 0.14)";
export const ACCENT = "#7fd0ff";
/** The gap between heatmap cells: the page's night background, so cells read as tiles. */
export const CELL_GAP = "#050b18";
/** Okabe-Ito vermillion and orange, for markers and highlighted spans. */
export const MARK = "#ff7a33";
export const MARK_SOFT = "rgba(255, 200, 87, 0.16)";

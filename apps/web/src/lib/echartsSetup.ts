// The only ECharts parts the app uses. Imported on demand by EChart, so the library stays out of
// the first load (it lands in its own chunk).
import { HeatmapChart, LineChart } from "echarts/charts";
import {
  GridComponent,
  MarkAreaComponent,
  TooltipComponent,
  VisualMapComponent,
} from "echarts/components";
import * as echarts from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";

echarts.use([
  HeatmapChart,
  LineChart,
  GridComponent,
  MarkAreaComponent,
  TooltipComponent,
  VisualMapComponent,
  CanvasRenderer,
]);

/** The app's dark glass look for every chart: DM Sans, light text, glass tooltips. */
echarts.registerTheme("itza", {
  backgroundColor: "transparent",
  textStyle: { fontFamily: "DM Sans Variable, DM Sans, ui-sans-serif, system-ui, sans-serif" },
  tooltip: {
    backgroundColor: "#070e3a",
    borderColor: "rgba(237, 237, 237, 0.2)",
    textStyle: { color: "#f3f7ff" },
    extraCssText: "border-radius: 14px; box-shadow: 0 18px 48px rgba(0, 0, 0, 0.45);",
  },
});

export { echarts };

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

export { echarts };

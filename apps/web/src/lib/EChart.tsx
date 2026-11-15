import { Skeleton } from "@itza/ui-kit";
import type { EChartsCoreOption } from "echarts/core";
import { useEffect, useRef, useState } from "react";

/**
 * An ECharts chart that loads the library on demand. `label` names the chart for assistive
 * technology; callers always put the same numbers in a table next to it (the accessible
 * alternative), so the canvas itself is a picture.
 */
export function EChart({
  option,
  label,
  height,
  className,
}: {
  option: EChartsCoreOption;
  label: string;
  /** Height in pixels. */
  height: number;
  className?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const chart = useRef<{ setOption: (o: EChartsCoreOption, replace: boolean) => void } | null>(
    null,
  );
  const latest = useRef(option);
  latest.current = option;
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let disposed = false;
    let dispose: (() => void) | undefined;
    void import("./echartsSetup").then(({ echarts }) => {
      const el = host.current;
      if (disposed || !el) return;
      const instance = echarts.init(el, "itza", { renderer: "canvas" });
      chart.current = instance;
      instance.setOption(latest.current, true);
      const observer = new ResizeObserver(() => instance.resize());
      observer.observe(el);
      dispose = () => {
        observer.disconnect();
        instance.dispose();
      };
      setReady(true);
    });
    return () => {
      disposed = true;
      chart.current = null;
      dispose?.();
    };
  }, []);

  useEffect(() => {
    chart.current?.setOption(option, true);
  }, [option]);

  return (
    <div className={className}>
      {ready ? null : <Skeleton className="w-full" style={{ height }} />}
      <div
        ref={host}
        role="img"
        aria-label={label}
        style={{ height: ready ? height : 0 }}
        className="w-full"
      />
    </div>
  );
}

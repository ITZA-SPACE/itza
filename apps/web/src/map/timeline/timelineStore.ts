import { create } from "zustand";
import { type DateRange, type Granularity, periodFor } from "./periods";

interface TimelineState {
  /** The chosen date (any day of the chosen period); null until the data's end date is known. */
  date: string | null;
  granularity: Granularity;
  setDate: (date: string) => void;
  setGranularity: (granularity: Granularity) => void;
}

/** The one timeline every map layer and chart follows (F-01). */
export const useTimeline = create<TimelineState>()((set) => ({
  date: null,
  granularity: "month",
  setDate: (date) => set({ date }),
  setGranularity: (granularity) => set({ granularity }),
}));

/** The chosen period for charts: `null` until a date is chosen. Re-renders when the scrubber moves. */
export function useTimelinePeriod(): (DateRange & { granularity: Granularity }) | null {
  const date = useTimeline((s) => s.date);
  const granularity = useTimeline((s) => s.granularity);
  return date ? { ...periodFor(date, granularity), granularity } : null;
}

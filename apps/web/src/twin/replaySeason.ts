import { create } from "zustand";

export interface ReplaySeason {
  /** Label such as `2021-22`. */
  label: string;
  /** First and last day of the season, ISO dates. */
  start: string;
  end: string;
}

interface ReplaySeasonState {
  season: ReplaySeason | null;
  set: (season: ReplaySeason | null) => void;
}

/** The season the Season Replay is showing, so the 3D twin can show what satellites saw in it. */
export const useReplaySeason = create<ReplaySeasonState>()((set) => ({
  season: null,
  set: (season) => set({ season }),
}));

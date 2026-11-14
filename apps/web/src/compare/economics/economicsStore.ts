import type { EconomicsInput } from "@itza/engine/economics";
import { create } from "zustand";

interface EconomicsState {
  /** Prices, yields and costs the farmer typed, by crop id; kept in memory like the design. */
  economics: EconomicsInput;
  setEconomics: (economics: EconomicsInput) => void;
}

/** The farmer's economics, shared by the compare page (where they are entered) and the builder. */
export const useEconomicsStore = create<EconomicsState>((set) => ({
  economics: {},
  setEconomics: (economics) => set({ economics }),
}));

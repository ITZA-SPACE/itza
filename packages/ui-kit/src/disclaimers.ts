export const disclaimers = {
  judgment:
    "ITZA supports farmer judgment and local agricultural expertise; it does not replace either.",
  relative:
    "Rankings are relative comparisons from historical data, projections and simplified models, not forecasts or guarantees.",
  gaps: "Every recommendation lists information gaps and risks that need local review.",
  satellite:
    "Satellite estimates differ from ground measurements; soil tests and field observations take precedence.",
} as const;

export type DisclaimerId = keyof typeof disclaimers;

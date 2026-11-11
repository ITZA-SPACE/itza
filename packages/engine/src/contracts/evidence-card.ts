// Generated from schemas/ by `pnpm schemas:generate`. Do not edit by hand.

/**
 * Evidence card for one rotation (F-08). Every mandatory field must be present.
 */
export interface EvidenceCard {
  schema: "evidence-card/1.0";
  rotation_id: string;
  why: string;
  /**
   * @minItems 1
   */
  evidence: [EvidenceItem, ...EvidenceItem[]];
  benefits: string[];
  gaps: string[];
  /**
   * Risks needing local review.
   */
  risks: string[];
  score: number;
  resilience_headline: string;
  confidence: {
    level: "high" | "medium" | "low";
    reasons: string[];
  };
  contributions: CriterionValues;
}
export interface EvidenceItem {
  indicator: string;
  value: number | string;
  comparison: string;
  source: string;
  resolution: string;
  period: string;
}
/**
 * One number per criterion.
 */
export interface CriterionValues {
  climate_fit: number;
  water_balance: number;
  soil_nitrogen: number;
  organic_matter: number;
  erosion_control: number;
  bare_field_exposure: number;
  pest_pressure: number;
  forage_income: number;
}

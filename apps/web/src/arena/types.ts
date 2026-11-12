/** Wire types of `POST /v1/ml/stress` (services/science-api `api/ml.py`); no JSON schema exists. */
export interface StageFeatures {
  rain_mm: number;
  dry_spell_days: number;
  et0_mm: number;
  balance_mm: number;
  frost_days: number;
  heat_days: number;
}

export interface SeasonFeatures {
  initial: StageFeatures;
  development: StageFeatures;
  mid: StageFeatures;
  late: StageFeatures;
  smap_rootzone_anomaly?: number;
  previous_peak_ndvi?: number;
  soil_awc_mm_m?: number;
  slope_deg?: number;
}

export interface Source {
  source: string;
  resolution: string;
  period: string;
}

export interface Driver {
  feature: string;
  value: number | null;
  shap_value: number;
}

export interface StressResponse {
  /** NDVI peak anomaly z-score: negative means a poorer season than usual. */
  prediction: number;
  expected_value: number;
  drivers: Driver[];
  model: { model_version: string; status: string; provenance: Source[]; limitations: string[] };
  input_provenance: Source[];
  gaps: string[];
}

import type { FieldGeometry } from "./geometry";

export interface HeroField {
  /** Folder name under public/bundles/. */
  id: string;
  geometry: FieldGeometry;
}

/** Precomputed hero fields. Placeholders until #17 ships the real ones. */
export const HERO_FIELDS: readonly HeroField[] = [
  {
    id: "semi-arid-winter-cereal",
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [5.32804, 36.11842],
          [5.33196, 36.11842],
          [5.33196, 36.12158],
          [5.32804, 36.12158],
          [5.32804, 36.11842],
        ],
      ],
    } as FieldGeometry,
  },
  {
    id: "fallow-heavy",
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [4.89805, 35.69842],
          [4.90195, 35.69842],
          [4.90195, 35.70158],
          [4.89805, 35.70158],
          [4.89805, 35.69842],
        ],
      ],
    } as FieldGeometry,
  },
];

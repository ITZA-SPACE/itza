import type { FieldGeometry } from "./geometry";

export interface HeroField {
  /** Folder name under public/bundles/. */
  id: string;
  /** `story`: the farmer's field (Sétif); `proof`: a field with public crop-type ground truth. */
  role: "story" | "proof";
  /** Region knowledge pack the field belongs to. */
  regionPack: string;
  geometry: FieldGeometry;
}

/**
 * The precomputed hero fields: real NASA-based bundles in `public/bundles/`, produced by
 * `pipelines/build_demo.py` (#17). Keep this list equal to `pipelines/hero_fields.yaml`; the test in
 * `hero.test.ts` fails when they differ. The outlines are sampling polygons, not cadastral boundaries.
 */
export const HERO_FIELDS: readonly HeroField[] = [
  {
    id: "setif-story",
    role: "story",
    regionPack: "dz-high-plains",
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [5.7278, 36.1183],
          [5.7312, 36.1183],
          [5.7312, 36.121],
          [5.7278, 36.121],
          [5.7278, 36.1183],
        ],
      ],
    } as FieldGeometry,
  },
  {
    id: "akron-proof-1",
    role: "proof",
    regionPack: "us-central-great-plains",
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [-103.17086256247813, 40.16678544374368],
          [-103.16802791867501, 40.166946897345056],
          [-103.16824213938182, 40.169082956355155],
          [-103.17107686725595, 40.168921497752535],
          [-103.17086256247813, 40.16678544374368],
        ],
      ],
    } as FieldGeometry,
  },
  {
    id: "akron-proof-2",
    role: "proof",
    regionPack: "us-central-great-plains",
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [-103.15450398326661, 40.13584598801245],
          [-103.15167052680775, 40.136007071283984],
          [-103.15188416728286, 40.138143122882035],
          [-103.1547177077445, 40.13798203462627],
          [-103.15450398326661, 40.13584598801245],
        ],
      ],
    } as FieldGeometry,
  },
  {
    id: "akron-proof-3",
    role: "proof",
    regionPack: "us-central-great-plains",
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [-103.14039200340923, 40.12368372183178],
          [-103.13755899620166, 40.12384448688794],
          [-103.13777217972653, 40.12598054874013],
          [-103.14060527091213, 40.12581977871175],
          [-103.14039200340923, 40.12368372183178],
        ],
      ],
    } as FieldGeometry,
  },
];

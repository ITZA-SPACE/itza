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
 * `hero.test.ts` fails when they differ. The outlines follow real field edges on imagery, but are not cadastral boundaries.
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
          [5.689663, 36.099135],
          [5.689447, 36.098934],
          [5.689303, 36.098002],
          [5.68993, 36.098061],
          [5.689542, 36.097854],
          [5.689841, 36.097522],
          [5.69097, 36.097099],
          [5.691114, 36.096916],
          [5.691976, 36.096714],
          [5.692179, 36.097403],
          [5.692402, 36.097513],
          [5.692699, 36.098231],
          [5.692838, 36.100214],
          [5.693044, 36.100591],
          [5.693003, 36.101541],
          [5.692327, 36.101822],
          [5.691858, 36.102258],
          [5.691438, 36.10229],
          [5.69, 36.103471],
          [5.689903, 36.103407],
          [5.689505, 36.10031],
          [5.689663, 36.099135],
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
          [-103.17235, 40.169315],
          [-103.172393, 40.162182],
          [-103.163059, 40.162149],
          [-103.163123, 40.169249],
          [-103.17235, 40.169315],
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
          [-103.153253, 40.140204],
          [-103.153253, 40.135217],
          [-103.152609, 40.135185],
          [-103.150506, 40.133167],
          [-103.148575, 40.133167],
          [-103.148618, 40.140254],
          [-103.153253, 40.140204],
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
          [-103.145571, 40.126752],
          [-103.145571, 40.124488],
          [-103.152223, 40.124488],
          [-103.152223, 40.122191],
          [-103.134906, 40.122191],
          [-103.134906, 40.126752],
          [-103.145571, 40.126752],
        ],
      ],
    } as FieldGeometry,
  },
];

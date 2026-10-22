import { DEFAULT_PARAMS, type BowlParams } from "./geometry/types";

export interface Preset {
  id: "small-cat" | "medium-dog" | "large-dog";
  params: BowlParams;
}

export const PRESETS: Preset[] = [
  {
    id: "small-cat",
    params: { ...DEFAULT_PARAMS },
  },
  {
    id: "medium-dog",
    params: {
      ...DEFAULT_PARAMS,
      bodyDiameter: 180,
      height: 92,
      innerDepth: 42,
      wallThickness: 3.2,
      bottomThickness: 3.4,
      mouthShrink: 6,
      footHeight: 18,
      rimRadius: 3,
      tiltDeg: 0,
      text: "Buddy",
      fontSize: 20,
      embossDepth: 1.1,
      ribCount: 56,
    },
  },
  {
    id: "large-dog",
    params: {
      ...DEFAULT_PARAMS,
      bodyDiameter: 220,
      height: 105,
      innerDepth: 50,
      wallThickness: 3.6,
      bottomThickness: 4,
      mouthShrink: 7,
      footHeight: 20,
      rimRadius: 3.2,
      tiltDeg: 0,
      text: "Max",
      fontSize: 22,
      embossDepth: 1.2,
      ribCount: 60,
    },
  },
];

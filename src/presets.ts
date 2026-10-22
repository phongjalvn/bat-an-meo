import { DEFAULT_PARAMS, applyInsertSize, type BowlParams } from "./geometry/types";

export interface Preset {
  id: "small-cat" | "medium-dog" | "large-dog" | "cat-care";
  params: BowlParams;
}

export const PRESETS: Preset[] = [
  {
    id: "small-cat",
    params: applyInsertSize(
      {
        ...DEFAULT_PARAMS,
        tiltDeg: 15,
        text: "Bé Mèo",
      },
      "small",
    ),
  },
  {
    id: "medium-dog",
    params: applyInsertSize(
      {
        ...DEFAULT_PARAMS,
        bodyDiameter: 204,
        height: 92,
        wallThickness: 3.2,
        bottomThickness: 3.4,
        mouthShrink: 6,
        footHeight: 18,
        rimRadius: 3,
        tiltDeg: 0,
        standHeight: 0,
        moatEnabled: false,
        text: "Buddy",
        fontSize: 20,
        embossDepth: 1.1,
        ribCount: 56,
      },
      "large",
    ),
  },
  {
    id: "large-dog",
    params: applyInsertSize(
      {
        ...DEFAULT_PARAMS,
        bodyDiameter: 230,
        height: 105,
        wallThickness: 3.6,
        bottomThickness: 4,
        mouthShrink: 7,
        footHeight: 20,
        rimRadius: 3.2,
        tiltDeg: 0,
        standHeight: 0,
        moatEnabled: false,
        text: "Max",
        fontSize: 22,
        embossDepth: 1.2,
        ribCount: 60,
      },
      "large",
    ),
  },
  {
    id: "cat-care",
    params: applyInsertSize(
      {
        ...DEFAULT_PARAMS,
        height: 76,
        tiltDeg: 15,
        standHeight: 52,
        moatEnabled: true,
        moatWidth: 16,
        moatDepth: 10,
        moatDistance: 6,
        text: "Bé Mèo",
        fontSize: 16,
      },
      "small",
    ),
  },
];

import { DEFAULT_PARAMS, applyInsertSize, defaultIcons, type BowlParams } from "./geometry/types";

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
        textStyle: "engrave",
        icons: defaultIcons(),
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
        trayDiameter: 268,
        trayHeight: 22,
        islandHeight: 24,
        wallThickness: 3.2,
        bottomThickness: 3.4,
        mouthShrink: 6,
        rimRadius: 3,
        tiltDeg: 0,
        moatEnabled: false,
        text: "Buddy",
        textLine2: "",
        fontSize: 20,
        embossDepth: 1.1,
        textStyle: "emboss",
        ribCount: 56,
        icons: [
          { id: "icon-1", enabled: true, kind: "bone", anchor: "left", sizeMm: 12, rotationDeg: 0 },
          { id: "icon-2", enabled: false, kind: "paw", anchor: "right", sizeMm: 11, rotationDeg: 0 },
        ],
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
        trayDiameter: 300,
        trayHeight: 24,
        islandHeight: 26,
        wallThickness: 3.6,
        bottomThickness: 4,
        mouthShrink: 7,
        rimRadius: 3.2,
        tiltDeg: 0,
        moatEnabled: false,
        text: "Max",
        fontSize: 22,
        embossDepth: 1.2,
        textStyle: "emboss",
        ribCount: 60,
        icons: [
          { id: "icon-1", enabled: true, kind: "dog", anchor: "left", sizeMm: 13, rotationDeg: 0 },
          { id: "icon-2", enabled: false, kind: "heart", anchor: "right", sizeMm: 11, rotationDeg: 0 },
        ],
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
        trayDiameter: 250,
        trayHeight: 20,
        islandHeight: 24,
        tiltDeg: 15,
        moatEnabled: true,
        moatWidth: 16,
        moatDepth: 10,
        moatGap: 6,
        text: "Bé Mèo",
        textLine2: "30/04/2026",
        fontSize: 16,
        textStyle: "engrave",
        icons: defaultIcons(),
      },
      "small",
    ),
  },
];

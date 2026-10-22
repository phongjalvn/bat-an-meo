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
        textLine2: "30/04/2026",
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
        height: 110,
        trayHeight: 22,
        islandHeight: 10,
        wallThickness: 3.2,
        bottomThickness: 3.2,
        mouthShrink: 9,
        rimRadius: 8,
        tiltDeg: 0,
        moatEnabled: false,
        text: "Buddy",
        textLine2: "",
        fontSize: 26,
        embossDepth: 1.1,
        textStyle: "emboss",
        ribCount: 56,
        icons: [
          { id: "icon-1", enabled: true, kind: "bone", anchor: "right", sizeMm: 13, rotationDeg: 0 },
          { id: "icon-2", enabled: false, kind: "paw", anchor: "left", sizeMm: 11, rotationDeg: 0 },
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
        height: 118,
        trayHeight: 22,
        islandHeight: 10,
        wallThickness: 3.4,
        bottomThickness: 3.4,
        mouthShrink: 9,
        rimRadius: 8,
        tiltDeg: 0,
        moatEnabled: false,
        text: "Max",
        textLine2: "",
        fontSize: 26,
        embossDepth: 1.2,
        textStyle: "emboss",
        ribCount: 60,
        icons: [
          { id: "icon-1", enabled: true, kind: "dog", anchor: "right", sizeMm: 14, rotationDeg: 0 },
          { id: "icon-2", enabled: false, kind: "heart", anchor: "left", sizeMm: 11, rotationDeg: 0 },
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
        tiltDeg: 15,
        moatEnabled: true,
        text: "Boom",
        textLine2: "30/04/2026",
        fontSize: 24,
        textStyle: "engrave",
        icons: defaultIcons(),
      },
      "small",
    ),
  },
];

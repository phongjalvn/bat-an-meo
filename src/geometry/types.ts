export type BaseTexture = "smooth" | "ribs" | "twist";

export type Locale = "vi" | "en";

export interface BowlParams {
  bodyDiameter: number;
  height: number;
  innerDepth: number;
  wallThickness: number;
  bottomThickness: number;
  mouthShrink: number;
  footHeight: number;
  rimRadius: number;
  tiltDeg: number;
  doubleBowl: boolean;
  antiSlipGroove: boolean;
  text: string;
  fontSize: number;
  embossDepth: number;
  baseTexture: BaseTexture;
  ribCount: number;
}

export const PARAM_LIMITS = {
  bodyDiameter: { min: 70, max: 260, step: 1 },
  height: { min: 40, max: 180, step: 1 },
  innerDepth: { min: 15, max: 90, step: 1 },
  wallThickness: { min: 1.6, max: 8, step: 0.1 },
  bottomThickness: { min: 1.6, max: 10, step: 0.1 },
  mouthShrink: { min: 0, max: 30, step: 0.5 },
  footHeight: { min: 6, max: 60, step: 1 },
  rimRadius: { min: 0, max: 10, step: 0.1 },
  tiltDeg: { min: 0, max: 15, step: 0.5 },
  fontSize: { min: 8, max: 36, step: 0.5 },
  embossDepth: { min: 0.4, max: 4, step: 0.1 },
  ribCount: { min: 12, max: 96, step: 1 },
} as const;

export const DEFAULT_PARAMS: BowlParams = {
  bodyDiameter: 130,
  height: 110,
  innerDepth: 48,
  wallThickness: 3,
  bottomThickness: 3,
  mouthShrink: 8,
  footHeight: 25,
  rimRadius: 3.5,
  tiltDeg: 0,
  doubleBowl: false,
  antiSlipGroove: true,
  text: "Bé Mèo",
  fontSize: 17,
  embossDepth: 1,
  baseTexture: "smooth",
  ribCount: 64,
};

export const PART_COLORS = {
  body: "#F7F1E3",
  base: "#C4A574",
  text: "#6B4423",
  insert: "#C5CCD3",
} as const;

export const FILAMENT_COLORS = [PART_COLORS.body, PART_COLORS.base, PART_COLORS.text, "#4A90A4"];

export const PLA_DENSITY = 1.24;

export interface MeshArrays {
  positions: Float32Array;
  indices: Uint32Array;
}

export interface BowlPart {
  name: "body" | "base" | "text";
  mesh: MeshArrays;
  triangleCount: number;
  volumeMm3: number;
}

export interface BowlModel {
  parts: BowlPart[];
  insert?: MeshArrays;
  width: number;
  depth: number;
  height: number;
  capacityMl: number;
  solidVolumeMm3: number;
  triangleCount: number;
  manifold: boolean;
}

export interface MaterialOption {
  id: string;
  density: number;
}

export const MATERIALS: MaterialOption[] = [
  { id: "pla", density: 1.24 },
  { id: "petg", density: 1.27 },
  { id: "abs", density: 1.04 },
];

export type BaseTexture = "smooth" | "ribs" | "twist";

export type Locale = "vi" | "en";

export type InsertSizeId = "small" | "large" | "custom";

export interface InsertPreset {
  id: Exclude<InsertSizeId, "custom">;
  lipMm: number;
  mouthMm: number;
  baseMm: number;
  heightMm: number;
  lipThicknessMm: number;
}

export const INSERT_PRESETS: Record<Exclude<InsertSizeId, "custom">, InsertPreset> = {
  small: { id: "small", lipMm: 130, mouthMm: 110, baseMm: 70, heightMm: 40, lipThicknessMm: 1.4 },
  large: { id: "large", lipMm: 190, mouthMm: 160, baseMm: 95, heightMm: 55, lipThicknessMm: 1.6 },
};

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
  standHeight: number;
  moatEnabled: boolean;
  moatWidth: number;
  moatDepth: number;
  moatDistance: number;
  insertSize: InsertSizeId;
  insertLipDiameter: number;
  insertMouthDiameter: number;
  insertBaseDiameter: number;
  insertHeight: number;
  insertClearance: number;
  insertLipThickness: number;
  doubleBowl: boolean;
  antiSlipGroove: boolean;
  text: string;
  fontSize: number;
  embossDepth: number;
  baseTexture: BaseTexture;
  ribCount: number;
}

export const PARAM_LIMITS = {
  bodyDiameter: { min: 90, max: 320, step: 1 },
  height: { min: 40, max: 180, step: 1 },
  innerDepth: { min: 15, max: 90, step: 1 },
  wallThickness: { min: 1.6, max: 8, step: 0.1 },
  bottomThickness: { min: 1.6, max: 10, step: 0.1 },
  mouthShrink: { min: 0, max: 20, step: 0.5 },
  footHeight: { min: 6, max: 60, step: 1 },
  rimRadius: { min: 0, max: 10, step: 0.1 },
  tiltDeg: { min: 0, max: 15, step: 0.5 },
  standHeight: { min: 0, max: 120, step: 1 },
  moatWidth: { min: 8, max: 40, step: 0.5 },
  moatDepth: { min: 6, max: 22, step: 0.5 },
  moatDistance: { min: 2, max: 24, step: 0.5 },
  insertLipDiameter: { min: 90, max: 240, step: 0.5 },
  insertMouthDiameter: { min: 60, max: 220, step: 0.5 },
  insertBaseDiameter: { min: 40, max: 180, step: 0.5 },
  insertHeight: { min: 20, max: 80, step: 0.5 },
  insertClearance: { min: 0.2, max: 1.2, step: 0.05 },
  fontSize: { min: 8, max: 36, step: 0.5 },
  embossDepth: { min: 0.4, max: 4, step: 0.1 },
  ribCount: { min: 12, max: 96, step: 1 },
} as const;

export const DEFAULT_PARAMS: BowlParams = {
  bodyDiameter: 150,
  height: 60,
  innerDepth: 40,
  wallThickness: 3,
  bottomThickness: 3,
  mouthShrink: 0,
  footHeight: 25,
  rimRadius: 3.5,
  tiltDeg: 0,
  standHeight: 0,
  moatEnabled: false,
  moatWidth: 16,
  moatDepth: 10,
  moatDistance: 6,
  insertSize: "small",
  insertLipDiameter: 130,
  insertMouthDiameter: 110,
  insertBaseDiameter: 70,
  insertHeight: 40,
  insertClearance: 0.4,
  insertLipThickness: 1.4,
  doubleBowl: false,
  antiSlipGroove: true,
  text: "Bé Mèo",
  fontSize: 17,
  embossDepth: 1,
  baseTexture: "ribs",
  ribCount: 64,
};

export const PART_COLORS = {
  body: "#F7F1E3",
  base: "#C4A574",
  stand: "#C4A574",
  text: "#6B4423",
  moat: "#4A90A4",
  insert: "#C5CCD3",
} as const;

export const FILAMENT_COLORS = [
  PART_COLORS.body,
  PART_COLORS.base,
  PART_COLORS.text,
  PART_COLORS.moat,
];

export const PLA_DENSITY = 1.24;

export type PartName = "body" | "base" | "stand" | "text" | "moat";

export interface MeshArrays {
  positions: Float32Array;
  indices: Uint32Array;
}

export interface BowlPart {
  name: PartName;
  mesh: MeshArrays;
  triangleCount: number;
  volumeMm3: number;
}

export interface StabilityInfo {
  comX: number;
  comY: number;
  footprintR: number;
  offsetMm: number;
  marginMm: number;
  stable: boolean;
}

export interface BowlModel {
  parts: BowlPart[];
  insert?: MeshArrays;
  width: number;
  depth: number;
  height: number;
  capacityMl: number;
  moatWaterMl: number;
  solidVolumeMm3: number;
  triangleCount: number;
  manifold: boolean;
  tiltDeg: number;
  moatEnabled: boolean;
  moatWidth: number;
  moatDepth: number;
  moatDistance: number;
  insertRimMm: number;
  insertMouthMm: number;
  insertBaseMm: number;
  insertHeightMm: number;
  stability: StabilityInfo;
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

export function minHolderDiameter(
  params: Pick<BowlParams, "insertLipDiameter" | "insertClearance" | "wallThickness">,
): number {
  return params.insertLipDiameter + 2 * params.wallThickness + 2 * params.insertClearance;
}

export function applyInsertSize(params: BowlParams, size: InsertSizeId): BowlParams {
  const next = { ...params, insertSize: size };
  if (size !== "custom") {
    const preset = INSERT_PRESETS[size];
    next.insertLipDiameter = preset.lipMm;
    next.insertMouthDiameter = preset.mouthMm;
    next.insertBaseDiameter = preset.baseMm;
    next.insertHeight = preset.heightMm;
    next.insertLipThickness = preset.lipThicknessMm;
  }
  next.innerDepth = next.insertHeight;
  next.bodyDiameter = Math.max(next.bodyDiameter, minHolderDiameter(next));
  const tiltRad = (Math.max(0, next.tiltDeg) * Math.PI) / 180;
  const lipZ = next.insertHeight + next.insertLipThickness;
  const lipR = next.insertLipDiameter / 2 + next.insertClearance;
  const minH = Math.ceil((lipZ + 0.8) * Math.cos(tiltRad) + next.bottomThickness + lipR * Math.sin(tiltRad) + 2);
  next.height = Math.max(next.height, minH);
  return next;
}

type LegacyInsert = Omit<Partial<BowlParams>, "insertSize"> & {
  insertSize?: string;
  insertDiameter?: number;
  insertDepth?: number;
  insertLipWidth?: number;
};

export function normalizeParams(raw: LegacyInsert | undefined): BowlParams {
  const incoming: LegacyInsert = { ...raw };
  if (incoming.insertSize === "14" || incoming.insertSize === "11") incoming.insertSize = "small";
  if (incoming.insertSize === "16") incoming.insertSize = "large";
  if (incoming.insertLipDiameter == null && incoming.insertDiameter != null) {
    incoming.insertLipDiameter = incoming.insertDiameter;
    incoming.insertHeight = incoming.insertDepth ?? incoming.insertHeight;
    const lipW = incoming.insertLipWidth ?? 10;
    incoming.insertMouthDiameter = incoming.insertMouthDiameter ?? incoming.insertDiameter - 2 * lipW;
    incoming.insertBaseDiameter = incoming.insertBaseDiameter ?? (incoming.insertMouthDiameter ?? 110) * 0.64;
  }
  const merged = { ...DEFAULT_PARAMS, ...incoming };
  const size: InsertSizeId = merged.insertSize === "small" || merged.insertSize === "large" ? merged.insertSize : "custom";
  return applyInsertSize({ ...merged, insertSize: size }, size);
}

export function extruderOf(name: PartName): number {
  if (name === "body") return 1;
  if (name === "base" || name === "stand") return 2;
  if (name === "text") return 3;
  return 4;
}

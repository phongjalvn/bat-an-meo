export type BaseTexture = "smooth" | "ribs" | "twist";

export type Locale = "vi" | "en";

export type InsertSizeId = "small" | "large" | "custom";

export type TextStyle = "engrave" | "emboss";

export type IconKind = "paw" | "cat" | "dog" | "heart" | "fish" | "bone" | "star" | "custom";

export type IconAnchor = "left" | "right" | "above";

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

export interface IconSlot {
  id: string;
  enabled: boolean;
  kind: IconKind;
  anchor: IconAnchor;
  sizeMm: number;
  rotationDeg: number;
  customName?: string;
  customPolygons?: Array<Array<[number, number]>>;
  featureWarning?: boolean;
}

export function defaultIcons(): IconSlot[] {
  return [
    { id: "icon-1", enabled: true, kind: "paw", anchor: "right", sizeMm: 13, rotationDeg: 0 },
    { id: "icon-2", enabled: false, kind: "heart", anchor: "left", sizeMm: 11, rotationDeg: 0 },
  ];
}

export function cloneIcons(icons: IconSlot[] | undefined): IconSlot[] {
  if (!icons?.length) return defaultIcons();
  return icons.map((icon) => ({
    ...icon,
    customPolygons: icon.customPolygons?.map((poly) => poly.map(([x, y]) => [x, y] as [number, number])),
  }));
}

export interface BowlParams {
  /** Use the clean upright parametric design; legacy lathe mode remains optional. */
  referenceShape: boolean;
  /** Maximum body diameter at the lower edge in the upright design. */
  bodyDiameter: number;
  /** When true, top, flare, height, tray, and deck follow the insert lip. */
  linkBodyToInsert: boolean;
  /** Kept so older projects still load. Sizing no longer uses this margin. */
  rimMargin: number;
  height: number;
  innerDepth: number;
  wallThickness: number;
  bottomThickness: number;
  /** Radial reduction from the lower body to the mouth, mm. */
  mouthShrink: number;
  trayDiameter: number;
  trayHeight: number;
  /** Height of the tray deck the body foot sits on. */
  islandHeight: number;
  rimRadius: number;
  tiltDeg: number;
  moatEnabled: boolean;
  moatWidth: number;
  moatDepth: number;
  moatGap: number;
  fitClearance: number;
  insertSize: InsertSizeId;
  insertLipDiameter: number;
  insertMouthDiameter: number;
  insertBaseDiameter: number;
  insertHeight: number;
  insertClearance: number;
  insertLipThickness: number;
  antiSlipGroove: boolean;
  /** Oval window through the front wall, near the foot. */
  windowEnabled: boolean;
  text: string;
  textLine2: string;
  fontSize: number;
  embossDepth: number;
  textStyle: TextStyle;
  icons: IconSlot[];
  baseTexture: BaseTexture;
  ribCount: number;
}

export const PARAM_LIMITS = {
  bodyDiameter: { min: 90, max: 380, step: 1 },
  rimMargin: { min: 6, max: 16, step: 0.5 },
  height: { min: 40, max: 220, step: 0.5 },
  innerDepth: { min: 15, max: 90, step: 1 },
  wallThickness: { min: 1.6, max: 8, step: 0.1 },
  bottomThickness: { min: 1.6, max: 10, step: 0.1 },
  mouthShrink: { min: 0, max: 40, step: 0.5 },
  trayDiameter: { min: 110, max: 420, step: 1 },
  trayHeight: { min: 16, max: 130, step: 0.5 },
  islandHeight: { min: 8, max: 90, step: 0.5 },
  rimRadius: { min: 0, max: 10, step: 0.1 },
  tiltDeg: { min: 0, max: 15, step: 0.5 },
  moatWidth: { min: 3, max: 20, step: 0.5 },
  moatDepth: { min: 6, max: 22, step: 0.5 },
  moatGap: { min: 1, max: 24, step: 0.5 },
  fitClearance: { min: 0.2, max: 1.2, step: 0.05 },
  insertLipDiameter: { min: 90, max: 260, step: 0.5 },
  insertMouthDiameter: { min: 60, max: 220, step: 0.5 },
  insertBaseDiameter: { min: 40, max: 180, step: 0.5 },
  insertHeight: { min: 20, max: 80, step: 0.5 },
  insertClearance: { min: 0.2, max: 1.2, step: 0.05 },
  fontSize: { min: 8, max: 36, step: 0.5 },
  embossDepth: { min: 0.4, max: 4, step: 0.1 },
  ribCount: { min: 12, max: 96, step: 1 },
} as const;

export const DEFAULT_PARAMS: BowlParams = {
  referenceShape: true,
  bodyDiameter: 190,
  linkBodyToInsert: true,
  rimMargin: 10,
  height: 102.9,
  innerDepth: 40,
  wallThickness: 3,
  bottomThickness: 2.4,
  mouthShrink: 11,
  trayDiameter: 190,
  trayHeight: 60,
  islandHeight: 25.7,
  rimRadius: 2.2,
  tiltDeg: 15,
  moatEnabled: true,
  moatWidth: 14,
  moatDepth: 10,
  moatGap: 2,
  fitClearance: 0.45,
  insertSize: "small",
  insertLipDiameter: 130,
  insertMouthDiameter: 110,
  insertBaseDiameter: 70,
  insertHeight: 40,
  insertClearance: 0.4,
  insertLipThickness: 1.4,
  antiSlipGroove: true,
  windowEnabled: true,
  text: "Boom",
  textLine2: "30/04/2026",
  fontSize: 26,
  embossDepth: 1.1,
  textStyle: "engrave",
  icons: defaultIcons(),
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

export type PartName = "body" | "base" | "text";

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
  moatGap: number;
  trayDiameter: number;
  trayHeight: number;
  islandHeight: number;
  pegRadius: number;
  socketRadius: number;
  fitClearance: number;
  insertRimMm: number;
  insertMouthMm: number;
  insertBaseMm: number;
  insertHeightMm: number;
  iconWarnings: string[];
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

/** Reference insert lip the measured STL proportions are built on. */
export const REF_INSERT_LIP = 130;

export function refScale(lipMm: number): number {
  return Math.max(40, lipMm) / REF_INSERT_LIP;
}

function roundMm(value: number): number {
  return Math.round(value * 10) / 10;
}

function clampLimit(value: number, lim: { min: number; max: number }): number {
  return Math.min(lim.max, Math.max(lim.min, value));
}

/** Plastic lip opening. Ø146.6 on the reference body for a 130 mm insert lip. */
export function lipOpeningDiameter(lipMm: number): number {
  return roundMm(146.6 * refScale(lipMm));
}

export function minHolderDiameter(
  params: Pick<BowlParams, "insertLipDiameter" | "insertClearance" | "wallThickness">,
): number {
  return params.insertLipDiameter + 2 * params.wallThickness + 2 * params.insertClearance;
}

/** Top diameter must clear the lip opening, the wall, and a small fillet. */
export function minTopDiameter(params: Pick<BowlParams, "insertLipDiameter" | "wallThickness">): number {
  return lipOpeningDiameter(params.insertLipDiameter) + 2 * params.wallThickness + 8;
}

/** Tray outer diameter clears the foot, the wall, and a land for the moat. */
export function minTrayDiameter(
  params: Pick<BowlParams, "bodyDiameter" | "mouthShrink" | "wallThickness">,
): number {
  const foot = params.bodyDiameter - 2 * params.mouthShrink;
  return foot + 2 * Math.max(1.6, params.wallThickness) + 12;
}

export function applyInsertSize(params: BowlParams, size: InsertSizeId): BowlParams {
  const next: BowlParams = { ...params, insertSize: size, icons: cloneIcons(params.icons) };
  if (size !== "custom") {
    const preset = INSERT_PRESETS[size];
    next.insertLipDiameter = preset.lipMm;
    next.insertMouthDiameter = preset.mouthMm;
    next.insertBaseDiameter = preset.baseMm;
    next.insertHeight = preset.heightMm;
    next.insertLipThickness = preset.lipThicknessMm;
  }
  next.innerDepth = next.insertHeight;
  if (next.linkBodyToInsert !== false) {
    next.linkBodyToInsert = true;
    const s = refScale(next.insertLipDiameter);
    next.bodyDiameter = clampLimit(roundMm(190 * s), PARAM_LIMITS.bodyDiameter);
    next.mouthShrink = clampLimit(roundMm(11 * s), PARAM_LIMITS.mouthShrink);
    next.height = clampLimit(roundMm(102.9 * s), PARAM_LIMITS.height);
    next.trayDiameter = clampLimit(roundMm(190 * s), PARAM_LIMITS.trayDiameter);
    next.trayHeight = clampLimit(roundMm(60 * s), PARAM_LIMITS.trayHeight);
    next.islandHeight = clampLimit(roundMm(25.7 * s), PARAM_LIMITS.islandHeight);
  }
  next.bodyDiameter = clampLimit(Math.max(next.bodyDiameter, minTopDiameter(next)), PARAM_LIMITS.bodyDiameter);
  next.trayDiameter = clampLimit(Math.max(next.trayDiameter, minTrayDiameter(next)), PARAM_LIMITS.trayDiameter);
  return next;
}

type LegacyInsert = Omit<Partial<BowlParams>, "insertSize" | "icons"> & {
  insertSize?: string;
  insertDiameter?: number;
  insertDepth?: number;
  insertLipWidth?: number;
  linkBodyToInsert?: boolean;
  rimMargin?: number;
  doubleBowl?: boolean;
  moatDistance?: number;
  standHeight?: number;
  footHeight?: number;
  icons?: IconSlot[];
};

export function normalizeParams(raw: LegacyInsert | undefined): BowlParams {
  const incoming: LegacyInsert = { ...raw };
  // Saved projects may still carry a double-bowl flag; single-bowl only.
  delete incoming.doubleBowl;
  if (incoming.insertSize === "14" || incoming.insertSize === "11") incoming.insertSize = "small";
  if (incoming.insertSize === "16") incoming.insertSize = "large";
  if (incoming.insertLipDiameter == null && incoming.insertDiameter != null) {
    incoming.insertLipDiameter = incoming.insertDiameter;
    incoming.insertHeight = incoming.insertDepth ?? incoming.insertHeight;
    const lipW = incoming.insertLipWidth ?? 10;
    incoming.insertMouthDiameter = incoming.insertMouthDiameter ?? incoming.insertDiameter - 2 * lipW;
    incoming.insertBaseDiameter = incoming.insertBaseDiameter ?? (incoming.insertMouthDiameter ?? 110) * 0.64;
  }
  if (incoming.moatGap == null && incoming.moatDistance != null) incoming.moatGap = incoming.moatDistance;
  if (incoming.trayHeight == null && incoming.footHeight != null) {
    incoming.trayHeight = Math.min(PARAM_LIMITS.trayHeight.max, Math.max(PARAM_LIMITS.trayHeight.min, incoming.footHeight));
  }
  if (incoming.islandHeight == null && incoming.standHeight != null) {
    incoming.islandHeight = Math.min(
      PARAM_LIMITS.islandHeight.max,
      Math.max(PARAM_LIMITS.islandHeight.min, incoming.standHeight > 0 ? incoming.standHeight : DEFAULT_PARAMS.islandHeight),
    );
  }
  const size: InsertSizeId =
    incoming.insertSize === "small" || incoming.insertSize === "large" || incoming.insertSize === "custom"
      ? incoming.insertSize
      : DEFAULT_PARAMS.insertSize;
  const merged: BowlParams = {
    ...DEFAULT_PARAMS,
    referenceShape: incoming.referenceShape ?? true,
    bodyDiameter: incoming.bodyDiameter ?? DEFAULT_PARAMS.bodyDiameter,
    linkBodyToInsert: incoming.linkBodyToInsert ?? true,
    rimMargin: incoming.rimMargin ?? DEFAULT_PARAMS.rimMargin,
    height: incoming.height ?? DEFAULT_PARAMS.height,
    innerDepth: incoming.innerDepth ?? DEFAULT_PARAMS.innerDepth,
    wallThickness: incoming.wallThickness ?? DEFAULT_PARAMS.wallThickness,
    bottomThickness: incoming.bottomThickness ?? DEFAULT_PARAMS.bottomThickness,
    mouthShrink: incoming.mouthShrink ?? DEFAULT_PARAMS.mouthShrink,
    trayDiameter: incoming.trayDiameter ?? DEFAULT_PARAMS.trayDiameter,
    trayHeight: incoming.trayHeight ?? DEFAULT_PARAMS.trayHeight,
    islandHeight: incoming.islandHeight ?? DEFAULT_PARAMS.islandHeight,
    rimRadius: incoming.rimRadius ?? DEFAULT_PARAMS.rimRadius,
    tiltDeg: incoming.tiltDeg ?? DEFAULT_PARAMS.tiltDeg,
    moatEnabled: incoming.moatEnabled ?? DEFAULT_PARAMS.moatEnabled,
    moatWidth: incoming.moatWidth ?? DEFAULT_PARAMS.moatWidth,
    moatDepth: incoming.moatDepth ?? DEFAULT_PARAMS.moatDepth,
    moatGap: incoming.moatGap ?? DEFAULT_PARAMS.moatGap,
    fitClearance: incoming.fitClearance ?? DEFAULT_PARAMS.fitClearance,
    insertSize: size,
    insertLipDiameter: incoming.insertLipDiameter ?? DEFAULT_PARAMS.insertLipDiameter,
    insertMouthDiameter: incoming.insertMouthDiameter ?? DEFAULT_PARAMS.insertMouthDiameter,
    insertBaseDiameter: incoming.insertBaseDiameter ?? DEFAULT_PARAMS.insertBaseDiameter,
    insertHeight: incoming.insertHeight ?? DEFAULT_PARAMS.insertHeight,
    insertClearance: incoming.insertClearance ?? DEFAULT_PARAMS.insertClearance,
    insertLipThickness: incoming.insertLipThickness ?? DEFAULT_PARAMS.insertLipThickness,
    antiSlipGroove: incoming.antiSlipGroove ?? DEFAULT_PARAMS.antiSlipGroove,
    windowEnabled: incoming.windowEnabled ?? DEFAULT_PARAMS.windowEnabled,
    text: incoming.text ?? DEFAULT_PARAMS.text,
    textLine2: incoming.textLine2 ?? "",
    fontSize: incoming.fontSize ?? DEFAULT_PARAMS.fontSize,
    embossDepth: incoming.embossDepth ?? DEFAULT_PARAMS.embossDepth,
    textStyle: incoming.textStyle === "emboss" ? "emboss" : incoming.textStyle === "engrave" ? "engrave" : DEFAULT_PARAMS.textStyle,
    icons: cloneIcons(incoming.icons ?? DEFAULT_PARAMS.icons),
    baseTexture: incoming.baseTexture ?? DEFAULT_PARAMS.baseTexture,
    ribCount: incoming.ribCount ?? DEFAULT_PARAMS.ribCount,
  };
  return applyInsertSize(merged, size);
}

export function extruderOf(name: PartName): number {
  if (name === "body") return 1;
  if (name === "base") return 2;
  return 3;
}

import Module from "manifold-3d";
import type { Manifold } from "manifold-3d";
import type { BowlModel, BowlParams, BowlPart, MeshArrays, StabilityInfo } from "./types";
import { DEFAULT_PARAMS, minHolderDiameter } from "./types";
import { fontPolygons } from "./text";
import type { Font } from "opentype.js";

type Wasm = Awaited<ReturnType<typeof Module>>;

let wasm: Wasm | null = null;

export async function initEngine(): Promise<Wasm> {
  if (wasm) return wasm;
  const instance = await Module();
  instance.setup();
  wasm = instance;
  return instance;
}

export function getEngine(): Wasm {
  if (!wasm) {
    throw new Error("Manifold engine is not initialized. Call initEngine() first.");
  }
  return wasm;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function resolvedDims(params: BowlParams) {
  const wall = clamp(params.wallThickness, 1.4, 12);
  const bottom = clamp(params.bottomThickness, 1.4, 14);
  const foot = clamp(params.footHeight, 4, 80);
  const stand = clamp(params.standHeight, 0, 120);
  const footTotal = foot + stand;
  const tilt = clamp(params.tiltDeg, 0, 15);
  const tiltRad = (tilt * Math.PI) / 180;
  const rim = clamp(params.rimRadius, 0, 10);
  const clearance = clamp(params.insertClearance, 0.15, 1.6);
  const steel = 0.7;
  const lipT = clamp(params.insertLipThickness, 0.8, 2.6);
  const insertRim = clamp(params.insertLipDiameter, 90, 240);
  const mouthInner = clamp(params.insertMouthDiameter, 50, insertRim - 6);
  const baseD = clamp(params.insertBaseDiameter, 30, mouthInner - 4);
  const insertHeight = clamp(params.insertHeight || params.innerDepth, 18, 90);
  const mouthOuterR = mouthInner / 2 + steel;
  const baseR = baseD / 2;
  const lipR = insertRim / 2;
  const bodyRMin = minHolderDiameter({
    insertLipDiameter: insertRim,
    insertClearance: clearance,
    wallThickness: wall,
  }) / 2;
  const extraWiden = Math.tan(tiltRad) * (footTotal + 40) * 0.25 + stand * 0.08;
  const rx = Math.max(bodyRMin, clamp(params.bodyDiameter, 90, 320) / 2, bodyRMin + extraWiden * 0.35);
  const bodyH = clamp(params.height, 40, 180);
  const drop = rx * Math.tan(tiltRad);
  const zFootTop = footTotal;
  const zRimCenter = zFootTop + bodyH;
  const pocketMouthR = mouthOuterR + clearance;
  const pocketBaseR = baseR + clearance;
  const pocketLipR = lipR + clearance;
  const insertDepth = insertHeight;
  const openingR = pocketMouthR;
  const pocketR = pocketMouthR;
  const bottomR = baseR;
  const footR = rx;
  const moatWidth = clamp(params.moatWidth, 8, 40);
  const moatDepth = clamp(params.moatDepth, 6, 22);
  const moatDistance = clamp(params.moatDistance, 2, 24);
  const moatFloor = 1.6;
  return {
    wall,
    bottom,
    foot,
    stand,
    footTotal,
    tilt,
    tiltRad,
    rim,
    clearance,
    steel,
    lipT,
    insertRim,
    mouthInner,
    mouthOuterR,
    baseR,
    lipR,
    insertHeight,
    insertDepth,
    pocketMouthR,
    pocketBaseR,
    pocketLipR,
    rx,
    bodyH,
    drop,
    zFootTop,
    zRimCenter,
    openingR,
    pocketR,
    bottomR,
    footR,
    moatWidth,
    moatDepth,
    moatDistance,
    moatFloor,
  };
}

type Dims = ReturnType<typeof resolvedDims>;

function closeProfile(pts: Array<[number, number]>): Array<[number, number]> {
  const cleaned: Array<[number, number]> = [];
  for (const [x, y] of pts) {
    const nx = Math.max(0, x);
    const last = cleaned[cleaned.length - 1];
    if (!last || Math.hypot(nx - last[0], y - last[1]) > 0.02) cleaned.push([nx, y]);
  }
  const first = cleaned[0];
  const last = cleaned[cleaned.length - 1];
  if (first && last && Math.hypot(first[0] - last[0], first[1] - last[1]) > 0.02) {
    cleaned.push([first[0], first[1]]);
  }
  return cleaned;
}

function revolve(profile: Array<[number, number]>, segments: number): Manifold {
  const { CrossSection } = getEngine();
  const cs = new CrossSection([profile]);
  const solid = cs.revolve(segments);
  cs.delete();
  return solid;
}

function meshOf(solid: Manifold): MeshArrays {
  const mesh = solid.getMesh();
  const props = mesh.vertProperties;
  const stride = mesh.numProp;
  const positions = new Float32Array(mesh.numVert * 3);
  for (let i = 0; i < mesh.numVert; i++) {
    positions[i * 3] = props[i * stride];
    positions[i * 3 + 1] = props[i * stride + 1];
    positions[i * 3 + 2] = props[i * stride + 2];
  }
  return { positions, indices: new Uint32Array(mesh.triVerts) };
}

function partFrom(name: BowlPart["name"], solid: Manifold): BowlPart {
  const mesh = meshOf(solid);
  return { name, mesh, triangleCount: mesh.indices.length / 3, volumeMm3: Math.max(0, solid.volume()) };
}

function toothedRing(outerR: number, innerR: number, count: number): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  const n = Math.max(8, Math.round(count));
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2;
    const a1 = ((i + 0.42) / n) * Math.PI * 2;
    const a2 = ((i + 0.58) / n) * Math.PI * 2;
    pts.push([Math.cos(a0) * innerR, Math.sin(a0) * innerR]);
    pts.push([Math.cos(a0) * outerR, Math.sin(a0) * outerR]);
    pts.push([Math.cos(a1) * outerR, Math.sin(a1) * outerR]);
    pts.push([Math.cos(a2) * innerR, Math.sin(a2) * innerR]);
  }
  pts.push(pts[0]);
  return pts;
}

function taperPoints(baseR: number, mouthR: number, y0: number, y1: number, steps: number): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    pts.push([baseR + (mouthR - baseR) * t, y0 + (y1 - y0) * t]);
  }
  return pts;
}

function pocketTaperProfile(p: Dims, extraDepth: number): Array<[number, number]> {
  const y0 = -extraDepth;
  const y1 = p.insertHeight;
  const pts: Array<[number, number]> = [[0, y0]];
  pts.push(...taperPoints(p.pocketBaseR, p.pocketMouthR, y0, y1, 10));
  pts.push([p.pocketMouthR, y1 + 0.4]);
  pts.push([0, y1 + 0.4]);
  return closeProfile(pts);
}

function insertShellProfile(p: Dims): Array<[number, number]> {
  const steel = p.steel;
  const depth = p.insertHeight;
  const innerBase = Math.max(6, p.baseR - steel);
  const innerMouth = p.mouthInner / 2;
  const outerBase = p.baseR;
  const outerMouth = p.mouthOuterR;
  const rimR = p.lipR;
  const pts: Array<[number, number]> = [];
  pts.push([innerBase, steel]);
  pts.push(...taperPoints(innerBase, innerMouth, steel, depth, 10));
  pts.push([innerMouth, depth + p.lipT - 0.12]);
  pts.push([rimR - 0.35, depth + p.lipT]);
  pts.push([rimR, depth + p.lipT]);
  pts.push([rimR, depth]);
  pts.push([outerMouth, depth]);
  const outer = taperPoints(outerBase, outerMouth, 0, depth, 10);
  for (let i = outer.length - 1; i >= 0; i--) pts.push(outer[i]);
  pts.push([innerBase, steel]);
  return closeProfile(pts);
}

function slantAbove(p: Dims): Manifold {
  const { Manifold } = getEngine();
  const big = 400;
  let cutter = Manifold.cube([big, big, big], false).translate(-big / 2, -big / 2, 0);
  cutter = cutter.rotate(p.tilt, 0, 0).translate(0, 0, p.zRimCenter);
  return cutter;
}

function placeOnRim(solid: Manifold, p: Dims, lipZ: number): Manifold {
  return solid.translate(0, 0, -lipZ).rotate(p.tilt, 0, 0).translate(0, 0, p.zRimCenter);
}

function buildBody(p: Dims): Manifold {
  const extra = p.drop + 6;
  const profile: Array<[number, number]> = [
    [0, p.zFootTop],
    [p.rx, p.zFootTop],
    [p.rx, p.zRimCenter + extra],
  ];
  if (p.rim > 0.4) {
    profile.push([p.rx + 0.15, p.zRimCenter + extra]);
    profile.push([p.rx - p.rim * 0.2, p.zRimCenter + extra + p.rim * 0.35]);
  }
  profile.push([0, p.zRimCenter + extra + p.rim]);
  let body = revolve(closeProfile(profile), 80);
  const cutter = slantAbove(p);
  const trimmed = body.subtract(cutter);
  body.delete();
  cutter.delete();
  body = trimmed;

  const lipZ = p.insertHeight + p.lipT;
  let taper = revolve(pocketTaperProfile(p, 0.8), 64);
  const { Manifold } = getEngine();
  let bore = Manifold.cylinder(p.lipT + 5, p.pocketLipR, p.pocketLipR, 64).translate(0, 0, p.insertHeight);
  const pocket = taper.add(bore);
  taper.delete();
  bore.delete();
  const placed = placeOnRim(pocket, p, lipZ);
  pocket.delete();
  const hollow = body.subtract(placed);
  body.delete();
  placed.delete();
  return hollow;
}

function buildInsert(p: Dims): Manifold {
  let insert = revolve(insertShellProfile(p), 64);
  insert = placeOnRim(insert, p, p.insertHeight + p.lipT);
  return insert;
}

function buildStand(params: BowlParams, p: Dims): Manifold {
  const { Manifold, CrossSection } = getEngine();
  const h = p.footTotal;
  const topR = p.footR;
  const flare = Math.min(h * 0.42, Math.tan(p.tiltRad) * (h + p.bodyH) * 0.55 + p.stand * 0.1 + (p.tilt > 0 ? 6 : 0));
  const botR = topR + flare;
  const groove = params.antiSlipGroove;
  const pts: Array<[number, number]> = [[0, 0]];
  if (groove) {
    pts.push([botR - 3.6, 0]);
    pts.push([botR - 3.6, 1.2]);
    pts.push([botR - 1.6, 1.2]);
    pts.push([botR - 1.6, 2.6]);
    pts.push([botR, 2.6]);
  } else {
    pts.push([botR, 0]);
  }
  pts.push([botR, Math.min(4, h * 0.2)]);
  pts.push([topR, h]);
  pts.push([Math.max(8, topR * 0.72), h]);
  pts.push([Math.max(8, topR * 0.72), h - 2.2]);
  pts.push([0, h - 2.2]);
  let stand = revolve(closeProfile(pts), 72);

  if (params.baseTexture !== "smooth") {
    const ribDepth = 1.2;
    const ring = toothedRing(botR + 0.2, Math.max(6, topR - ribDepth), params.ribCount);
    const cs = new CrossSection([ring]);
    const twist = params.baseTexture === "twist" ? 26 : 0;
    const divisions = params.baseTexture === "twist" ? 12 : 0;
    const scaleTop = topR / botR;
    const ribs = cs.extrude(h, divisions, twist, [scaleTop, scaleTop]);
    cs.delete();
    const combined = stand.add(ribs);
    stand.delete();
    ribs.delete();
    stand = combined;
    const cap = Manifold.cylinder(1.3, topR - 0.4, topR - 0.4, 64).translate(0, 0, h - 1.3);
    const withCap = stand.add(cap);
    stand.delete();
    cap.delete();
    stand = withCap;
  }
  return stand;
}

function buildMoat(p: Dims): Manifold {
  const wall = Math.max(2.2, p.wall);
  const innerWater = p.footR + p.moatDistance;
  const outerWater = innerWater + p.moatWidth;
  const floor = Math.max(1.2, p.moatFloor);
  const free = 1.2;
  const inner = innerWater - wall;
  const outer = outerWater + wall;
  const top = floor + p.moatDepth + free;
  const profile: Array<[number, number]> = [
    [inner, 0],
    [outer, 0],
    [outer, top],
    [outerWater, top],
    [outerWater, floor],
    [innerWater, floor],
    [innerWater, floor + p.moatDepth + 0.8],
    [inner, floor + p.moatDepth + 0.8],
  ];
  return revolve(closeProfile(profile), 72);
}

function buildText(params: BowlParams, p: Dims, font: Font | null): Manifold | null {
  if (!font || !params.text.trim() || params.embossDepth <= 0) return null;
  const polygons = fontPolygons(font, params.text.trim(), params.fontSize);
  if (!polygons.length) return null;
  const { CrossSection } = getEngine();
  const cs = new CrossSection(polygons);
  if (cs.isEmpty()) {
    cs.delete();
    return null;
  }
  const bounds = cs.bounds();
  const cx = (bounds.min[0] + bounds.max[0]) / 2;
  const cy = (bounds.min[1] + bounds.max[1]) / 2;
  let solid = cs.extrude(params.embossDepth + 0.55);
  cs.delete();
  const textZ = p.zFootTop + p.bodyH * 0.42;
  solid = solid.translate(-cx, -cy, 0).rotate(90, 0, 0).translate(0, -(p.rx - 0.3), textZ);
  return solid;
}

function duplicateAlongX(solid: Manifold, offset: number): Manifold {
  const left = solid.translate(-offset, 0, 0);
  const right = solid.translate(offset, 0, 0);
  const both = left.add(right);
  left.delete();
  right.delete();
  return both;
}

function meshCentroid(mesh: MeshArrays): [number, number, number] {
  let x = 0;
  let y = 0;
  let z = 0;
  const n = mesh.positions.length / 3;
  if (!n) return [0, 0, 0];
  for (let i = 0; i < mesh.positions.length; i += 3) {
    x += mesh.positions[i];
    y += mesh.positions[i + 1];
    z += mesh.positions[i + 2];
  }
  return [x / n, y / n, z / n];
}

function stabilityOf(parts: BowlPart[], footprintR: number): StabilityInfo {
  let w = 0;
  let x = 0;
  let y = 0;
  for (const part of parts) {
    const c = meshCentroid(part.mesh);
    x += c[0] * part.volumeMm3;
    y += c[1] * part.volumeMm3;
    w += part.volumeMm3;
  }
  const comX = w ? x / w : 0;
  const comY = w ? y / w : 0;
  const offset = Math.hypot(comX, comY);
  const margin = footprintR - offset;
  return { comX, comY, footprintR, offsetMm: offset, marginMm: margin, stable: margin > 4 };
}

export async function buildBowl(params: BowlParams = DEFAULT_PARAMS, font: Font | null = null): Promise<BowlModel> {
  await initEngine();
  const p = resolvedDims(params);

  let body = buildBody(p);
  let stand = buildStand(params, p);
  let text = buildText(params, p, font);
  let insert = buildInsert(p);
  let moat: Manifold | null = params.moatEnabled ? buildMoat(p) : null;

  if (params.doubleBowl) {
    const offset = Math.max(p.rx, (moat ? p.footR + p.moatDistance + p.moatWidth + 8 : p.rx)) + 10;
    const pair = (solid: Manifold) => {
      const next = duplicateAlongX(solid, offset);
      solid.delete();
      return next;
    };
    body = pair(body);
    stand = pair(stand);
    insert = pair(insert);
    if (text) text = pair(text);
    if (moat) moat = pair(moat);
    const { Manifold } = getEngine();
    const bar = Manifold.cube([offset * 2, 16, Math.min(8, p.footTotal)], true).translate(0, 0, 3);
    const bridged = stand.add(bar);
    stand.delete();
    bar.delete();
    stand = bridged;
  }

  const capR = p.mouthInner / 2;
  const capR0 = Math.max(6, p.baseR - p.steel);
  const insertCap = (Math.PI * p.insertHeight * (capR * capR + capR * capR0 + capR0 * capR0)) / 3;
  const water = params.moatEnabled
    ? Math.PI * (Math.pow(p.footR + p.moatDistance + p.moatWidth, 2) - Math.pow(p.footR + p.moatDistance, 2)) * p.moatDepth
    : 0;

  const parts: BowlPart[] = [partFrom("body", body), partFrom("base", stand)];
  if (text && !text.isEmpty()) parts.push(partFrom("text", text));
  if (moat && !moat.isEmpty()) parts.push(partFrom("moat", moat));

  const insertMesh = meshOf(insert);
  const solids = [body, stand, text, moat].filter((s): s is Manifold => !!s);
  const boxes = solids.map((s) => s.boundingBox());
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const b of boxes) {
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], b.min[i]);
      max[i] = Math.max(max[i], b.max[i]);
    }
  }

  const footprintR = params.moatEnabled
    ? p.footR + p.moatDistance + p.moatWidth + p.wall
    : p.footR + Math.min(p.footTotal * 0.42, Math.tan(p.tiltRad) * (p.footTotal + p.bodyH) * 0.55 + p.stand * 0.1 + (p.tilt > 0 ? 6 : 0));
  const stability = stabilityOf(parts, footprintR);
  const manifold =
    parts.every((part) => part.triangleCount > 0 && part.volumeMm3 > 0) &&
    body.status() === "NoError" &&
    stand.status() === "NoError";

  const model: BowlModel = {
    parts,
    insert: insertMesh,
    width: max[0] - min[0],
    depth: max[1] - min[1],
    height: max[2] - min[2],
    capacityMl: (insertCap / 1000) * (params.doubleBowl ? 2 : 1),
    moatWaterMl: (water / 1000) * (params.doubleBowl ? 2 : 1),
    solidVolumeMm3: parts.reduce((sum, part) => sum + part.volumeMm3, 0),
    triangleCount: parts.reduce((sum, part) => sum + part.triangleCount, 0),
    manifold,
    tiltDeg: p.tilt,
    moatEnabled: params.moatEnabled,
    moatWidth: p.moatWidth,
    moatDepth: p.moatDepth,
    moatDistance: p.moatDistance,
    insertRimMm: p.insertRim,
    insertMouthMm: p.mouthInner,
    insertBaseMm: p.baseR * 2,
    insertHeightMm: p.insertHeight,
    stability,
  };

  body.delete();
  stand.delete();
  insert.delete();
  text?.delete();
  moat?.delete();
  return model;
}

export function estimateMassGrams(volumeMm3: number, density = 1.24): number {
  return (volumeMm3 / 1000) * density;
}

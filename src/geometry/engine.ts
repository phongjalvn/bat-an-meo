import type { Manifold } from "manifold-3d";
import type { Font } from "opentype.js";
import type { BowlModel, BowlParams, BowlPart, MeshArrays, StabilityInfo } from "./types";
import { DEFAULT_PARAMS, minHolderDiameter, minTrayDiameter } from "./types";
import { layoutDecorations } from "./text";
import { wrapPolygonsToCylinder } from "./wrap";
import { getEngine, initEngine } from "./wasm";

export { getEngine, initEngine };

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function resolvedDims(params: BowlParams) {
  const wall = clamp(params.wallThickness, 1.4, 12);
  const bottom = clamp(params.bottomThickness, 1.4, 14);
  const tilt = clamp(params.tiltDeg, 0, 15);
  const tiltRad = (tilt * Math.PI) / 180;
  const rim = clamp(params.rimRadius, 0, 10);
  const clearance = clamp(params.insertClearance, 0.15, 1.6);
  const fitClearance = clamp(params.fitClearance, 0.2, 1.4);
  const steel = 0.7;
  const lipT = clamp(params.insertLipThickness, 0.8, 2.6);
  const insertRim = clamp(params.insertLipDiameter, 90, 240);
  const mouthInner = clamp(params.insertMouthDiameter, 50, insertRim - 6);
  const baseD = clamp(params.insertBaseDiameter, 30, mouthInner - 4);
  const insertHeight = clamp(params.insertHeight || params.innerDepth, 18, 90);
  const mouthOuterR = mouthInner / 2 + steel;
  const baseR = baseD / 2;
  const lipR = insertRim / 2;
  const bodyRMin =
    minHolderDiameter({
      insertLipDiameter: insertRim,
      insertClearance: clearance,
      wallThickness: wall,
    }) / 2;
  const rx = Math.max(bodyRMin, clamp(params.bodyDiameter, 90, 320) / 2);
  const bodyH = clamp(params.height, 40, 180);
  const pocketMouthR = mouthOuterR + clearance;
  const pocketBaseR = baseR + clearance;
  const pocketLipR = lipR + clearance;
  const lipZ = insertHeight + lipT;
  const tiltSin = Math.sin(tiltRad);
  const tiltCos = Math.max(0.72, Math.cos(tiltRad));
  const extraBot = rx * Math.tan(tiltRad) + 10;
  const extraTop = rx * Math.tan(tiltRad) + 6;
  const maxStem = (bodyH - bottom - pocketLipR * tiltSin) / tiltCos;
  const extraDepth = Math.max(0.8, maxStem - lipZ);
  const floorT = Math.max(1.8, Math.min(3.2, bottom));
  const moatWidth = clamp(params.moatWidth, 8, 40);
  const moatDepth = clamp(params.moatDepth, 6, 22);
  const moatGap = clamp(params.moatGap, 1, 24);
  const pegR = clamp(rx * 0.69, 18, rx - wall - 6);
  const socketR = pegR + fitClearance;
  const islandR = clamp(rx - 8, pegR + wall + 2, rx - 2);
  const moatInner = islandR + moatGap;
  const moatOuter = params.moatEnabled ? moatInner + moatWidth : moatInner;
  const minTrayR = minTrayDiameter({
    bodyDiameter: rx * 2,
    wallThickness: wall,
    moatEnabled: params.moatEnabled,
    moatWidth,
    moatGap,
  }) / 2;
  const trayR = Math.max(clamp(params.trayDiameter, 110, 420) / 2, minTrayR, moatOuter + wall);
  const trayH = Math.max(clamp(params.trayHeight, 10, 60), floorT + (params.moatEnabled ? moatDepth : 0) + 2.4);
  const islandH = Math.max(clamp(params.islandHeight, 10, 80), floorT + (params.moatEnabled ? moatDepth : 0) + 2.2);
  const pegH = clamp(bodyH * 0.4, 16, 36);
  const zShoulder = islandH;
  const zFootTop = islandH;
  const zRimCenter = zFootTop + bodyH;
  return {
    wall,
    bottom,
    tilt,
    tiltRad,
    rim,
    clearance,
    fitClearance,
    steel,
    lipT,
    insertRim,
    mouthInner,
    mouthOuterR,
    baseR,
    lipR,
    insertHeight,
    lipZ,
    extraDepth,
    extraBot,
    extraTop,
    pocketMouthR,
    pocketBaseR,
    pocketLipR,
    rx,
    bodyH,
    zFootTop,
    zRimCenter,
    zShoulder,
    floorT,
    moatWidth,
    moatDepth,
    moatGap,
    moatInner,
    moatOuter,
    pegR,
    socketR,
    islandR,
    trayR,
    trayH,
    islandH,
    pegH,
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

function insertOuterSolidProfile(p: Dims): Array<[number, number]> {
  const depth = p.insertHeight;
  const pts: Array<[number, number]> = [[0, 0]];
  pts.push(...taperPoints(p.baseR, p.mouthOuterR, 0, depth, 10));
  pts.push([p.lipR, depth]);
  pts.push([p.lipR, depth + p.lipT]);
  pts.push([0, depth + p.lipT]);
  return closeProfile(pts);
}

function insertCavityProfile(p: Dims): Array<[number, number]> {
  const steel = p.steel;
  const depth = p.insertHeight;
  const innerBase = Math.max(6, p.baseR - steel);
  const innerMouth = p.mouthInner / 2;
  const pts: Array<[number, number]> = [[0, steel]];
  pts.push(...taperPoints(innerBase, innerMouth, steel, depth, 10));
  pts.push([innerMouth, depth + p.lipT + 1]);
  pts.push([0, depth + p.lipT + 1]);
  return closeProfile(pts);
}

function belowZeroCutter(): Manifold {
  const { Manifold } = getEngine();
  const big = 800;
  return Manifold.cube([big, big, big], false).translate(-big / 2, -big / 2, -big);
}

function buildBody(p: Dims): Manifold {
  const { Manifold } = getEngine();
  const h = p.bodyH + p.extraTop + p.extraBot;
  let body = Manifold.cylinder(h, p.rx, p.rx, 80).translate(0, 0, -p.extraBot);
  if (p.rim > 0.4) {
    const lip = Manifold.cylinder(p.rim * 0.55, p.rx + 0.15, p.rx - p.rim * 0.15, 80).translate(0, 0, p.bodyH);
    const withLip = body.add(lip);
    body.delete();
    lip.delete();
    body = withLip;
  }

  let taper = revolve(pocketTaperProfile(p, p.extraDepth), 64);
  let bore = Manifold.cylinder(p.lipT + 5, p.pocketLipR, p.pocketLipR, 64).translate(0, 0, p.insertHeight);
  const pocket = taper.add(bore);
  taper.delete();
  bore.delete();
  const placed = pocket.translate(0, 0, p.bodyH - p.lipZ);
  pocket.delete();
  const hollow = body.subtract(placed);
  body.delete();
  placed.delete();
  return hollow;
}

function applyTiltAndSeat(solid: Manifold, p: Dims): Manifold {
  const tilted = solid.rotate(p.tilt, 0, 0);
  if (tilted !== solid) solid.delete();
  const cutter = belowZeroCutter();
  const seated = tilted.subtract(cutter);
  tilted.delete();
  cutter.delete();
  return seated.translate(0, 0, p.zShoulder);
}

function cutSocket(body: Manifold, p: Dims): Manifold {
  const { Manifold } = getEngine();
  const socket = Manifold.cylinder(p.pegH + 2.8, p.socketR, p.socketR, 64).translate(0, 0, p.zShoulder - 0.4);
  const cut = body.subtract(socket);
  body.delete();
  socket.delete();
  return cut;
}

function buildInsert(p: Dims): Manifold {
  let outer = revolve(insertOuterSolidProfile(p), 64);
  const cavity = revolve(insertCavityProfile(p), 64);
  const shell = outer.subtract(cavity);
  outer.delete();
  cavity.delete();
  const atTop = shell.translate(0, 0, p.bodyH - p.lipZ);
  if (atTop !== shell) shell.delete();
  return applyTiltAndSeat(atTop, p);
}

function buildTray(params: BowlParams, p: Dims): Manifold {
  const { CrossSection } = getEngine();
  const innerWall = Math.max(p.islandR + 2, p.trayR - p.wall);
  const waterTop = p.floorT + p.moatDepth;
  const profile: Array<[number, number]> = [[0, 0]];
  if (params.antiSlipGroove) {
    profile.push([p.trayR - 5.6, 0]);
    profile.push([p.trayR - 5.6, 1.25]);
    profile.push([p.trayR - 2.3, 1.25]);
    profile.push([p.trayR - 2.3, 0]);
  }
  profile.push([p.trayR, 0]);
  profile.push([p.trayR, p.trayH]);
  profile.push([innerWall, p.trayH]);
  if (params.moatEnabled && p.moatOuter > p.moatInner + 0.8) {
    profile.push([innerWall, waterTop]);
    profile.push([p.moatOuter, waterTop]);
    profile.push([p.moatOuter, p.floorT]);
    profile.push([p.moatInner, p.floorT]);
    profile.push([p.moatInner, waterTop]);
    profile.push([p.islandR, waterTop]);
  } else {
    profile.push([innerWall, p.floorT]);
    profile.push([p.islandR, p.floorT]);
  }
  profile.push([p.islandR, p.islandH]);
  profile.push([p.pegR, p.islandH]);
  profile.push([p.pegR, p.islandH + p.pegH]);
  profile.push([0, p.islandH + p.pegH]);
  let tray = revolve(closeProfile(profile), 80);

  if (params.baseTexture !== "smooth") {
    const ring = toothedRing(p.trayR + 1.1, p.trayR + 0.08, params.ribCount);
    const cs = new CrossSection([ring]);
    const twist = params.baseTexture === "twist" ? 22 : 0;
    const divisions = params.baseTexture === "twist" ? 10 : 0;
    const ribs = cs.extrude(Math.max(6, p.trayH - 1), divisions, twist);
    cs.delete();
    const combined = tray.add(ribs);
    tray.delete();
    ribs.delete();
    tray = combined;
  }
  return tray;
}

function buildDecor(
  params: BowlParams,
  p: Dims,
  font: Font | null,
): { cutter: Manifold | null; inlay: Manifold | null; warnings: string[] } {
  const layout = layoutDecorations(font, params.text, params.textLine2, params.fontSize, params.icons);
  if (!layout.polygons.length) return { cutter: null, inlay: null, warnings: layout.warnings };
  const depth = clamp(params.embossDepth, 0.4, 4);
  const zMid = p.bodyH * 0.42;
  const engrave = params.textStyle !== "emboss";
  const cutter = engrave ? wrapPolygonsToCylinder(layout.polygons, p.rx, depth + 0.45, zMid, 0.12) : null;
  const inlay = wrapPolygonsToCylinder(layout.polygons, p.rx, depth + (engrave ? 0.05 : 0.15), zMid, engrave ? 0.02 : 0.35);
  return { cutter, inlay, warnings: layout.warnings };
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
  const decor = buildDecor(params, p, font);
  if (decor.cutter) {
    try {
      const cut = body.subtract(decor.cutter);
      body.delete();
      body = cut;
    } catch {
      // Keep the body if wrap-cut fails; inlay may still print as a separate part.
    }
    decor.cutter.delete();
  }

  body = applyTiltAndSeat(body, p);
  body = cutSocket(body, p);

  let text: Manifold | null = null;
  if (decor.inlay) {
    text = applyTiltAndSeat(decor.inlay, p);
  }

  const tray = buildTray(params, p);
  const insert = buildInsert(p);

  const capR = p.mouthInner / 2;
  const capR0 = Math.max(6, p.baseR - p.steel);
  const insertCap = (Math.PI * p.insertHeight * (capR * capR + capR * capR0 + capR0 * capR0)) / 3;
  const water = params.moatEnabled
    ? Math.PI * (p.moatOuter * p.moatOuter - p.moatInner * p.moatInner) * p.moatDepth
    : 0;

  const parts: BowlPart[] = [partFrom("body", body), partFrom("base", tray)];
  if (text && !text.isEmpty()) parts.push(partFrom("text", text));

  const insertMesh = meshOf(insert);
  const solids = [body, tray, text].filter((s): s is Manifold => !!s);
  const boxes = solids.map((s) => s.boundingBox());
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const b of boxes) {
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], b.min[i]);
      max[i] = Math.max(max[i], b.max[i]);
    }
  }

  const footprintR = p.trayR;
  const stability = stabilityOf(parts, footprintR);
  const manifold =
    parts.every((part) => part.triangleCount > 0 && part.volumeMm3 > 0) &&
    body.status() === "NoError" &&
    tray.status() === "NoError";

  const model: BowlModel = {
    parts,
    insert: insertMesh,
    width: max[0] - min[0],
    depth: max[1] - min[1],
    height: max[2] - min[2],
    capacityMl: insertCap / 1000,
    moatWaterMl: water / 1000,
    solidVolumeMm3: parts.reduce((sum, part) => sum + part.volumeMm3, 0),
    triangleCount: parts.reduce((sum, part) => sum + part.triangleCount, 0),
    manifold,
    tiltDeg: p.tilt,
    moatEnabled: params.moatEnabled,
    moatWidth: p.moatWidth,
    moatDepth: p.moatDepth,
    moatGap: p.moatGap,
    trayDiameter: p.trayR * 2,
    trayHeight: p.trayH,
    islandHeight: p.islandH,
    pegRadius: p.pegR,
    socketRadius: p.socketR,
    fitClearance: p.fitClearance,
    insertRimMm: p.insertRim,
    insertMouthMm: p.mouthInner,
    insertBaseMm: p.baseR * 2,
    insertHeightMm: p.insertHeight,
    iconWarnings: decor.warnings,
    stability,
  };

  body.delete();
  tray.delete();
  insert.delete();
  text?.delete();
  return model;
}

export function estimateMassGrams(volumeMm3: number, density = 1.24): number {
  return (volumeMm3 / 1000) * density;
}

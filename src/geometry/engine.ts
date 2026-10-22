import type { Manifold } from "manifold-3d";
import type { Font } from "opentype.js";
import type { BowlModel, BowlParams, BowlPart, MeshArrays, StabilityInfo } from "./types";
import { DEFAULT_PARAMS } from "./types";
import { layoutDecorations } from "./text";
import { wrapPolygonsToCylinder } from "./wrap";
import { getEngine, initEngine } from "./wasm";
import { referenceSolid, tiltReference } from "./reference";

export { getEngine, initEngine };

const LATHE = 160;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function resolvedDims(params: BowlParams) {
  const wall = clamp(params.wallThickness, 1.4, 12);
  const bottom = clamp(params.bottomThickness, 1.4, 14);
  const tilt = clamp(params.tiltDeg, 0, 15);
  const tiltRad = (tilt * Math.PI) / 180;
  const tanTilt = Math.tan(tiltRad);
  const clearance = clamp(params.insertClearance, 0.15, 1.6);
  const fitClearance = clamp(params.fitClearance, 0.2, 1.4);
  const steel = 0.7;
  const lipT = clamp(params.insertLipThickness, 0.8, 2.6);
  const insertRim = clamp(params.insertLipDiameter, 90, 260);
  const mouthInner = clamp(params.insertMouthDiameter, 50, insertRim - 6);
  const baseD = clamp(params.insertBaseDiameter, 30, mouthInner - 4);
  const insertHeight = clamp(params.insertHeight || params.innerDepth, 18, 90);
  const mouthOuterR = mouthInner / 2 + steel;
  const baseR = baseD / 2;
  const lipR = insertRim / 2;
  const scale = insertRim / 130;
  const topR = clamp(params.bodyDiameter, 90, 380) / 2;
  const flare = clamp(params.mouthShrink, 0, topR * 0.55);
  const footR = topR - flare;
  const bodyH = clamp(params.height, 40, 220);
  const slope = (topR - footR) / Math.max(1, bodyH);
  const openTarget = (146.6 / 2) * scale;
  const openR = clamp(openTarget, 12, Math.max(14, topR - wall - 1.5));
  const filletRoom = Math.max(0, (topR - openR - 1.1) * 0.55);
  const rim = clamp(params.rimRadius, 0, Math.min(10, filletRoom));
  const lipH = clamp(Math.max(2.8 * (bodyH / 102.9), rim + 0.55), 2.2, 12);
  const flangeH = clamp(2.8 * (bodyH / 102.9), 2.2, 5);
  const innerLow = footR + slope * (flangeH + 0.5) - wall;
  const flangeR = clamp((130.4 / 2) * scale, 8, Math.max(10, Math.min(innerLow - 1, footR - wall - 1.2)));
  // Low (front) outer edge sits at the reference height. The center and the back rise with the tilt.
  const zCut = bodyH + (params.referenceShape ? 0 : topR * tanTilt);
  const sBack = tanTilt;
  const zBack = (zCut + sBack * footR) / Math.max(0.25, 1 - slope * sBack);
  const trayR = clamp(params.trayDiameter, 110, 460) / 2;
  const trayH = clamp(params.trayHeight, 16, 130);
  const deckZ = clamp(params.islandHeight, 8, Math.max(10, trayH - 8));
  const deckLift = params.referenceShape ? trayH * 36.8 / 60 + 6 * scale + fitClearance : deckZ + 0.2;
  const wallInner = trayR - (params.referenceShape ? Math.max(1.6,Math.min(2.4,wall*2/3)) : wall);
  const floorT = clamp(bottom, 2, 6);
  const moatGap = clamp(params.moatGap, 0.6, 24);
  const moatInner = params.referenceShape ? params.bodyDiameter / 2 * 0.772 + 3 * scale + moatGap : footR + fitClearance + moatGap;
  const moatLimit = wallInner - 0.85;
  const moatOuter = Math.min(moatInner + clamp(params.moatWidth, 3, 24), moatLimit);
  const moatDepth = clamp(params.moatDepth, 4, Math.max(4, deckZ - floorT - 1));
  const moatOk = params.moatEnabled && moatOuter > moatInner + 1.4 && (params.referenceShape || moatInner > footR + 0.4) && moatInner < moatLimit - 1;
  const moatWidth = moatOk ? moatOuter - moatInner : 0;
  const winScale = bodyH / 102.9;
  const winZ0 = 20 * winScale;
  const winZ1 = 36 * winScale;
  const winHalfAng = (40.3 * Math.PI) / 180;
  const frontTop = bodyH - Math.max(rim, 1) - 8;
  const wrapLocal = params.referenceShape ? bodyH * 0.42 : clamp(winZ1 + Math.max(0, frontTop - winZ1) * 0.58, winZ1 + 10, Math.max(winZ1 + 12, frontTop - 4));
  const wrapR = footR + slope * wrapLocal;
  const pegR = footR;
  const socketR = footR + fitClearance;
  return {
    wall,
    bottom,
    tilt,
    tiltRad,
    tanTilt,
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
    scale,
    topR,
    footR,
    flare,
    slope,
    bodyH,
    openR,
    lipH,
    flangeH,
    flangeR,
    zCut,
    zBack,
    trayR,
    trayH,
    deckZ,
    deckLift,
    wallInner,
    floorT,
    moatGap,
    moatInner,
    moatOuter,
    moatDepth,
    moatOk,
    moatWidth,
    winZ0,
    winZ1,
    winHalfAng,
    wrapLocal,
    wrapR,
    pegR,
    socketR,
  };
}

type Dims = ReturnType<typeof resolvedDims>;

function closeProfile(pts: Array<[number, number]>): Array<[number, number]> {
  const cleaned: Array<[number, number]> = [];
  for (const [x, y] of pts) {
    const nx = Math.max(0, x);
    const last = cleaned[cleaned.length - 1];
    if (!last || Math.hypot(nx - last[0], y - last[1]) > 0.04) cleaned.push([nx, y]);
  }
  const first = cleaned[0];
  const last = cleaned[cleaned.length - 1];
  if (first && last && Math.hypot(first[0] - last[0], first[1] - last[1]) > 0.04) {
    cleaned.push([first[0], first[1]]);
  }
  return cleaned;
}

function revolve(profile: Array<[number, number]>, segments: number): Manifold {
  const { CrossSection } = getEngine();
  let cs = new CrossSection([profile]);
  if (cs.area() < 0) {
    cs.delete();
    const reversed = profile.slice().reverse();
    cs = new CrossSection([reversed]);
  }
  const solid = cs.revolve(segments);
  cs.delete();
  return solid;
}

function meshOf(solid: Manifold): MeshArrays {
  const mesh = solid.getMesh();
  const props = mesh.vertProperties;
  const stride = mesh.numProp;
  const weld = new Map<string, number>();
  const remap = new Uint32Array(mesh.numVert);
  const raw: number[] = [];
  for (let i = 0; i < mesh.numVert; i++) {
    const x = props[i * stride];
    const y = props[i * stride + 1];
    const z = props[i * stride + 2];
    const key = `${Math.round(x * 1000000)},${Math.round(y * 1000000)},${Math.round(z * 1000000)}`;
    let id = weld.get(key);
    if (id === undefined) {
      id = raw.length / 3;
      weld.set(key, id);
      raw.push(x, y, z);
    }
    remap[i] = id;
  }
  const indices: number[] = [];
  const tri = mesh.triVerts;
  for (let i = 0; i < tri.length; i += 3) {
    const a = remap[tri[i]];
    const b = remap[tri[i + 1]];
    const c = remap[tri[i + 2]];
    if (a === b || b === c || a === c) continue;
    indices.push(a, b, c);
  }
  return { positions: Float32Array.from(raw), indices: Uint32Array.from(indices) };
}

function partFrom(name: BowlPart["name"], solid: Manifold): BowlPart {
  const mesh = meshOf(solid);
  return { name, mesh, triangleCount: mesh.indices.length / 3, volumeMm3: Math.max(0, solid.volume()) };
}

function taperPoints(baseR: number, mouthR: number, y0: number, y1: number, steps: number): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    pts.push([baseR + (mouthR - baseR) * t, y0 + (y1 - y0) * t]);
  }
  return pts;
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

function ringCyl(height: number, innerR: number, outerR: number, z0: number, segments = 120): Manifold {
  const { Manifold } = getEngine();
  const outer = Manifold.cylinder(height, outerR, outerR, segments).translate(0, 0, z0);
  const inner = Manifold.cylinder(height + 1, innerR, innerR, segments).translate(0, 0, z0 - 0.4);
  const ring = outer.subtract(inner);
  outer.delete();
  inner.delete();
  return ring;
}

/** Rotate around X so the front (−Y) side of a z=0 plane drops. */
function tiltAroundX(solid: Manifold, tiltDeg: number): Manifold {
  if (Math.abs(tiltDeg) < 0.05) return solid;
  const tilted = solid.rotate(tiltDeg, 0, 0);
  if (tilted !== solid) solid.delete();
  return tilted;
}

/** Remove everything above the plane z = zCenter + y·tan(tilt), sunk by `sink` mm. */
function cutAbovePlane(solid: Manifold, zCenter: number, tiltDeg: number, sink: number): Manifold {
  const { Manifold } = getEngine();
  const big = 900;
  let cutter = Manifold.cube([big, big, big], true).translate(0, 0, big / 2 - sink);
  cutter = tiltAroundX(cutter, tiltDeg);
  const placed = cutter.translate(0, 0, zCenter);
  if (placed !== cutter) cutter.delete();
  const cut = solid.subtract(placed);
  solid.delete();
  placed.delete();
  return cut;
}

function placeOnTiltedFace(solid: Manifold, p: Dims): Manifold {
  const tilted = tiltAroundX(solid, p.tilt);
  const moved = tilted.translate(0, 0, p.zCut);
  if (moved !== tilted) tilted.delete();
  return moved;
}

type Fillet = {
  rc: number;
  zc: number;
  angW: number;
  angF: number;
  Lw: number;
};

/** Quarter-round center in the radial plane. Tangent to the flared wall and to the tilted face. */
function filletAt(p: Dims, theta: number, f: number): Fillet | null {
  const s = Math.sin(theta) * p.tanTilt;
  const slope = p.slope;
  const Lw = Math.hypot(1, slope);
  const Lf = Math.hypot(1, s);
  const denom = 1 - slope * s;
  if (!(denom > 0.2) || !Number.isFinite(Lw)) return null;
  const rc = (p.footR - f * Lw + slope * p.zCut - slope * f * Lf) / denom;
  const zc = p.zCut - f * Lf + s * rc;
  const angW = Math.atan2(-slope, 1);
  let angF = Math.atan2(1, -s);
  if (angF < angW) angF += Math.PI * 2;
  if (!Number.isFinite(rc) || !Number.isFinite(zc)) return null;
  return { rc, zc, angW, angF, Lw };
}

function filletFits(p: Dims, f: number): boolean {
  if (f < 0.45) return false;
  for (let i = 0; i < 12; i++) {
    const fr = filletAt(p, (i / 12) * Math.PI * 2, f);
    if (!fr) return false;
    const zWall = fr.zc - (f * p.slope) / fr.Lw;
    const rFace = fr.rc + f * Math.cos(fr.angF);
    const rWall = fr.rc + f / fr.Lw;
    if (zWall < 8 || rWall < p.footR * 0.8 || rFace < p.openR + 1.1 || rFace > rWall + 0.2) return false;
  }
  return true;
}

function pushRing(dst: number[], n: number, at: (theta: number) => [number, number, number]): number {
  const base = dst.length / 3;
  for (let i = 0; i < n; i++) {
    const theta = (i / n) * Math.PI * 2;
    const [x, y, z] = at(theta);
    dst.push(x, y, z);
  }
  return base;
}

function bridgeRings(idx: number[], a: number, b: number, n: number) {
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    idx.push(a + i, a + j, b + j, a + i, b + j, b + i);
  }
}

function manifoldFromMesh(vertProperties: Float32Array, triVerts: Uint32Array): Manifold {
  const { Manifold, Mesh } = getEngine();
  let solid = new Manifold(new Mesh({ numProp: 3, vertProperties, triVerts }));
  if (solid.volume() < 0) {
    const flipped = triVerts.slice();
    for (let i = 0; i < flipped.length; i += 3) {
      const swap = flipped[i + 1];
      flipped[i + 1] = flipped[i + 2];
      flipped[i + 2] = swap;
    }
    solid.delete();
    solid = new Manifold(new Mesh({ numProp: 3, vertProperties, triVerts: flipped }));
  }
  return solid;
}

/** Solid frustum closed by a radial fillet and the tilted top face. */
function buildFilletMesh(p: Dims, f: number): Manifold | null {
  const n = LATHE;
  const nFrust = 20;
  const nArc = 14;
  const nFace = 8;
  const xyz: number[] = [];
  const rings: number[] = [];
  const wallOf = (theta: number) => {
    const fr = filletAt(p, theta, f);
    if (!fr) return null;
    return {
      fr,
      r: fr.rc + f / fr.Lw,
      z: fr.zc - (f * p.slope) / fr.Lw,
    };
  };
  if (!wallOf(0)) return null;

  rings.push(pushRing(xyz, n, (theta) => [p.footR * Math.cos(theta), p.footR * Math.sin(theta), 0]));
  for (let i = 1; i <= nFrust; i++) {
    const t = i / nFrust;
    rings.push(
      pushRing(xyz, n, (theta) => {
        const w = wallOf(theta)!;
        const z = t * w.z;
        const r = p.footR + p.slope * z;
        return [r * Math.cos(theta), r * Math.sin(theta), z];
      }),
    );
  }
  for (let k = 1; k <= nArc; k++) {
    const u = k / nArc;
    rings.push(
      pushRing(xyz, n, (theta) => {
        const fr = filletAt(p, theta, f)!;
        const ang = fr.angW + (fr.angF - fr.angW) * u;
        const r = fr.rc + f * Math.cos(ang);
        const z = fr.zc + f * Math.sin(ang);
        return [r * Math.cos(theta), r * Math.sin(theta), z];
      }),
    );
  }
  for (let k = 1; k <= nFace; k++) {
    const u = k / (nFace + 1);
    rings.push(
      pushRing(xyz, n, (theta) => {
        const fr = filletAt(p, theta, f)!;
        const rFace = fr.rc + f * Math.cos(fr.angF);
        const r = rFace * (1 - u);
        const z = p.zCut + Math.sin(theta) * p.tanTilt * r;
        return [r * Math.cos(theta), r * Math.sin(theta), z];
      }),
    );
  }
  const apex = xyz.length / 3;
  xyz.push(0, 0, p.zCut);
  const botC = xyz.length / 3;
  xyz.push(0, 0, 0);
  const idx: number[] = [];
  for (let r = 0; r < rings.length - 1; r++) bridgeRings(idx, rings[r], rings[r + 1], n);
  const top = rings[rings.length - 1];
  const bottom = rings[0];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    idx.push(apex, top + i, top + j);
    idx.push(botC, bottom + j, bottom + i);
  }
  try {
    const solid = manifoldFromMesh(new Float32Array(xyz), new Uint32Array(idx));
    if (solid.status() !== "NoError" || !(solid.volume() > 1000)) {
      solid.delete();
      return null;
    }
    return solid;
  } catch {
    return null;
  }
}

function buildSharpBody(p: Dims): Manifold {
  const zTop = p.zBack + 8;
  const steps = 28;
  const pts: Array<[number, number]> = [[0, 0], [p.footR, 0]];
  for (let i = 1; i <= steps; i++) {
    const z = (zTop * i) / steps;
    pts.push([p.footR + p.slope * z, z]);
  }
  pts.push([0, zTop]);
  const spun = revolve(closeProfile(pts), LATHE);
  return cutAbovePlane(spun, p.zCut, p.tilt, 0);
}

function cavityProfile(p: Dims): Array<[number, number]> {
  const zHi = p.zBack + p.rim + 24;
  const z1 = p.flangeH + 0.6;
  const r1 = Math.max(p.flangeR + 0.8, p.footR + p.slope * z1 - p.wall);
  const pts: Array<[number, number]> = [
    [0, -0.5],
    [p.flangeR, -0.5],
    [p.flangeR, p.flangeH],
    [r1, z1],
  ];
  const steps = 16;
  for (let i = 1; i <= steps; i++) {
    const z = z1 + ((zHi - z1) * i) / steps;
    pts.push([Math.max(4, p.footR + p.slope * z - p.wall), z]);
  }
  pts.push([0, zHi]);
  return closeProfile(pts);
}

function stadiumPolygon(halfStraight: number, radius: number, segs: number): Array<[number, number]> {
  const pts: Array<[number, number]> = [
    [-halfStraight, -radius],
    [halfStraight, -radius],
  ];
  for (let i = 1; i < segs; i++) {
    const a = -Math.PI / 2 + (Math.PI * i) / segs;
    pts.push([halfStraight + radius * Math.cos(a), radius * Math.sin(a)]);
  }
  pts.push([halfStraight, radius], [-halfStraight, radius]);
  for (let i = 1; i < segs; i++) {
    const a = Math.PI / 2 + (Math.PI * i) / segs;
    pts.push([-halfStraight + radius * Math.cos(a), radius * Math.sin(a)]);
  }
  return pts;
}

/** One horizontal pill through the front wall. The reference mesh also opens the back; this ships the single front window. */
function windowCutter(p: Dims): Manifold | null {
  const zMid = (p.winZ0 + p.winZ1) / 2;
  const slotH = Math.max(4, p.winZ1 - p.winZ0);
  const rOuter = p.footR + p.slope * zMid;
  const rMid = rOuter - p.wall / 2;
  const chord = 2 * rMid * Math.sin(p.winHalfAng);
  const capR = slotH / 2;
  const halfStraight = Math.max(0.4, (chord - slotH) / 2);
  const reach = rMid * (1 - Math.cos(p.winHalfAng)) + p.wall + 12;
  const depth = Math.max(p.wall + 18, reach * 2);
  const { CrossSection } = getEngine();
  const cs = new CrossSection([stadiumPolygon(halfStraight, capR, 18)]);
  if (cs.area() <= 0) {
    cs.delete();
    return null;
  }
  let solid = cs.extrude(depth, 1, 0, [1, 1], true);
  cs.delete();
  const turned = solid.rotate(90, 0, 0);
  if (turned !== solid) solid.delete();
  const placed = turned.translate(0, -rMid, zMid);
  if (placed !== turned) turned.delete();
  if (placed.status() !== "NoError" || placed.volume() <= 0) {
    placed.delete();
    return null;
  }
  return placed;
}

function hollowBody(outer: Manifold, p: Dims, windowOn: boolean): Manifold {
  const { Manifold } = getEngine();
  let cavity = revolve(cavityProfile(p), LATHE);
  cavity = cutAbovePlane(cavity, p.zCut - p.lipH, p.tilt, 0);
  let body = outer.subtract(cavity);
  outer.delete();
  cavity.delete();

  const z0 = p.zCut - p.lipH - p.topR * p.tanTilt - 8;
  const z1 = p.zBack + p.rim + 16;
  const hole = Manifold.cylinder(Math.max(4, z1 - z0), p.openR, p.openR, LATHE).translate(0, 0, z0);
  const opened = body.subtract(hole);
  body.delete();
  hole.delete();
  body = opened;

  if (windowOn) {
    const win = windowCutter(p);
    if (win) {
      const cut = body.subtract(win);
      body.delete();
      win.delete();
      body = cut;
    }
  }

  const placed = body.translate(0, 0, p.deckLift);
  if (placed !== body) body.delete();
  return placed;
}

function buildBody(p: Dims, windowOn: boolean): Manifold {
  let f = p.rim;
  while (f >= 0.45 && !filletFits(p, f)) f *= 0.72;
  if (filletFits(p, f)) {
    const meshed = buildFilletMesh(p, f);
    if (meshed) return hollowBody(meshed, p, windowOn);
  }
  return hollowBody(buildSharpBody(p), p, windowOn);
}

function buildInsert(p: Dims): Manifold {
  let outer = revolve(insertOuterSolidProfile(p), 128);
  const cavity = revolve(insertCavityProfile(p), 128);
  const shell = outer.subtract(cavity);
  outer.delete();
  cavity.delete();
  const atRim = shell.translate(0, 0, -p.insertHeight);
  if (atRim !== shell) shell.delete();
  const onFace = placeOnTiltedFace(atRim, p);
  const world = onFace.translate(0, 0, p.deckLift);
  if (world !== onFace) onFace.delete();
  return world;
}

function pushOut(pts: Array<[number, number]>, x: number, y: number) {
  const last = pts[pts.length - 1];
  const nx = Math.max(x, last[0] + 0.15);
  if (Math.hypot(nx - last[0], y - last[1]) < 0.08) return;
  pts.push([nx, y]);
}

function trayProfile(p: Dims): Array<[number, number]> {
  const sR = p.trayR / 95;
  const sZ = p.deckZ / 25.71;
  const dome: Array<[number, number]> = (
    [
      [49.5, 0],
      [54, 0.5],
      [58.5, 1.3],
      [63, 3],
      [66.5, 5.6],
      [71, 9.2],
      [74.5, 14.5],
      [77, 23.2],
    ] as Array<[number, number]>
  ).map(([r, z]) => [r * sR, z * sZ]);
  const pts: Array<[number, number]> = [
    [0, 0],
    [dome[0][0], 0],
  ];
  for (const q of dome) pts.push(q);
  const shoulderR = dome[dome.length - 1][0];
  const shoulderZ = dome[dome.length - 1][1];
  const wallBot = Math.min(shoulderZ, 23.1 * sZ);
  const lip = Math.min(1.05, p.wall * 0.32);
  if (p.moatOk) {
    const under = Math.max(0.6, p.deckZ - p.moatDepth - p.floorT);
    const x0 = Math.max(shoulderR + 0.3, Math.min(p.moatInner - 0.15, p.wallInner - 6));
    const x1 = Math.max(x0 + 1.8, Math.min(p.moatOuter + 0.25, p.wallInner - lip - 0.6));
    pushOut(pts, x0, shoulderZ);
    pushOut(pts, x0 + 0.7, under);
    pushOut(pts, x1, under);
    pushOut(pts, p.wallInner, Math.max(wallBot, under + 0.5));
  } else {
    pushOut(pts, p.wallInner, Math.max(wallBot, shoulderZ - 1.5));
  }
  pushOut(pts, p.trayR, wallBot);
  pushOut(pts, p.trayR, p.trayH - lip * 1.15);
  pts.push(
    [p.trayR - lip * 0.45, p.trayH - lip * 0.35],
    [p.trayR - lip, p.trayH],
    [p.wallInner + lip, p.trayH],
    [p.wallInner + lip * 0.45, p.trayH - lip * 0.35],
    [p.wallInner, p.trayH - lip * 1.15],
    [p.wallInner, p.deckZ],
    [0, p.deckZ],
  );
  return closeProfile(pts);
}

function buildTray(params: BowlParams, p: Dims): Manifold {
  let tray = revolve(trayProfile(p), LATHE);
  if (p.moatOk) {
    const channel = ringCyl(p.moatDepth + 0.55, p.moatInner, p.moatOuter, p.deckZ - p.moatDepth, LATHE);
    const cut = tray.subtract(channel);
    tray.delete();
    channel.delete();
    tray = cut;
  }
  const ribIn = p.footR + p.fitClearance;
  const ribOut = Math.min(ribIn + 1.35, (p.moatOk ? p.moatInner - 0.4 : p.wallInner - 1.4));
  if (ribOut > ribIn + 0.65) {
    const rib = ringCyl(1.45, ribIn, ribOut, p.deckZ - 0.04, 128);
    const withRib = tray.add(rib);
    tray.delete();
    rib.delete();
    tray = withRib;
  }
  if (params.antiSlipGroove) {
    const sR = p.trayR / 95;
    const groove = ringCyl(0.85, 16 * sR, 34 * sR, -0.2, 96);
    const grooved = tray.subtract(groove);
    tray.delete();
    groove.delete();
    tray = grooved;
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
  const zMid = p.deckLift + p.wrapLocal;
  const mouthR = Math.max(p.lipR + p.wall + 1, params.bodyDiameter / 2 - params.mouthShrink);
  const fillet = Math.min(params.rimRadius, p.wall, (mouthR-p.mouthOuterR-p.clearance)/3);
  const slope = params.referenceShape ? (mouthR-params.bodyDiameter/2)/Math.max(1,p.bodyH-fillet) : p.slope;
  const radius = params.referenceShape ? params.bodyDiameter/2 + slope*(p.wrapLocal-fillet) : p.wrapR;
  const engrave = params.textStyle !== "emboss";
  const cutter = engrave ? wrapPolygonsToCylinder(layout.polygons, radius, depth + 0.45, zMid, depth, slope) : null;
  const inlay = wrapPolygonsToCylinder(
    layout.polygons,
    radius,
    depth + (engrave ? 0.05 : 0.15),
    zMid,
    engrave ? depth - 0.08 : 0.35,
    slope,
  );
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

  let body: Manifold;
  if (params.referenceShape) {
    const source = await referenceSolid("top", p.scale, p.bodyH, params);
    body = source.translate(0, 0, p.deckLift);
    source.delete();

  } else {
    body = buildBody(p, params.windowEnabled !== false);
  }
  const decor = buildDecor(params, p, font);
  if (decor.cutter) {
    try {
      const cut = body.subtract(decor.cutter);
      body.delete();
      body = cut;
    } catch {
      // Keep the body if wrap-cut fails; the inlay may still print as its own part.
    }
    decor.cutter.delete();
  }

  let text: Manifold | null = null;
  if (decor.inlay) text = decor.inlay;

  if (params.referenceShape) {
    body = tiltReference(body, p.bodyH, p.deckLift, p.tilt);
    if (text) text = tiltReference(text, p.bodyH, p.deckLift, p.tilt);
    if (params.windowEnabled !== false) {
      const { Manifold } = getEngine();
      // Two finger openings under the rim, on the sides, clear of the name.
      const hole = Manifold.cylinder(220 * p.scale, 7.5 * p.scale, 7.5 * p.scale, 64, true)
        .scale([1, 1.8, 1]).rotate(0, 90, 0).translate(0, 0, p.deckLift + p.bodyH * 0.77);
      const opened = body.subtract(hole);
      body.delete(); hole.delete(); body = opened;
    }
  }

  const tray = params.referenceShape ? await referenceSolid("base", p.scale, p.trayH, params) : buildTray(params, p);
  const insert = buildInsert(p);

  const capR = p.mouthInner / 2;
  const capR0 = Math.max(6, p.baseR - p.steel);
  const insertCap = (Math.PI * p.insertHeight * (capR * capR + capR * capR0 + capR0 * capR0)) / 3;
  const water = p.moatOk ? Math.PI * (p.moatOuter * p.moatOuter - p.moatInner * p.moatInner) * p.moatDepth : 0;

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
    moatEnabled: p.moatOk,
    moatWidth: p.moatWidth,
    moatDepth: p.moatDepth,
    moatGap: p.moatGap,
    trayDiameter: p.trayR * 2,
    trayHeight: p.trayH,
    islandHeight: p.deckZ,
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

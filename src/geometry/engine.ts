import type { Manifold } from "manifold-3d";
import type { Font } from "opentype.js";
import type { BowlModel, BowlParams, BowlPart, MeshArrays, StabilityInfo } from "./types";
import { DEFAULT_PARAMS, minTrayDiameter } from "./types";
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
  const margin = clamp(params.rimMargin, 4, 20);
  // bodyDiameter is the TOP diameter. Auto mode sets it to lip + 2× margin.
  const minTopD = insertRim + 2 * Math.max(4, wall + 1.2);
  const topR = Math.max(minTopD, clamp(params.bodyDiameter, 90, 340)) / 2;
  const taper = clamp(params.mouthShrink, 0, 28);
  const rx = topR + taper;
  const bodyH = clamp(params.height, 40, 180);
  // Back of a tilted face pulls the fillet farther inward than the sides.
  const filletDen = 1 + Math.sin(tiltRad);
  const filletMax = Math.max(0, (topR - (lipR + clearance) - 1.8) / filletDen);
  const rim = clamp(params.rimRadius, 0, Math.min(10, filletMax));
  // Neck, island, and peg stay in proportion to the wide base.
  const neckR = clamp(rx * 0.88, 28, rx - 6);
  const pocketMouthR = mouthOuterR + clearance;
  const pocketBaseR = baseR + clearance;
  const pocketLipR = lipR + clearance;
  const lipZ = insertHeight + lipT;
  const extraDepth = 0.8;
  const floorT = Math.max(1.8, Math.min(3.2, bottom));
  const moatWidth = clamp(params.moatWidth, 6, 40);
  const moatDepth = clamp(params.moatDepth, 6, 22);
  const moatGap = clamp(params.moatGap, 1, 24);
  const islandR = clamp(rx * 0.8, 22, neckR - 3);
  const pegR = clamp(rx * 0.68, 16, islandR - 5);
  const socketR = pegR + fitClearance;
  const socketH = 3.6;
  const pegH = 3.2;
  const minTrayR = minTrayDiameter({ bodyDiameter: topR * 2, mouthShrink: taper }) / 2;
  const trayR = Math.max(clamp(params.trayDiameter, 110, 460) / 2, minTrayR);
  const rimT = 4.5;
  const wallInner = Math.max(islandR + 3.2, trayR - rimT);
  const moatInner = islandR + moatGap;
  const moatOuter = params.moatEnabled
    ? Math.min(moatInner + moatWidth, wallInner - 0.8)
    : Math.max(moatInner, neckR + 2);
  const trayH = clamp(params.trayHeight, 18, 70);
  const islandH = Math.min(Math.max(clamp(params.islandHeight, 8, 50), floorT + 4), trayH - 6);
  const waistH = 12;
  // Neck stays narrow through the rim so the moat reads as a dark ring.
  const neckH = Math.max(8, trayH - islandH + 5);
  const zShoulder = islandH;
  const zFootTop = islandH;
  const zFace = zFootTop + bodyH;
  const zFront = zFace - topR * Math.tan(tiltRad);
  const zBack = zFace + topR * Math.tan(tiltRad);
  const zWaist1 = islandH + neckH + waistH;
  const skirt = Math.max(rim, 0.8) + wall + 1.6;
  const zFrontLocal = bodyH - topR * Math.tan(tiltRad);
  const zCyl0 = Math.max(neckH + waistH + 4, zFrontLocal - skirt - 3);
  const wrapTaper = (topR - rx) / Math.max(1, zCyl0 - (neckH + waistH));
  const wrapR = topR;
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
    extraBot: 0,
    extraTop: 0,
    pocketMouthR,
    pocketBaseR,
    pocketLipR,
    rx,
    topR,
    neckR,
    neckH,
    waistH,
    margin,
    wrapR,
    wrapTaper,
    zWaist1,
    zCyl0,
    skirt,
    rimT,
    wallInner,
    bodyH,
    zFootTop,
    zRimCenter: zFace,
    zFace,
    zFront,
    zBack,
    zShoulder,
    floorT,
    moatWidth,
    moatDepth,
    moatGap,
    moatInner,
    moatOuter,
    pegR,
    socketR,
    socketH,
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
  const weld = new Map<string, number>();
  const remap = new Uint32Array(mesh.numVert);
  const raw: number[] = [];
  for (let i = 0; i < mesh.numVert; i++) {
    const x = props[i * stride];
    const y = props[i * stride + 1];
    const z = props[i * stride + 2];
    const key = `${Math.round(x * 500)},${Math.round(y * 500)},${Math.round(z * 500)}`;
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

function ringCyl(height: number, innerR: number, outerR: number, z0: number): Manifold {
  const { Manifold } = getEngine();
  const outer = Manifold.cylinder(height, outerR, outerR, 80).translate(0, 0, z0);
  const inner = Manifold.cylinder(height + 1, innerR, innerR, 80).translate(0, 0, z0 - 0.4);
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

/** Drop the cutting plane `sink` mm along the tilted normal so the body face is buried under the lip. */
function cutTiltedTop(solid: Manifold, p: Dims, sink: number): Manifold {
  const { Manifold } = getEngine();
  const big = 700;
  let cutter = Manifold.cube([big, big, big], true).translate(0, 0, big / 2 - sink);
  cutter = tiltAroundX(cutter, p.tilt);
  const placed = cutter.translate(0, 0, p.bodyH);
  if (placed !== cutter) cutter.delete();
  const cut = solid.subtract(placed);
  solid.delete();
  placed.delete();
  return cut;
}

function placeOnTiltedFace(solid: Manifold, p: Dims): Manifold {
  const tilted = tiltAroundX(solid, p.tilt);
  return tilted.translate(0, 0, p.bodyH);
}

function easeSmooth(t: number): number {
  return t * t * (3 - 2 * t);
}

type RimLayout = {
  rounded: boolean;
  /** Local Z where the full-radius wall hands off to the rounded cap. */
  zCapBottom: number;
  zNubTop: number;
  /** Cap overlaps the wall by this much so the union cannot leave a gap. */
  zLow: number;
  zcFront: number;
};

/** Fillet sits on the vertical wall and stays tangent to the tilted face. */
function rimLayout(p: Dims): RimLayout {
  const f = p.rim;
  const R = p.topR;
  const sFront = -Math.tan(p.tiltRad);
  const Lf = Math.hypot(1, sFront);
  const zcFront = p.bodyH + sFront * Math.max(R - f, 1) - f * Lf;
  const rounded = f >= 0.8 && R - f > p.pocketLipR + 0.6;
  const zCapBottom = rounded ? zcFront - 2.6 : p.bodyH;
  const zNubTop = rounded ? Math.max(zCapBottom + 1.2, zcFront - 0.3) : p.bodyH + R * Math.tan(p.tiltRad) + 4;
  return { rounded, zCapBottom, zNubTop, zLow: zCapBottom - 1.2, zcFront };
}

function bodyOuterProfile(p: Dims, layout: RimLayout): Array<[number, number]> {
  const zWaist0 = p.neckH;
  const zFull = layout.rounded ? Math.min(layout.zCapBottom, layout.zNubTop - 0.4) : p.bodyH + p.topR * Math.tan(p.tiltRad) + 4;
  const zWaist1 = Math.min(p.neckH + p.waistH, Math.max(zWaist0 + 1, zFull - 5));
  const zCyl = Math.min(Math.max(p.zCyl0, zWaist1 + 1), Math.max(zWaist1 + 1.2, zFull - 1.2));
  const pts: Array<[number, number]> = [
    [0, 0],
    [p.neckR, 0],
    [p.neckR, Math.min(zWaist0, zWaist1)],
  ];
  if (zWaist1 > zWaist0 + 0.4) {
    const waistSteps = 10;
    for (let i = 1; i <= waistSteps; i++) {
      const t = i / waistSteps;
      pts.push([p.neckR + (p.rx - p.neckR) * easeSmooth(t), zWaist0 + (zWaist1 - zWaist0) * t]);
    }
  }
  if (zCyl > zWaist1 + 0.4) pts.push(...taperPoints(p.rx, p.topR, zWaist1, zCyl, 8));
  pts.push([p.topR, Math.max(zCyl, zWaist1)]);
  if (layout.rounded) {
    // Full-radius wall ends on the cap's bottom circle. The nub above that
    // sits inside the cap so the two outer cylinders are not coincident.
    const zMeet = layout.zLow;
    pts.push([p.topR, zMeet], [p.topR - 0.28, zMeet + 0.22], [p.topR - 0.28, layout.zNubTop], [0, layout.zNubTop]);
  } else {
    pts.push([p.topR, zFull], [0, zFull]);
  }
  return closeProfile(pts);
}

function bodyCavityProfile(p: Dims, layout: RimLayout): Array<[number, number]> {
  const innerNeck = Math.max(p.socketR + 1, p.neckR - p.wall);
  const innerBase = Math.max(innerNeck + 1, p.rx - p.wall);
  const innerTop = Math.max(innerNeck + 1, (layout.rounded ? p.topR - 0.12 : p.topR) - p.wall);
  const zFloor = p.socketH + p.bottom;
  const zWaist0 = p.neckH;
  const zOpen = layout.rounded ? layout.zNubTop + 0.5 : p.bodyH + p.topR * Math.tan(p.tiltRad) + 8;
  const zFull = layout.rounded ? layout.zCapBottom : p.bodyH;
  const zWaist1 = Math.min(p.neckH + p.waistH, Math.max(zWaist0 + 1, zFull - 5));
  const zCyl = Math.min(Math.max(p.zCyl0, zWaist1 + 1), Math.max(zWaist1 + 1.2, zFull - 1.2));
  const pts: Array<[number, number]> = [
    [0, 0],
    [p.socketR, 0],
    [p.socketR, p.socketH],
    [innerNeck, zFloor],
    [innerNeck, Math.max(zFloor, Math.min(zWaist0, zWaist1))],
  ];
  if (zWaist1 > zWaist0 + 0.4) {
    const waistSteps = 8;
    for (let i = 1; i <= waistSteps; i++) {
      const t = i / waistSteps;
      pts.push([innerNeck + (innerBase - innerNeck) * easeSmooth(t), zWaist0 + (zWaist1 - zWaist0) * t]);
    }
  }
  if (zCyl > zWaist1 + 0.4) pts.push(...taperPoints(innerBase, innerTop, zWaist1, zCyl, 8));
  pts.push([innerTop, Math.max(zCyl, zWaist1)], [innerTop, zOpen], [0, zOpen]);
  return closeProfile(pts);
}

/** Radial section of the roundover: tangent to the vertical wall and to the tilted face. */
function filletFrame(p: Dims, theta: number) {
  const s = Math.sin(theta) * Math.tan(p.tiltRad);
  const L = Math.hypot(1, s);
  const f = p.rim;
  const R = p.topR;
  const rc = R - f;
  const zc = p.bodyH + s * rc - f * L;
  const ang1 = Math.atan2(1 / L, -s / L);
  return { rc, zc, f, R, ang1 };
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

/** One solid: tilted flat face plus the round edge, overlapped onto the wall. */
function roundedCap(p: Dims, layout: RimLayout): Manifold {
  const n = 128;
  const nArc = 12;
  const xyz: number[] = [];
  const bottom = pushRing(xyz, n, (theta) => [p.topR * Math.cos(theta), p.topR * Math.sin(theta), layout.zLow]);
  const wall = pushRing(xyz, n, (theta) => {
    const fr = filletFrame(p, theta);
    return [fr.R * Math.cos(theta), fr.R * Math.sin(theta), fr.zc];
  });
  const arcs: number[] = [];
  for (let k = 1; k <= nArc; k++) {
    const u = k / nArc;
    arcs.push(
      pushRing(xyz, n, (theta) => {
        const fr = filletFrame(p, theta);
        const ang = u * fr.ang1;
        const r = fr.rc + fr.f * Math.cos(ang);
        const z = fr.zc + fr.f * Math.sin(ang);
        return [r * Math.cos(theta), r * Math.sin(theta), z];
      }),
    );
  }
  const apex = xyz.length / 3;
  xyz.push(0, 0, p.bodyH);
  const botC = xyz.length / 3;
  xyz.push(0, 0, layout.zLow);
  const idx: number[] = [];
  bridgeRings(idx, bottom, wall, n);
  let prev = wall;
  for (const ring of arcs) {
    bridgeRings(idx, prev, ring, n);
    prev = ring;
  }
  const face = arcs[arcs.length - 1];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    idx.push(apex, face + i, face + j);
    idx.push(botC, bottom + j, bottom + i);
  }
  return manifoldFromMesh(new Float32Array(xyz), new Uint32Array(idx));
}

/** Hollow under the tilted face, staying inside the fillet so the roundover is not cut. */
function capVoid(p: Dims, layout: RimLayout): Manifold | null {
  const n = 96;
  let rin = p.topR - p.wall - 0.3;
  for (let i = 0; i < 32; i++) {
    const fr = filletFrame(p, (i / 32) * Math.PI * 2);
    rin = Math.min(rin, fr.rc + fr.f * Math.cos(fr.ang1) - 1.15);
  }
  rin = Math.max(p.pocketMouthR + 1.5, rin);
  const zApex = p.bodyH - p.wall / Math.max(0.2, Math.cos(p.tiltRad));
  let z0 = layout.zCapBottom - 0.6;
  const zFront = zApex - rin * Math.tan(p.tiltRad);
  if (zFront < z0 + 1.2) z0 = zFront - 1.2;
  if (!(rin > 8) || !(zApex > z0 + 1)) return null;
  const xyz: number[] = [];
  const bottom = pushRing(xyz, n, (theta) => [rin * Math.cos(theta), rin * Math.sin(theta), z0]);
  const top = pushRing(xyz, n, (theta) => {
    const y = rin * Math.sin(theta);
    return [rin * Math.cos(theta), y, zApex + y * Math.tan(p.tiltRad)];
  });
  const botC = xyz.length / 3;
  xyz.push(0, 0, z0);
  const apex = xyz.length / 3;
  xyz.push(0, 0, zApex);
  const idx: number[] = [];
  bridgeRings(idx, bottom, top, n);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    idx.push(apex, top + i, top + j);
    idx.push(botC, bottom + j, bottom + i);
  }
  const solid = manifoldFromMesh(new Float32Array(xyz), new Uint32Array(idx));
  if (solid.status() !== "NoError" || solid.volume() <= 0) {
    solid.delete();
    return null;
  }
  return solid;
}

function buildBody(p: Dims): Manifold {
  const { Manifold } = getEngine();
  const layout = rimLayout(p);
  let body = revolve(bodyOuterProfile(p, layout), 96);
  const cavity = revolve(bodyCavityProfile(p, layout), 80);
  const hollow = body.subtract(cavity);
  body.delete();
  cavity.delete();
  body = hollow;

  if (layout.rounded) {
    const cap = roundedCap(p, layout);
    const joined = body.add(cap);
    body.delete();
    cap.delete();
    body = joined;
    const voidSolid = capVoid(p, layout);
    if (voidSolid) {
      const opened = body.subtract(voidSolid);
      body.delete();
      voidSolid.delete();
      body = opened;
    }
  } else {
    body = cutTiltedTop(body, p, 0.35);
  }

  let taper = revolve(pocketTaperProfile(p, p.extraDepth), 64);
  let bore = Manifold.cylinder(p.lipT + 6, p.pocketLipR, p.pocketLipR, 64).translate(0, 0, p.insertHeight - 0.2);
  const pocket = taper.add(bore);
  taper.delete();
  bore.delete();
  const well = Manifold.cylinder(8, Math.max(p.pocketLipR, p.pocketMouthR + 2), Math.max(p.pocketLipR, p.pocketMouthR + 2), 64).translate(
    0,
    0,
    p.insertHeight,
  );
  const withWell = pocket.add(well);
  pocket.delete();
  well.delete();
  const pocketAtFace = withWell.translate(0, 0, -p.insertHeight);
  if (pocketAtFace !== withWell) withWell.delete();
  const placed = placeOnTiltedFace(pocketAtFace, p);
  const opened = body.subtract(placed);
  body.delete();
  placed.delete();
  return opened.translate(0, 0, p.zShoulder);
}

function buildInsert(p: Dims): Manifold {
  let outer = revolve(insertOuterSolidProfile(p), 64);
  const cavity = revolve(insertCavityProfile(p), 64);
  const shell = outer.subtract(cavity);
  outer.delete();
  cavity.delete();
  const atFace = shell.translate(0, 0, -p.insertHeight);
  if (atFace !== shell) shell.delete();
  const placed = placeOnTiltedFace(atFace, p);
  return placed.translate(0, 0, p.zShoulder);
}

function buildTray(params: BowlParams, p: Dims): Manifold {
  const { Manifold } = getEngine();
  const wallInner = p.wallInner;
  const rim = 2.15;
  const floorZ = p.floorT;

  const islandPts: Array<[number, number]> = [
    [0, 0],
    [p.islandR * 0.64, 0],
  ];
  islandPts.push(...taperPoints(p.islandR * 0.64, p.islandR, 0, p.islandH, 10));
  islandPts.push([p.islandR, p.islandH], [0, p.islandH]);
  let tray = revolve(closeProfile(islandPts), 72);

  const wallH = p.trayH;
  const wall = ringCyl(wallH - floorZ + 0.2, wallInner, p.trayR, floorZ);
  const withWall = tray.add(wall);
  tray.delete();
  wall.delete();
  tray = withWall;

  const floor = ringCyl(floorZ + 0.4, p.islandR - 0.2, p.trayR, -0.1);
  const withFloor = tray.add(floor);
  tray.delete();
  floor.delete();
  tray = withFloor;

  if (rim > 1) {
    const { CrossSection } = getEngine();
    const bead = CrossSection.circle(rim, 20).translate(p.trayR - rim * 0.85, 0);
    const torus = bead.revolve(64);
    bead.delete();
    const lip = torus.translate(0, 0, wallH - rim * 0.55);
    torus.delete();
    const withLip = tray.add(lip);
    tray.delete();
    lip.delete();
    tray = withLip;
  }

  if (params.moatEnabled && p.moatOuter > p.moatInner + 0.8) {
    const waterTop = Math.min(p.islandH - 1.2, floorZ + p.moatDepth);
    const channel = ringCyl(waterTop - floorZ + 0.2, p.moatInner, Math.min(p.moatOuter, wallInner - 0.6), floorZ);
    const cut = tray.subtract(channel);
    tray.delete();
    channel.delete();
    tray = cut;
  } else {
    const dish = ringCyl(p.islandH - floorZ, p.islandR + 0.4, wallInner, floorZ);
    const cut = tray.subtract(dish);
    tray.delete();
    dish.delete();
    tray = cut;
  }

  if (p.pegH > 0.4) {
    const peg = Manifold.cylinder(p.pegH, p.pegR, p.pegR, 64).translate(0, 0, p.islandH);
    const withPeg = tray.add(peg);
    tray.delete();
    peg.delete();
    tray = withPeg;
  }

  if (params.antiSlipGroove) {
    const groove = ringCyl(1.2, Math.max(8, p.islandR * 0.55), p.islandR * 0.78, -0.15);
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
  const visibleLow = Math.max(p.zWaist1, p.trayH) + 8;
  const visibleHigh = p.zFront - 10;
  const zMid = visibleLow + Math.max(16, (visibleHigh - visibleLow) * 0.48);
  const zCylWorld = p.zShoulder + p.zCyl0;
  const taperSpan = Math.max(1, zCylWorld - p.zWaist1);
  const wrapR = p.rx + (p.topR - p.rx) * clamp((zMid - p.zWaist1) / taperSpan, 0, 1);
  const engrave = params.textStyle !== "emboss";
  const cutter = engrave ? wrapPolygonsToCylinder(layout.polygons, wrapR, depth + 0.45, zMid, 0.08, p.wrapTaper) : null;
  const inlay = wrapPolygonsToCylinder(
    layout.polygons,
    wrapR,
    depth + (engrave ? 0.05 : 0.15),
    zMid,
    engrave ? 0.02 : 0.35,
    p.wrapTaper,
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

  let text: Manifold | null = null;
  if (decor.inlay) {
    text = decor.inlay;
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

import Module from "manifold-3d";
import type { Manifold } from "manifold-3d";
import type { BowlModel, BowlParams, BowlPart, MeshArrays } from "./types";
import { DEFAULT_PARAMS } from "./types";
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

function ellipseX(y: number, rx: number, ry: number, cy: number): number {
  const t = clamp((y - cy) / Math.max(ry, 0.001), -0.999, 0.999);
  return rx * Math.sqrt(1 - t * t);
}

function sampleArc(
  cx: number,
  cy: number,
  r: number,
  a0: number,
  a1: number,
  steps: number,
): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let i = 0; i <= steps; i++) {
    const t = a0 + ((a1 - a0) * i) / steps;
    out.push([cx + Math.cos(t) * r, cy + Math.sin(t) * r]);
  }
  return out;
}

export function resolvedDims(params: BowlParams) {
  const wall = clamp(params.wallThickness, 1.4, 12);
  const bottom = clamp(params.bottomThickness, 1.4, 14);
  const foot = clamp(params.footHeight, 4, params.height - 18);
  const height = Math.max(params.height, foot + 20);
  const rx = clamp(params.bodyDiameter, 50, 280) / 2;
  const bodyH = height - foot;
  // Sphere-like body: wide at the equator, open generously at the rim.
  const ry = Math.max(bodyH * 0.58, rx * 0.72);
  const cy = foot + bodyH * 0.38;
  const rim = clamp(params.rimRadius, 0, Math.min(8, wall));
  const openingR = clamp(rx - params.mouthShrink, rx * 0.45, rx - wall * 0.4);
  const innerOpening = Math.max(10, openingR - wall);
  const topY = height;
  const cavityFloor = clamp(topY - params.innerDepth, foot + bottom, topY - 12);
  const footR = rx * 0.86;
  return { wall, bottom, foot, height, rx, ry, cy, rim, openingR, innerOpening, topY, cavityFloor, footR, bodyH };
}

function bodyRadiusAt(y: number, p: ReturnType<typeof resolvedDims>, inset: number): number {
  const raw = ellipseX(y, Math.max(8, p.rx - inset), Math.max(8, p.ry - inset * 0.25), p.cy);
  const flare = p.openingR - inset;
  // Keep the rim wide instead of pinching to a bottle neck.
  if (y > p.cy) return Math.max(raw, flare * 0.92);
  return Math.max(raw, p.footR - inset - 1);
}

function outerProfile(p: ReturnType<typeof resolvedDims>): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  pts.push([0, p.foot]);
  pts.push([p.footR * 0.98, p.foot]);
  const y0 = p.foot;
  const y1 = p.topY - Math.max(p.rim, 1.6);
  const steps = 32;
  for (let i = 0; i <= steps; i++) {
    const y = y0 + ((y1 - y0) * i) / steps;
    pts.push([bodyRadiusAt(y, p, 0), y]);
  }
  if (p.rim > 0.2) {
    const arc = sampleArc(p.openingR, p.topY - p.rim, p.rim, 0, Math.PI * 0.55, 8);
    for (const [x, y] of arc) {
      if (x >= 0) pts.push([x, y]);
    }
  }
  pts.push([p.openingR, p.topY]);
  pts.push([0, p.topY]);
  return closeProfile(pts);
}

function cavityProfile(p: ReturnType<typeof resolvedDims>): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  pts.push([0, p.cavityFloor]);
  const y0 = p.cavityFloor;
  const y1 = p.topY + 3;
  const steps = 26;
  for (let i = 0; i <= steps; i++) {
    const y = y0 + ((y1 - y0) * i) / steps;
    const x = y >= p.topY ? p.innerOpening : Math.max(p.innerOpening * 0.55, bodyRadiusAt(y, p, p.wall));
    pts.push([x, y]);
  }
  pts.push([p.innerOpening, p.topY + 3]);
  pts.push([0, p.topY + 3]);
  return closeProfile(pts);
}

function insertProfile(p: ReturnType<typeof resolvedDims>): Array<[number, number]> {
  const t = Math.max(0.85, p.wall * 0.34);
  const floor = p.cavityFloor + 0.5;
  const top = p.topY - 0.9;
  const lip = Math.max(p.innerOpening - 0.35, 12);
  const innerLip = Math.max(8, lip - t);
  const pts: Array<[number, number]> = [[0, floor + t]];
  const steps = 16;
  for (let i = 0; i <= steps; i++) {
    const y = floor + t + ((top - t - (floor + t)) * i) / steps;
    pts.push([Math.max(innerLip * 0.6, bodyRadiusAt(y, p, p.wall + t + 0.2)), y]);
  }
  pts.push([innerLip, top - t]);
  pts.push([lip, top]);
  for (let i = steps; i >= 0; i--) {
    const y = floor + ((top - 0.4 - floor) * i) / steps;
    pts.push([Math.max(lip * 0.6, bodyRadiusAt(y, p, p.wall + 0.25)), y]);
  }
  pts.push([0, floor]);
  return closeProfile(pts);
}

function baseProfile(p: ReturnType<typeof resolvedDims>, groove: boolean): Array<[number, number]> {
  const r = p.footR;
  const pts: Array<[number, number]> = [[0, 0]];
  if (groove) {
    pts.push([r - 3.4, 0]);
    pts.push([r - 3.4, 1.15]);
    pts.push([r - 1.5, 1.15]);
    pts.push([r - 1.5, 2.5]);
    pts.push([r, 2.5]);
  } else {
    pts.push([r, 0]);
  }
  pts.push([r, p.foot]);
  pts.push([Math.max(4, r * 0.86), p.foot]);
  pts.push([0, p.foot]);
  return closeProfile(pts);
}

function closeProfile(pts: Array<[number, number]>): Array<[number, number]> {
  const cleaned: Array<[number, number]> = [];
  for (const [x, y] of pts) {
    const nx = Math.max(0, x);
    const last = cleaned[cleaned.length - 1];
    if (!last || Math.hypot(nx - last[0], y - last[1]) > 0.02) {
      cleaned.push([nx, y]);
    }
  }
  const first = cleaned[0];
  const last = cleaned[cleaned.length - 1];
  if (first && last && Math.hypot(first[0] - last[0], first[1] - last[1]) > 0.02) {
    cleaned.push([first[0], first[1]]);
  }
  return cleaned;
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
  return {
    positions,
    indices: new Uint32Array(mesh.triVerts),
  };
}

function partFrom(name: BowlPart["name"], solid: Manifold): BowlPart {
  const mesh = meshOf(solid);
  return {
    name,
    mesh,
    triangleCount: mesh.indices.length / 3,
    volumeMm3: Math.max(0, solid.volume()),
  };
}

function duplicateAlongX(solid: Manifold, offset: number): Manifold {
  const left = solid.translate(-offset, 0, 0);
  const right = solid.translate(offset, 0, 0);
  const both = left.add(right);
  left.delete();
  right.delete();
  return both;
}

function buildBase(params: BowlParams, p: ReturnType<typeof resolvedDims>): Manifold {
  const { Manifold } = getEngine();
  let base = revolve(baseProfile(p, params.antiSlipGroove), 72);
  if (params.baseTexture !== "smooth") {
    const ribDepth = 1.15;
    const ring = toothedRing(p.footR + 0.15, Math.max(4, p.footR - ribDepth), params.ribCount);
    const { CrossSection } = getEngine();
    const cs = new CrossSection([ring]);
    const twist = params.baseTexture === "twist" ? 28 : 0;
    const divisions = params.baseTexture === "twist" ? 10 : 0;
    const ribs = cs.extrude(p.foot, divisions, twist);
    cs.delete();
    const combined = base.add(ribs);
    base.delete();
    ribs.delete();
    base = combined;
    const cap = Manifold.cylinder(1.2, p.footR - 0.2, p.footR - 0.2, 64);
    const withCap = base.add(cap);
    base.delete();
    cap.delete();
    base = withCap;
  }
  return base;
}

function buildText(params: BowlParams, p: ReturnType<typeof resolvedDims>, font: Font | null): Manifold | null {
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
  const depth = params.embossDepth + 0.55;
  let solid = cs.extrude(depth);
  cs.delete();
  solid = solid.translate(-cx, -cy, 0).rotate(90, 0, 0);
  const textZ = p.foot + p.bodyH * 0.46;
  const surfaceR = bodyRadiusAt(textZ, p, 0);
  // Place on -Y so a later X=-90 preview rotation faces the default camera.
  solid = solid.translate(0, -(surfaceR - 0.25), textZ);
  return solid;
}

export async function buildBowl(params: BowlParams = DEFAULT_PARAMS, font: Font | null = null): Promise<BowlModel> {
  await initEngine();
  const p = resolvedDims(params);
  const segments = 80;

  let outer = revolve(outerProfile(p), segments);
  let cavity = revolve(cavityProfile(p), 64);
  if (params.tiltDeg > 0.05) {
    const pivotZ = p.cavityFloor + (p.topY - p.cavityFloor) * 0.35;
    cavity = cavity
      .translate(0, 0, -pivotZ)
      .rotate(clamp(params.tiltDeg, 0, 15), 0, 0)
      .translate(0, 0, pivotZ);
  }
  let body = outer.subtract(cavity);
  outer.delete();
  cavity.delete();

  let base = buildBase(params, p);
  let text = buildText(params, p, font);
  let insert = revolve(insertProfile(p), 64);

  if (params.doubleBowl) {
    const offset = p.rx + 8;
    const body2 = duplicateAlongX(body, offset);
    body.delete();
    body = body2;
    const base2 = duplicateAlongX(base, offset);
    base.delete();
    base = base2;
    const insert2 = duplicateAlongX(insert, offset);
    insert.delete();
    insert = insert2;
    if (text) {
      const text2 = duplicateAlongX(text, offset);
      text.delete();
      text = text2;
    }
    const { Manifold } = getEngine();
    const bar = Manifold.cube([offset * 2 + 6, 18, Math.min(10, p.foot)], true).translate(0, 0, 4);
    const bridged = base.add(bar);
    base.delete();
    bar.delete();
    base = bridged;
  }

  const cavityOnly = revolve(cavityProfile(p), 48);
  const capacityMm3 = Math.max(0, cavityOnly.volume()) * (params.doubleBowl ? 2 : 1);
  cavityOnly.delete();

  const parts: BowlPart[] = [partFrom("body", body), partFrom("base", base)];
  if (text && !text.isEmpty()) {
    parts.push(partFrom("text", text));
  }

  const insertMesh = meshOf(insert);
  const bounds = [body, base, text].filter(Boolean).map((s) => s!.boundingBox());
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const b of bounds) {
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], b.min[i]);
      max[i] = Math.max(max[i], b.max[i]);
    }
  }

  const manifold =
    parts.every((part) => part.triangleCount > 0 && part.volumeMm3 > 0) &&
    body.status() === "NoError" &&
    base.status() === "NoError";

  const model: BowlModel = {
    parts,
    insert: insertMesh,
    width: max[0] - min[0],
    depth: max[1] - min[1],
    height: max[2] - min[2],
    capacityMl: capacityMm3 / 1000,
    solidVolumeMm3: parts.reduce((sum, part) => sum + part.volumeMm3, 0),
    triangleCount: parts.reduce((sum, part) => sum + part.triangleCount, 0),
    manifold,
  };

  body.delete();
  base.delete();
  insert.delete();
  text?.delete();
  return model;
}

export function estimateMassGrams(volumeMm3: number, density = 1.24): number {
  return (volumeMm3 / 1000) * density;
}

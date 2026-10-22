import type { Manifold } from "manifold-3d";
import { getEngine } from "./wasm";

import type { BowlParams } from "./types";

// Entirely procedural solids. The supplied STL is only a dimensional reference.
export async function referenceSolid(name: "top" | "base", scale: number, height: number, params: BowlParams): Promise<Manifold> {
  const { CrossSection, Manifold } = getEngine();
  const wall = Math.max(1.6, params.wallThickness);
  const bottom = Math.max(1.6, params.bottomThickness);
  const bodyR = params.bodyDiameter / 2;
  const mouthR = Math.max(params.insertLipDiameter / 2 + wall + 1, bodyR - params.mouthShrink);
  const footHole = bodyR * 0.772;
  const seatInner = params.insertMouthDiameter / 2 + 0.7 + params.insertClearance;
  const lipH = Math.max(2.4, bottom);
  const fillet = Math.min(params.rimRadius, wall, (mouthR - seatInner) / 3);
  const trayR = params.trayDiameter / 2;
  const rimZ = params.trayHeight * 36.8 / 60;
  const lift = rimZ + 6 * scale + params.fitClearance;
  const peak = Math.max(lift + 4, rimZ + params.islandHeight);
  const supportR = Math.min(footHole + 3 * scale, trayR - wall - 4);
  const floorZ = Math.max(bottom + 1, rimZ - (params.moatEnabled ? params.moatDepth : 0));
  const profile: Array<[number, number]> = name === "base" ? [
    [0,peak], [Math.min(53.4*scale,footHole-4),peak],
    [footHole-params.fitClearance,lift+lipH], [footHole-params.fitClearance,lift],
    [supportR,lift], [supportR,rimZ],
    [trayR-fillet,rimZ], [trayR,rimZ-fillet], [trayR,fillet],
    [trayR-fillet,0], [trayR-wall,0], [trayR-wall,floorZ-bottom], [0,floorZ-bottom],
  ] : [
    [footHole,0], [bodyR-fillet,0], [bodyR,fillet],
    [mouthR,height-fillet], [mouthR-fillet,height],
    [seatInner,height], [seatInner,height-lipH], [mouthR-wall,height-lipH],
    [bodyR-wall,lipH], [footHole,lipH],
  ];
  const area = profile.reduce((sum, p, i) => { const q = profile[(i+1)%profile.length]; return sum + p[0]*q[1]-q[0]*p[1]; },0);
  const section = new CrossSection([area < 0 ? profile.reverse() : profile]);
  let solid = section.revolve(192);
  section.delete();
  if (name === "base" && params.moatEnabled) {
    const inner = supportR + params.moatGap;
    const outer = Math.min(inner + params.moatWidth, trayR-wall-0.5);
    if (outer > inner + 1) {
      const outside = Manifold.cylinder(params.moatDepth+1,outer,outer,192).translate(0,0,rimZ-params.moatDepth);
      const inside = Manifold.cylinder(params.moatDepth+2,inner,inner,192).translate(0,0,rimZ-params.moatDepth-0.5);
      const channel = outside.subtract(inside);
      const cut = solid.subtract(channel);
      solid.delete(); outside.delete(); inside.delete(); channel.delete(); solid = cut;
    }
  }
  if (name === "base" && params.baseTexture !== "smooth") {
    const cuts: Manifold[] = [];
    const n = Math.max(12, Math.min(96, Math.round(params.ribCount)));
    const cs = new CrossSection([[[trayR-0.55,-0.6],[trayR+1,-0.6],[trayR+1,0.6],[trayR-0.55,0.6]]]);
    const groove = cs.extrude(Math.max(1,rimZ-2), params.baseTexture === "twist" ? 18 : 1, params.baseTexture === "twist" ? 12 : 0).translate(0,0,1);
    cs.delete();
    for(let i=0;i<n;i++) cuts.push(groove.rotate(0,0,i*360/n));
    const cutter = Manifold.union(cuts);
    const textured = solid.subtract(cutter);
    solid.delete(); groove.delete(); cutter.delete(); cuts.forEach(c=>c.delete()); solid = textured;
  }
  if (solid.status() !== "NoError" || solid.volume() <= 0) {
    solid.delete(); throw new Error("Không dựng được khối tròn kín");
  }
  return solid;
}

/** Keep the mating foot fixed; tilt the upper rim about its center. */
export function tiltReference(solid: Manifold, height: number, lift: number, tilt: number): Manifold {
  const refined = solid.refineToLength(4);
  const result = refined.warp((v) => {
    const z = (v[2] - lift) * 102.85713958740234 / height;
    const t = Math.max(0, Math.min(1, (z - 38) / (100.1 - 38)));
    const blend = t * t * (3 - 2 * t);
    v[2] += blend * v[1] * Math.tan(tilt * Math.PI / 180);
  });
  refined.delete(); solid.delete();
  return result;
}

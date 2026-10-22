import type { Manifold } from "manifold-3d";
import { getEngine } from "./wasm";

import type { BowlParams } from "./types";


/** Quadratic rim: tangent to the tapered wall, then tangent to the top face. */
export function roundedRimProfile(bodyR: number, mouthR: number, height: number, seat: number, lipH: number, radius: number): Array<[number, number]> {
  const slope = (mouthR-bodyR)/Math.max(1,height-radius);
  const inner = Math.min(0.6,lipH*0.2,radius);
  const points: Array<[number, number]> = [];
  for(let i=0;i<=16;i++) {
    const t=i/16,u=1-t;
    points.push([u*u*(mouthR-slope*radius)+2*u*t*mouthR+t*t*(mouthR-radius),u*u*(height-radius)+(2*u*t+t*t)*height]);
  }
  for(let i=0;i<=8;i++) {
    const t=i/8,u=1-t;
    points.push([u*u*(seat+inner)+(2*u*t+t*t)*seat,(u*u+2*u*t)*height+t*t*(height-inner)]);
  }
  return points.filter((p,i,all)=>i===0 || Math.hypot(p[0]-all[i-1][0],p[1]-all[i-1][1])>1e-6);
}

/** Raised rounded flutes, with smooth run-outs clear of both rims. */
export function textureSolid(solid: Manifold, params: BowlParams, name: "top"|"base"): Manifold {
  if(params.baseTexture === "smooth" || name==="top") return solid;
  const scale=params.insertLipDiameter/130;
  const h=params.trayHeight*36.8/60;
  const outer=params.trayDiameter/2;
  const n=Math.max(12,Math.min(96,Math.round(params.ribCount)));
  const textured=solid.warp(v=>{
    const r=Math.hypot(v[0],v[1]); if(r<1) return;
    const z=v[2];
    const edge=Math.max(0,Math.min(1,(z-2)/3,(h-3-z)/3));
    const fade=edge*edge*(3-2*edge);
    const weight=Math.max(0,Math.min(1,(r-outer+params.wallThickness)/params.wallThickness));
    const angle=Math.atan2(v[1],v[0])-(params.baseTexture==="twist"?Math.tan(Math.PI/6)*z/outer:0);
    const wave=Math.pow((1+Math.cos(n*angle))/2,2);
    const extra=0.9*scale*fade*wave*weight;
    v[0]*=(r+extra)/r;v[1]*=(r+extra)/r;
  });
  solid.delete();return textured;
}

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
  const trayWall = Math.max(1.6,Math.min(2.4,wall*2/3));
  const rimZ = params.trayHeight * 36.8 / 60;
  const lift = rimZ + 6 * scale + params.fitClearance;
  const peak = Math.max(lift + 4, rimZ + params.islandHeight);
  const supportR = Math.min(footHole + 3 * scale, trayR - wall - 4);
  const floorZ = Math.max(bottom + 1, rimZ - (params.moatEnabled ? params.moatDepth : 0));
  const profile: Array<[number, number]> = name === "base" ? [
    [0,peak], [Math.min(53.4*scale,footHole-4),peak],
    [footHole-params.fitClearance,lift+lipH], [footHole-params.fitClearance,lift],
    [supportR,lift], [supportR,rimZ],
    [trayR-fillet,rimZ], [trayR,rimZ-fillet],
    ...Array.from({length:32},(_,i)=>[trayR,rimZ-fillet-(rimZ-2*fillet)*(i+1)/32] as [number,number]),
    [trayR-fillet,0], [trayR-trayWall,0], [trayR-trayWall,floorZ-bottom], [0,floorZ-bottom],
  ] : [
    [footHole,0], [bodyR-fillet,0], [bodyR,fillet],
    ...Array.from({length:64},(_,i)=>{
      const z=fillet+(height-2*fillet)*(i+1)/64;
      return [bodyR+(mouthR-bodyR)/Math.max(1,height-fillet)*(z-fillet),z] as [number,number];
    }),
    ...roundedRimProfile(bodyR,mouthR,height,seatInner,lipH,fillet),
    [seatInner,height-lipH], [mouthR-wall,height-lipH],
    [bodyR-wall,lipH], [footHole,lipH],
  ];
  const area = profile.reduce((sum, p, i) => { const q = profile[(i+1)%profile.length]; return sum + p[0]*q[1]-q[0]*p[1]; },0);
  const section = new CrossSection([area < 0 ? profile.reverse() : profile]);
  let solid = section.revolve((params.baseTexture === "smooth" || name==="top") ? 192 : Math.max(256,Math.round(params.ribCount)*12));
  section.delete();
  if (name === "base" && params.moatEnabled) {
    const inner = supportR + params.moatGap;
    const outer = Math.min(inner + params.moatWidth, trayR-trayWall-0.5);
    if (outer > inner + 1) {
      const outside = Manifold.cylinder(params.moatDepth+1,outer,outer,192).translate(0,0,rimZ-params.moatDepth);
      const inside = Manifold.cylinder(params.moatDepth+2,inner,inner,192).translate(0,0,rimZ-params.moatDepth-0.5);
      const channel = outside.subtract(inside);
      const cut = solid.subtract(channel);
      solid.delete(); outside.delete(); inside.delete(); channel.delete(); solid = cut;
    }
  }
  solid=textureSolid(solid,params,name);
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

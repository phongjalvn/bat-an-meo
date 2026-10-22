import type { Manifold } from "manifold-3d";
import { getEngine } from "./wasm";
import type { Polygon } from "./icons";

function meshOfWarp(positions: Float32Array, indices: Uint32Array): Manifold | null {
  const { Manifold, Mesh } = getEngine();
  try {
    const solid = new Manifold(
      new Mesh({
        numProp: 3,
        vertProperties: positions,
        triVerts: indices,
      }),
    );
    if (solid.isEmpty() || solid.status() !== "NoError" || solid.volume() <= 0) {
      solid.delete();
      return null;
    }
    return solid;
  } catch {
    return null;
  }
}

/**
 * Wrap XY polygons (X along the wall, Y up) onto a cylinder of radius R.
 * Extrusion becomes radial thickness starting at R - inset.
 */
export function wrapPolygonsToCylinder(
  polygons: Polygon[],
  radius: number,
  thickness: number,
  zCenter: number,
  inset = 0.25,
  taperPerMm = 0,
): Manifold | null {
  if (!polygons.length || radius < 8 || thickness <= 0) return null;
  const { CrossSection } = getEngine();
  let cs: InstanceType<typeof CrossSection>;
  try {
    cs = new CrossSection(polygons);
  } catch {
    return null;
  }
  if (cs.isEmpty()) {
    cs.delete();
    return null;
  }
  const extruded = cs.extrude(thickness);
  cs.delete();
  const mesh = extruded.getMesh();
  const stride = mesh.numProp;
  const positions = new Float32Array(mesh.numVert * 3);
  for (let i = 0; i < mesh.numVert; i++) {
    const x = mesh.vertProperties[i * stride];
    const y = mesh.vertProperties[i * stride + 1];
    const z = mesh.vertProperties[i * stride + 2];
    const surfaceR = radius + taperPerMm * y;
    const theta = x / Math.max(8, surfaceR);
    const r = Math.max(2, surfaceR - inset + z);
    positions[i * 3] = r * Math.sin(theta);
    positions[i * 3 + 1] = -r * Math.cos(theta);
    positions[i * 3 + 2] = y + zCenter;
  }
  extruded.delete();
  return meshOfWarp(positions, new Uint32Array(mesh.triVerts));
}

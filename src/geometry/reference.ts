import type { Manifold } from "manifold-3d";
import { getEngine } from "./wasm";
import type { MeshArrays } from "./types";

const cache = new Map<string, Promise<MeshArrays>>();
async function load(name: string): Promise<MeshArrays> {
  if (!cache.has(name)) cache.set(name, (async () => {
    let bytes: ArrayBuffer;
    if (typeof process !== "undefined" && process.versions?.node && typeof window === "undefined") {
      const moduleName = "node:fs/promises";
      const fs = await import(/* @vite-ignore */ moduleName);
      const b = await fs.readFile(`${process.cwd()}/public/reference/${name}.bin`);
      bytes = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
    } else {
      const response = await fetch(`${import.meta.env.BASE_URL}reference/${name}.bin`);
      if (!response.ok) throw new Error(`Không tải được STL mẫu: ${response.status}`);
      bytes = await response.arrayBuffer();
    }
    const header = new Uint32Array(bytes, 0, 2);
    return { positions: new Float32Array(bytes, 8, header[0]), indices: new Uint32Array(bytes, 8 + header[0] * 4, header[1]) };
  })());
  try { return await cache.get(name)!; } catch (error) { cache.delete(name); throw error; }
}

/** The original mating foot and water tray stay intact; only the upper shell rises. */
export async function referenceSolid(name: "top" | "base", scale: number, height: number): Promise<Manifold> {
  const source = await load(name);
  const positions = source.positions.slice();
  const referenceHeight = name === "top" ? 102.85713958740234 : 60;
  for (let i = 0; i < positions.length; i += 3) {
    const z = positions[i + 2];
    positions[i] *= scale;
    positions[i + 1] *= scale;

    positions[i + 2] = z * height / referenceHeight;
  }
  const { Manifold, Mesh } = getEngine();
  const solid = new Manifold(new Mesh({numProp: 3, vertProperties: positions, triVerts: source.indices}));
  if (solid.status() !== "NoError") { solid.delete(); throw new Error("STL mẫu không kín sau khi chỉnh kích thước"); }
  return solid;
}

export function tiltReference(solid: Manifold, scale: number, height: number, lift: number, tilt: number): Manifold {
  const refined = solid.refineToLength(4);
  const result = refined.warp((v) => {
    const z = (v[2] - lift) * 102.85713958740234 / height;
    const t = Math.max(0, Math.min(1, (z - 38) / (100.25 - 38)));
    const blend = t * t * (3 - 2 * t);
    v[2] += blend * (95 * scale + v[1]) * Math.tan(tilt * Math.PI / 180);
  });
  refined.delete();
  solid.delete();
  return result;
}

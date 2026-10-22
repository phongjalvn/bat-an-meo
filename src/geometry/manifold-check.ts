import type { MeshArrays } from "./types";
import { getEngine } from "./engine";

export function edgeManifoldCheck(mesh: MeshArrays): { ok: boolean; reason: string } {
  if (mesh.indices.length < 3 || mesh.positions.length < 9) {
    return { ok: false, reason: "empty mesh" };
  }
  if (mesh.indices.length % 3 !== 0) {
    return { ok: false, reason: "index count is not a multiple of 3" };
  }
  const edges = new Map<string, number>();
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const a = mesh.indices[i];
    const b = mesh.indices[i + 1];
    const c = mesh.indices[i + 2];
    if (a === b || b === c || a === c) return { ok: false, reason: "degenerate triangle" };
    const ax = mesh.positions[a * 3];
    const ay = mesh.positions[a * 3 + 1];
    const az = mesh.positions[a * 3 + 2];
    const bx = mesh.positions[b * 3];
    const by = mesh.positions[b * 3 + 1];
    const bz = mesh.positions[b * 3 + 2];
    const cx = mesh.positions[c * 3];
    const cy = mesh.positions[c * 3 + 1];
    const cz = mesh.positions[c * 3 + 2];
    const abx = bx - ax;
    const aby = by - ay;
    const abz = bz - az;
    const acx = cx - ax;
    const acy = cy - ay;
    const acz = cz - az;
    const nx = aby * acz - abz * acy;
    const ny = abz * acx - abx * acz;
    const nz = abx * acy - aby * acx;
    if (nx * nx + ny * ny + nz * nz < 1e-16) {
      return { ok: false, reason: "zero-area triangle" };
    }
    addEdge(edges, a, b);
    addEdge(edges, b, c);
    addEdge(edges, c, a);
  }
  for (const count of edges.values()) {
    if (count !== 2) {
      return { ok: false, reason: `boundary or non-manifold edge (count=${count})` };
    }
  }
  return { ok: true, reason: "each edge shared by exactly two triangles" };
}

function addEdge(edges: Map<string, number>, a: number, b: number) {
  const key = a < b ? `${a}:${b}` : `${b}:${a}`;
  edges.set(key, (edges.get(key) ?? 0) + 1);
}

export function reconstructManifold(mesh: MeshArrays): boolean {
  const { Manifold, Mesh } = getEngine();
  try {
    const solid = new Manifold(
      new Mesh({
        numProp: 3,
        vertProperties: mesh.positions,
        triVerts: mesh.indices,
      }),
    );
    const ok = !solid.isEmpty() && solid.status() === "NoError" && solid.volume() > 0;
    solid.delete();
    return ok;
  } catch {
    return false;
  }
}

export function isPrintableManifold(mesh: MeshArrays): boolean {
  const edge = edgeManifoldCheck(mesh);
  if (!edge.ok) return false;
  return reconstructManifold(mesh);
}

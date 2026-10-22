import type { BowlModel, BowlParams, MeshArrays } from "../geometry/types";

function concatMeshes(meshes: MeshArrays[]): MeshArrays {
  let vertCount = 0;
  let triCount = 0;
  for (const mesh of meshes) {
    vertCount += mesh.positions.length / 3;
    triCount += mesh.indices.length / 3;
  }
  const positions = new Float32Array(vertCount * 3);
  const indices = new Uint32Array(triCount * 3);
  let vOff = 0;
  let iOff = 0;
  let vBase = 0;
  for (const mesh of meshes) {
    positions.set(mesh.positions, vOff);
    for (let i = 0; i < mesh.indices.length; i++) {
      indices[iOff + i] = mesh.indices[i] + vBase;
    }
    vOff += mesh.positions.length;
    iOff += mesh.indices.length;
    vBase += mesh.positions.length / 3;
  }
  return { positions, indices };
}

export function meshToBinaryStl(mesh: MeshArrays): Uint8Array {
  const triCount = mesh.indices.length / 3;
  const buffer = new ArrayBuffer(84 + triCount * 50);
  const view = new DataView(buffer);
  const header = "MONO pet bowl STL (mm)";
  for (let i = 0; i < header.length; i++) view.setUint8(i, header.charCodeAt(i));
  view.setUint32(80, triCount, true);
  let offset = 84;
  const p = mesh.positions;
  for (let t = 0; t < triCount; t++) {
    const ia = mesh.indices[t * 3];
    const ib = mesh.indices[t * 3 + 1];
    const ic = mesh.indices[t * 3 + 2];
    const ax = p[ia * 3];
    const ay = p[ia * 3 + 1];
    const az = p[ia * 3 + 2];
    const bx = p[ib * 3];
    const by = p[ib * 3 + 1];
    const bz = p[ib * 3 + 2];
    const cx = p[ic * 3];
    const cy = p[ic * 3 + 1];
    const cz = p[ic * 3 + 2];
    const nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
    const ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
    const nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    const len = Math.hypot(nx, ny, nz) || 1;
    view.setFloat32(offset, nx / len, true);
    view.setFloat32(offset + 4, ny / len, true);
    view.setFloat32(offset + 8, nz / len, true);
    writeVertex(view, offset + 12, ax, ay, az);
    writeVertex(view, offset + 24, bx, by, bz);
    writeVertex(view, offset + 36, cx, cy, cz);
    view.setUint16(offset + 48, 0, true);
    offset += 50;
  }
  return new Uint8Array(buffer);
}

function writeVertex(view: DataView, offset: number, x: number, y: number, z: number) {
  view.setFloat32(offset, x, true);
  view.setFloat32(offset + 4, y, true);
  view.setFloat32(offset + 8, z, true);
}

export function modelToBinaryStl(model: BowlModel): Uint8Array {
  return meshToBinaryStl(concatMeshes(model.parts.map((part) => part.mesh)));
}

export function exportFileStem(params: BowlParams): string {
  const d = Math.round(params.bodyDiameter);
  const h = Math.round(params.height);
  const w = params.wallThickness.toFixed(1).replace(".", "p");
  const name = params.text.trim().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");
  const insert = Math.round(params.insertLipDiameter);
  return `bowl_d${d}_h${h}_w${w}_i${insert}${name ? `_${name}` : ""}`;
}

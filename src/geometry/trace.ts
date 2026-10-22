import type { Polygon } from "./icons";

function closeRing(pts: Polygon): Polygon {
  if (pts.length < 2) return pts;
  const first = pts[0];
  const last = pts[pts.length - 1];
  if (Math.hypot(first[0] - last[0], first[1] - last[1]) > 0.4) pts.push([first[0], first[1]]);
  return pts;
}

/** Marching-squares outline of dark / opaque pixels. Browser-only. */
export async function tracePngFile(file: File, threshold = 0.55): Promise<Polygon[]> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const size = 160;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return [];
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size, size);
    const scale = Math.min(size / img.width, size / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
    const data = ctx.getImageData(0, 0, size, size).data;
    const solid = new Uint8Array(size * size);
    for (let i = 0; i < solid.length; i++) {
      const r = data[i * 4];
      const g = data[i * 4 + 1];
      const b = data[i * 4 + 2];
      const a = data[i * 4 + 3] / 255;
      const lum = (r + g + b) / (3 * 255);
      solid[i] = a > 0.2 && lum < threshold ? 1 : 0;
    }
    return marchingSquares(solid, size);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not read image"));
    img.src = url;
  });
}

function marchingSquares(solid: Uint8Array, n: number): Polygon[] {
  const rings: Polygon[] = [];
  const seen = new Set<string>();
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= n || y >= n ? 0 : solid[y * n + x]);

  for (let y = 0; y < n - 1; y++) {
    for (let x = 0; x < n - 1; x++) {
      const code = at(x, y) | (at(x + 1, y) << 1) | (at(x + 1, y + 1) << 2) | (at(x, y + 1) << 3);
      if (code === 0 || code === 15) continue;
      const key = `${x}:${y}:${code}`;
      if (seen.has(key)) continue;
      const ring = traceRing(solid, n, x, y);
      if (ring.pts.length >= 8) {
        for (const cell of ring.cells) seen.add(cell);
        rings.push(closeRing(ring.pts));
      }
    }
  }
  return rings;
}

function traceRing(solid: Uint8Array, n: number, sx: number, sy: number): { pts: Polygon; cells: string[] } {
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= n || y >= n ? 0 : solid[y * n + x]);
  const pts: Polygon = [];
  const cells: string[] = [];
  let x = sx;
  let y = sy;
  let guard = 0;
  while (guard++ < n * n) {
    const code = at(x, y) | (at(x + 1, y) << 1) | (at(x + 1, y + 1) << 2) | (at(x, y + 1) << 3);
    cells.push(`${x}:${y}:${code}`);
    pts.push([x + 0.5, -(y + 0.5)]);
    if (code === 1 || code === 5 || code === 13) y -= 1;
    else if (code === 2 || code === 3 || code === 7) x += 1;
    else if (code === 4 || code === 6 || code === 14) y += 1;
    else x -= 1;
    if (x === sx && y === sy) break;
    if (x < 0 || y < 0 || x >= n - 1 || y >= n - 1) break;
  }
  return { pts, cells };
}

import type { IconKind } from "./types";

export type Point = [number, number];
export type Polygon = Point[];

const MIN_FEATURE_MM = 0.8;

function circle(cx: number, cy: number, r: number, n = 20): Polygon {
  const pts: Polygon = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return pts;
}

function ellipse(cx: number, cy: number, rx: number, ry: number, n = 22): Polygon {
  const pts: Polygon = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  return pts;
}

/** Built-in marks, centered near the origin, roughly 10 mm tall. */
export function libraryPolygons(kind: Exclude<IconKind, "custom">): Polygon[] {
  if (kind === "paw") {
    return [
      ellipse(0, -1.6, 2.7, 2.2),
      ellipse(-2.6, 2.2, 1.15, 1.45),
      ellipse(-0.9, 3.1, 1.1, 1.4),
      ellipse(0.9, 3.1, 1.1, 1.4),
      ellipse(2.6, 2.2, 1.15, 1.45),
    ];
  }
  if (kind === "heart") {
    const pts: Polygon = [];
    for (let i = 0; i <= 40; i++) {
      const t = (i / 40) * Math.PI * 2;
      const x = 16 * Math.sin(t) ** 3;
      const y =
        13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
      pts.push([x * 0.22, y * 0.22]);
    }
    return [pts];
  }
  if (kind === "star") {
    const pts: Polygon = [];
    for (let i = 0; i < 10; i++) {
      const a = (i * Math.PI) / 5 - Math.PI / 2;
      const r = i % 2 === 0 ? 4.6 : 1.9;
      pts.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    return [pts];
  }
  if (kind === "bone") {
    return [
      [
        [-4.4, -1.05],
        [-3.2, -1.05],
        [3.2, -1.05],
        [4.4, -1.05],
        [5.1, -1.9],
        [5.9, -1.15],
        [5.9, 1.15],
        [5.1, 1.9],
        [4.4, 1.05],
        [3.2, 1.05],
        [-3.2, 1.05],
        [-4.4, 1.05],
        [-5.1, 1.9],
        [-5.9, 1.15],
        [-5.9, -1.15],
        [-5.1, -1.9],
      ],
    ];
  }
  if (kind === "fish") {
    return [
      [
        [-4.6, 0],
        [-3.2, 2.3],
        [-0.4, 2.8],
        [2.4, 1.6],
        [3.4, 0.6],
        [5.4, 2.2],
        [4.6, 0],
        [5.4, -2.2],
        [3.4, -0.6],
        [2.4, -1.6],
        [-0.4, -2.8],
        [-3.2, -2.3],
      ],
    ];
  }
  if (kind === "cat") {
    return [
      [
        [0, 4.6],
        [-2.1, 2.4],
        [-3.8, 4.4],
        [-4.4, 1.2],
        [-3.6, -2.6],
        [-1.6, -4.2],
        [1.6, -4.2],
        [3.6, -2.6],
        [4.4, 1.2],
        [3.8, 4.4],
        [2.1, 2.4],
      ],
    ];
  }
  return [
    [
      [0, 4.8],
      [-2.4, 3.4],
      [-4.2, 3.8],
      [-3.8, 0.6],
      [-3.2, -2.8],
      [-1.4, -4.4],
      [1.4, -4.4],
      [3.2, -2.8],
      [3.8, 0.6],
      [4.2, 3.8],
      [2.4, 3.4],
    ],
  ];
}

export function boundsOf(polygons: Polygon[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const poly of polygons) {
    for (const [x, y] of poly) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  return { minX, minY, maxX, maxY };
}

export function scaleToHeight(polygons: Polygon[], heightMm: number): Polygon[] {
  const b = boundsOf(polygons);
  const h = Math.max(0.01, b.maxY - b.minY);
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  const s = heightMm / h;
  return polygons.map((poly) => poly.map(([x, y]) => [(x - cx) * s, (y - cy) * s] as Point));
}

export function rotatePolygons(polygons: Polygon[], deg: number): Polygon[] {
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return polygons.map((poly) => poly.map(([x, y]) => [x * c - y * s, x * s + y * c] as Point));
}

export function translatePolygons(polygons: Polygon[], dx: number, dy: number): Polygon[] {
  return polygons.map((poly) => poly.map(([x, y]) => [x + dx, y + dy] as Point));
}

function polygonArea(poly: Polygon): number {
  let sum = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    sum += a[0] * b[1] - b[0] * a[1];
  }
  return sum / 2;
}

function perimeter(poly: Polygon): number {
  let len = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    len += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return len;
}

/** True when the thinnest closed outline is below a printable 0.8 mm feature. */
export function hasThinFeatures(polygons: Polygon[], minMm = MIN_FEATURE_MM): boolean {
  if (!polygons.length) return true;
  for (const poly of polygons) {
    if (poly.length < 3) return true;
    const area = Math.abs(polygonArea(poly));
    const peri = perimeter(poly);
    if (peri < 1e-6) return true;
    const hydraulic = (2 * area) / peri;
    const b = boundsOf([poly]);
    const span = Math.min(b.maxX - b.minX, b.maxY - b.minY);
    if (hydraulic < minMm * 0.45 || span < minMm) return true;
  }
  return false;
}

export function isClosedPrintable(polygons: Polygon[]): boolean {
  if (!polygons.length) return false;
  return polygons.every((poly) => poly.length >= 3 && Math.abs(polygonArea(poly)) > 0.05);
}

function closeRing(pts: Polygon): Polygon {
  if (pts.length < 2) return pts;
  const first = pts[0];
  const last = pts[pts.length - 1];
  if (Math.hypot(first[0] - last[0], first[1] - last[1]) > 0.02) pts.push([first[0], first[1]]);
  return pts;
}

function sampleCubic(p0: Point, p1: Point, p2: Point, p3: Point, steps: number): Polygon {
  const out: Polygon = [];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    const x = u ** 3 * p0[0] + 3 * u ** 2 * t * p1[0] + 3 * u * t ** 2 * p2[0] + t ** 3 * p3[0];
    const y = u ** 3 * p0[1] + 3 * u ** 2 * t * p1[1] + 3 * u * t ** 2 * p2[1] + t ** 3 * p3[1];
    out.push([x, y]);
  }
  return out;
}

function sampleQuad(p0: Point, p1: Point, p2: Point, steps: number): Polygon {
  const out: Polygon = [];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    out.push([u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]]);
  }
  return out;
}

function nextNumber(src: string, i: number): { value: number; i: number } | null {
  while (i < src.length && /[\s,]/.test(src[i])) i += 1;
  const match = src.slice(i).match(/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/);
  if (!match) return null;
  return { value: Number(match[0]), i: i + match[0].length };
}

function readNums(src: string, start: number, count: number): { nums: number[]; i: number } {
  const nums: number[] = [];
  let i = start;
  while (nums.length < count) {
    const next = nextNumber(src, i);
    if (!next) break;
    nums.push(next.value);
    i = next.i;
  }
  return { nums, i };
}

/** Parse a subset of SVG path `d` into closed rings. */
export function pathToPolygons(d: string): Polygon[] {
  const contours: Polygon[] = [];
  let current: Polygon = [];
  let i = 0;
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  let lastCmd = "";
  const push = (x: number, y: number) => {
    const last = current[current.length - 1];
    if (!last || Math.hypot(last[0] - x, last[1] - y) > 0.01) current.push([x, y]);
    cx = x;
    cy = y;
  };
  const flush = (forceClose: boolean) => {
    if (current.length < 3) {
      current = [];
      return;
    }
    const first = current[0];
    const last = current[current.length - 1];
    const alreadyClosed = Math.hypot(first[0] - last[0], first[1] - last[1]) <= 0.05;
    if (!forceClose && !alreadyClosed) {
      current = [];
      return;
    }
    contours.push(forceClose ? closeRing(current) : current);
    current = [];
  };

  while (i < d.length) {
    const ch = d[i];
    if (/[A-Za-z]/.test(ch)) {
      lastCmd = ch;
      i += 1;
    } else if (/[\s,]/.test(ch)) {
      i += 1;
      continue;
    } else if (!lastCmd) {
      i += 1;
      continue;
    }
    const rel = lastCmd === lastCmd.toLowerCase();
    const cmd = lastCmd.toUpperCase();
    if (cmd === "M") {
      const { nums, i: ni } = readNums(d, i, 2);
      i = ni;
      if (nums.length < 2) continue;
      flush(false);
      const x = rel ? cx + nums[0] : nums[0];
      const y = rel ? cy + nums[1] : nums[1];
      sx = x;
      sy = y;
      push(x, y);
      lastCmd = rel ? "l" : "L";
    } else if (cmd === "L") {
      const { nums, i: ni } = readNums(d, i, 2);
      i = ni;
      if (nums.length < 2) continue;
      push(rel ? cx + nums[0] : nums[0], rel ? cy + nums[1] : nums[1]);
    } else if (cmd === "H") {
      const { nums, i: ni } = readNums(d, i, 1);
      i = ni;
      if (!nums.length) continue;
      push(rel ? cx + nums[0] : nums[0], cy);
    } else if (cmd === "V") {
      const { nums, i: ni } = readNums(d, i, 1);
      i = ni;
      if (!nums.length) continue;
      push(cx, rel ? cy + nums[0] : nums[0]);
    } else if (cmd === "C") {
      const { nums, i: ni } = readNums(d, i, 6);
      i = ni;
      if (nums.length < 6) continue;
      const p1: Point = [rel ? cx + nums[0] : nums[0], rel ? cy + nums[1] : nums[1]];
      const p2: Point = [rel ? cx + nums[2] : nums[2], rel ? cy + nums[3] : nums[3]];
      const p3: Point = [rel ? cx + nums[4] : nums[4], rel ? cy + nums[5] : nums[5]];
      for (const pt of sampleCubic([cx, cy], p1, p2, p3, 8)) push(pt[0], pt[1]);
    } else if (cmd === "Q") {
      const { nums, i: ni } = readNums(d, i, 4);
      i = ni;
      if (nums.length < 4) continue;
      const p1: Point = [rel ? cx + nums[0] : nums[0], rel ? cy + nums[1] : nums[1]];
      const p2: Point = [rel ? cx + nums[2] : nums[2], rel ? cy + nums[3] : nums[3]];
      for (const pt of sampleQuad([cx, cy], p1, p2, 6)) push(pt[0], pt[1]);
    } else if (cmd === "Z") {
      push(sx, sy);
      flush(true);
      cx = sx;
      cy = sy;
    } else {
      const skip = readNums(d, i, 8);
      i = skip.i || i + 1;
    }
  }
  flush(false);
  return contours.map((c) => (polygonArea(c) < 0 ? [...c].reverse() : c));
}

export function svgTextToPolygons(svgText: string): { polygons: Polygon[]; closed: boolean } {
  const polygons: Polygon[] = [];
  const pathRe = /<path\b[^>]*\bd\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = pathRe.exec(svgText))) {
    polygons.push(...pathToPolygons(match[1]));
  }
  const polyRe = /<polygon\b[^>]*\bpoints\s*=\s*["']([^"']+)["'][^>]*>/gi;
  while ((match = polyRe.exec(svgText))) {
    const pts = match[1]
      .trim()
      .split(/[\s,]+/)
      .map(Number)
      .filter((n) => Number.isFinite(n));
    const ring: Polygon = [];
    for (let i = 0; i + 1 < pts.length; i += 2) ring.push([pts[i], -pts[i + 1]]);
    if (ring.length >= 3) polygons.push(closeRing(ring));
  }
  const circleRe = /<circle\b[^>]*>/gi;
  while ((match = circleRe.exec(svgText))) {
    const tag = match[0];
    const cx = Number(/cx\s*=\s*["']?(-?[\d.]+)/i.exec(tag)?.[1] ?? 0);
    const cy = Number(/cy\s*=\s*["']?(-?[\d.]+)/i.exec(tag)?.[1] ?? 0);
    const r = Number(/r\s*=\s*["']?(-?[\d.]+)/i.exec(tag)?.[1] ?? 0);
    if (r > 0.05) polygons.push(circle(cx, -cy, r));
  }
  const rectRe = /<rect\b[^>]*>/gi;
  while ((match = rectRe.exec(svgText))) {
    const tag = match[0];
    const x = Number(/[^-]x\s*=\s*["']?(-?[\d.]+)/i.exec(tag)?.[1] ?? /x\s*=\s*["']?(-?[\d.]+)/i.exec(tag)?.[1] ?? 0);
    const y = Number(/y\s*=\s*["']?(-?[\d.]+)/i.exec(tag)?.[1] ?? 0);
    const w = Number(/width\s*=\s*["']?(-?[\d.]+)/i.exec(tag)?.[1] ?? 0);
    const h = Number(/height\s*=\s*["']?(-?[\d.]+)/i.exec(tag)?.[1] ?? 0);
    if (w > 0.05 && h > 0.05) {
      polygons.push([
        [x, -y],
        [x + w, -y],
        [x + w, -(y + h)],
        [x, -(y + h)],
      ]);
    }
  }
  return { polygons, closed: isClosedPrintable(polygons) };
}

export async function parseSvgFile(file: File): Promise<{ polygons: Polygon[]; closed: boolean; name: string }> {
  const text = await file.text();
  const parsed = svgTextToPolygons(text);
  return { ...parsed, name: file.name };
}

export { MIN_FEATURE_MM };

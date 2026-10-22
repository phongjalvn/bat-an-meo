import type { Font, PathCommand } from "opentype.js";

type Point = [number, number];

function commandPoints(commands: PathCommand[]): Point[][] {
  const contours: Point[][] = [];
  let current: Point[] = [];
  let cx = 0;
  let cy = 0;
  let start: Point = [0, 0];

  const push = (x: number, y: number) => {
    const last = current[current.length - 1];
    if (!last || Math.hypot(last[0] - x, last[1] - y) > 0.01) {
      current.push([x, y]);
    }
    cx = x;
    cy = y;
  };

  for (const cmd of commands) {
    if (cmd.type === "M") {
      if (current.length > 2) contours.push(current);
      current = [];
      start = [cmd.x, cmd.y];
      push(cmd.x, cmd.y);
    } else if (cmd.type === "L") {
      push(cmd.x, cmd.y);
    } else if (cmd.type === "C") {
      const steps = 8;
      const x0 = cx;
      const y0 = cy;
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const u = 1 - t;
        const x =
          u * u * u * x0 +
          3 * u * u * t * cmd.x1 +
          3 * u * t * t * cmd.x2 +
          t * t * t * cmd.x;
        const y =
          u * u * u * y0 +
          3 * u * u * t * cmd.y1 +
          3 * u * t * t * cmd.y2 +
          t * t * t * cmd.y;
        push(x, y);
      }
    } else if (cmd.type === "Q") {
      const steps = 6;
      const x0 = cx;
      const y0 = cy;
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const u = 1 - t;
        const x = u * u * x0 + 2 * u * t * cmd.x1 + t * t * cmd.x;
        const y = u * u * y0 + 2 * u * t * cmd.y1 + t * t * cmd.y;
        push(x, y);
      }
    } else if (cmd.type === "Z") {
      push(start[0], start[1]);
      if (current.length > 2) contours.push(current);
      current = [];
    }
  }
  if (current.length > 2) contours.push(current);
  return contours;
}

function area(poly: Point[]): number {
  let sum = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    sum += a[0] * b[1] - b[0] * a[1];
  }
  return sum / 2;
}

function flipY(poly: Point[]): Point[] {
  return poly.map(([x, y]) => [x, -y]);
}

export function fontPolygons(font: Font, text: string, fontSize: number): Point[][] {
  const path = font.getPath(text, 0, 0, fontSize);
  const contours = commandPoints(path.commands).map(flipY).filter((c) => c.length >= 3);
  // CrossSection unions overlapping contours and treats holes by fill rule.
  return contours.map((c) => (area(c) < 0 ? [...c].reverse() : c));
}

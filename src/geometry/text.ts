import type { Font, PathCommand } from "opentype.js";
import type { IconSlot } from "./types";
import {
  boundsOf,
  hasThinFeatures,
  libraryPolygons,
  rotatePolygons,
  scaleToHeight,
  translatePolygons,
  type Polygon,
} from "./icons";

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
        const x = u * u * u * x0 + 3 * u * u * t * cmd.x1 + 3 * u * t * t * cmd.x2 + t * t * t * cmd.x;
        const y = u * u * u * y0 + 3 * u * u * t * cmd.y1 + 3 * u * t * t * cmd.y2 + t * t * t * cmd.y;
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
  // Reverse the entire glyph winding together. Reversing each contour
  // independently fills the counters in B, o, 0 and Vietnamese letters.
  const largest = contours.reduce<Point[] | null>((best, c) => !best || Math.abs(area(c)) > Math.abs(area(best)) ? c : best, null);
  return largest && area(largest) < 0 ? contours.map(c => [...c].reverse()) : contours;
}

function centerPolygons(polygons: Polygon[]): Polygon[] {
  const b = boundsOf(polygons);
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  return translatePolygons(polygons, -cx, -cy);
}

export interface DecorLayout {
  polygons: Polygon[];
  warnings: string[];
}

/** Compose name, optional second line, and icons into one unwrapped wall drawing. */
export function layoutDecorations(
  font: Font | null,
  text: string,
  textLine2: string,
  fontSize: number,
  icons: IconSlot[],
): DecorLayout {
  const warnings: string[] = [];
  const parts: Polygon[] = [];
  const line1 = text.trim();
  const line2 = textLine2.trim();
  let name: Polygon[] = [];
  if (font && line1) name = centerPolygons(fontPolygons(font, line1, fontSize));
  const nameBox = boundsOf(name);

  for (const icon of icons) {
    if (!icon.enabled) continue;
    let raw: Polygon[] = [];
    if (icon.kind === "custom") {
      raw = icon.customPolygons ?? [];
      if (!raw.length) {
        warnings.push("icon-empty");
        continue;
      }
    } else {
      raw = libraryPolygons(icon.kind);
    }
    let shaped = scaleToHeight(raw, icon.sizeMm);
    shaped = rotatePolygons(shaped, icon.rotationDeg);
    if (hasThinFeatures(shaped)) {
      warnings.push("icon-thin");
    }
    const box = boundsOf(shaped);
    const iw = box.maxX - box.minX;
    const gap = Math.max(3, icon.sizeMm * 0.28);
    let dx = 0;
    let dy = 0;
    if (icon.anchor === "left") dx = nameBox.minX - gap - iw / 2;
    else if (icon.anchor === "right") dx = nameBox.maxX + gap + iw / 2;
    else dy = nameBox.maxY + gap + (box.maxY - box.minY) / 2;
    parts.push(...translatePolygons(shaped, dx, dy));
  }

  let stacked = [...name, ...parts];
  if (font && line2) {
    const second = centerPolygons(fontPolygons(font, line2, Math.max(7, fontSize * 0.38)));
    const nameBottom = name.length ? nameBox.minY : boundsOf(parts).minY;
    const secondBox = boundsOf(second);
    const gap = fontSize * 0.18;
    stacked = [
      ...name,
      ...parts,
      ...translatePolygons(second, 0, nameBottom - gap - (secondBox.maxY - secondBox.minY) / 2),
    ];
  }

  const combined = centerPolygons(stacked);
  return { polygons: combined, warnings };
}

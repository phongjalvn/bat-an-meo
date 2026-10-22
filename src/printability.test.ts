import { describe, expect, it } from "vitest";
import { buildBowl, initEngine } from "./geometry/engine";
import { isPrintableManifold, edgeManifoldCheck } from "./geometry/manifold-check";
import { DEFAULT_PARAMS, normalizeParams, PARAM_LIMITS, type BowlParams } from "./geometry/types";

const custom = (overrides: Partial<BowlParams>) => normalizeParams({ ...DEFAULT_PARAMS, insertSize: "custom", linkBodyToInsert: false, ...overrides });

describe("printable parameter constraints", () => {
  it("uses whole millimetres while preserving manufacturing tolerances", () => {
    const p = custom({ height: 102.9, trayHeight: 60.4, islandHeight: 25.7,
      mouthShrink: 11.3, fontSize: 25.6, fitClearance: 0.45, insertClearance: 0.4,
      wallThickness: 3.2, bottomThickness: 2.4, embossDepth: 1.1 });
    for (const key of ["bodyDiameter", "height", "trayDiameter", "trayHeight", "islandHeight", "mouthShrink", "fontSize"] as const) {
      expect(Number.isInteger(p[key]), key).toBe(true);
    }
    expect(p.fitClearance).toBe(0.45);
    expect(p.insertClearance).toBe(0.4);
    expect(p.wallThickness).toBe(3.2);
    expect(p.bottomThickness).toBe(2.4);
    expect(p.embossDepth).toBe(1.1);
  });

  it("retains a backing wall behind engraved letters", () => {
    const p = custom({ wallThickness: 1.6, bottomThickness: 1.6, embossDepth: 4 });
    expect(p.wallThickness).toBeGreaterThanOrEqual(2.4);
    expect(p.bottomThickness).toBeGreaterThanOrEqual(2.4);
    expect(p.wallThickness - p.embossDepth).toBeGreaterThanOrEqual(1.2 - 1e-6);
  });

  it("keeps a full width moat and a floor below the requested depth", () => {
    const p = custom({ bodyDiameter: 300, trayDiameter: 110, trayHeight: 16, moatWidth: 20, moatGap: 24, moatDepth: 22 });
    const support = p.bodyDiameter / 2 * 0.772 + 3 * p.insertLipDiameter / 130;
    const trayWall = Math.max(1.6, Math.min(2.4, p.wallThickness * 2 / 3));
    expect(p.trayDiameter / 2 - trayWall - 0.5).toBeGreaterThanOrEqual(support + p.moatGap + p.moatWidth);
    expect(p.trayHeight * 36.8 / 60 - p.moatDepth).toBeGreaterThanOrEqual(p.bottomThickness + 1);
  });

  it("keeps insert measurements ordered and leaves a supporting lip", () => {
    const p = custom({ insertLipDiameter: 90, insertMouthDiameter: 220, insertBaseDiameter: 180, mouthShrink: 40, bodyDiameter: 90 });
    const seat = p.insertMouthDiameter / 2 + 0.7 + p.insertClearance;
    expect(p.insertLipDiameter / 2 - seat).toBeGreaterThanOrEqual(2);
    expect(p.insertBaseDiameter).toBeLessThanOrEqual(p.insertMouthDiameter - 4);
    expect(p.bodyDiameter / 2 - p.mouthShrink).toBeGreaterThanOrEqual(p.insertLipDiameter / 2 + p.wallThickness + 1);
  });

  it("raises a short body to clear a deep insert and the support", () => {
    const p = custom({ height: 40, insertHeight: 80, islandHeight: 90, tiltDeg: 15 });
    const lift = 6 * p.insertLipDiameter / 130 + p.fitClearance;
    const needed = p.insertHeight + Math.max(4, p.islandHeight - lift) + p.insertLipDiameter / 2 * Math.sin(p.tiltDeg * Math.PI / 180) + 3;
    expect(p.height).toBeGreaterThanOrEqual(needed);
  });

  it("keeps the base fillet below half the actual tray height", () => {
    const p = custom({ moatEnabled: false, trayHeight: 16, wallThickness: 6, bottomThickness: 6, rimRadius: 10 });
    expect(p.rimRadius * 2).toBeLessThan(p.trayHeight * 36.8 / 60);
  });

  it("repairs non-finite and out of range saved values", () => {
    const p = custom({ bodyDiameter: Infinity, height: NaN, fitClearance: -5, ribCount: 19.7 });
    for (const key of Object.keys(PARAM_LIMITS) as Array<keyof typeof PARAM_LIMITS>) {
      expect(Number.isFinite(p[key]), key).toBe(true);
      expect(p[key], key).toBeGreaterThanOrEqual(PARAM_LIMITS[key].min);
      expect(p[key], key).toBeLessThanOrEqual(PARAM_LIMITS[key].max);
    }
    expect(Number.isInteger(p.ribCount)).toBe(true);
    expect(custom(p)).toEqual(p);
  });
});


describe("boundary geometry", () => {
  it("builds closed solids for the smallest insert with conflicting dimensions", async () => {
    await initEngine();
    const model = await buildBowl({ ...DEFAULT_PARAMS, insertSize: "custom", linkBodyToInsert: false,
      insertLipDiameter: 90, insertMouthDiameter: 220, insertBaseDiameter: 180,
      bodyDiameter: 90, height: 40, wallThickness: 1.6, bottomThickness: 1.6,
      mouthShrink: 40, trayDiameter: 110, trayHeight: 16,
      moatWidth: 20, moatGap: 24, moatDepth: 22, text: "", textLine2: "", icons: [] });
    expect(model.moatEnabled).toBe(true);
    expect(model.moatWidth).toBeCloseTo(20, 3);
    for (const part of model.parts) expect(isPrintableManifold(part.mesh), `${part.name}: ${edgeManifoldCheck(part.mesh).reason}`).toBe(true);
  });

  it("builds a large, deep insert at maximum tilt without open boundaries", async () => {
    const model = await buildBowl({ ...DEFAULT_PARAMS, insertSize: "custom", linkBodyToInsert: false,
      insertLipDiameter: 260, insertMouthDiameter: 220, insertHeight: 80,
      bodyDiameter: 380, height: 40, islandHeight: 90,
      wallThickness: 6, bottomThickness: 6, rimRadius: 10,
      trayDiameter: 110, trayHeight: 16, moatWidth: 20, moatGap: 24, moatDepth: 22,
      tiltDeg: 15, text: "", textLine2: "", icons: [] });
    expect(model.moatWidth).toBeCloseTo(20, 3);
    for (const part of model.parts) expect(isPrintableManifold(part.mesh), `${part.name}: ${edgeManifoldCheck(part.mesh).reason}`).toBe(true);
  });
});

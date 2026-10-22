import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, beforeAll } from "vitest";
import JSZip from "jszip";
import { parse } from "opentype.js";
import { DEFAULT_PARAMS, applyInsertSize, minHolderDiameter, minTrayDiameter, normalizeParams } from "./geometry/types";
import { buildBowl, initEngine, resolvedDims } from "./geometry/engine";
import { isPrintableManifold } from "./geometry/manifold-check";
import { isClosedPrintable, pathToPolygons, svgTextToPolygons } from "./geometry/icons";
import { exportFileStem, modelToBinaryStl } from "./export/stl";
import { REQUIRED_3MF_FILES, buildThreeMf } from "./export/threemf";
import { PRESETS } from "./presets";

const fontBytes = readFileSync(resolve("public/fonts/NotoSans-Regular.ttf"));
const font = parse(fontBytes.buffer.slice(fontBytes.byteOffset, fontBytes.byteOffset + fontBytes.byteLength));

beforeAll(async () => {
  await initEngine();
});

describe("default pet bowl export", () => {
  it("generates a non-empty manifold STL with key dimensions in the filename", async () => {
    const model = await buildBowl(DEFAULT_PARAMS, font);
    expect(model.parts.length).toBeGreaterThanOrEqual(2);
    expect(model.triangleCount).toBeGreaterThan(200);
    expect(model.capacityMl).toBeGreaterThan(20);
    expect(model.solidVolumeMm3).toBeGreaterThan(1000);
    expect(model.manifold).toBe(true);
    expect(model.insertRimMm).toBe(130);
    expect(model.insertMouthMm).toBe(110);
    expect(model.insertBaseMm).toBe(70);
    expect(model.insertHeightMm).toBe(40);
    expect(model.insert?.positions.length).toBeGreaterThan(300);
    expect(model.parts.map((p) => p.name as string)).not.toContain("moat");
    expect(model.parts.map((p) => p.name as string)).not.toContain("stand");
    expect(Math.abs(model.width - model.depth)).toBeLessThan(8);

    for (const part of model.parts) {
      expect(isPrintableManifold(part.mesh)).toBe(true);
    }

    const stl = modelToBinaryStl(model);
    expect(stl.byteLength).toBeGreaterThan(84 + 50);
    const triCount = new DataView(stl.buffer, stl.byteOffset, stl.byteLength).getUint32(80, true);
    expect(triCount).toBeGreaterThan(100);
    expect(model.parts.some((p) => p.name === "text")).toBe(true);
    expect(exportFileStem(DEFAULT_PARAMS)).toMatch(/bowl_d190_h103_w3p0_i130(_Boom)?/);
  });

  it("exports Bambu Lab and Snapmaker U1 3MF projects with part-to-filament mapping", async () => {
    const model = await buildBowl(DEFAULT_PARAMS, font);

    const bambu = await buildThreeMf(model, "bambu");
    const u1 = await buildThreeMf(model, "snapmaker-u1");

    await assertThreeMf(bambu.bytes, {
      printer: "Bambu Lab P1S",
      filamentMaps: "1 1 1 1",
      minObjects: 2,
    });
    await assertThreeMf(u1.bytes, {
      printer: "Snapmaker U1",
      filamentMaps: "1 2 3 4",
      minObjects: 2,
    });

    expect(bambu.parts.map((p) => [p.name, p.extruder])).toEqual([
      ["body", 1],
      ["base", 2],
      ["text", 3],
    ]);
    expect(u1.parts.map((p) => [p.name, p.extruder])).toEqual([
      ["body", 1],
      ["base", 2],
      ["text", 3],
    ]);
    expect(bambu.parts.map((p) => p.name)).not.toContain("moat");
    expect(bambu.filamentColours[0]).toBe("#F7F1E3");
    expect(bambu.filamentColours[1]).toBe("#C4A574");
    expect(bambu.filamentColours[2]).toBe("#6B4423");
  });
});

describe("single bowl only", () => {
  it("ignores a saved double-bowl flag and never emits a paired body", () => {
    const loaded = normalizeParams({
      doubleBowl: true,
      moatDistance: 8,
      standHeight: 40,
      footHeight: 22,
    });
    expect((loaded as { doubleBowl?: boolean }).doubleBowl).toBeUndefined();
    expect(loaded.moatGap).toBe(8);
    expect(loaded.trayHeight).toBe(22);
    expect(loaded.islandHeight).toBe(40);
  });

  it("builds one circular tray even when an old project asked for two bowls", async () => {
    const params = normalizeParams({ ...DEFAULT_PARAMS, doubleBowl: true } as typeof DEFAULT_PARAMS & {
      doubleBowl: boolean;
    });
    const model = await buildBowl(params, font);
    expect(model.parts.filter((p) => p.name === "body")).toHaveLength(1);
    expect(model.parts.filter((p) => p.name === "base")).toHaveLength(1);
    expect(Math.abs(model.width - model.depth)).toBeLessThan(10);
    expect(model.width).toBeGreaterThan(params.bodyDiameter - 4);
  });
});

describe("stainless insert sizes", () => {
  it("sizes the tapered pocket plus lip counterbore from the measured bowls", () => {
    const sizedSmall = applyInsertSize(DEFAULT_PARAMS, "small");
    const pSmall = resolvedDims(sizedSmall);
    expect(pSmall.insertRim).toBe(130);
    expect(pSmall.mouthInner).toBe(110);
    expect(pSmall.baseR * 2).toBe(70);
    expect(pSmall.insertHeight).toBe(40);
    expect(pSmall.pocketMouthR).toBeCloseTo(110 / 2 + pSmall.steel + pSmall.clearance, 4);
    expect(pSmall.pocketBaseR).toBeCloseTo(70 / 2 + pSmall.clearance, 4);
    expect(pSmall.pocketLipR).toBeCloseTo(130 / 2 + pSmall.clearance, 4);
    expect(pSmall.pocketLipR).toBeGreaterThan(pSmall.pocketMouthR);
    expect(pSmall.rx * 2).toBeGreaterThanOrEqual(minHolderDiameter(sizedSmall) - 0.01);
    expect(minHolderDiameter(sizedSmall)).toBeCloseTo(130 + 2 * sizedSmall.wallThickness + 2 * sizedSmall.insertClearance, 4);
    expect(pSmall.trayR * 2).toBeGreaterThanOrEqual(minTrayDiameter(sizedSmall) - 0.01);

    const sizedLarge = applyInsertSize({ ...DEFAULT_PARAMS, bodyDiameter: 150 }, "large");
    const pLarge = resolvedDims(sizedLarge);
    expect(pLarge.insertRim).toBe(190);
    expect(pLarge.mouthInner).toBe(160);
    expect(pLarge.baseR * 2).toBe(95);
    expect(pLarge.insertHeight).toBe(55);
    expect(sizedLarge.bodyDiameter).toBeGreaterThanOrEqual(minHolderDiameter(sizedLarge));
    expect(sizedLarge.bodyDiameter).toBeGreaterThanOrEqual(190 + 2 * sizedLarge.wallThickness);
    expect(pLarge.pocketLipR).toBeGreaterThan(pLarge.pocketMouthR);
  });

  it("keeps custom measured lip, mouth, base, and height", async () => {
    const custom = applyInsertSize(
      {
        ...DEFAULT_PARAMS,
        insertLipDiameter: 142,
        insertMouthDiameter: 118,
        insertBaseDiameter: 74,
        insertHeight: 43,
      },
      "custom",
    );
    expect(custom.insertSize).toBe("custom");
    expect(custom.insertLipDiameter).toBe(142);
    expect(custom.insertMouthDiameter).toBe(118);
    expect(custom.insertBaseDiameter).toBe(74);
    expect(custom.insertHeight).toBe(43);
    const model = await buildBowl(custom, font);
    expect(model.insertRimMm).toBe(142);
    expect(model.insertMouthMm).toBe(118);
    expect(model.insertBaseMm).toBe(74);
    expect(model.insertHeightMm).toBe(43);
    expect(model.insert).toBeTruthy();
    expect(model.manifold).toBe(true);
  });

  it("keeps a bottom floor under a tilted pocket so the insert cannot punch through", () => {
    const care = PRESETS.find((p) => p.id === "cat-care")!.params;
    const p = resolvedDims(care);
    const stem = p.extraDepth + p.insertHeight + p.lipT;
    const frontZ = p.zFace - p.topR * Math.tan(p.tiltRad) - stem * Math.cos(p.tiltRad);
    expect(p.extraDepth).toBeGreaterThanOrEqual(0.8);
    expect(frontZ).toBeGreaterThan(p.zFootTop + p.socketH + p.bottom - 2);
    expect(p.bottom).toBeGreaterThanOrEqual(1.6);
  });

  it("uses Small 11 cm on cat presets and Large 16 cm on dog presets", () => {
    const cat = PRESETS.find((p) => p.id === "small-cat")!;
    const dog = PRESETS.find((p) => p.id === "medium-dog")!;
    const care = PRESETS.find((p) => p.id === "cat-care")!;
    expect(cat.params.insertSize).toBe("small");
    expect(cat.params.insertLipDiameter).toBe(130);
    expect(dog.params.insertSize).toBe("large");
    expect(dog.params.insertLipDiameter).toBe(190);
    expect(care.params.moatEnabled).toBe(true);
    expect(care.params.tiltDeg).toBe(15);
    expect(care.params.insertSize).toBe("small");
    expect((cat.params as { doubleBowl?: boolean }).doubleBowl).toBeUndefined();
  });
});

describe("tray moat and centering fit", () => {
  it("cuts the water channel into the base instead of exporting a fourth filament part", async () => {
    const params = PRESETS.find((p) => p.id === "cat-care")!.params;
    const model = await buildBowl(params, font);
    expect(model.moatEnabled).toBe(true);
    expect(model.moatWaterMl).toBeGreaterThan(20);
    expect(model.tiltDeg).toBe(15);
    expect(model.stability.stable).toBe(true);
    expect(model.parts.map((p) => p.name)).toEqual(expect.arrayContaining(["body", "base"]));
    expect(model.parts.map((p) => p.name as string)).not.toContain("moat");
    expect(model.socketRadius).toBeCloseTo(model.pegRadius + model.fitClearance, 4);

    for (const part of model.parts) {
      expect(isPrintableManifold(part.mesh)).toBe(true);
      expect(part.volumeMm3).toBeGreaterThan(50);
    }

    const base = model.parts.find((p) => p.name === "base")!;
    const zs = extrema(base.mesh.positions, 2);
    expect(zs.max - zs.min).toBeGreaterThan(params.moatDepth + params.trayHeight * 0.4);

    const u1 = await buildThreeMf(model, "snapmaker-u1");
    expect(u1.parts.map((p) => [p.name, p.extruder])).toEqual(
      expect.arrayContaining([
        ["body", 1],
        ["base", 2],
      ]),
    );
    expect(u1.parts.map((p) => p.name)).not.toContain("moat");
    await assertThreeMf(u1.bytes, {
      printer: "Snapmaker U1",
      filamentMaps: "1 2 3 4",
      minObjects: 2,
    });
    const settings = (await JSZip.loadAsync(u1.bytes)).file("Metadata/model_settings.config");
    const xml = await settings!.async("string");
    expect(xml).not.toContain('key="name" value="moat"');

    const p = resolvedDims(params);
    expect(p.islandR / p.rx).toBeGreaterThan(0.78);
    expect(p.islandR / p.rx).toBeLessThan(0.86);
    expect(p.pegR / p.rx).toBeGreaterThan(0.64);
    expect(p.pegR / p.rx).toBeLessThan(0.73);
    expect(p.moatOuter - p.moatInner).toBeCloseTo(p.moatWidth, 4);
    expect(p.trayR).toBeGreaterThan(p.moatOuter + p.wall - 0.2);

    const waterTop = p.floorT + p.moatDepth;
    const ring = [...radiiNear(base.mesh.positions, p.floorT, 0.6), ...radiiNear(base.mesh.positions, waterTop, 0.6)];
    expect(ring.some((r) => Math.abs(r - p.moatInner) < 2.5)).toBe(true);
    expect(ring.some((r) => Math.abs(r - p.moatOuter) < 2.5)).toBe(true);
  });

  it("wraps name, second line, and icons on the cylinder", async () => {
    const params = {
      ...DEFAULT_PARAMS,
      text: "Winnie",
      textLine2: "30/04/2026",
      textStyle: "engrave" as const,
    };
    const model = await buildBowl(params, font);
    const text = model.parts.find((p) => p.name === "text");
    expect(text).toBeTruthy();
    const pos = text!.mesh.positions;
    let rmin = Infinity;
    let rmax = -Infinity;
    let spanX = 0;
    let spanY = 0;
    for (let i = 0; i < pos.length; i += 3) {
      const r = Math.hypot(pos[i], pos[i + 1]);
      rmin = Math.min(rmin, r);
      rmax = Math.max(rmax, r);
      spanX = Math.max(spanX, Math.abs(pos[i]));
      spanY = Math.max(spanY, Math.abs(pos[i + 1]));
    }
    expect(spanX).toBeGreaterThan(12);
    expect(spanY).toBeGreaterThan(12);
    expect(rmin).toBeGreaterThan(params.bodyDiameter / 2 - 18);
    expect(rmax - rmin).toBeGreaterThan(0.6);
    expect(text!.volumeMm3).toBeGreaterThan(80);

    const embossed = await buildBowl({ ...params, textStyle: "emboss" }, font);
    expect(embossed.parts.some((part) => part.name === "text")).toBe(true);
    expect(embossed.parts.find((part) => part.name === "text")!.volumeMm3).toBeGreaterThan(80);
  });
});

describe("reference silhouette", () => {
  it("keeps an upright circular wall and matches ref1/ref2 defaults", async () => {
    const model = await buildBowl(DEFAULT_PARAMS, font);
    const p = resolvedDims(DEFAULT_PARAMS);
    const body = model.parts.find((part) => part.name === "body")!;
    const base = model.parts.find((part) => part.name === "base")!;

    expect(p.rx * 2).toBeCloseTo(190, 4);
    expect(p.topR).toBeLessThan(p.rx - 3);
    expect(p.neckR * 2).toBeGreaterThan(160);
    expect(p.neckR * 2).toBeLessThan(172);
    expect(p.bodyH).toBeCloseTo(103, 4);
    expect(p.trayR - p.rx).toBeGreaterThanOrEqual(5);
    expect(p.trayR - p.rx).toBeLessThanOrEqual(12);
    expect(p.trayH).toBeGreaterThanOrEqual(25);
    expect(p.trayH).toBeLessThanOrEqual(36);
    expect(p.islandH).toBeLessThan(p.trayH - 8);
    expect(p.islandR * 2).toBeGreaterThan(148);
    expect(p.islandR * 2).toBeLessThan(160);
    expect(p.pegR * 2).toBeGreaterThan(125);
    expect(p.pegR * 2).toBeLessThan(135);
    expect(p.socketR * 2).toBeGreaterThan(126);
    expect(p.socketR * 2).toBeLessThan(136);
    expect(p.wall).toBeCloseTo(3, 4);

    const midLo = p.zFootTop + p.bodyH * 0.35;
    const midHi = p.zFootTop + p.bodyH * 0.55;
    const ring: number[] = [];
    let xMin = Infinity;
    let xMax = -Infinity;
    let yMin = Infinity;
    let yMax = -Infinity;
    let n = 0;
    for (let i = 0; i < body.mesh.positions.length; i += 3) {
      const z = body.mesh.positions[i + 2];
      if (z < midLo || z > midHi) continue;
      const x = body.mesh.positions[i];
      const y = body.mesh.positions[i + 1];
      const r = Math.hypot(x, y);
      if (r < p.neckR - 4) continue;
      ring.push(r);
      xMin = Math.min(xMin, x);
      xMax = Math.max(xMax, x);
      yMin = Math.min(yMin, y);
      yMax = Math.max(yMax, y);
      n++;
    }
    expect(ring.length).toBeGreaterThan(20);
    const rMin = Math.min(...ring);
    const rMax = Math.max(...ring);
    expect(rMax - rMin).toBeLessThan(10);
    expect(rMax).toBeLessThan(p.rx + 3);
    expect(rMin).toBeGreaterThan(p.topR - 4);
    expect(n).toBeGreaterThan(20);
    expect(Math.abs(xMax + xMin)).toBeLessThan(4);
    expect(Math.abs(yMax + yMin)).toBeLessThan(4);
    expect(Math.abs(xMax - xMin - (yMax - yMin))).toBeLessThan(8);

    const bodyVol = body.volumeMm3;
    const trayVol = base.volumeMm3;
    expect(bodyVol).toBeLessThan(350_000);
    expect(bodyVol).toBeGreaterThan(80_000);
    expect(trayVol).toBeLessThan(700_000);
    expect(model.solidVolumeMm3).toBeLessThan(1_100_000);

    expect(p.neckR).toBeLessThan(p.trayR - 8);
    const neckBand: number[] = [];
    for (let i = 0; i < body.mesh.positions.length; i += 3) {
      const z = body.mesh.positions[i + 2];
      if (z < p.islandH + 1 || z > p.trayH + 2) continue;
      const r = Math.hypot(body.mesh.positions[i], body.mesh.positions[i + 1]);
      if (r > p.socketR + 2) neckBand.push(r);
    }
    expect(neckBand.length).toBeGreaterThan(8);
    expect(Math.max(...neckBand)).toBeLessThan(p.trayR - 4);

    const insert = model.insert!;
    let izMax = -Infinity;
    let izMin = Infinity;
    for (let i = 2; i < insert.positions.length; i += 3) {
      izMax = Math.max(izMax, insert.positions[i]);
      izMin = Math.min(izMin, insert.positions[i]);
    }
    expect(izMax - p.zFront).toBeGreaterThan(-8);
    expect(izMax).toBeGreaterThan(p.zFront - 2);
  });
});

describe("icon outlines", () => {
  it("accepts a closed SVG path and rejects an open stroke", () => {
    const closed = pathToPolygons("M0 0 L10 0 L10 10 L0 10 Z");
    expect(isClosedPrintable(closed)).toBe(true);
    const fromFile = svgTextToPolygons(`<svg><path d="M 0 0 L 8 0 L 4 6 Z"/></svg>`);
    expect(fromFile.closed).toBe(true);
    const open = pathToPolygons("M0 0 L10 0 L10 10");
    expect(isClosedPrintable(open)).toBe(false);
  });
});

function radiiNear(positions: Float32Array, z: number, tol: number) {
  const rs: number[] = [];
  for (let i = 0; i < positions.length; i += 3) {
    if (Math.abs(positions[i + 2] - z) <= tol) rs.push(Math.hypot(positions[i], positions[i + 1]));
  }
  return rs;
}

function extrema(positions: Float32Array, axis: 0 | 1 | 2) {
  let min = Infinity;
  let max = -Infinity;
  for (let i = axis; i < positions.length; i += 3) {
    min = Math.min(min, positions[i]);
    max = Math.max(max, positions[i]);
  }
  return { min, max };
}

async function assertThreeMf(
  bytes: Uint8Array,
  expectMeta: { printer: string; filamentMaps: string; minObjects: number },
) {
  expect(bytes.byteLength).toBeGreaterThan(256);
  const zip = await JSZip.loadAsync(bytes);
  for (const name of REQUIRED_3MF_FILES) {
    expect(zip.file(name), name).toBeTruthy();
  }
  expect(zip.file("3D/Objects/bowl.model")).toBeTruthy();
  expect(zip.file("Metadata/plate_1.png")).toBeTruthy();

  const settings = JSON.parse(await zip.file("Metadata/project_settings.config")!.async("string"));
  expect(settings.printer_model).toBe(expectMeta.printer);
  expect(settings.filament_type).toEqual(["PLA", "PLA", "PLA", "PLA"]);

  const modelSettings = await zip.file("Metadata/model_settings.config")!.async("string");
  expect(modelSettings).toContain('key="extruder" value="1"');
  expect(modelSettings).toContain('key="extruder" value="2"');
  expect(modelSettings).toContain(`key="filament_maps" value="${expectMeta.filamentMaps}"`);
  expect(modelSettings).toContain("plater_id");
  expect(modelSettings).toContain("normal_part");

  const objectModel = await zip.file("3D/Objects/bowl.model")!.async("string");
  expect(objectModel).toContain("<vertex");
  expect(objectModel).toContain("<triangle");
  expect((objectModel.match(/<object /g) ?? []).length).toBeGreaterThanOrEqual(expectMeta.minObjects);
}

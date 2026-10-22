import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, beforeAll } from "vitest";
import JSZip from "jszip";
import { parse } from "opentype.js";
import { DEFAULT_PARAMS, applyInsertSize, minHolderDiameter } from "./geometry/types";
import { buildBowl, initEngine, resolvedDims } from "./geometry/engine";
import { isPrintableManifold } from "./geometry/manifold-check";
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
    expect(model.parts.some((p) => p.name === "moat")).toBe(false);

    for (const part of model.parts) {
      expect(isPrintableManifold(part.mesh)).toBe(true);
    }

    const stl = modelToBinaryStl(model);
    expect(stl.byteLength).toBeGreaterThan(84 + 50);
    const triCount = new DataView(stl.buffer, stl.byteOffset, stl.byteLength).getUint32(80, true);
    expect(triCount).toBeGreaterThan(100);
    expect(exportFileStem(DEFAULT_PARAMS)).toMatch(/bowl_d150_h72_w3p0_i130(_Bé-Mèo)?/);
  });

  it("exports Bambu Lab and Snapmaker U1 3MF projects with part-to-filament mapping", async () => {
    const model = await buildBowl(DEFAULT_PARAMS, font);

    const bambu = await buildThreeMf(model, "bambu");
    const u1 = await buildThreeMf(model, "snapmaker-u1");

    await assertThreeMf(bambu.bytes, {
      printer: "Bambu Lab P1S",
      filamentMaps: "1 1 1 1",
      minObjects: 3,
    });
    await assertThreeMf(u1.bytes, {
      printer: "Snapmaker U1",
      filamentMaps: "1 2 3 4",
      minObjects: 3,
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
    expect(bambu.filamentColours[0]).toBe("#F7F1E3");
    expect(bambu.filamentColours[1]).toBe("#C4A574");
    expect(bambu.filamentColours[2]).toBe("#6B4423");
    expect(bambu.filamentColours[3]).toBe("#4A90A4");
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
  });
});

describe("anti-hunch and anti-ant export", () => {
  it("exports a watertight moat as filament 4 and keeps every part manifold", async () => {
    const params = PRESETS.find((p) => p.id === "cat-care")!.params;
    const model = await buildBowl(params, font);
    expect(model.moatEnabled).toBe(true);
    expect(model.moatWaterMl).toBeGreaterThan(20);
    expect(model.tiltDeg).toBe(15);
    expect(model.stability.stable).toBe(true);
    expect(model.parts.map((p) => p.name)).toEqual(expect.arrayContaining(["body", "base", "text", "moat"]));

    for (const part of model.parts) {
      expect(isPrintableManifold(part.mesh)).toBe(true);
      expect(part.volumeMm3).toBeGreaterThan(50);
    }

    const moat = model.parts.find((p) => p.name === "moat")!;
    const zs = extrema(moat.mesh.positions, 2);
    expect(zs.max - zs.min).toBeGreaterThan(params.moatDepth + 1.2);

    const u1 = await buildThreeMf(model, "snapmaker-u1");
    expect(u1.parts.map((p) => [p.name, p.extruder])).toEqual(
      expect.arrayContaining([
        ["body", 1],
        ["base", 2],
        ["text", 3],
        ["moat", 4],
      ]),
    );
    await assertThreeMf(u1.bytes, {
      printer: "Snapmaker U1",
      filamentMaps: "1 2 3 4",
      minObjects: 4,
    });
    const settings = (await JSZip.loadAsync(u1.bytes)).file("Metadata/model_settings.config");
    const xml = await settings!.async("string");
    expect(xml).toContain('key="extruder" value="4"');
  });
});

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
  expect(modelSettings).toContain('key="extruder" value="3"');
  expect(modelSettings).toContain(`key="filament_maps" value="${expectMeta.filamentMaps}"`);
  expect(modelSettings).toContain("plater_id");
  expect(modelSettings).toContain("normal_part");

  const objectModel = await zip.file("3D/Objects/bowl.model")!.async("string");
  expect(objectModel).toContain("<vertex");
  expect(objectModel).toContain("<triangle");
  expect((objectModel.match(/<object /g) ?? []).length).toBeGreaterThanOrEqual(expectMeta.minObjects);
}

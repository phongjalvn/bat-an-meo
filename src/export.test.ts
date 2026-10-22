import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, beforeAll } from "vitest";
import JSZip from "jszip";
import { parse } from "opentype.js";
import { DEFAULT_PARAMS } from "./geometry/types";
import { buildBowl, initEngine } from "./geometry/engine";
import { isPrintableManifold } from "./geometry/manifold-check";
import { exportFileStem, modelToBinaryStl } from "./export/stl";
import { REQUIRED_3MF_FILES, buildThreeMf } from "./export/threemf";

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

    for (const part of model.parts) {
      expect(isPrintableManifold(part.mesh)).toBe(true);
    }

    const stl = modelToBinaryStl(model);
    expect(stl.byteLength).toBeGreaterThan(84 + 50);
    const triCount = new DataView(stl.buffer, stl.byteOffset, stl.byteLength).getUint32(80, true);
    expect(triCount).toBeGreaterThan(100);
    expect(exportFileStem(DEFAULT_PARAMS)).toMatch(/bowl_d130_h110_w3p0_Bé-Mèo|bowl_d130_h110_w3p0/);
  });

  it("exports Bambu Lab and Snapmaker U1 3MF projects with part-to-filament mapping", async () => {
    const model = await buildBowl(DEFAULT_PARAMS, font);

    const bambu = await buildThreeMf(model, "bambu");
    const u1 = await buildThreeMf(model, "snapmaker-u1");

    await assertThreeMf(bambu.bytes, {
      printer: "Bambu Lab P1S",
      filamentMaps: "1 1 1 1",
    });
    await assertThreeMf(u1.bytes, {
      printer: "Snapmaker U1",
      filamentMaps: "1 2 3 4",
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
  });
});

async function assertThreeMf(
  bytes: Uint8Array,
  expectMeta: { printer: string; filamentMaps: string },
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
  expect(modelSettings).toContain('plater_id');
  expect(modelSettings).toContain("normal_part");

  const objectModel = await zip.file("3D/Objects/bowl.model")!.async("string");
  expect(objectModel).toContain("<vertex");
  expect(objectModel).toContain("<triangle");
  expect((objectModel.match(/<object /g) ?? []).length).toBeGreaterThanOrEqual(3);
}

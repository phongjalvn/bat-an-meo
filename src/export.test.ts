import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, beforeAll } from "vitest";
import JSZip from "jszip";
import { parse } from "opentype.js";
import { DEFAULT_PARAMS as REFERENCE_DEFAULTS, applyInsertSize, minHolderDiameter, minTrayDiameter, normalizeParams } from "./geometry/types";
import { buildBowl, initEngine, resolvedDims } from "./geometry/engine";
import { isPrintableManifold } from "./geometry/manifold-check";
import { isClosedPrintable, pathToPolygons, svgTextToPolygons } from "./geometry/icons";
import { exportFileStem, modelToBinaryStl } from "./export/stl";
import { REQUIRED_3MF_FILES, buildThreeMf } from "./export/threemf";
import { fontPolygons } from "./geometry/text";
import { getEngine } from "./geometry/wasm";
import { PRESETS } from "./presets";

// Retain coverage of the optional parametric editor independently of the STL mode.
const DEFAULT_PARAMS = { ...REFERENCE_DEFAULTS, referenceShape: false };

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
    expect(Math.abs(model.width - model.depth)).toBeLessThan(24);

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
    expect(loaded.windowEnabled).toBe(true);
    expect(loaded.trayHeight).toBeCloseTo(60, 0);
    expect(loaded.islandHeight).toBeCloseTo(25.7, 0);

    const kept = normalizeParams({
      linkBodyToInsert: false,
      footHeight: 22,
      standHeight: 40,
      moatDistance: 8,
      bodyDiameter: 190,
      mouthShrink: 11,
    });
    expect(kept.trayHeight).toBe(22);
    expect(kept.islandHeight).toBe(40);
    expect(kept.moatGap).toBe(8);
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
  it("scales the frustum, lip opening, and tray from the reference insert", () => {
    const sizedSmall = applyInsertSize(DEFAULT_PARAMS, "small");
    const pSmall = resolvedDims(sizedSmall);
    expect(pSmall.insertRim).toBe(130);
    expect(pSmall.mouthInner).toBe(110);
    expect(pSmall.baseR * 2).toBe(70);
    expect(pSmall.insertHeight).toBe(40);
    expect(sizedSmall.bodyDiameter).toBeCloseTo(190, 4);
    expect(pSmall.topR * 2).toBeCloseTo(190, 4);
    expect(pSmall.footR * 2).toBeCloseTo(168, 4);
    expect(pSmall.footR).toBeLessThan(pSmall.topR - 4);
    expect(pSmall.openR * 2).toBeCloseTo(146.6, 1);
    expect(pSmall.flangeR * 2).toBeCloseTo(130.4, 0);
    expect(pSmall.wall).toBeCloseTo(3, 4);
    expect(pSmall.bodyH).toBeCloseTo(102.9, 4);
    expect(pSmall.trayR * 2).toBeCloseTo(190, 4);
    expect(pSmall.trayH).toBeCloseTo(60, 4);
    expect(pSmall.deckZ).toBeCloseTo(25.7, 4);
    expect(pSmall.trayR * 2).toBeGreaterThanOrEqual(minTrayDiameter(sizedSmall) - 0.01);
    expect(minHolderDiameter(sizedSmall)).toBeCloseTo(130 + 2 * sizedSmall.wallThickness + 2 * sizedSmall.insertClearance, 4);

    const sizedLarge = applyInsertSize({ ...DEFAULT_PARAMS, bodyDiameter: 190 }, "large");
    const pLarge = resolvedDims(sizedLarge);
    expect(pLarge.insertRim).toBe(190);
    expect(pLarge.mouthInner).toBe(160);
    expect(pLarge.baseR * 2).toBe(95);
    expect(pLarge.insertHeight).toBe(55);
    expect(sizedLarge.bodyDiameter).toBeCloseTo(190 * (190 / 130), 1);
    expect(pLarge.topR * 2).toBeCloseTo(sizedLarge.bodyDiameter, 4);
    expect(pLarge.openR * 2).toBeCloseTo(146.6 * (190 / 130), 0);
    expect(pLarge.footR).toBeLessThan(pLarge.topR);
    expect(sizedLarge.trayHeight).toBeCloseTo(60 * (190 / 130), 1);

    const manual = applyInsertSize({ ...DEFAULT_PARAMS, linkBodyToInsert: false, bodyDiameter: 210, height: 110 }, "small");
    expect(manual.linkBodyToInsert).toBe(false);
    expect(manual.bodyDiameter).toBe(210);
    expect(manual.height).toBe(110);
    expect(manual.trayDiameter).toBeGreaterThanOrEqual(minTrayDiameter(manual) - 0.01);
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

  it("keeps an inward foot flange and a top lip under the tilted cut", () => {
    const care = PRESETS.find((p) => p.id === "cat-care")!.params;
    const p = resolvedDims(care);
    expect(p.flangeR).toBeLessThan(p.footR - p.wall);
    expect(p.flangeH).toBeGreaterThan(2);
    expect(p.flangeH).toBeLessThan(6);
    expect(p.openR).toBeLessThan(p.topR - p.wall);
    expect(p.lipH).toBeGreaterThan(2);
    expect(p.zCut).toBe(p.bodyH);
    expect(p.bodyH).toBeGreaterThan(90);
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
    const params = { ...PRESETS.find((p) => p.id === "cat-care")!.params, referenceShape: false };
    const model = await buildBowl(params, font);
    expect(model.moatEnabled).toBe(true);
    expect(model.moatWaterMl).toBeGreaterThan(20);
    expect(model.tiltDeg).toBe(15);
    expect(model.stability.stable).toBe(true);
    expect(model.parts.map((p) => p.name)).toEqual(expect.arrayContaining(["body", "base"]));
    expect(model.parts.map((p) => p.name as string)).not.toContain("moat");
    expect(model.pegRadius).toBeGreaterThan(70);
    expect(model.socketRadius).toBeCloseTo(model.pegRadius + model.fitClearance, 4);

    for (const part of model.parts) {
      expect(isPrintableManifold(part.mesh)).toBe(true);
      expect(part.volumeMm3).toBeGreaterThan(50);
    }

    const base = model.parts.find((p) => p.name === "base")!;
    const zs = extrema(base.mesh.positions, 2);
    expect(zs.max - zs.min).toBeGreaterThan(55);
    expect(zs.max - zs.min).toBeLessThan(63);

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
    expect(p.moatOuter - p.moatInner).toBeGreaterThan(2);
    expect(p.moatOuter - p.moatInner).toBeLessThan(p.moatWidth + 0.2);
    expect(p.trayR).toBeGreaterThan(p.moatOuter + p.wall * 0.4);
    expect(p.deckZ).toBeGreaterThan(20);
    expect(p.moatInner).toBeGreaterThan(p.footR);

    const ring = radiiNear(base.mesh.positions, p.deckZ, 1.2);
    expect(ring.some((r) => Math.abs(r - p.moatInner) < 2.2)).toBe(true);
    expect(ring.some((r) => Math.abs(r - p.moatOuter) < 2.2)).toBe(true);
    const dome = sliceMaxRadius(base.mesh.positions, base.mesh.indices, 8);
    expect(dome).toBeGreaterThan(45);
    expect(dome).toBeLessThan(p.trayR - 8);
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
  it("flares upward and matches the reference body and tray", async () => {
    const flat = {
      ...DEFAULT_PARAMS,
      tiltDeg: 0,
      windowEnabled: false,
      text: "",
      textLine2: "",
      icons: DEFAULT_PARAMS.icons.map((icon) => ({ ...icon, enabled: false })),
    };
    const model = await buildBowl(flat, font);
    const p = resolvedDims(flat);
    const body = model.parts.find((part) => part.name === "body")!;
    const base = model.parts.find((part) => part.name === "base")!;

    expect(p.topR * 2).toBeCloseTo(190, 4);
    expect(p.footR * 2).toBeCloseTo(168, 4);
    expect(p.footR).toBeLessThan(p.topR);
    expect(p.openR * 2).toBeCloseTo(146.6, 1);
    expect(p.bodyH).toBeCloseTo(102.9, 4);
    expect(p.wall).toBeCloseTo(3, 4);
    expect(p.trayR * 2).toBeCloseTo(190, 4);
    expect(p.trayH).toBeCloseTo(60, 4);
    expect(p.deckZ).toBeCloseTo(25.7, 4);
    expect(model.manifold).toBe(true);
    for (const part of model.parts) expect(isPrintableManifold(part.mesh)).toBe(true);

    const footZ = p.deckLift + 1.4;
    const footRs = sliceRadii(body.mesh.positions, body.mesh.indices, footZ).filter((r) => r > 20);
    expect(footRs.some((r) => Math.abs(r - p.flangeR) < 1.4)).toBe(true);
    expect(Math.max(...footRs)).toBeGreaterThan(p.footR - 1.6);
    expect(Math.max(...footRs)).toBeLessThan(p.footR + 1.6);

    const wallZ = p.deckLift + 55;
    const wallRs = sliceRadii(body.mesh.positions, body.mesh.indices, wallZ).filter((r) => r > 30);
    const outer = Math.max(...wallRs);
    const inner = wallRs.filter((r) => r < outer - 1.2).reduce((m, r) => Math.max(m, r), 0);
    expect(Math.abs(outer - (p.footR + p.slope * 55))).toBeLessThan(1.3);
    expect(outer - inner).toBeGreaterThan(2.4);
    expect(outer - inner).toBeLessThan(3.8);

    const lipZ = p.deckLift + p.bodyH - 0.7;
    const lipRs = sliceRadii(body.mesh.positions, body.mesh.indices, lipZ).filter((r) => r > 8);
    expect(Math.abs(Math.min(...lipRs) - p.openR)).toBeLessThan(1.6);

    const lowR = sliceMaxRadius(body.mesh.positions, body.mesh.indices, p.deckLift + 12);
    const highR = sliceMaxRadius(body.mesh.positions, body.mesh.indices, p.deckLift + 80);
    expect(highR).toBeGreaterThan(lowR + 4);
    expect(lowR).toBeLessThan(p.topR - 2);

    const bodyVol = body.volumeMm3;
    const trayVol = base.volumeMm3;
    expect(bodyVol).toBeGreaterThan(80_000);
    expect(bodyVol).toBeLessThan(500_000);
    expect(trayVol).toBeGreaterThan(200_000);
    expect(trayVol).toBeLessThan(1_000_000);
    expect(model.solidVolumeMm3).toBeLessThan(1_600_000);

    const opened = await buildBowl({ ...flat, windowEnabled: true }, font);
    const openedBody = opened.parts.find((part) => part.name === "body")!;
    expect(isPrintableManifold(openedBody.mesh)).toBe(true);
    const zWin = p.deckLift + (p.winZ0 + p.winZ1) / 2;
    const front = slicePoints(openedBody.mesh.positions, openedBody.mesh.indices, zWin).filter((hit) => {
      return Math.abs(hit.ang + Math.PI / 2) < 0.28 && hit.r > p.footR - 6;
    });
    const side = slicePoints(openedBody.mesh.positions, openedBody.mesh.indices, zWin).filter((hit) => {
      return Math.abs(hit.ang) < 0.28 && hit.r > p.footR - 6;
    });
    expect(front.length).toBe(0);
    expect(side.length).toBeGreaterThan(0);

    const tilted = await buildBowl(DEFAULT_PARAMS, font);
    const tp = resolvedDims(DEFAULT_PARAMS);
    expect(tilted.tiltDeg).toBe(15);
    expect(tilted.manifold).toBe(true);
    const rise = sliceMaxRadius(
      tilted.parts.find((part) => part.name === "body")!.mesh.positions,
      tilted.parts.find((part) => part.name === "body")!.mesh.indices,
      tp.deckLift + 70,
    );
    const baseR = sliceMaxRadius(
      tilted.parts.find((part) => part.name === "body")!.mesh.positions,
      tilted.parts.find((part) => part.name === "body")!.mesh.indices,
      tp.deckLift + 12,
    );
    expect(rise).toBeGreaterThan(baseR + 3);
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

function sliceHits(positions: Float32Array, indices: Uint32Array, z: number): Array<{ r: number; ang: number }> {
  const hits: Array<{ r: number; ang: number }> = [];
  for (let i = 0; i < indices.length; i += 3) {
    const ids = [indices[i], indices[i + 1], indices[i + 2]];
    const zs = ids.map((id) => positions[id * 3 + 2]);
    if (z < Math.min(...zs) - 1e-4 || z > Math.max(...zs) + 1e-4) continue;
    for (let e = 0; e < 3; e++) {
      const a = ids[e];
      const b = ids[(e + 1) % 3];
      const za = positions[a * 3 + 2];
      const zb = positions[b * 3 + 2];
      if ((za - z) * (zb - z) > 1e-8) continue;
      const denom = zb - za;
      const t = Math.abs(denom) < 1e-8 ? 0 : (z - za) / denom;
      if (t < -1e-3 || t > 1 + 1e-3) continue;
      const x = positions[a * 3] + (positions[b * 3] - positions[a * 3]) * t;
      const y = positions[a * 3 + 1] + (positions[b * 3 + 1] - positions[a * 3 + 1]) * t;
      hits.push({ r: Math.hypot(x, y), ang: Math.atan2(y, x) });
    }
  }
  return hits;
}

function sliceRadii(positions: Float32Array, indices: Uint32Array, z: number): number[] {
  return sliceHits(positions, indices, z).map((hit) => hit.r);
}

function slicePoints(positions: Float32Array, indices: Uint32Array, z: number): Array<{ r: number; ang: number }> {
  return sliceHits(positions, indices, z);
}

function sliceMaxRadius(positions: Float32Array, indices: Uint32Array, z: number): number {
  return sliceRadii(positions, indices, z).reduce((m, r) => Math.max(m, r), 0);
}

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


describe("clean parametric product", () => {
  it("builds clean upright parts with a flat base and a narrower mouth at both tilt limits", async () => {
    for (const tiltDeg of [0, 15]) {
      const model = await buildBowl({ ...REFERENCE_DEFAULTS, tiltDeg, text: "Bầu", textLine2: "" }, font);
      expect(model.manifold).toBe(true);
      const base = model.parts.find(p => p.name === "base")!;
      expect(base.volumeMm3).toBeGreaterThan(100000);
      const bottom = sliceRadii(base.mesh.positions, base.mesh.indices, 0.5);
      expect(Math.max(...bottom)).toBeGreaterThan(92);
      // A flat outer foot supports the tray; the dome rises inside the shell.
      const raised = sliceRadii(base.mesh.positions, base.mesh.indices, 55);
      expect(Math.max(...raised)).toBeLessThan(70);
      expect(model.width).toBeCloseTo(190, 0);
      for (const part of model.parts) expect(isPrintableManifold(part.mesh), part.name).toBe(true);
      // The opening seat must stop a 130 mm steel lip, while clearing its 111.4 mm outer mouth.
      const body = model.parts.find(p => p.name === "body")!;
      if (tiltDeg === 0) {
        const lower = sliceRadii(body.mesh.positions, body.mesh.indices, resolvedDims(REFERENCE_DEFAULTS).deckLift + 5);
        const upper = sliceRadii(body.mesh.positions, body.mesh.indices, resolvedDims(REFERENCE_DEFAULTS).deckLift + REFERENCE_DEFAULTS.height - 5);
        expect(Math.max(...lower)).toBeGreaterThan(Math.max(...upper) + 6);
        const radii = sliceRadii(body.mesh.positions, body.mesh.indices, resolvedDims(REFERENCE_DEFAULTS).deckLift + REFERENCE_DEFAULTS.height - 1);
        expect(radii.some(r => r > 55.7 && r < 56.5)).toBe(true);
      }
      const bytes = modelToBinaryStl(model);
      expect(new DataView(bytes.buffer).getUint32(80, true)).toBe(model.triangleCount);
    }
  });
  it("scales the clean design for the large insert without opening mesh boundaries", async () => {
    const model = await buildBowl(applyInsertSize({ ...REFERENCE_DEFAULTS, text: "Jimmy", textLine2: "", textStyle: "emboss" }, "large"), font);
    expect(model.manifold).toBe(true);
    for (const part of model.parts) expect(isPrintableManifold(part.mesh), part.name).toBe(true);
    const mf = await buildThreeMf(model, "bambu");
    expect(mf.bytes.length).toBeGreaterThan(1000);
  });
});

it("preserves the counter inside a round name glyph", () => {
  const polygons = fontPolygons(font, "O", 26);
  const area = (poly: number[][]) => Math.abs(poly.reduce((sum, p, i) => { const q = poly[(i + 1) % poly.length]; return sum + p[0]*q[1]-q[0]*p[1]; }, 0) / 2);
  const largest = Math.max(...polygons.map(area));
  const section = new (getEngine().CrossSection)(polygons);
  expect(section.area()).toBeGreaterThan(0);
  expect(section.area()).toBeLessThan(largest * 0.8);
  section.delete();
});

it("applies thickness, stand height and both base textures to real solids", async()=>{
  const plain=await buildBowl({...REFERENCE_DEFAULTS,text:"",textLine2:"",icons:[],tiltDeg:0});
  const base=plain.parts.find(p=>p.name==="base")!;
  const thick=await buildBowl({...REFERENCE_DEFAULTS,text:"",textLine2:"",icons:[],wallThickness:4,bottomThickness:4,islandHeight:35});
  expect(thick.parts.find(p=>p.name==="base")!.volumeMm3).toBeGreaterThan(base.volumeMm3);
  for(const baseTexture of ["ribs","twist"] as const){
    const textured=await buildBowl({...REFERENCE_DEFAULTS,text:"",textLine2:"",icons:[],tiltDeg:0,baseTexture,ribCount:24});
    const part=textured.parts.find(p=>p.name==="base")!;
    expect(part.volumeMm3).toBeGreaterThan(base.volumeMm3);
    const body=textured.parts.find(p=>p.name==="body")!;
    expect(body.volumeMm3).toBeCloseTo(plain.parts.find(p=>p.name==="body")!.volumeMm3,0);
    for(const solid of textured.parts) expect(isPrintableManifold(solid.mesh),solid.name).toBe(true);
  }
});

it("rounds the upper rim continuously and keeps the zero-radius option printable", async()=>{
  const params={...REFERENCE_DEFAULTS,tiltDeg:0,text:"",textLine2:"",icons:[],windowEnabled:false,rimRadius:2.2};
  const model=await buildBowl(params);
  const body=model.parts.find(p=>p.name==="body")!;
  const z=resolvedDims(params).deckLift+params.height;
  const outer=(drop:number)=>Math.max(...sliceRadii(body.mesh.positions,body.mesh.indices,z-drop));
  const upperChange=outer(0.8)-outer(0.3);
  const lowerChange=outer(1.8)-outer(1.3);
  // A straight chamfer has constant slope. A rounded transition turns
  // progressively toward the horizontal face as it approaches the top.
  expect(upperChange).toBeGreaterThan(lowerChange*1.5);
  for(const rimRadius of [0,10]){
    const variant=await buildBowl({...params,rimRadius});
    for(const part of variant.parts) expect(isPrintableManifold(part.mesh),part.name).toBe(true);
  }
});

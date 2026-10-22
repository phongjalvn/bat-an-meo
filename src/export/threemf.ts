import JSZip from "jszip";
import type { BowlModel, BowlPart } from "../geometry/types";
import { FILAMENT_COLORS, extruderOf } from "../geometry/types";
import u1Settings from "./templates/u1-project-settings.json";
import { miniPng } from "./png";

export type ThreeMfTarget = "bambu" | "snapmaker-u1";

export interface ThreeMfPartMeta {
  name: string;
  objectId: number;
  componentId: number;
  extruder: number;
  color: string;
  triangleCount: number;
}

export interface ThreeMfBuildResult {
  bytes: Uint8Array;
  files: string[];
  parts: ThreeMfPartMeta[];
  printerModel: string;
  filamentColours: string[];
  filamentMaps: string;
}

const BAMBU_IDENTITY = {
  printer_settings_id: "Bambu Lab P1S 0.4 nozzle",
  printer_model: "Bambu Lab P1S",
  printer_variant: "0.4",
  printable_area: ["0x0", "256x0", "256x256", "0x256"],
  printable_height: "256",
  nozzle_diameter: ["0.4"],
  nozzle_type: "hardened_steel",
  nozzle_volume: 81,
  print_compatible_printers: ["Bambu Lab P1S 0.4 nozzle"],
  compatible_printers: ["Bambu Lab P1S 0.4 nozzle"],
  print_settings_id: "0.20mm Standard @BBL P1S",
  version: "01.10.00.85",
  single_extruder_multi_material: "1",
};

function uuidFrom(seed: string): string {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const hex = (n: number) => (n >>> 0).toString(16).padStart(8, "0");
  const a = hex(h);
  const b = hex(h ^ 0x9e3779b9);
  return `${a.slice(0, 8)}-${b.slice(0, 4)}-4${b.slice(5, 8)}-8${a.slice(1, 4)}-${a}${b}`.slice(0, 36);
}

function xmlEscape(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function projectSettings(target: ThreeMfTarget): Record<string, unknown> {
  const settings = structuredClone(u1Settings) as Record<string, unknown>;
  settings.filament_colour = FILAMENT_COLORS.slice();
  settings.filament_type = ["PLA", "PLA", "PLA", "PLA"];
  settings.filament_density = ["1.24", "1.24", "1.24", "1.24"];
  settings.filament_diameter = ["1.75", "1.75", "1.75", "1.75"];
  settings.filament_settings_id = ["Generic PLA", "Generic PLA", "Generic PLA", "Generic PLA"];
  settings.filament_vendor = ["Generic", "Generic", "Generic", "Generic"];
  if (target === "bambu") {
    Object.assign(settings, BAMBU_IDENTITY);
    settings.default_filament_profile = ["Bambu PLA Basic"];
  } else {
    settings.printer_settings_id = "Snapmaker U1 (0.4 nozzle)";
    settings.printer_model = "Snapmaker U1";
    settings.printer_variant = "0.4";
    settings.print_compatible_printers = ["Snapmaker U1 (0.4 nozzle)"];
    settings.print_settings_id = "0.20 Standard @Snapmaker U1 (0.4 nozzle)";
    settings.nozzle_diameter = ["0.4", "0.4", "0.4", "0.4"];
    settings.single_extruder_multi_material = "0";
    settings.default_filament_profile = ["Snapmaker PLA"];
  }
  return settings;
}

function meshXml(part: BowlPart, objectId: number, uuid: string): string {
  const verts: string[] = [];
  const p = part.mesh.positions;
  for (let i = 0; i < p.length; i += 3) {
    verts.push(
      `     <vertex x="${p[i].toFixed(4)}" y="${p[i + 1].toFixed(4)}" z="${p[i + 2].toFixed(4)}"/>`,
    );
  }
  const tris: string[] = [];
  const idx = part.mesh.indices;
  for (let i = 0; i < idx.length; i += 3) {
    tris.push(`     <triangle v1="${idx[i]}" v2="${idx[i + 1]}" v3="${idx[i + 2]}"/>`);
  }
  return [
    ` <object id="${objectId}" p:UUID="${uuid}" type="model">`,
    "  <mesh>",
    "   <vertices>",
    ...verts,
    "   </vertices>",
    "   <triangles>",
    ...tris,
    "   </triangles>",
    "  </mesh>",
    " </object>",
  ].join("\n");
}

function modelHeader(): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:BambuStudio="http://schemas.bambulab.com/package/2021" xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06" requiredextensions="p">',
    " <metadata name=\"Application\">BambuStudio-2.3.1</metadata>",
    ' <metadata name="BambuStudio:3mfVersion">1</metadata>',
    ' <metadata name="Title">MONO pet bowl</metadata>',
  ].join("\n");
}

function contentTypes(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
 <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
 <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
 <Default Extension="png" ContentType="image/png"/>
 <Default Extension="gcode" ContentType="text/x.gcode"/>
</Types>
`;
}

function rootRels(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
 <Relationship Target="/3D/3dmodel.model" Id="rel-1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
 <Relationship Target="/Metadata/plate_1.png" Id="rel-2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/thumbnail"/>
 <Relationship Target="/Metadata/plate_1.png" Id="rel-4" Type="http://schemas.bambulab.com/package/2021/cover-thumbnail-middle"/>
 <Relationship Target="/Metadata/plate_1_small.png" Id="rel-5" Type="http://schemas.bambulab.com/package/2021/cover-thumbnail-small"/>
</Relationships>
`;
}

function modelRels(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
 <Relationship Target="/3D/Objects/bowl.model" Id="rel-1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>
`;
}

function sliceInfo(printerModel: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<config>
 <header>
  <header_item key="X-BBL-Client-Type" value="slicer"/>
  <header_item key="X-BBL-Client-Version" value="02.00.00.00"/>
 </header>
 <plate>
  <metadata key="index" value="1"/>
  <metadata key="printer_model_id" value="${xmlEscape(printerModel)}"/>
 </plate>
</config>
`;
}

function modelSettings(
  parts: ThreeMfPartMeta[],
  assemblyId: number,
  transform: string,
  filamentMaps: string,
): string {
  const partBlocks = parts
    .map(
      (part) => `    <part id="${part.componentId}" subtype="normal_part">
      <metadata key="name" value="${xmlEscape(part.name)}"/>
      <metadata key="matrix" value="1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1"/>
      <metadata key="extruder" value="${part.extruder}"/>
      <mesh_stat edges_fixed="0" degenerate_facets="0" facets_removed="0" facets_reversed="0" backwards_edges="0"/>
    </part>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<config>
  <object id="${assemblyId}">
    <metadata key="name" value="Pet bowl"/>
    <metadata key="extruder" value="1"/>
${partBlocks}
  </object>
  <plate>
    <metadata key="plater_id" value="1"/>
    <metadata key="plater_name" value="plate-1"/>
    <metadata key="locked" value="false"/>
    <metadata key="filament_map_mode" value="Auto For Flush"/>
    <metadata key="filament_maps" value="${filamentMaps}"/>
    <metadata key="thumbnail_file" value="Metadata/plate_1.png"/>
    <metadata key="thumbnail_no_light_file" value="Metadata/plate_no_light_1.png"/>
    <metadata key="top_file" value="Metadata/top_1.png"/>
    <metadata key="pick_file" value="Metadata/pick_1.png"/>
    <model_instance>
      <metadata key="object_id" value="${assemblyId}"/>
      <metadata key="instance_id" value="0"/>
      <metadata key="identify_id" value="${assemblyId}"/>
    </model_instance>
  </plate>
  <assemble>
   <assemble_item object_id="${assemblyId}" instance_id="0" transform="${transform}" offset="0 0 0" />
  </assemble>
</config>
`;
}

function bedCenter(target: ThreeMfTarget, size: { x: number; y: number; z: number }): { x: number; y: number; z: number } {
  if (target === "snapmaker-u1") {
    return { x: 135.5, y: 136, z: size.z / 2 };
  }
  return { x: 128, y: 128, z: size.z / 2 };
}

function boundsOf(model: BowlModel) {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (const part of model.parts) {
    const p = part.mesh.positions;
    for (let i = 0; i < p.length; i += 3) {
      minX = Math.min(minX, p[i]);
      minY = Math.min(minY, p[i + 1]);
      minZ = Math.min(minZ, p[i + 2]);
      maxX = Math.max(maxX, p[i]);
      maxY = Math.max(maxY, p[i + 1]);
      maxZ = Math.max(maxZ, p[i + 2]);
    }
  }
  return { minX, minY, minZ, maxX, maxY, maxZ };
}

export async function buildThreeMf(model: BowlModel, target: ThreeMfTarget): Promise<ThreeMfBuildResult> {
  const settings = projectSettings(target);
  const printerModel = String(settings.printer_model);
  const filamentColours = settings.filament_colour as string[];
  const filamentMaps = target === "snapmaker-u1" ? "1 2 3 4" : "1 1 1 1";

  const box = boundsOf(model);
  const size = {
    x: box.maxX - box.minX,
    y: box.maxY - box.minY,
    z: box.maxZ - box.minZ,
  };
  const cx = (box.minX + box.maxX) / 2;
  const cy = (box.minY + box.maxY) / 2;
  const cz = (box.minZ + box.maxZ) / 2;
  const bed = bedCenter(target, size);
  const transform = `1 0 0 0 1 0 0 0 1 ${bed.x.toFixed(3)} ${bed.y.toFixed(3)} ${bed.z.toFixed(3)}`;

  const assemblyId = 2;
  const metas: ThreeMfPartMeta[] = model.parts.map((part, index) => {
    const componentId = index * 2 + 1;
    const extruder = extruderOf(part.name);
    return {
      name: part.name,
      objectId: assemblyId,
      componentId,
      extruder,
      color: FILAMENT_COLORS[extruder - 1],
      triangleCount: part.triangleCount,
    };
  });

  const objects = model.parts
    .map((part, index) => {
      const id = metas[index].componentId;
      const shifted: BowlPart = {
        ...part,
        mesh: {
          positions: Float32Array.from(
            part.mesh.positions.map((value, i) => {
              const axis = i % 3;
              if (axis === 0) return value - cx;
              if (axis === 1) return value - cy;
              return value - cz;
            }),
          ),
          indices: part.mesh.indices,
        },
      };
      return meshXml(shifted, id, uuidFrom(`part-${part.name}-${id}`));
    })
    .join("\n");

  const components = metas
    .map(
      (part) =>
        `    <component p:path="/3D/Objects/bowl.model" objectid="${part.componentId}" p:UUID="${uuidFrom(`comp-${part.name}`)}" transform="1 0 0 0 1 0 0 0 1 0 0 0"/>`,
    )
    .join("\n");

  const rootModel = `${modelHeader()}
 <resources>
  <object id="${assemblyId}" p:UUID="${uuidFrom("assembly")}" type="model">
   <components>
${components}
   </components>
  </object>
 </resources>
 <build p:UUID="${uuidFrom("build")}">
  <item objectid="${assemblyId}" p:UUID="${uuidFrom("item")}" transform="${transform}" printable="1"/>
 </build>
</model>
`;

  const objectsModel = `${modelHeader()}
 <resources>
${objects}
 </resources>
 <build/>
</model>
`;

  const png = miniPng();
  const zip = new JSZip();
  zip.file("[Content_Types].xml", contentTypes());
  zip.file("_rels/.rels", rootRels());
  zip.file("3D/3dmodel.model", rootModel);
  zip.file("3D/_rels/3dmodel.model.rels", modelRels());
  zip.file("3D/Objects/bowl.model", objectsModel);
  zip.file("Metadata/project_settings.config", JSON.stringify(settings, null, 2));
  zip.file("Metadata/model_settings.config", modelSettings(metas, assemblyId, transform, filamentMaps));
  zip.file("Metadata/slice_info.config", sliceInfo(printerModel));
  zip.file("Metadata/plate_1.png", png);
  zip.file("Metadata/plate_1_small.png", png);
  zip.file("Metadata/plate_no_light_1.png", png);
  zip.file("Metadata/top_1.png", png);
  zip.file("Metadata/pick_1.png", png);

  const bytes = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
  return {
    bytes,
    files: [
      "[Content_Types].xml",
      "_rels/.rels",
      "3D/3dmodel.model",
      "3D/_rels/3dmodel.model.rels",
      "3D/Objects/bowl.model",
      "Metadata/project_settings.config",
      "Metadata/model_settings.config",
      "Metadata/slice_info.config",
      "Metadata/plate_1.png",
      "Metadata/plate_1_small.png",
      "Metadata/plate_no_light_1.png",
      "Metadata/top_1.png",
      "Metadata/pick_1.png",
    ],
    parts: metas,
    printerModel,
    filamentColours,
    filamentMaps,
  };
}

export const REQUIRED_3MF_FILES = [
  "[Content_Types].xml",
  "_rels/.rels",
  "3D/3dmodel.model",
  "3D/_rels/3dmodel.model.rels",
  "3D/Objects/bowl.model",
  "Metadata/project_settings.config",
  "Metadata/model_settings.config",
  "Metadata/slice_info.config",
] as const;

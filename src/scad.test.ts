import { readFileSync } from "node:fs";
import { parse } from "opentype.js";
import JSZip from "jszip";
import { buildThreeMf } from "./export/threemf";
import { describe, it, expect } from "vitest";
import { createOpenSCAD } from "openscad-wasm";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { buildBowl, initEngine, getEngine } from "./geometry/engine";
import { DEFAULT_PARAMS } from "./geometry/types";
import { modelToScad } from "./export/scad";

describe("OpenSCAD render",()=>{
  it("renders the procedural body and base as closed STL without source assets",async()=>{
    await initEngine();
    const fontBytes=readFileSync("public/fonts/NotoSans-Regular.ttf");
    const font=parse(fontBytes.buffer.slice(fontBytes.byteOffset,fontBytes.byteOffset+fontBytes.byteLength));
    const params={...DEFAULT_PARAMS,text:"Bầu",textLine2:"",tiltDeg:15,baseTexture:"twist" as const,ribCount:24};
    const preview=await buildBowl(params,font);
    const renderedParts=preview.parts.filter(p=>p.name==="text");
    const source=modelToScad(params,preview);
    expect(source).not.toContain("import(");
    for(const part of ["body","base"]){
      const logs:string[]=[];
      const app=await createOpenSCAD({print:t=>logs.push(t),printErr:t=>logs.push(t)});
      const instance=app.getInstance();
      instance.FS.writeFile("/input.scad",source);
      const code=instance.callMain(["/input.scad","--backend=Manifold","-D",`part="${part}"`,"-o","/out.stl"]);
      expect(code,logs.join("\n")).toBe(0);
      const bytes=instance.FS.readFile("/out.stl",{encoding:"binary"});
      const geometry=new STLLoader().parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength) as ArrayBuffer);
      const positions=Float32Array.from(geometry.getAttribute("position").array);
      const {Manifold,Mesh}=getEngine();
      const mesh=new Mesh({numProp:3,vertProperties:positions,triVerts:Uint32Array.from({length:positions.length/3},(_,i)=>i)});mesh.merge();
      const solid=new Manifold(mesh);
      expect(solid.status(),logs.join("\n")).toBe("NoError");
      expect(solid.volume()).toBeGreaterThan(1000);
      const output=solid.getMesh();
      const verts=new Float32Array(output.numVert*3);
      for(let i=0;i<output.numVert;i++) for(let k=0;k<3;k++) verts[i*3+k]=output.vertProperties[i*output.numProp+k];
      renderedParts.push({name:part as "body"|"base",mesh:{positions:verts,indices:new Uint32Array(output.triVerts)},triangleCount:output.numTri,volumeMm3:solid.volume()});
      solid.delete();geometry.dispose();
    }
    const model={...preview,parts:renderedParts.sort((a,b)=>["body","base","text"].indexOf(a.name)-["body","base","text"].indexOf(b.name))};
    for(const target of ["bambu","snapmaker-u1"] as const){
      const result=await buildThreeMf(model,target);
      expect(result.parts.map(p=>[p.name,p.extruder])).toEqual([["body",1],["base",2],["text",3]]);
      const zip=await JSZip.loadAsync(result.bytes);
      expect(zip.file("3D/Objects/bowl.model")).not.toBeNull();
      const settings=await zip.file("Metadata/model_settings.config")!.async("string");
      expect(settings).toContain(target==="bambu"?"1 1 1 1":"1 2 3 4");
    }
  },120000);
});

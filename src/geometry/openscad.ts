import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import type { BowlModel, BowlParams, BowlPart } from "./types";
import { modelToScad } from "../export/scad";
import { getEngine } from "./wasm";

function render(source:string, part:string):Promise<Uint8Array> {
  return new Promise((resolve,reject)=>{
    const worker = new Worker(new URL("./openscad.worker.ts",import.meta.url),{type:"module"});
    const timer = setTimeout(()=>{worker.terminate();reject(new Error("OpenSCAD render quá 3 phút. Giảm số gân hoặc độ phức tạp icon rồi thử lại."));},180000);
    const finish=()=>{clearTimeout(timer);worker.terminate();};
    worker.onerror = error=>{finish();reject(new Error(error.message));};
    worker.onmessage = event=>{finish();event.data.error?reject(new Error(event.data.error)):resolve(event.data.bytes);};
    worker.postMessage({source,part});
  });
}
export async function renderOpenScadModel(params:BowlParams, preview:BowlModel):Promise<BowlModel> {
  const source = modelToScad(params,preview);
  const parts:BowlPart[]=[];
  for(const part of preview.parts) {
    // Decoration is already a closed font solid; compile the editable CAD bodies.
    if(part.name==="text") { parts.push(part);continue; }
    const bytes=await render(source,part.name);
    const geometry=new STLLoader().parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength) as ArrayBuffer);
    const positions=Float32Array.from(geometry.getAttribute("position").array);
    const indices=Uint32Array.from({length:positions.length/3},(_,i)=>i);
    const {Mesh,Manifold}=getEngine();
    const mesh=new Mesh({numProp:3,vertProperties:positions,triVerts:indices});mesh.merge();
    const solid=new Manifold(mesh);
    if(solid.status()!=="NoError" || solid.volume()<=0) {solid.delete();geometry.dispose();throw new Error(`OpenSCAD: phần ${part.name} chưa kín`);}
    const output=solid.getMesh();
    const verts=new Float32Array(output.numVert*3);
    for(let i=0;i<output.numVert;i++) for(let k=0;k<3;k++) verts[i*3+k]=output.vertProperties[i*output.numProp+k];
    parts.push({name:part.name,mesh:{positions:verts,indices:new Uint32Array(output.triVerts)},triangleCount:output.numTri,volumeMm3:solid.volume()});
    solid.delete();geometry.dispose();
  }
  const min=[Infinity,Infinity,Infinity], max=[-Infinity,-Infinity,-Infinity];
  for(const part of parts) for(let i=0;i<part.mesh.positions.length;i+=3) for(let k=0;k<3;k++) {
    min[k]=Math.min(min[k],part.mesh.positions[i+k]); max[k]=Math.max(max[k],part.mesh.positions[i+k]);
  }
  return {...preview,parts,width:max[0]-min[0],depth:max[1]-min[1],height:max[2]-min[2],triangleCount:parts.reduce((sum,p)=>sum+p.triangleCount,0),solidVolumeMm3:parts.reduce((sum,p)=>sum+p.volumeMm3,0),manifold:true};
}

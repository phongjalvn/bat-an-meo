import fs from "node:fs";
import path from "node:path";
import Module from "manifold-3d";
const lib = await Module(); lib.setup();
const source = process.argv[2];
if (!source) throw new Error("Usage: node scripts/prepare-reference.mjs <STL directory>");
for (const [input, output] of [["obj_1_base.stl", "base"], ["obj_2_top.stl", "top"]]) {
 const b = fs.readFileSync(path.join(source,input)); const n=b.readUInt32LE(80);
 const xyz=[], ids=[], weld=new Map();
 for(let i=0;i<n;i++) for(let j=0;j<3;j++) {
  const v=[0,1,2].map(k=>b.readFloatLE(84+i*50+12+j*12+k*4));
  const key=v.map(x=>Math.round(x*10000)).join(",");
  if(!weld.has(key)){weld.set(key,xyz.length/3);xyz.push(...v);}
  ids.push(weld.get(key));
 }
 const mesh=new lib.Mesh({numProp:3,vertProperties:Float32Array.from(xyz),triVerts:Uint32Array.from(ids)}); mesh.merge();
 const original=new lib.Manifold(mesh);
 if(original.status()!=="NoError") throw new Error(input+": "+original.status());
 const solid=original.simplify(.04); const m=solid.getMesh(); const box=solid.boundingBox();
 const verts=new Float32Array(m.numVert*3);
 for(let i=0;i<m.numVert;i++) for(let k=0;k<3;k++) verts[i*3+k]=m.vertProperties[i*m.numProp+k]-(k<2?(box.min[k]+box.max[k])/2:box.min[k]);
 const header=new Uint32Array([verts.length,m.triVerts.length]);
 fs.writeFileSync(`public/reference/${output}.bin`,Buffer.concat([Buffer.from(header.buffer),Buffer.from(verts.buffer),Buffer.from(m.triVerts.buffer)]));
 console.log(input,original.numTri(),solid.numTri(),solid.volume()); solid.delete();original.delete();
}

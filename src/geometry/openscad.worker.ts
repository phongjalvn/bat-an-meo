/// <reference lib="webworker" />
import { createOpenSCAD } from "openscad-wasm";
self.onmessage = async (event: MessageEvent<{source:string;part:string}>) => {
  const logs: string[] = [];
  try {
    const app = await createOpenSCAD({print:t=>logs.push(t),printErr:t=>logs.push(t)});
    const instance = app.getInstance();
    instance.FS.writeFile("/bowl.scad",event.data.source);
    const code = instance.callMain(["/bowl.scad","--backend=Manifold","-D",`part="${event.data.part}"`,"-o","/out.stl"]);
    if(code !== 0) throw new Error(logs.slice(-8).join("\n"));
    const bytes = instance.FS.readFile("/out.stl",{encoding:"binary"});
    self.postMessage({bytes},[bytes.buffer]);
  } catch(error) { self.postMessage({error: String(error), logs:logs.slice(-8)}); }
};

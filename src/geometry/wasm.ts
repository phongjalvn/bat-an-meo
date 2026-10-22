import Module from "manifold-3d";
import wasmUrl from "manifold-3d/manifold.wasm?url";

type Wasm = Awaited<ReturnType<typeof Module>>;

let wasm: Wasm | null = null;

function isNodeRuntime(): boolean {
  return typeof process !== "undefined" && !!process.versions?.node && typeof window === "undefined";
}

export async function initEngine(): Promise<Wasm> {
  if (wasm) return wasm;
  // Node (Vitest) resolves manifold.wasm next to the package. The browser must
  // fetch the Vite-emitted asset — otherwise the default URL returns HTML.
  const instance = isNodeRuntime()
    ? await Module()
    : await Module({
        locateFile: () => wasmUrl,
        wasmBinary: await fetchWasm(wasmUrl),
      } as { locateFile: () => string });
  instance.setup();
  wasm = instance;
  return instance;
}

async function fetchWasm(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load manifold wasm (${response.status})`);
  }
  const bytes = await response.arrayBuffer();
  const head = new Uint8Array(bytes, 0, 4);
  if (head[0] !== 0x00 || head[1] !== 0x61 || head[2] !== 0x73 || head[3] !== 0x6d) {
    throw new Error("Manifold wasm response was not a WebAssembly binary");
  }
  return bytes;
}

export function getEngine(): Wasm {
  if (!wasm) {
    throw new Error("Manifold engine is not initialized. Call initEngine() first.");
  }
  return wasm;
}

import Module from "manifold-3d";

type Wasm = Awaited<ReturnType<typeof Module>>;

let wasm: Wasm | null = null;

export async function initEngine(): Promise<Wasm> {
  if (wasm) return wasm;
  const instance = await Module();
  instance.setup();
  wasm = instance;
  return instance;
}

export function getEngine(): Wasm {
  if (!wasm) {
    throw new Error("Manifold engine is not initialized. Call initEngine() first.");
  }
  return wasm;
}

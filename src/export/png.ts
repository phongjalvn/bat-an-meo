const PIXEL =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

export function miniPng(): Uint8Array {
  const binary = atob(PIXEL);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export function tintedPng(r: number, g: number, b: number): Uint8Array {
  const base = miniPng();
  // Keep a valid tiny PNG; color is not required for slicer import.
  void r;
  void g;
  void b;
  return base;
}

import { parse } from "opentype.js";
import type { Font } from "opentype.js";

let cached: Font | null = null;

export async function loadAppFont(): Promise<Font> {
  if (cached) return cached;
  const url = `${import.meta.env.BASE_URL}fonts/NotoSans-Regular.ttf`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Could not load Noto Sans");
  const buffer = await res.arrayBuffer();
  cached = parse(buffer);
  return cached;
}

export async function loadFontFromBuffer(buffer: ArrayBuffer): Promise<Font> {
  cached = parse(buffer);
  return cached;
}

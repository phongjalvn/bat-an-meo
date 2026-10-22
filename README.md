# MONO. Pet bowl generator

Vietnamese-first web app that designs a 3D-printable pet bowl and exports slicer-ready files.

The body is a straight frustum that widens upward, matching the reference shell: about Ø168 at the foot and Ø190 at the top for the Small insert, a constant 3 mm wall, and a height of 102.9 mm on the low side. The top is cut at 0–15° (low at the front, about 13–15° for cats) and finished with one continuous radial fillet. The stainless insert hangs in a top ring lip (Ø146.6 opening for Small) — there is no deep internal shelf. The bottom is open, with a thin inward foot flange. An optional oval window cuts the front wall near the foot. The tray follows the reference dish: Ø190, a 60 mm wall about 3 mm thick, a solid domed underside, and a flat deck near z = 26 mm that the body sits on. A water moat is cut into that deck between the foot and the tray wall, and a low rib locates the foot. Every major diameter and height scales with the insert lip (Small 130, Large 190, or Custom). Geometry is generated with lathe profiles and [manifold-3d](https://github.com/elalish/manifold) so the meshes stay watertight for slicers.

## Features

- Live 3D preview with orbit, front/top/side cameras, zoom, and a reference plate that is not exported
- Stainless insert sizes from the real bowls: **Nhỏ 11 cm** (lip 130 / mouth 110 / base 70 / height 40 mm) and **Lớn 16 cm** (lip 190 / mouth 160 / base 95 / height 55 mm), plus Custom for those four measurements
- Top lip opening follows the reference (Ø146.6 for a 130 mm insert lip) and scales with the selected insert. The steel mesh is preview-only
- Single bowl only. Saved projects that still carry a double-bowl flag load as one bowl (that field is ignored)
- Design sliders for top diameter, upward flare, body height, tray size, deck height, wall thickness, rounded rim, 0–15° cat tilt, foot clearance, and the oval window
- Anti-hunch tilted top and an anti-ant water moat in the deck between the body foot and the tray wall
- Name plus optional date line, wrapped on the front: large name, icon beside it, small date underneath; engraved inlay or flush emboss
- Customizable icons (paw, cat, dog, heart, fish, bone, star) or uploaded SVG / PNG; per-icon placement, size, and rotation
- Base textures: smooth, vertical ribs, twisted ribs
- Presets: small cat, medium dog, large dog, cat anti-hunch / anti-ant
- Local project save (`Đã lưu trên máy`)
- Estimated capacity (ml) and print mass (g) for PLA / PETG / ABS
- English / Vietnamese language toggle
- Export menu:
  - Binary STL (mm), filename includes key dimensions
  - 3MF for Bambu Studio (`Bambu Lab P1S`)
  - 3MF for Snapmaker U1 (Orca), using the same project/metadata layout as `bambu-to-snapmaker-u1`

## Develop

```bash
npm install
npm test
npm run dev
```

Open the printed local URL (default `http://localhost:5173`).

## Tests

`npm test` builds the default bowl, writes a binary STL, and checks that:

- the STL is non-empty
- every printable part is manifold (each edge shared by two triangles, and manifold-3d accepts the mesh)
- both 3MF archives contain the Bambu/Orca files (`3D/3dmodel.model`, `Metadata/project_settings.config`, `Metadata/model_settings.config`, plate metadata, thumbnails)
- body / base / text map to filament slots 1 / 2 / 3; the moat is part of the tray, not a fourth object
- Snapmaker U1 uses `filament_maps` `1 2 3 4`; Bambu uses AMS-style `1 1 1 1`
- Small (11 cm) and Large (16 cm) insert presets scale the frustum, opening, and tray from the reference; Custom keeps measured lip / mouth / base / height
- the anti-hunch / anti-ant preset keeps a watertight moat floor inside the tray
- a saved `doubleBowl` flag is ignored and the mesh stays one circular tray
- the default body flares upward (foot about Ø168, top Ø190), the lip opening is about Ø146.6, and the tray is about Ø190 × 60 mm with a deck near 26 mm

## Deploy to GitHub Pages

1. In the GitHub repo: **Settings → Pages → Build and deployment → GitHub Actions**.
2. Merge to `main`. The workflow in `.github/workflows/pages.yml` runs tests, builds with `GITHUB_PAGES=true` (base path `/bat-an-meo/`), and deploys `dist`.
3. The public URL is `https://<user>.github.io/bat-an-meo/`.

To build the Pages bundle locally:

```bash
GITHUB_PAGES=true npm run build
```

## Deploy to Vercel

1. Import the GitHub repository in Vercel.
2. Framework preset: Vite. Build command: `npm run build`. Output: `dist`.
3. Leave the base path at `/` (do not set `GITHUB_PAGES`).
4. Deploy. No environment variables are required.

## Print notes

- Units are millimetres.
- The steel insert is display-only and is omitted from STL/3MF. The printed top lip is the reference opening (wider than the steel lip, Ø146.6 for Small).
- 3MF files open as unsliced multi-color projects. Re-slice in Bambu Studio or Snapmaker Orca before printing.
- Wrapped text and icons are a separate part so they can print in a second color.
- The anti-ant moat is a channel in the tray deck (same filament as the base), between the body foot and the outer wall. Fill it with water after printing. The floor under the channel stays at least 2 mm; the dome underside drops only under that ring so the channel can be deep.
- The body sits on the deck. A low rib just outside the foot locates it. Increase foot clearance if the fit is tight.
- Tilted cat bowls keep the low side near the reference height and rise toward the back. The center of mass stays inside the tray.

## Limitations

- Very wide names are scaled onto the front of the cylinder; long strings wrap less cleanly.
- Uploaded PNGs are threshold-traced; clean SVG outlines print more reliably. Features thinner than 0.8 mm are flagged.
- Plate thumbnails in the 3MF are placeholder PNGs, not rendered previews.
- Bambu export targets a P1S 0.4 mm profile; pick your actual printer after opening the file if needed.
- Manifold generation is heavier than a simple preview mesh, so sliders are debounced.

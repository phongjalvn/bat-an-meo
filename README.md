# MONO. Pet bowl generator

Vietnamese-first web app that designs a 3D-printable pet bowl and exports slicer-ready files.

The holder is a single tilted cylinder with a recessed pocket for a removable stainless insert (preview only). The printable base is one circular tray: outer wall, floor, optional anti-ant water moat inside the dish, and a centering island with a peg that seats the body. Geometry is generated with lathe/revolve profiles and [manifold-3d](https://github.com/elalish/manifold) so the meshes stay watertight for slicers.

## Features

- Live 3D preview with orbit, front/top/side cameras, zoom, and a reference plate that is not exported
- Stainless insert sizes from the real bowls: **Nhỏ 11 cm** (lip 130 / mouth 110 / base 70 / height 40 mm) and **Lớn 16 cm** (lip 190 / mouth 160 / base 95 / height 55 mm), plus Custom for those four measurements
- Pocket follows the tapered bowl plus clearance, with a shallow counterbore for the rolled rim lip; holder outer diameter is at least lip + 2× wall
- Single bowl only. Saved projects that still carry a double-bowl flag load as one bowl (that field is ignored)
- Design sliders for body and tray size, wall/bottom thickness, island height, rounded rim, 0–15° cat tilt, centering-fit clearance, anti-slip groove
- Anti-hunch (whole-body tilt on a flat seat) and an anti-ant water moat cut into the tray around the island
- Name plus optional second line, wrapped on the cylinder: engraved inlay or flush emboss
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
- Small (11 cm) and Large (16 cm) insert presets set pocket + holder diameter; Custom keeps measured lip / mouth / base / height
- the anti-hunch / anti-ant preset keeps a watertight moat floor inside the tray
- a saved `doubleBowl` flag is ignored and the mesh stays one circular tray

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
- The steel insert is display-only and is omitted from STL/3MF. The printed pocket holds a real Small 11 cm or Large 16 cm insert by the rim lip.
- 3MF files open as unsliced multi-color projects. Re-slice in Bambu Studio or Snapmaker Orca before printing.
- Wrapped text and icons are a separate part so they can print in a second color.
- The anti-ant moat is a channel inside the tray (same filament as the base). Fill it with water after printing; keep the floor ≥ 1.2 mm.
- The body sockets onto the tray island. Increase centering-fit clearance if the peg is too tight for your printer.
- Tilted cat bowls sit on a flat cut so the center of mass stays inside the tray. Chamfers stay ≤ 45° so the stand prints without supports.

## Limitations

- Very wide names are scaled onto the front of the cylinder; long strings wrap less cleanly.
- Uploaded PNGs are threshold-traced; clean SVG outlines print more reliably. Features thinner than 0.8 mm are flagged.
- Plate thumbnails in the 3MF are placeholder PNGs, not rendered previews.
- Bambu export targets a P1S 0.4 mm profile; pick your actual printer after opening the file if needed.
- Manifold generation is heavier than a simple preview mesh, so sliders are debounced.

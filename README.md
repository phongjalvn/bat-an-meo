# MONO. Pet bowl generator

Vietnamese-first web app that designs a 3D-printable pet bowl and exports slicer-ready files.

Mặc định app dùng trực tiếp hình học từ hai STL mẫu `obj_1_base.stl` và `obj_2_top.stl`. Khay nước, chân lắp, cửa thoáng và bo cạnh giữ theo mẫu; chỉ phần trên của thân được nâng dần để tạo miệng nghiêng 0–15°. Tên, dòng phụ và icon bám theo mặt thân, có thể khắc chìm hoặc làm nổi, xuất riêng màu trong 3MF.

Lỗ nguyên mẫu khoảng Ø146,6 mm lớn hơn vành bát inox nhỏ Ø130 mm. App bổ sung vòng đỡ bên trong, mở theo đường kính miệng ngoài cộng độ hở, để vành inox tựa được trên thân. Bát inox chỉ dùng để xem trước. Chưa có kiểm chứng bằng bản in và bát inox thật.

Mesh nguồn được hàn đỉnh và giảm tam giác với sai số 0,04 mm, lưu trong `public/reference/*.bin` (tọa độ mm, tâm XY ở gốc). Tái tạo asset từ STL gốc bằng:

```bash
node scripts/prepare-reference.mjs "/path/to/base_elevatorio_anti_insects_stls"
```

Giao diện mặc định chỉ đưa ra các thông số phù hợp với mẫu: kích thước bát inox, góc nghiêng và cá nhân hóa. Các dự án cũ tự chuyển sang hình học STL mẫu; engine dựng tham số cũ vẫn được giữ với `referenceShape: false` để tương thích và kiểm thử. Kích thước Small/Large vẫn là tỷ lệ cấu hình của app; cần đo bát inox thực tế và dùng Custom trước khi in.

## Features

- Live 3D preview with orbit, front/top/side cameras, zoom, and a reference plate that is not exported
- Stainless insert sizes from the real bowls: **Nhỏ 11 cm** (lip 130 / mouth 110 / base 70 / height 40 mm) and **Lớn 16 cm** (lip 190 / mouth 160 / base 95 / height 55 mm), plus Custom for those four measurements
- The reference shell opening gains an inward seat sized to the measured steel mouth plus clearance. The steel mesh is preview-only
- Single bowl only. Saved projects that still carry a double-bowl flag load as one bowl (that field is ignored)
- Reference geometry with 0–15° tilt and steel insert sizing; unrelated structural controls are hidden
- Tilted top and the original water tray around the raised body foot
- Name plus optional date line, wrapped on the front: large name, icon beside it, small date underneath; engraved inlay or flush emboss
- Customizable icons (paw, cat, dog, heart, fish, bone, star) or uploaded SVG / PNG; per-icon placement, size, and rotation
- Original STL tray and mating foot
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

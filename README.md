# MONO — Đế bát thú cưng

App tiếng Việt dựng bát tham số, xuất OpenSCAD, STL và project 3MF cho Bambu Studio / Snapmaker U1.

## Hình học

Toàn bộ hình học được dựng mới bằng tiết diện và phép CSG. STL được cung cấp chỉ là tài liệu tham khảo về tỷ lệ; app không tải, nhúng hay nhập mesh gốc, không mang theo logo của mẫu.

- Thân rộng phía dưới, thu nhỏ ở miệng. Chân đế phẳng phía dưới, bệ đỡ nhô lên vào trong thân.
- Miệng nghiêng 0–15°; chân lắp giữ nguyên để đặt thẳng trên đế.
- Hai cửa lấy tay ở hai bên, gần miệng; tên ở mặt trước.
- Gờ miệng đỡ vành inox, lỗ mở theo miệng ngoài cộng độ hở. Bát inox chỉ xem trước.
- Thành, đáy, độ thu miệng, chiều cao chân đỡ và kích thước đều điều chỉnh được.
- Hào nước có tùy chọn bật/tắt, chiều rộng, chiều sâu và khe hở.
- Đế trơn, gân dọc hoặc gân xoắn, thay đổi được số gân.
- Tên tiếng Việt, dòng phụ và icon; chữ nổi hoặc khắc chìm, chỉnh cỡ và độ sâu.

## OpenSCAD và xuất file

Xem trước dùng Manifold để phản hồi nhanh khi kéo slider. Khi xuất STL hoặc 3MF, app sinh mã OpenSCAD và render thân/đế bằng OpenSCAD WebAssembly trong worker; lỗi render được báo rõ và không âm thầm xuất bản preview.

Menu **Xuất** có:

- **OpenSCAD (.scad)**: nguồn tham số chỉnh được cho thân và đế. Nét tên/icon là polyhedron sinh từ font và lựa chọn trong app, không lấy từ STL. Đổi tên/icon trong app rồi xuất lại để cập nhật nét chữ; không có biến đổi tên trực tiếp trong SCAD.
- **STL**: hình học sau render OpenSCAD, đơn vị mm.
- **3MF Bambu Lab**: project theo cấu hình Bambu Lab P1S.
- **3MF Snapmaker U1**: project theo cấu hình Snapmaker U1 / Orca.

Trong 3MF, thân / đế / tên-icon là các part riêng, gán filament 1 / 2 / 3. Bát inox và bàn tham chiếu không xuất in. Lần render đầu cần tải worker OpenSCAD khoảng 14 MB; worker chạy riêng để giao diện không bị khóa. Nút xuất được khóa cho đến khi hoàn tất, ảnh chụp tham số được giữ riêng để thay đổi UI giữa lúc render không làm trộn cấu hình.

Kích thước inox có Small (vành 130 / miệng 110 / đáy 70 / cao 40 mm), Large (190 / 160 / 95 / 55 mm), và Custom. Cần đo bát thật và chọn độ hở phù hợp trước khi in. Chưa xác nhận bằng bản in vật lý; khối lượng hiển thị tính theo thể tích khối đặc, không phải dự báo infill của slicer.

## Chạy và kiểm tra

```bash
npm ci
npm test
npm run dev
```

Tests kiểm tra mesh kín, chiều lắp đúng, gờ đỡ inox, font có dấu/lòng chữ, cấu trúc 3MF và render OpenSCAD thật. Hình học tham số cũ vẫn được giữ trong engine với `referenceShape: false` để tương thích kiểm thử; cấu hình mới mặc định dùng thiết kế sạch.

## GitHub Pages

Push `main` kích hoạt `.github/workflows/pages.yml`: cài dependency, test, build với base `/bat-an-meo/`, rồi deploy Pages.

[Ứng dụng](https://phongjalvn.github.io/bat-an-meo/)

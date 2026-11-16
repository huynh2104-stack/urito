# Urito POS

[日本語](README.md) | [English](README.en.md) | [Danh sách tính năng](docs/ja/features.md)

Phần mềm bán hàng (POS) dạng PWA chạy hoàn toàn trên trình duyệt — **không cần máy chủ, không tài khoản, 0 đồng chi phí duy trì** — dành cho cửa hàng bán lẻ, quán cà phê và quán ăn nhỏ.

## Điểm nổi bật

- **Lưu trữ hoàn toàn trên máy (IndexedDB / Dexie v7)**: Mọi hoá đơn, hàng hoá, biến động kho và công nợ khách hàng đều được ghi an toàn trong trình duyệt theo transaction.
- **Hoạt động khi mất mạng (Service Worker)**: Tải một lần để bán hàng, quét mã vạch bằng camera, in hoá đơn nhiệt 58 mm / 80 mm ngay cả khi không có Internet.
- **Tối ưu hiệu năng cho máy cấu hình thấp**: Tách gói màn hình với `React.lazy`, tách bảng ảnh sản phẩm nhị phân kết hợp LRU cache (tối đa 300 ảnh), và bảng tổng hợp doanh thu theo ngày giúp gói JS khởi động chỉ còn **135.90 KB gzip**.
- **Kết nối Shopify & đa ngôn ngữ**: Xuất/nhập CSV chuẩn Shopify, lưu tên hàng đa ngôn ngữ (`vi` / `ja` / `en`), chọn ngôn ngữ ngay khi in hoá đơn, và nhập đơn hàng EC chống trùng lặp.
- **An toàn dữ liệu**: Mã PIN băm PBKDF2-SHA256 kèm khoá tạm sau 5 lần nhập sai; hỗ trợ sao lưu nén `.json.gz` qua File System Access API và gộp dữ liệu nhiều thiết bị.

## Lệnh phát triển

```bash
npm install
npm run dev
npm run typecheck && npm run lint && npm test
npm run build && node scripts/check-size.mjs
```

## Giấy phép

[MIT License](LICENSE)

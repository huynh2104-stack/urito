# Urito

Phần mềm bán hàng (POS) cho cửa hàng bán lẻ, quán cà phê / trà sữa, nhà hàng và hộ kinh doanh.
Chạy hoàn toàn trên máy người dùng — **không server, không tài khoản, không chi phí vận hành**.

小規模店舗向けの販売管理システム / Point-of-sale for small shops — **vi / ja / en**.

---

## Bản 0.5 - màn hình bán hàng

- Ghim hàng lên màn hình bán hàng ngay trong danh sách Hàng hoá (bấm ngôi sao).
- Bộ lọc/sắp xếp ở màn hình Bán hàng: ghim lên đầu, bán chạy nhất (30 ngày), tên, giá, tồn kho ít, mới thêm; chỉ hiện hàng còn tồn; 3 cỡ ô hàng. Lựa chọn được nhớ theo từng thiết bị.
- Dòng giỏ hàng có ảnh sản phẩm; hàng bay vào giỏ khi thêm; xoá dòng trượt sang trái (trên điện thoại vuốt trái để xoá).
- Sửa lỗi ô số lượng: xoá số để gõ số mới không còn làm mất dòng hàng.
- Thanh toán: các nút tiền mặt cộng dồn (100.000 + 50.000 = 150.000), nút C và xoá lùi có màu riêng.
- Sửa lỗi nút 3 gạch trên máy tính làm mờ màn hình mà không hiện menu.

## Bản 0.4 - diện mạo mới

- Nhận diện mới: logo Urito, thanh điều hướng xanh navy, màu cobalt thống nhất, bóng đổ nhẹ thay cho viền phẳng.
- Màn hình thiết lập và đăng nhập chia đôi (panel thương hiệu + biểu mẫu).
- Thẻ hàng hoá có ô chữ cái màu theo nhóm; thẻ số liệu có biểu tượng; biểu đồ bo tròn.
- Tuỳ chọn tạo 14 ngày lịch sử bán hàng mẫu để Tổng quan/Báo cáo có số liệu xem thử.
- Vẫn không dùng thư viện UI hay bộ lọc blur nặng: máy yếu vẫn mượt.

## Vì sao thiết kế như vậy

| Ràng buộc | Cách giải quyết |
|---|---|
| Máy cấu hình yếu, "vào là dùng ngay" | PWA chạy trên Edge/Chrome. Không cài `.exe`, mở link là dùng, cài ra desktop 1 chạm. Bundle ~170 KB gzip, không dùng UI framework nặng. |
| Phải chạy được khi mất mạng | Service worker tự viết: HTML network-first, asset cache-first → mở lần đầu xong là dùng offline vĩnh viễn. |
| Dữ liệu nằm trên máy | Toàn bộ hoá đơn, hàng hoá, khách hàng nằm trong **IndexedDB** của trình duyệt. Không có dữ liệu nào rời khỏi máy. |
| Tự sao lưu lên đám mây do người dùng tự chọn | **File System Access API**: người dùng chọn một thư mục (ví dụ `Google Drive\Urito Backup`), app tự ghi file JSON theo lịch, ứng dụng đám mây tự upload. Không tốn phí, không phụ thuộc nhà cung cấp nào. |
| 0 chi phí vận hành | Static site → GitHub Pages / Netlify / Cloudflare Pages đều miễn phí vĩnh viễn. Không có backend, không database thuê. |
| Hồ sơ ứng tuyển | TypeScript strict, kiến trúc feature-based, engine tính tiền thuần & có unit test, i18n vi/ja/en đầy đủ. |

---

## Tính năng

**Bán hàng**
- Màn hình POS: lưới hàng hoá theo nhóm, tìm kiếm **không dấu** (gõ `ca phe` ra `Cà phê`), quét mã vạch (nhập mã + Enter).
- Tuỳ chọn món (size / đá / đường / topping) có phụ thu, ghi chú từng món.
- Giảm giá theo dòng và theo đơn (%, số tiền), mã khuyến mãi.
- Hình thức: tại chỗ / mang đi / giao hàng / bán lẻ. Chọn bàn, số khách.
- Lưu tạm đơn (nhiều đơn chờ cùng lúc), mở lại đơn của bàn.
- Thanh toán: tiền mặt, thẻ, chuyển khoản, ví điện tử, QR, ghi nợ, **trả nhiều phương thức trong một đơn**. Bàn phím số, nút tiền nhanh, tính tiền thối.
- Tích điểm & dùng điểm cho khách quen.
- Phím tắt: `F2` tìm hàng, `F9` thanh toán, `F4` lưu tạm.

**Hoá đơn**
- Danh sách theo khoảng thời gian, lọc trạng thái, tìm theo mã / khách / món.
- Chi tiết hoá đơn, in lại, **trả hàng từng món** (hoàn tiền theo tỷ lệ, tuỳ chọn nhập lại kho), huỷ hoá đơn (tự hoàn kho + hoàn công nợ, điểm).
- In hoá đơn nhiệt 58 mm / 80 mm (hoặc "Lưu thành PDF" nếu chưa có máy in).
- Xuất Excel (CSV có BOM UTF-8 → mở bằng Excel không lỗi font tiếng Việt/Nhật).

**Hàng hoá & kho**
- Hàng hoá: giá bán / giá vốn, đơn vị, SKU, mã vạch, tồn tối thiểu, dịch vụ (không tồn kho), ghim lên màn hình bán hàng.
- Nhóm hàng, nhóm tuỳ chọn (size/topping) dùng lại cho nhiều món.
- Nhập hàng hoá loạt từ **CSV**.
- Kho: nhập / xuất / kiểm kê / huỷ hàng, cảnh báo sắp hết, giá trị tồn kho, **lịch sử kho đầy đủ** (mọi thay đổi tồn đều có vết).
- Phiếu nhập hàng theo nhà cung cấp, nhập kho một chạm, cập nhật giá vốn, ghi công nợ phải trả.

**Khách hàng & nhà cung cấp**
- Hồ sơ khách, lịch sử mua, điểm thưởng, **công nợ** và thu nợ.
- Nhà cung cấp và công nợ phải trả.

**Ca làm việc & chi phí**
- Mở ca với tiền đầu ca, thu/chi tiền mặt trong ca, đóng ca đối chiếu tiền đếm được với tiền dự kiến, in báo cáo ca.
- Ghi nhận chi phí theo loại (mặt bằng, lương, điện nước…) để tính **lãi ròng**.

**Báo cáo**
- Doanh thu thuần, lãi gộp, lãi ròng, giá vốn, số hoá đơn, trung bình/hoá đơn — có **so sánh với kỳ trước**.
- Biểu đồ theo ngày, theo khung giờ (biết giờ cao điểm), theo nhóm hàng, theo hình thức thanh toán, theo nhân viên, hàng bán chạy.
- Xuất CSV toàn bộ báo cáo.

**Hệ thống**
- Nhân viên & phân quyền (chủ / quản lý / thu ngân), đăng nhập bằng mã PIN.
- Cài đặt: thông tin cửa hàng, logo, VAT (không / đã gồm / cộng thêm), phí phục vụ, làm tròn tổng tiền, mẫu hoá đơn, tích điểm, tiền tệ (VND / JPY / USD), giao diện sáng–tối, ngôn ngữ.
- Sao lưu & khôi phục (xem bên dưới).

**v0.2**
- Giao diện mới: thanh điều hướng tối, tiêu đề trang, ô sản phẩm có ảnh.
- **Điện thoại**: thanh điều hướng dưới, giỏ hàng trượt lên, hộp thoại dạng bottom-sheet, quét mã vạch bằng camera (BarcodeDetector).
- **Gộp dữ liệu giữa các máy** (bán trên điện thoại lúc mất điện rồi gộp về máy tính): chỉ thêm bản ghi mới, phát lại biến động kho, cập nhật khách hàng, đổi tên số hoá đơn trùng, chạy nhiều lần không bị nhân đôi — có test tự động.
- Phân quyền: chặn hạ quyền chủ cuối cùng, chặn route theo quyền, **Đổi nhân viên / Giao ca** từ menu người dùng.
- Bán lẻ: ảnh sản phẩm, tạo mã vạch nội bộ (EAN-13 tiền tố 20), **in tem mã vạch** (Code 128 tự viết, không thư viện), hàng ngoài danh mục, cú pháp `24*mã`, tạo phiếu nhập từ hàng sắp hết, nhân bản hàng hoá.

---

## Chạy thử

```bash
npm install
npm run dev
```

Mở http://localhost:5173

```bash
npm run build     # ra thư mục dist/
npm run preview   # xem thử bản build
npm test          # 48 unit test: tính tiền, tiền tệ, mã vạch, gộp dữ liệu
```

---

## Đưa cho người dùng thật (miễn phí)

1. `npm run build` → được thư mục `dist/`.
2. Đưa `dist/` lên một trong các dịch vụ miễn phí:
   - **GitHub Pages**: đẩy `dist/` lên nhánh `gh-pages`.
   - **Netlify / Cloudflare Pages**: kéo thả thư mục `dist/` vào trang web của họ.
3. Gửi đường link cho người dùng. Lần đầu mở cần mạng; sau đó **chạy offline được**.
4. Trên máy người dùng, mở link bằng **Microsoft Edge** (Windows có sẵn) → nút "Cài đặt ứng dụng" trên thanh địa chỉ → app có icon riêng trên desktop, mở như phần mềm bình thường.

> App dùng đường dẫn tương đối (`base: './'`) và hash router nên chạy được ở bất kỳ thư mục con nào, không cần cấu hình rewrite.

---

## Sao lưu tự động lên đám mây (không tốn phí)

Trong app: **Sao lưu → Chọn thư mục**.

1. Cài Google Drive / OneDrive / Dropbox trên máy (Windows thường có sẵn OneDrive).
2. Tạo thư mục `Urito Backup` **bên trong** thư mục đồng bộ của dịch vụ đó.
3. Trong app bấm "Chọn thư mục" và trỏ vào đúng thư mục vừa tạo.
4. Bật "Tự động sao lưu", chọn chu kỳ (ví dụ 30 phút) và số bản giữ lại.

Urito ghi file `urito-backup-YYYYMMDD-HHMMSS.json`, dịch vụ đám mây tự upload. Muốn khôi phục thì chọn file trong danh sách hoặc tải file `.json` lên.

Ngoài ra còn có: tải file sao lưu về máy thủ công, xuất hàng hoá / hoá đơn ra CSV.

> Cần Microsoft Edge hoặc Google Chrome cho tính năng ghi thẳng vào thư mục. Trình duyệt khác vẫn dùng được nút tải file sao lưu thủ công.

---

## Kiến trúc

```
src/
  core/        Logic thuần, không phụ thuộc React/DB — tiền tệ, giỏ hàng, ngày tháng, id
               money.ts   toàn bộ tiền là SỐ NGUYÊN đơn vị nhỏ nhất (đồng/yên/cent)
               cart.ts    engine tính tiền duy nhất của cả app (+ cart.test.ts)
  db/          Kiểu dữ liệu miền, Dexie schema, dữ liệu mẫu
  services/    Nghiệp vụ ghi dữ liệu: orders, inventory, purchases, shifts, reports, backup, csv
  store/       Zustand: app (settings/user/shift), cart, ui (toast/confirm)
  i18n/        vi.ts là từ điển gốc; ja/en phải khớp key, thiếu key là lỗi biên dịch
  components/  Design system tự viết (ui.tsx, charts.tsx, Icon.tsx, Shell.tsx)
  features/    Mỗi màn hình một thư mục
  print/       Hoá đơn nhiệt & báo cáo ca (in qua chính hộp thoại in của trình duyệt)
```

**Nguyên tắc quan trọng**

- **Tiền luôn là số nguyên** đơn vị nhỏ nhất → không bao giờ sai số dấu phẩy động trên hoá đơn hay báo cáo.
- **Một nguồn sự thật cho giá**: mọi màn hình đều gọi `core/cart.ts`.
- **Ghi dữ liệu trong transaction**: thanh toán ghi hoá đơn + trừ kho + cập nhật điểm/công nợ + tăng số hoá đơn trong một giao dịch duy nhất.
- **Báo cáo ca tính lại từ hoá đơn** thay vì cộng dồn, nên không bao giờ lệch với hoá đơn thực tế.
- **Mọi thay đổi tồn kho đều có vết** trong `stockMovements`.

## Ngôn ngữ

`vi` là từ điển gốc, `ja` và `en` được ràng buộc kiểu theo nó. Thêm một key mới vào `src/i18n/vi.ts` mà quên dịch sang tiếng Nhật/Anh sẽ **không biên dịch được** — không có chuỗi nào bị bỏ sót.

## Giấy phép

Dự án cá nhân.

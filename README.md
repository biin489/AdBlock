# 🛡️ AdBlock — Facebook & YouTube Ad Blocker

> Chrome Extension (Manifest V3) — Chặn quảng cáo thông minh trên Facebook và YouTube với chế độ Stealth Mode.

![Version](https://img.shields.io/badge/version-1.3.1%20Smart%20UI-blue)
![Manifest](https://img.shields.io/badge/Manifest-V3-brightgreen)
![License](https://img.shields.io/badge/license-MIT-orange)

---

## ✨ Tính năng

- 🚫 **Chặn quảng cáo Facebook** — Phát hiện và ẩn bài viết được tài trợ ("Được tài trợ"), "Gợi ý cho bạn" và các dạng quảng cáo ẩn khác
- 🎬 **Chặn quảng cáo YouTube** — Bỏ qua pre-roll, mid-roll và overlay ads
- 🖱️ **Chặn Thủ công AI-Smart** — Trỏ chuột chọn vùng và ẩn vĩnh viễn. Tích hợp AI-smart Metadata tự động dịch khối HTML thành ngôn ngữ con người (Hình ảnh/Video/Văn bản) trên bảng quản lý hoàn tác cực thông minh.
- 🥷 **Stealth Mode** — Inject script vào page context để bypass các cơ chế anti-adblock của Facebook
- 📡 **DeclarativeNetRequest** — Chặn request mạng theo quy tắc tĩnh, hiệu suất cao, không cần quyền `webRequest`
- 📊 **Thống kê realtime** — Popup hiển thị số lượng quảng cáo đã chặn theo phiên
- 🌐 **Đa ngôn ngữ** — Hỗ trợ Tiếng Việt và English

---

## 🏗️ Kiến trúc

```
AdBlock/
├── manifest.json           # Extension manifest (MV3)
├── background.js           # Service worker — quản lý state & messaging
├── content_core.js         # Content script lõi — chạy trên mọi trang
├── inject_blocker.js       # Script inject vào page context
├── fb_stealth_bridge.js    # Bridge giao tiếp stealth cho Facebook
├── popup.html / popup.js   # Giao diện popup thống kê
├── rules.json              # Quy tắc chặn network (declarativeNetRequest)
├── engines/
│   ├── facebook.js         # Engine phát hiện quảng cáo Facebook
│   └── youtube.js          # Engine phát hiện quảng cáo YouTube
└── _locales/
    ├── vi/messages.json    # Tiếng Việt
    └── en/messages.json    # English
```

---

## 🚀 Cài đặt thủ công (Developer Mode)

1. Tải về hoặc clone repo này:
   ```bash
   git clone https://github.com/biin489/AdBlock.git
   ```

2. Mở Chrome và truy cập `chrome://extensions/`

3. Bật **Developer mode** (góc trên bên phải)

4. Nhấn **Load unpacked** → chọn thư mục `AdBlock`

5. Extension sẽ xuất hiện trên thanh công cụ Chrome ✅

---

## 🔧 Cách hoạt động

### Facebook Engine
- Sử dụng `MutationObserver` để theo dõi DOM realtime
- Phát hiện bài viết quảng cáo qua chuỗi văn bản (`Được tài trợ`, `Sponsored`, v.v.)
- **Stealth Bridge**: inject script qua `fb_stealth_bridge.js` vào page context để đọc dữ liệu React internal mà content script không thể truy cập trực tiếp

### YouTube Engine
- Tự động click nút "Bỏ qua quảng cáo" khi xuất hiện
- Ẩn các overlay và banner ads

### Network Rules
- File `rules.json` định nghĩa các quy tắc chặn request theo URL pattern
- Sử dụng `declarativeNetRequest` API — hiệu năng cao, không làm chậm browser

### CSS Element Hider (Chặn Thủ Công)
- Sinh CSS Selector tĩnh tuyệt đối (DOM Path) kháng ID và kháng Class (Bypass được cơ chế chống chèn của Facebook, Youtube).
- Tự động bơm `<style>` injection ở giai đoạn `document_start` triệt tiêu chớp giật layout khi tải mới.
- Lưu trữ cục bộ bảo mật và giới hạn RAM `chrome.storage.local`.

---

## 📋 Quyền yêu cầu

| Quyền | Lý do |
|---|---|
| `declarativeNetRequest` | Chặn request mạng theo quy tắc |
| `scripting` | Inject content scripts động |
| `storage` | Lưu thống kê và cài đặt chặn thủ công |
| `tabs` | Đọc thông tin tab hiện tại |
| `contextMenus` | Bật Menu Chuột Phải chèn UI chọn phần tử cần xóa |

---

## 👤 Tác giả

**Thi Phạm** — [github.com/biin489](https://github.com/biin489)

---

## 📄 License

MIT License — Xem file [LICENSE](LICENSE) để biết thêm chi tiết.

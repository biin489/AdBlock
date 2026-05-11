# Changelog

All notable changes to the Absolute AdBlocker extension will be documented in this file.

## [1.4.0] - 2026-05-11
### Added
- **Anti Trình Chặn Quảng Cáo**: Cải thiện khả năng tương thích trên một số nhóm trang web không thân thiện với extension chặn quảng cáo, giúp nội dung hiển thị bình thường khi extension đang bật.
- **Page-Context Shim Layer**: Inject script vào page context ở `document_start` để chuẩn hoá môi trường biến môi trường mà trang web hay kiểm tra (`window.adsbygoogle`, `canRunAds`, `google_jobrunner`, v.v.).
- **Library Shim**: Vô hiệu hoá các thư viện kiểm tra phía client phổ biến (`FuckAdBlock`, `BlockAdBlock`, `SniffAdBlock`) — callback `onNotDetected` luôn fire, `check()` luôn trả `false`.
- **Network Probe Compatibility**: Override `fetch` và `XMLHttpRequest` cho các URL probe quen thuộc — trả về fake 200 empty response để tránh kích hoạt logic kiểm tra phía trang.
- **Script Loader Compatibility**: Hook `appendChild`/`insertBefore` cho `<script>` mang URL probe — fake event `onload` thay vì để trang web phát hiện qua `onerror`.
- **Bait Honeypot**: Tạo các phần tử mồi `<ins>` với class quen thuộc, kích thước `300x100px` ẩn ở `-9999px` — bypass kỹ thuật kiểm tra dựa trên `offsetHeight` của phần tử mồi.
- **Warning Overlay Killer**: `MutationObserver` quét DOM tìm cụm từ cảnh báo (đa ngôn ngữ vi/en) → tự động xoá overlay + tháo lớp khoá scroll trên `html/body`.
- **Player Auto-Restore**: Tự động hiển thị lại các player nội dung bị trang web ẩn (`#player`, `.jwplayer`, `.video-js`, `iframe[allowfullscreen]`, v.v.) để khôi phục trải nghiệm xem.

## [1.3.1] - 2026-03-29
### Added
- Tính năng AI-smart Metadata cho Bảng Xoá quảng cáo thủ công: tự động phân tích và dịch danh tính nội dung (Hình ảnh, Video, Trích xuất văn bản) trước khi ẩn.
- Hiệu ứng Tan Biến như môi trường iOS 18 (Cubic-bezier shrink & blur fade out) khi người dùng tác động xóa/khôi phục quảng cáo trực tiếp trên trang.
- Nâng cấp UI của Popup List có hỗ trợ icon vector đẹp mắt.

### Fixed
- Lỗi invalid URL parse khiến Popup không đọc được dữ liệu phần tử khi `host` bị gán sai giá trị, dẫn tới hiển thị 0 record.

## [1.3.0] - 2026-03-29
### Added
- **Manual Element Hider**: Tính năng chọn vùng và xoá tĩnh quảng cáo bằng Context Menu. Hỗ trợ animation làm mờ tinh tế trước khi xoá.
- **Auto-Hide at document_start**: Các phần tử rác bị chặn thủ công tự động áp dụng CSS qua API `chrome.storage.local` ngay từ lúc tải trang, tuyệt đối không chớp giật layout (nhờ cấu trúc file DOM Path `tag:nth-child`).
- **Undo UI Control**: Có chức năng hoàn tác (Undo/Xóa rule) ngay trong Popup "Quản lý mục đã xóa". Web tự động cập nhật lại hiển thị không cần tải lại trang.

### Removed
- **Manual HTML Scan (Debug Mode)**: Gỡ bỏ hoàn toàn chế độ Debug dò tìm cấu trúc thủ công cũ trên giao diện vì tính năng Manual Hider mớis đã giải quyết hoàn toàn.

---

## [1.2.0] - 2026-03-29
- **Commercial Readiness**: First formal release preparation for Chrome Web Store.
- **Versioning System**: Implemented 4-digit SemVer for better update tracking.
- **Changelog**: Added `CHANGELOG.md` to track extension evolution.
- **UI Enhancements**: Added version display in the popup and "What's New" link.

### Fixed
- General performance improvements in `MutationObserver` filtering.
- Enhanced reliability of Facebook ad detection.

---

## [1.1.0] - 2026-03-15
### Added
- **Sub-Engine Architecture**: Integrated dedicated engines for Facebook and YouTube.
- **Real-time Stats**: Track blocked items categorized by DOM, Network, and Popup.
- **Debug Mode**: Added HTML extraction tool for Facebook posts.

### Changed
- Refactored `content_core.js` for better modularity.
- Updated popup UI with modern glassmorphism design.

---

## [1.0.0] - Initial Release
- Core ad-blocking functionality.
- Basic popup UI.
- Declarative Net Request integration.

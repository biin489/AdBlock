# Changelog

All notable changes to the Absolute AdBlocker extension will be documented in this file.

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

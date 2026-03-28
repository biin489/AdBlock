// === SUB-ENGINE: YOUTUBE ===
// Chỉ load trên *://*.youtube.com/* (khai báo trong manifest.json)
// Phụ thuộc vào: window.SystemLogger và window.AppCore từ content_core.js

// ==========================================
// ĐĂNG KÝ ĐỒNG BỘ VỚI CORE ENGINE
// Gọi ngay khi file load (không đợi callback async)
// → Core biết có Sub-Engine trước khi quyết định bật GenericScanner
// ==========================================
if (window.AppCore) {
    window.AppCore.registerSubEngine('YouTube');
}

// ==========================================
// 1. YOUTUBE AD ENGINE: Logic phát hiện QC YouTube
// ==========================================
class YoutubeAdEngine {
    // Các selector cho phần tử quảng cáo của YouTube
    // Thêm/bớt selector ở đây theo mục đích của bạn
    static AD_SELECTORS = [
        'ytd-ad-slot-renderer',           // Quảng cáo trong feed/trang chủ
        'ytd-promoted-sparkles-web-renderer', // Quảng cáo promoted trong search
        'ytd-promoted-video-renderer',    // Video quảng cáo trong search results
        '#masthead-ad',                   // Banner quảng cáo phía trên
        '.ytd-banner-promo-renderer',     // Banner promo
        'ytd-statement-banner-renderer',  // Banner tuyên bố (mua Premium)
        'ytd-primetime-promo-renderer',   // Quảng cáo Primetime
        '#player-ads',                    // Khu vực quảng cáo ở player
        '.ad-showing .ytp-ad-module',     // Module quảng cáo đang hiển thị
    ];

    // Selector chặn sidebar "recommended" khi đang xem video quảng cáo
    static SIDEBAR_AD_SELECTORS = [
        'ytd-display-ad-renderer',        // Quảng cáo display trong sidebar
    ];

    // [C-2] Lưu trạng thái muted của user trước khi extension can thiệp
    static _userMutedState = false;

    /**
     * Xóa các phần tử quảng cáo DOM tĩnh
     * @returns {number} Số lượng phần tử đã xóa
     */
    static removeAdElements() {
        let removed = 0;
        const allSelectors = [...this.AD_SELECTORS, ...this.SIDEBAR_AD_SELECTORS];

        for (const selector of allSelectors) {
            try {
                document.querySelectorAll(selector).forEach(el => {
                    if (el.dataset.adblockCleaned) return;
                    el.dataset.adblockCleaned = 'true';
                    const info = window.SystemLogger?.extractElementInfo(el);
                    el.style.display = 'none'; // Ẩn thay vì xóa để tránh re-render loop
                    removed++;
                    window.SystemLogger?.log('INFO', `YouTube - Ẩn phần tử QC: ${selector}`, info);
                    window.SystemLogger?.sendDomBlockLog(`YouTube DOM - ${selector}`, info);
                });
            } catch (e) {
                window.SystemLogger?.log('ERROR', `Lỗi khi xử lý selector: ${selector}`, null, e);
            }
        }
        return removed;
    }

    /**
     * Bỏ qua quảng cáo video (tự click nút Skip)
     * @returns {boolean} true nếu đã click skip
     */
    static skipVideoAd() {
        // Các nút skip có thể xuất hiện với nhiều selector khác nhau
        const skipSelectors = [
            '.ytp-ad-skip-button',
            '.ytp-skip-ad-button',
            '.ytp-ad-skip-button-modern',
        ];

        for (const sel of skipSelectors) {
            const skipBtn = document.querySelector(sel);
            if (skipBtn && skipBtn.offsetParent !== null) { // offsetParent != null = đang hiển thị
                skipBtn.click();
                window.SystemLogger?.log('INFO', 'YouTube - Đã tự động click Skip Ad');
                window.SystemLogger?.sendDomBlockLog('YouTube Video Ad - Tự động Skip', { tag: 'BUTTON', src: window.location.href });
                return true;
            }
        }
        return false;
    }

    /**
     * Tăng tốc quảng cáo video bằng cách set playbackRate = 16x
     * [C-2] Lưu trạng thái muted của user trước khi thiết lập, khôi phục đúng sau khi QC kết thúc
     */
    static muteAndSpeedupAd() {
        const video = document.querySelector('video');
        if (!video) return;

        const adOverlay = document.querySelector('.ad-showing');
        if (adOverlay) {
            if (video.playbackRate < 16) {
                this._userMutedState = video.muted; // [C-2] Ghi nhớ ý muốn của user
                video.playbackRate = 16;
                video.muted = true;
                window.SystemLogger?.log('INFO', 'YouTube - Đang tăng tốc quảng cáo video (16x, tắt tiếng)');
            }
        } else {
            // Khôi phục tốc độ bình thường khi hết QC
            if (video.playbackRate > 1) {
                video.playbackRate = 1;
                video.muted = this._userMutedState; // [C-2] Khôi phục đúng state cũ của user
            }
        }
    }
}

// ==========================================
// 2. YOUTUBE SCANNER: Vòng lặp quét và dọn dẹp
// ==========================================
class YoutubeScanner {
    static _scanInterval = null;
    static _adCheckInterval = null;
    static _observer = null;

    static init() {
        this.startObserver();
        this.cleanYoutubeAds();

        // [Opt-1] Quét DOM định kỳ để bắt quảng cáo lazy-load
        this._scanInterval = setInterval(() => {
            if (!document.hidden) this.cleanYoutubeAds();
        }, 3000); // Tăng lên 3s cho YouTube vì MutationObserver đã làm tốt việc bắt node mới

        // [Opt-2] Tăng interval và kiểm tra hidden cho video ads
        this._adCheckInterval = setInterval(() => {
            if (!document.hidden) {
                YoutubeAdEngine.skipVideoAd();
                YoutubeAdEngine.muteAndSpeedupAd();
            }
        }, 1000);

        // [HOT TOGGLE] Lắng nghe tín hiệu dừng từ Core
        window.addEventListener('adblock:stop', () => this.stop());
    }

    static stop() {
        SystemLogger.log('WARN', 'YoutubeScanner: Dừng hoạt động (Hot Toggle)');
        if (this._scanInterval) {
            clearInterval(this._scanInterval);
            this._scanInterval = null;
        }
        if (this._adCheckInterval) {
            clearInterval(this._adCheckInterval);
            this._adCheckInterval = null;
        }
        if (this._observer) {
            this._observer.disconnect();
            this._observer = null;
        }
    }

    static cleanYoutubeAds() {
        try {
            const removed = YoutubeAdEngine.removeAdElements();
            if (removed > 0) {
                window.SystemLogger?.log('INFO', `YouTube - Vòng quét DOM xóa ${removed} phần tử QC`);
            }
        } catch (e) {
            window.SystemLogger?.log('ERROR', 'Lỗi vòng lặp cleanYoutubeAds', null, e);
        }
    }

    static startObserver() {
        this._observer = new MutationObserver((mutations) => {
            if (mutations.some(m => m.addedNodes.length > 0)) {
                // [H-4] Chỉ quét DOM khi có node mới. Đã bỏ skipVideoAd/muteAndSpeedupAd
                // khỏi observer để tránh gọi 2 hàm này hàng chục lần/giây khi YouTube lazy-load.
                // Interval riêng (800ms) xử lý skip/speedup với tần suất hợp lý.
                this.cleanYoutubeAds();
            }
        });
        this._observer.observe(document.documentElement, { childList: true, subtree: true });
    }
}

// ==========================================
// BOOTSTRAP: Kiểm tra và khởi chạy YouTube Scanner
// ==========================================
chrome.storage.local.get(['enabledDomains'], (data) => {
    const enabledDomains = data.enabledDomains || [];
    const currentHost = window.location.hostname;

    if (!enabledDomains.includes(currentHost)) {
        return; // Core đã log trạng thái TẮT rồi
    }

    window.SystemLogger?.log('INFO', 'Định tuyến môi trường: YouTube - Bật YouTube Scanner');
    YoutubeScanner.init();
});

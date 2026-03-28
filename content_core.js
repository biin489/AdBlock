// ==========================================
// CONTENT_CORE.JS - CORE ENGINE
// Chạy trên MỌI trang web (nếu được bật).
// Cung cấp: SystemLogger, AdBlockEngine, PopupBlocker, GenericScanner
// ==========================================

// ==========================================
// 1. SYSTEM LOGGER: Quản lý Hệ thống Log
// ==========================================
class SystemLogger {
    static logs = [];
    static MAX_LOGS = 250;

    static log(level, action, details = null, error = null) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            level: level,
            action: action,
            details: details,
            error: error ? (error.message || error.toString()) : null,
            url: window.location.href
        };

        this.logs.push(logEntry);
        if (this.logs.length > this.MAX_LOGS) this.logs.shift();

        if (level === 'ERROR') {
            console.error(`[AdBlock SysLog] ${action}`, details, error);
        } else if (level === 'WARN') {
            // [Prod] Mute non-critical warnings in console
            // console.warn(`[AdBlock SysLog] ${action}`, details);
        }
    }

    static extractElementInfo(el) {
        if (!el) return null;
        let htmlSnippet = 'N/A';
        try {
            htmlSnippet = el.outerHTML || 'N/A';
            if (htmlSnippet.length > 800) {
                htmlSnippet = htmlSnippet.substring(0, 800) + '\n\n... [ĐÃ CẮT BỚT DO QUÁ DÀI]';
            }
        } catch (e) {
            this.log('ERROR', 'Lỗi khi trích xuất HTML Snippet', null, e);
        }

        return {
            tag: el.tagName || 'N/A',
            id: el.id || 'N/A',
            className: typeof el.className === 'string' ? el.className : 'N/A',
            size: el.getBoundingClientRect ? `${Math.round(el.getBoundingClientRect().width)}x${Math.round(el.getBoundingClientRect().height)}` : 'N/A',
            src: el.src || el.href || 'N/A',
            html: htmlSnippet
        };
    }

    static listenForLogRequests() {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message.action === 'GET_SYSTEM_LOGS') {
                sendResponse({ systemLogs: this.logs });
            }
        });
    }

    static sendDomBlockLog(details, elementInfo) {
        if (chrome.runtime?.id) {
            chrome.runtime.sendMessage({ action: 'log_dom_block', details, elementInfo }).catch(() => { });
        }
    }

    static sendPopupBlockLog(elementInfo) {
        if (chrome.runtime?.id) {
            chrome.runtime.sendMessage({ action: 'log_popup_block', elementInfo }).catch(() => { });
        }
    }
}
window.SystemLogger = SystemLogger;

// ==========================================
// 2. ADBLOCK ENGINE: CORE PURE LOGIC
// Lõi phán đoán quảng cáo chung (không biết về FB/YT cụ thể)
// ==========================================
class AdBlockEngine {
    static AD_SIZES = [[728, 90], [720, 90], [720, 80], [300, 250], [160, 600], [320, 50], [970, 90], [970, 250], [300, 600]];
    static BAD_KEYWORDS = ['sunwin', 'hitclub', 'win79', 'vsbet', 'zowin', 'nhatvip', 'go88', 'b52', 'bet', 'casino', 'tai-xiu', 'nohu', 'banca', 'gamvip', 'vip', 'haywin', '88', 'catfix', 'catfish'];
    // Chỉ chứa các tag HTML ngữ nghĩa thuần — không biết về YouTube hay Facebook
    static SAFE_TAGS = ['BODY', 'HTML', 'MAIN', 'ARTICLE', 'HEADER', 'FOOTER', 'NAV', 'SECTION', 'ASIDE'];

    static isGenericAd(rect, style, tagName, windowArea, windowInnerHeight) {
        if (this.SAFE_TAGS.includes(tagName)) return false;
        const area = rect.width * rect.height;
        if (area === 0) return false;

        if (style.position === 'fixed' || style.position === 'absolute') {
            const zIndex = parseInt(style.zIndex, 10);
            if (zIndex > 999 && (rect.bottom >= windowInnerHeight - 50 || rect.top <= 50)) {
                return 'Banner ghim cứng';
            }
            if (area > (windowArea * 0.6)) {
                const zIndexParsed = parseInt(style.zIndex, 10) || 0;
                if (style.opacity < 0.1 || style.backgroundColor === 'rgba(0, 0, 0, 0)' || style.backgroundColor === 'transparent' || zIndexParsed > 99999) {
                    return 'Lớp phủ vô hình đè màn hình';
                }
            }
        }

        const isStandardSize = this.AD_SIZES.some(size => Math.abs(rect.width - size[0]) <= 10 && Math.abs(rect.height - size[1]) <= 10);
        if (isStandardSize && (tagName === 'IFRAME' || tagName === 'A')) {
            return `Kích thước chuẩn QC (${Math.round(rect.width)}x${Math.round(rect.height)})`;
        }
        return false;
    }

    static isCosmeticLinkBad(href, imgSrc, imgAlt, imgTitle) {
        if (href && this.BAD_KEYWORDS.some(kw => href.toLowerCase().includes(kw))) return true;
        if (this.BAD_KEYWORDS.some(kw => imgSrc.toLowerCase().includes(kw) || imgAlt.toLowerCase().includes(kw) || imgTitle.toLowerCase().includes(kw))) return true;
        return false;
    }

    static isCosmeticDivBad(className, id) {
        className = (className || '').toLowerCase();
        id = (id || '').toLowerCase();
        // [M-3] Thêm 'advance|advantage' để tránh false positive với advanced-search, advantage-panel, v.v.
        const safeRegex = /(thread|head|load|radio|shadow|padding|gradient|ready|badge|download|metadata|reader|header|advance|advantage)/i;
        if (safeRegex.test(className) || safeRegex.test(id)) return false;

        return (className === 'adv' || className.includes(' adv ') || className.startsWith('adv ') ||
                className.includes('_adv') || className.includes('-adv') || className.includes('catfix') ||
                className.includes('ad-center') || className.includes('-ads-') ||
                id.includes('ad-center') || id.includes('catfix'));
    }

    static isAdWrapper(className, id) {
        className = (className || '').toLowerCase();
        id = (id || '').toLowerCase();
        // [M-3] Thêm 'advance|advantage' để tránh false positive
        const safeRegex = /(thread|head|load|radio|shadow|padding|gradient|ready|badge|download|metadata|reader|header|advance|advantage)/i;
        if (safeRegex.test(className) || safeRegex.test(id)) {
            return false;
        }
        const adRegex = /(^|[-_ \b])(ad|ads|adv|advertisement|sponsor|sponsored|banner|catfix)([-_ \b]|$)/i;
        return adRegex.test(className) || adRegex.test(id);
    }
}
window.AdBlockEngine = AdBlockEngine;

// ==========================================
// 3. POPUP BLOCKER
// ==========================================
class PopupBlocker {
    static init() {
        this.injectWindowOpenBlocker();
        this.listenForFakeWindowOpen();
        this.listenForClickUnders();
    }

    static injectWindowOpenBlocker() {
        try {
            const injectScript = document.createElement('script');
            injectScript.src = chrome.runtime.getURL('inject_blocker.js');
            injectScript.onload = function() {
                this.remove();
            };
            (document.head || document.documentElement).appendChild(injectScript);
            SystemLogger.log('INFO', 'Đã tiêm script đóng băng window.open thông qua tài nguyên ngoài (tránh CSP).');
        } catch (e) {
            SystemLogger.log('ERROR', 'Lỗi khi tiêm script window.open', null, e);
        }
    }

    static listenForFakeWindowOpen() {
        window.addEventListener('message', (e) => {
            if (e.source === window && e.data.type === 'ADBLOCK_POPUP') {
                SystemLogger.log('WARN', 'Phát hiện mã độc cố gọi window.open', e.data.url);
                SystemLogger.sendPopupBlockLog({ tag: 'Window', src: e.data.url });
            }
        });
    }

    static listenForClickUnders() {
        document.addEventListener('click', (e) => {
            if (e.isTrusted) {
                const target = e.target.closest('a');
                if (target && target.target === '_blank') {
                    const isInternal = target.href.includes(window.location.hostname);
                    // [M-2] Thêm guard: bỏ qua SVG icon links và image links hợp lệ
                    // (các nút share/print dùng SVG sẽ không bị chặn nhầm)
                    const hasSvg = !!target.querySelector('svg');
                    const hasImg = !!target.querySelector('img');
                    if (!isInternal && target.textContent.trim().length === 0 && !target.querySelector('img.content-img') && !hasSvg && !hasImg) {
                        e.preventDefault();
                        e.stopPropagation();
                        SystemLogger.log('WARN', 'Đã chặn Click-under tàng hình', target.href);
                        SystemLogger.sendPopupBlockLog({ tag: 'A', src: target.href });
                    }
                }
            }
        }, true);
    }
}

// ==========================================
// 4. GENERIC SCANNER: Bộ quét trang thường
// ==========================================
class GenericScanner {
    static timeout = null;
    static _interval = null; // [M-1] Lưu interval ID để có thể dừng khi cần

    static init() {
        this.startObserver();
        if (document.readyState === 'loading') {
            window.addEventListener('DOMContentLoaded', () => this.detectAndDestroy());
        } else {
            this.detectAndDestroy();
        }
        // [Opt-1] Chỉ chạy Interval khi tab đang hiển thị để tiết kiệm pin/CPU
        this._interval = setInterval(() => {
            if (!document.hidden) this.detectAndDestroy();
        }, 2500);
    }

    static stop() {
        if (this._interval) {
            clearInterval(this._interval);
            this._interval = null;
        }
        if (this.timeout) {
            cancelIdleCallback(this.timeout);
            this.timeout = null;
        }
    }

    static detectAndDestroy() {
        const startTime = performance.now();
        let scannedElements = 0;
        let removedElements = 0;

        try {
            const windowArea = window.innerWidth * window.innerHeight;
            const windowInnerHeight = window.innerHeight;
            const suspiciousElements = document.querySelectorAll('iframe, div[style*="position"], a[style*="position"]');
            scannedElements = suspiciousElements.length;

            suspiciousElements.forEach(el => {
                const style = window.getComputedStyle(el);
                if (!style || style.display === 'none') return;

                const rect = el.getBoundingClientRect();
                const reason = AdBlockEngine.isGenericAd(rect, style, el.tagName, windowArea, windowInnerHeight);

                if (reason) {
                    const info = SystemLogger.extractElementInfo(el);
                    el.remove();
                    removedElements++;
                    SystemLogger.log('INFO', `Thực thi Heuristic: ${reason}`, info);
                    SystemLogger.sendDomBlockLog(`Heuristic: ${reason}`, info);
                }
            });

            this.applyCosmeticFilters();
        } catch (error) {
            SystemLogger.log('ERROR', 'Lỗi nghiêm trọng trong thuật toán detectAndDestroy', null, error);
        } finally {
            const timeTaken = performance.now() - startTime;
            if (removedElements > 0) {
                SystemLogger.log('INFO', `Vòng quét DOM hoàn tất`, `Quét ${scannedElements} thẻ, Xóa ${removedElements} thẻ, Mất ${timeTaken.toFixed(2)}ms`);
            }
        }
    }

    static applyCosmeticFilters() {
        try {
            let cosmeticRemoved = 0;

            document.querySelectorAll('a').forEach(link => {
                const img = link.querySelector('img');
                const imgSrc = img ? (img.src || '').toLowerCase() : '';
                const imgAlt = img ? (img.alt || '').toLowerCase() : '';
                const imgTitle = img ? (img.title || '').toLowerCase() : '';

                const isBad = AdBlockEngine.isCosmeticLinkBad(link.href, imgSrc, imgAlt, imgTitle);

                if (isBad) {
                    let targetToRemove = link;
                    let parent = link.parentElement;

                    while (parent && !AdBlockEngine.SAFE_TAGS.includes(parent.tagName)) {
                        const className = (parent.className || '').toLowerCase();
                        const id = (parent.id || '').toLowerCase();

                        if (AdBlockEngine.isAdWrapper(className, id) ||
                           (parent.childElementCount <= 4 && parent.textContent.trim().length < 50)) {
                            targetToRemove = parent;
                        } else {
                            break;
                        }
                        parent = parent.parentElement;
                    }

                    if (AdBlockEngine.SAFE_TAGS.includes(targetToRemove.tagName)) {
                        return;
                    }

                    const info = SystemLogger.extractElementInfo(targetToRemove);
                    targetToRemove.remove();
                    cosmeticRemoved++;
                    SystemLogger.log('INFO', 'Thực thi Cosmetic Filter: Banner cá cược', info);
                    SystemLogger.sendDomBlockLog('Cosmetic Filter: Banner cá cược', info);
                }
            });

            document.querySelectorAll('div').forEach(div => {
                const isBadDiv = AdBlockEngine.isCosmeticDivBad(div.className, div.id);
                if (isBadDiv) {
                    const info = SystemLogger.extractElementInfo(div);
                    div.remove();
                    cosmeticRemoved++;
                    SystemLogger.log('INFO', 'Thực thi Cosmetic Filter: Khối Div rác', info);
                    SystemLogger.sendDomBlockLog('Cosmetic Filter: Div chứa class Ads', info);
                }
            });

            if (cosmeticRemoved > 0) SystemLogger.log('INFO', `Vòng quét Cosmetic hoàn tất`, `Xóa ${cosmeticRemoved} banner/div rác`);
        } catch (error) {
            SystemLogger.log('ERROR', 'Lỗi nghiêm trọng trong applyCosmeticFilters', null, error);
        }
    }

    static debounceDetect() {
        if (this.timeout) cancelIdleCallback(this.timeout);
        // [Opt-2] Dùng requestIdleCallback thay vì setTimeout để quét khi trình duyệt rảnh
        this.timeout = requestIdleCallback(() => {
            if (!document.hidden) this.detectAndDestroy();
        }, { timeout: 1000 });
    }

    static startObserver() {
        const observer = new MutationObserver((mutations) => {
            let hasNewNodes = mutations.some(m => m.addedNodes.length > 0);
            if (hasNewNodes) this.debounceDetect();
        });
        observer.observe(document.documentElement, { childList: true, subtree: true });
    }
}

// ==========================================
// 5. MANUAL BLOCKER: Chặn quảng cáo thủ công
// ==========================================
class ManualBlocker {
    static isSelectionMode = false;
    static hoveredElement = null;
    static hiddenSelectors = [];
    static hostname = '';

    static init() {
        try {
            this.hostname = window.top.location.hostname;
        } catch(e) {
            this.hostname = window.location.hostname;
        }

        // Tạo thẻ style tiêm vào head kháng chớp màn hình ở document_start
        this.styleTag = document.createElement('style');
        this.styleTag.id = 'adblock-manual-hider';
        (document.head || document.documentElement).appendChild(this.styleTag);

        this.loadAndApplySelectors();
        this.setupMessageListener();
        this.setupSelectionEvents();
    }

    static loadAndApplySelectors() {
        const storageKey = `manual_ads_${this.hostname}`;
        chrome.storage.local.get([storageKey], (data) => {
            this.hiddenSelectors = data[storageKey] || [];
            this.updateStyleTag();
        });
    }

    static updateStyleTag() {
        if (this.hiddenSelectors.length > 0) {
            const cssSelectors = this.hiddenSelectors.map(item => typeof item === 'string' ? item : item.selector);
            const rule = cssSelectors.join(',\n') + ' {\n  display: none !important;\n  visibility: hidden !important;\n  pointer-events: none !important;\n  width: 0 !important;\n  height: 0 !important;\n}';
            this.styleTag.innerHTML = rule;
        } else {
            this.styleTag.innerHTML = '';
        }
    }

    static setupMessageListener() {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message.action === 'TOGGLE_MANUAL_BLOCKER') {
                this.isSelectionMode = !this.isSelectionMode;
                if (!this.isSelectionMode && this.hoveredElement) {
                    this.hoveredElement.style.outline = '';
                    this.hoveredElement = null;
                }
                if (this.isSelectionMode) {
                    this.showToast("🔎 Chế độ Xoá Thủ Công: Rê chuột và Click vào phần tử muốn tuỷ diệt vĩnh viễn (Bấm ESC để huỷ).");
                } else {
                    this.showToast("Đã tắt chế độ Xoá nền tảng này.");
                }
                sendResponse({ success: true });
            } else if (message.action === 'REMOVE_MANUAL_RULE') {
                // Nhận yêu cầu Hoàn tác từ Popup
                const ruleToRemove = message.selector;
                
                const exists = this.hiddenSelectors.find(item => {
                    return (typeof item === 'string' ? item : item.selector) === ruleToRemove;
                });

                if (ruleToRemove && exists) {
                    this.hiddenSelectors = this.hiddenSelectors.filter(item => {
                        return (typeof item === 'string' ? item : item.selector) !== ruleToRemove;
                    });
                    
                    const storageKey = `manual_ads_${this.hostname}`;
                    
                    // Hiệu ứng Fade In kiểu iOS trước khi loại bỏ khỏi style tag
                    const el = document.querySelector(ruleToRemove);
                    if (el) {
                        // Chuẩn bị trạng thái 
                        el.style.opacity = '0';
                        el.style.filter = 'blur(10px)';
                        el.style.transform = 'scale(0.8)';
                        el.style.transition = 'all 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)';
                        
                        // Áp dụng gỡ quy tắc trong DB
                        chrome.storage.local.set({ [storageKey]: this.hiddenSelectors }, () => {
                            this.updateStyleTag(); // Xóa display:none từ CSS
                            this.showToast("♻️ Đã khôi phục phần tử thành công.");
                            
                            // Force reflow để browser nhận trạng thái ban đầu của inline
                            void el.offsetHeight;
                            
                            // Bung hiệu ứng
                            el.style.opacity = '1';
                            el.style.filter = 'blur(0px)';
                            el.style.transform = 'scale(1)';
                            
                            setTimeout(() => {
                                el.style.transition = '';
                                el.style.opacity = '';
                                el.style.filter = '';
                                el.style.transform = '';
                            }, 600);
                        });
                    } else {
                        // Nều không tìm thấy DOM thì gỡ luôn
                        chrome.storage.local.set({ [storageKey]: this.hiddenSelectors }, () => {
                            this.updateStyleTag();
                            this.showToast("♻️ Đã khôi phục phần tử thành công.");
                        });
                    }
                }
                sendResponse({ success: true });
            }
        });

        // Bấm phím ESC để thoát
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isSelectionMode) {
                this.isSelectionMode = false;
                if (this.hoveredElement) this.hoveredElement.style.outline = '';
                this.showToast("Đã tắt chế độ Xoá thủ công.");
            }
        });
    }

    static setupSelectionEvents() {
        document.addEventListener('mouseover', (e) => {
            if (!this.isSelectionMode) return;
            const element = e.target;
            if (this.hoveredElement && this.hoveredElement !== element) this.hoveredElement.style.outline = '';
            this.hoveredElement = element;
            if (this.hoveredElement) {
                this.hoveredElement.style.outline = '3px dashed #ef4444';
            }
        });

        document.addEventListener('mouseout', (e) => {
            if (!this.isSelectionMode || !this.hoveredElement) return;
            this.hoveredElement.style.outline = '';
        });

        document.addEventListener('click', (e) => {
            if (!this.isSelectionMode) return;
            e.preventDefault();
            e.stopPropagation();

            if (this.hoveredElement) {
                const elementToHide = this.hoveredElement;
                elementToHide.style.outline = '';
                
                const selector = this.generateSelector(elementToHide);
                if (selector) {
                    // Trích xuất siêu dữ liệu thông minh để Popup hiển thị UI/UX
                    let type = 'LAYOUT';
                    let text = `Khối giao diện (${elementToHide.tagName})`;
                    
                    if (elementToHide.innerText && elementToHide.innerText.trim().length > 0) {
                        type = 'TEXT';
                        text = elementToHide.innerText.trim().substring(0, 35).replace(/\s+/g, ' ') + '...';
                    } else if (elementToHide.tagName === 'IMG' || elementToHide.querySelector('img')) {
                        type = 'IMAGE';
                        text = 'Hình ảnh quảng cáo / Banner';
                    } else if (elementToHide.tagName === 'VIDEO' || elementToHide.querySelector('video')) {
                        type = 'VIDEO';
                        text = 'Video Player / Multimedia';
                    } else if (elementToHide.tagName === 'A' || elementToHide.querySelector('a')) {
                        type = 'LINK';
                        const a = elementToHide.tagName === 'A' ? elementToHide : elementToHide.querySelector('a');
                        text = a.href ? a.href.replace(/^https?:\/\/(www\.)?/, '').substring(0, 35) + '...' : 'Liên kết (Link)';
                    }
                    const ruleObj = { selector, type, text, ts: Date.now() };

                    // Animation "Tan Biến" (Dissolve) kiểu iOS 18 Safari
                    elementToHide.style.transition = 'all 0.6s cubic-bezier(0.25, 1, 0.5, 1)';
                    elementToHide.style.transform = 'scale(0.85) translateY(10px)';
                    elementToHide.style.filter = 'blur(10px) grayscale(100%)';
                    elementToHide.style.opacity = '0';
                    elementToHide.style.pointerEvents = 'none';

                    setTimeout(() => {
                        this.saveSelector(ruleObj);
                        SystemLogger.log('INFO', 'Xoá thủ công 1 phần tử trên trang', { tag: elementToHide.tagName, src: window.location.href, html: selector });
                        this.showToast("✅ Đã diệt phần tử này mãi mãi. Reload lại trang web sẽ vẫn không còn!");
                    }, 600); // Đợi 600ms sau khi hoạt ảnh kết thúc
                } else {
                    this.showToast("❌ Không thể xác định cấu trúc phần tử này.", true);
                }

                this.isSelectionMode = false;
                this.hoveredElement = null;
            }
        }, true);
    }

    static generateSelector(el) {
        if (!el || el.tagName === 'BODY' || el.tagName === 'HTML') return '';
        let path = [];
        let current = el;
        while (current && current.tagName !== 'BODY' && current.tagName !== 'HTML') {
            let tag = current.tagName.toLowerCase();
            let siblings = Array.from(current.parentNode.children);
            let index = siblings.indexOf(current) + 1;
            path.unshift(`${tag}:nth-child(${index})`);
            current = current.parentNode;
        }
        if (path.length === 0) return '';
        return 'body > ' + path.join(' > ');
    }

    static saveSelector(ruleObj) {
        const selectorStr = typeof ruleObj === 'string' ? ruleObj : ruleObj.selector;
        const exists = this.hiddenSelectors.some(item => {
            const s = typeof item === 'string' ? item : item.selector;
            return s === selectorStr;
        });

        if (!exists) {
            this.hiddenSelectors.push(ruleObj);
            // Giữ cho file nhẹ và siêu nhanh (tối đa 100 rule thủ công / domain)
            if (this.hiddenSelectors.length > 100) {
                this.hiddenSelectors.shift();
            }
            
            const storageKey = `manual_ads_${this.hostname}`;
            chrome.storage.local.set({ [storageKey]: this.hiddenSelectors }, () => {
                this.updateStyleTag();
            });
            
            // Gửi sự kiện cho extension đếm
            SystemLogger.sendDomBlockLog('Xoá Thủ Công', { tag: 'Manual', src: this.hostname });
        }
    }

    static showToast(msg, isError = false) {
        const tempMsg = document.createElement('div');
        tempMsg.style.cssText = `position:fixed; bottom:30px; left:50%; transform:translateX(-50%); z-index:99999999; padding:12px 24px; background:${isError ? '#ef4444' : '#1e293b'}; color:white; border-radius:12px; font-family:-apple-system, BlinkMacSystemFont, sans-serif; font-size: 14px; font-weight:600; box-shadow: 0 10px 25px rgba(0,0,0,0.3); transition: opacity 0.3s; opacity: 1; pointer-events:none; border: 1px solid rgba(255,255,255,0.1);`;
        tempMsg.innerText = msg;
        document.body.appendChild(tempMsg);
        setTimeout(() => {
            tempMsg.style.opacity = '0';
            setTimeout(() => tempMsg.remove(), 300);
        }, 3500);
    }
}

// ==========================================
// 5. APP CORE: Bootstrap & Sub-Engine Registry
//
// API cho Sub-Engines:
//   window.AppCore.registerSubEngine(name)
//   → Sub-Engine gọi hàm này ĐỒNG BỘ (synchronous) ngay khi file load.
//   → Core sẽ không bật GenericScanner nếu có Sub-Engine đã đăng ký.
// ==========================================
class AppCore {
    static _registeredEngines = [];
    static _coreStarted = false;

    /**
     * Sub-Engines gọi hàm này NGAY KHI FILE LOAD (không cần đợi callback async).
     * Đây là cơ chế đăng ký đồng bộ, đảm bảo Core biết Sub-Engine tồn tại
     * trước khi đưa ra quyết định bật/tắt GenericScanner.
     */
    static registerSubEngine(name) {
        this._registeredEngines.push(name);
        SystemLogger.log('INFO', `Sub-Engine đã đăng ký: [${name}]`);
    }

    // [HOT TOGGLE] Dừng tất cả hoạt động chặn của Core và Sub-Engines (nếu có)
    static stop() {
        if (!this._coreStarted) return;
        SystemLogger.log('WARN', 'Dừng AdBlock Core Script (Hot Toggle).');
        GenericScanner.stop();
        // Gửi tín hiệu dừng cho Sub-Engines nếu chúng đang chạy
        window.dispatchEvent(new CustomEvent('adblock:stop'));
        this._coreStarted = false;
    }

    static init() {
        if (this._coreStarted) return;
        this._coreStarted = true;

        SystemLogger.listenForLogRequests();
        SystemLogger.log('INFO', 'Khởi tạo AdBlock Core Script.');
        PopupBlocker.init();
        
        // ManualBlocker chạy ĐỘC LẬP trên mọi website (kể cả có SubEngine hay không)
        ManualBlocker.init();

        if (this._registeredEngines.length === 0) {
            // Không có Sub-Engine nào đăng ký → đây là web thường → bật Generic Scanner
            SystemLogger.log('INFO', `Định tuyến môi trường: Web thường - Bật Generic Scanner`);
            GenericScanner.init();
        } else {
            // Có Sub-Engine đăng ký → Sub-Engine sẽ tự quản lý
            SystemLogger.log('INFO', `Phát hiện Sub-Engine [${this._registeredEngines.join(', ')}] - Generic Scanner đã tắt.`);
        }
    }
}

// Expose sớm để Sub-Engines có thể gọi registerSubEngine() ngay khi file load
window.AppCore = AppCore;

// ==========================================
// BOOTSTRAP & HOT TOGGLE
// ==========================================
function bootstrap() {
    chrome.storage.local.get(['enabledDomains'], (data) => {
        const enabledDomains = data.enabledDomains || [];
        const currentHost = window.location.hostname;

        if (enabledDomains.includes(currentHost)) {
            //Yield cho Sub-Engines kịp đăng ký
            setTimeout(() => AppCore.init(), 0);
        }
    });
}

// Lắng nghe thay đổi để BẬT/TẮT nóng không cần reload trang
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.enabledDomains) {
        const enabledDomains = changes.enabledDomains.newValue || [];
        const currentHost = window.location.hostname;
        const isEnabled = enabledDomains.includes(currentHost);

        if (isEnabled && !AppCore._coreStarted) {
            AppCore.init();
        } else if (!isEnabled && AppCore._coreStarted) {
            AppCore.stop();
        }
    }
});

bootstrap();

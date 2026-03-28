// === SUB-ENGINE: FACEBOOK ===
// Chỉ load trên *://*.facebook.com/* (khai báo trong manifest.json)
// Phụ thuộc vào: window.SystemLogger và window.AppCore từ content_core.js

// ==========================================
// ĐĂNG KÝ ĐỒNG BỘ VỚI CORE ENGINE
// Gọi ngay khi file load (không đợi callback async)
// → Core biết có Sub-Engine trước khi quyết định bật GenericScanner
// ==========================================
if (window.AppCore) {
    window.AppCore.registerSubEngine('Facebook');
}

// ==========================================
// 1. ENGINE RIÊNG BIỆT CHO FACEBOOK
// ==========================================
class FacebookAdEngine {
    static EXACT_AD_WORDS = ["được tài trợ", "sponsored"];
    static EXACT_SUGGESTION_WORDS = ["gợi ý cho bạn", "suggested for you", "những người bạn có thể biết", "people you may know"];
    static fiberAdMap = new Map(); // Results from Stealth Bridge (React Fiber), capped at 200 entries

    static isFacebookSpam(post, settings) {
        try {
            if (settings.block_ads) {
                // [Additive 1] Check Stealth Bridge data (React Fiber)
                const postId = post.id || post.getAttribute('aria-posinset');
                if (postId && this.fiberAdMap.has(postId)) {
                    return this.fiberAdMap.get(postId);
                }

                if (post.querySelector('[data-ad-rendering-role^="cta-"]')) return "Quảng cáo (Có nút CTA Hành động)";
                for (let link of post.querySelectorAll('a')) {
                    const href = link.getAttribute('href') || '';
                    if (href.includes('/ads/about/') || href.includes('ad_id=') || href.includes('client_token=')) return "Quảng cáo (Có link Ads hệ thống)";
                }
                for (let use of post.querySelectorAll('use')) {
                    const href = use.getAttribute('xlink:href') || use.getAttribute('href') || '';
                    if (href.includes('#spon_') || href.includes('sponsored')) return "Được tài trợ (Mã SVG ẩn)";
                }
                for (let el of post.querySelectorAll('[aria-label]')) {
                    const label = (el.getAttribute('aria-label') || '').toLowerCase().trim();
                    if (label === 'được tài trợ' || label === 'sponsored' || label === 'đóng bài viết được tài trợ') return "Được tài trợ (Aria-label)";
                }
                for (let h of post.querySelectorAll('span[dir="auto"], h3, h4')) {
                    if (this.EXACT_AD_WORDS.includes((h.textContent || "").trim().toLowerCase())) return "Quảng cáo (Text tĩnh Được tài trợ)";
                }
            }
            if (settings.block_suggested) {
                // [Layer 1] aria-label deep scan — Facebook dùng aria-label cho a11y trên label "Gợi ý cho bạn"
                // EXACT match, không dùng includes() → false positive = 0
                for (let el of post.querySelectorAll('[aria-label]')) {
                    const label = (el.getAttribute('aria-label') || '').toLowerCase().trim();
                    if (this.EXACT_SUGGESTION_WORDS.includes(label))
                        return "Gợi ý rác (Aria-label exact)";
                }

                // [Layer 2] Composite text: bắt trường hợp Facebook split "Gợi ý cho bạn" thành nhiều span con
                // → textContent của span CHA đúng, nhưng dài hơn 50 → bị bỏ lọt bởi logic cũ
                // Guard kép: 4 < length <= 80 để không match nội dung bài viết thật (thường >> 80 ký tự)
                // Dùng includes() nhưng từ khoá đều là cụm dài đặc thù → false positive rất thấp
                for (let el of post.querySelectorAll('span[dir="auto"], h3, h4')) {
                    const text = (el.textContent || '').trim().toLowerCase();
                    if (text.length > 80) continue; // Nới từ 50→80 để bắt parent span
                    if (text.length < 4) continue;  // Bỏ qua span rỗng / icon / ký tự đơn
                    if (this.EXACT_SUGGESTION_WORDS.some(w => text.includes(w)))
                        return "Gợi ý rác (Text composite)";
                }

                // [Layer 3] Exact match — giữ nguyên logic gốc làm safety fallback
                for (let el of post.querySelectorAll('span[dir="auto"], h3, h4')) {
                    const text = (el.textContent || '').trim().toLowerCase();
                    if (text.length > 50) continue;
                    if (this.EXACT_SUGGESTION_WORDS.includes(text))
                        return "Gợi ý rác (Text exact)";
                }
            }
            if (settings.block_strangers) {
                const isGroupPost = !!post.querySelector('a[href*="/groups/"]');
                for (let btn of post.querySelectorAll('div[role="button"], span[role="button"]')) {
                    const t = (btn.textContent || "").trim().toLowerCase();
                    if (t === 'tham gia' || t === 'join') return "Gợi ý Nhóm (Chưa tham gia)";
                    if (t === 'theo dõi' || t === 'follow') {
                        if (isGroupPost) continue; // Bỏ qua nếu là bài trong nhóm đã tham gia
                        return "Người lạ / Trang chưa theo dõi";
                    }
                }
            }
        } catch (e) {
            window.SystemLogger?.log('ERROR', 'Lỗi trong thuật toán isFacebookSpam', null, e);
        }
        return false;
    }
}

// ==========================================
// 2. DEBUG UI MANAGER (chỉ dùng cho Facebook)
// ==========================================
class DebugUIManager {
    static isDebugMode = false;
    static hoveredElement = null;

    static init() {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message.action === 'TOGGLE_DEBUG_MODE') {
                this.isDebugMode = message.state;
                if (!this.isDebugMode && this.hoveredElement) {
                    this.hoveredElement.style.outline = '';
                    this.hoveredElement.style.cursor = '';
                    this.hoveredElement = null;
                }
                if (this.isDebugMode) {
                    this.showTemporaryStatus("💡 Chế độ Quét: Rê chuột vào bài viết và Click để trích xuất HTML!");
                }
                sendResponse({ success: true });
            } else if (message.action === 'GET_DEBUG_STATUS') {
                sendResponse({ isDebugMode: this.isDebugMode });
            }
        });

        document.addEventListener('mouseover', (e) => {
            if (!this.isDebugMode) return;
            const post = e.target.closest('div[data-pagelet^="FeedUnit"], div[role="article"], div[aria-posinset]') || e.target;
            if (this.hoveredElement && this.hoveredElement !== post) this.hoveredElement.style.outline = '';
            this.hoveredElement = post;
            if (this.hoveredElement) {
                this.hoveredElement.style.outline = '4px solid #f44336';
                this.hoveredElement.style.cursor = 'crosshair';
            }
        });

        document.addEventListener('mouseout', (e) => {
            if (!this.isDebugMode || !this.hoveredElement) return;
            this.hoveredElement.style.outline = '';
            this.hoveredElement.style.cursor = '';
        });

        document.addEventListener('click', (e) => {
            if (!this.isDebugMode) return;
            e.preventDefault();
            e.stopPropagation();

            if (this.hoveredElement) {
                this.hoveredElement.style.outline = '';
                this.hoveredElement.style.cursor = '';
                const htmlData = this.hoveredElement.outerHTML;

                window.SystemLogger?.log('INFO', 'Người dùng đã dùng Debug Mode trích xuất 1 bài viết thủ công.');

                if (navigator.clipboard && window.isSecureContext) {
                    navigator.clipboard.writeText(htmlData).then(() => {
                        this.showTemporaryStatus("✅ Đã copy mã HTML thành công! Hãy dán (Ctrl+V) gửi cho tôi.");
                    }).catch(() => this.fallbackCopyTextToClipboard(htmlData));
                } else {
                    this.fallbackCopyTextToClipboard(htmlData);
                }

                this.isDebugMode = false;
                chrome.runtime.sendMessage({ action: 'DEBUG_MODE_AUTO_OFF' }).catch(() => {});
            }
        }, true);
    }

    static stop() {
        this.isDebugMode = false;
        if (this.hoveredElement) {
            this.hoveredElement.style.outline = '';
            this.hoveredElement.style.cursor = '';
        }
    }

    static showTemporaryStatus(msg, isError = false) {
        const tempMsg = document.createElement('div');
        tempMsg.style.cssText = `position:fixed; top:80px; left:50%; transform:translateX(-50%); z-index:999999; padding:12px 20px; background:${isError ? '#f44336' : '#4CAF50'}; color:white; border-radius:8px; font-family:Arial; font-weight:bold; box-shadow: 0 4px 6px rgba(0,0,0,0.3); transition: opacity 0.5s; opacity: 1; pointer-events:none;`;
        tempMsg.innerText = msg;
        document.body.appendChild(tempMsg);
        setTimeout(() => {
            tempMsg.style.opacity = '0';
            setTimeout(() => tempMsg.remove(), 500);
        }, 3000);
    }

    static fallbackCopyTextToClipboard(text) {
        // Fallback: notify user to open DevTools Console to copy manually
        this.showTemporaryStatus("❌ Không thể copy tự động! Hãy ấn F12 → Console để xem mã HTML.", true);
    }
}

// ==========================================
// 3. FACEBOOK SCANNER: Lọc luồng Newsfeed
// ==========================================
class FacebookScanner {
    static settings = { block_ads: true, block_suggested: true, block_strangers: true };
    // [L-3] Đã xóa hiddenPostsCount vì là dead code (không được dùng hay hiển thị ở đâu)

    static _scanInterval = null;
    static _observer = null;
    static _intersectionObserver = null;
    static _processedPosts = new WeakSet();

    static init() {
        chrome.storage.local.get(['fb_settings'], (data) => {
            if (data.fb_settings) {
                this.settings = data.fb_settings;
            }
            this.startObserver();
            this.startIntersectionObserver();
            
            // Initial scan (use requestIdleCallback for lower priority)
            if (window.requestIdleCallback) {
                requestIdleCallback(() => this.cleanFeed());
            } else {
                this.cleanFeed();
            }

            this.injectStealthBridge();
            this.setupBridgeListeners();
            DebugUIManager.init();
        });

        chrome.storage.onChanged.addListener((changes, namespace) => {
            if (namespace === 'local' && changes.fb_settings) {
                this.settings = changes.fb_settings.newValue;
            }
        });

        // [HOT TOGGLE] Lắng nghe tín hiệu dừng từ Core
        window.addEventListener('adblock:stop', () => this.stop());
    }

    static injectStealthBridge() {
        try {
            if (document.getElementById('fb-stealth-bridge-loader')) return;
            const script = document.createElement('script');
            script.id = 'fb-stealth-bridge-loader';
            script.src = chrome.runtime.getURL('fb_stealth_bridge.js');
            script.onload = () => script.remove();
            (document.head || document.documentElement).appendChild(script);
        } catch (e) {}
    }

    static setupBridgeListeners() {
        window.addEventListener('FB_ADBLOCK_RESPONSE_FIBER', (e) => {
            const { results } = e.detail;
            if (results && Array.isArray(results)) {
                results.forEach(res => {
                    // LRU eviction: keep fiberAdMap under 200 entries
                    if (FacebookAdEngine.fiberAdMap.size >= 200) {
                        FacebookAdEngine.fiberAdMap.delete(FacebookAdEngine.fiberAdMap.keys().next().value);
                    }
                    FacebookAdEngine.fiberAdMap.set(res.id, res.reason);
                });
                // Results are picked up by the next regular interval scan
            }
        });
    }

    static _lastFiberRequest = 0;
    static requestFiberScan() {
        const now = Date.now();
        // Limit fiber scans to once every 5 seconds to save CPU
        if (now - this._lastFiberRequest < 5000) return;
        this._lastFiberRequest = now;

        // Dispatch async to break stack chain
        setTimeout(() => {
            window.dispatchEvent(new CustomEvent('FB_ADBLOCK_REQUEST_FIBER', { 
                detail: { requestId: now } 
            }));
        }, 0);
    }

    static stop() {
        SystemLogger.log('WARN', 'FacebookScanner: Dừng hoạt động (Hot Toggle)');
        if (this._scanInterval) {
            clearInterval(this._scanInterval);
            this._scanInterval = null;
        }
        if (this._observer) {
            this._observer.disconnect();
            this._observer = null;
        }
        if (typeof DebugUIManager !== 'undefined' && DebugUIManager.stop) {
            DebugUIManager.stop();
        }
    }

    static getFbPostInfo(post) {
        let author = "Người lạ / Trang ẩn";
        let postUrl = "N/A";

        try {
            const authorEl = post.querySelector('h3, h4, strong, b, [data-ad-rendering-role="profile_name"]');
            if (authorEl && authorEl.textContent) {
                author = authorEl.textContent.trim();
            } else {
                const firstLink = Array.from(post.querySelectorAll('a')).find(a => a.innerText.trim().length > 0);
                if (firstLink) author = firstLink.innerText.trim();
            }

            const links = post.querySelectorAll('a[href]');
            for (let link of links) {
                const href = link.href;
                if (href.includes('/posts/') || href.includes('/videos/') || href.includes('fbid=') || href.includes('/photo') || href.includes('/permalink') || href.includes('/reel/') || href.includes('/groups/')) {
                    if (!href.includes('&reply_comment_id=') && !href.includes('comment_id=')) {
                        postUrl = href;
                        break;
                    }
                }
            }

            if (postUrl === "N/A") {
                for (let link of links) {
                    const href = link.href;
                    if (href.includes('l.facebook.com/l.php') || (!href.includes('facebook.com') && href.startsWith('http'))) {
                        postUrl = href;
                        break;
                    }
                }
            }

            if (postUrl === "N/A" && links.length > 0) {
                for (let link of links) {
                    const href = link.href;
                    if (href.startsWith('https://www.facebook.com/') && !href.includes('/groups/') && !href.includes('#')) {
                        postUrl = href;
                        break;
                    }
                }
            }

            if (postUrl !== "N/A") {
                try {
                    const cleanUrl = new URL(postUrl);
                    cleanUrl.searchParams.delete('__cft__[0]');
                    cleanUrl.searchParams.delete('__tn__');
                    cleanUrl.searchParams.delete('fbclid');
                    postUrl = cleanUrl.toString();
                } catch (e) { }
            }
        } catch (e) {
            window.SystemLogger?.log('WARN', 'Lỗi khi lấy thông tin Tác giả/URL FB', null, e);
        }

        return { author, postUrl };
    }

    static finalizeLogging(post, reason, fbInfo, info) {
        let contentElement = post.querySelector('[data-ad-comet-preview="message"]') ||
            post.querySelector('div[dir="auto"]') || post;
        let snippet = "";

        try {
            let clone = contentElement.cloneNode(true);
            let buttons = clone.querySelectorAll('div[role="button"], span[role="button"]');
            buttons.forEach(btn => {
                let text = (btn.textContent || "").trim().toLowerCase();
                if (text === 'xem thêm' || text === 'see more' || text === 'ẩn bớt') {
                    btn.remove();
                }
            });

            let htmlContent = clone.innerHTML;
            htmlContent = htmlContent.replace(/<br\s*[\/]?>/gi, "\n");
            htmlContent = htmlContent.replace(/<\/div>/gi, "</div>\n");
            htmlContent = htmlContent.replace(/<\/p>/gi, "</p>\n");

            let tmp = document.createElement("div");
            tmp.innerHTML = htmlContent;
            snippet = (tmp.textContent || tmp.innerText || "").trim();
            snippet = snippet.replace(/\n\s*\n/g, '\n').trim();
            snippet = snippet.replace(/…$/g, '').trim();

        } catch (e) {
            snippet = (contentElement.innerText || "").trim();
        }

        if (snippet.startsWith("Facebook Facebook")) {
            snippet = "Không thể trích xuất nội dung (Ảnh/Video hoặc bài viết bị ẩn).";
        } else if (snippet.length === 0) {
            snippet = "Không có nội dung văn bản (Chỉ chứa ảnh/video/link).";
        }

        window.SystemLogger?.log('INFO', `Đã ẩn bài Facebook: ${reason}`, `Tác giả: ${fbInfo.author} | URL: ${fbInfo.postUrl}`);

        if (chrome.runtime?.id) {
            try {
                // [M-4] Ưu tiên dùng outerHTML mới nhất, fallback sang htmlSnapshot nếu element đã bị React recycle
                let updatedHtml = '';
                try { updatedHtml = post.outerHTML || ''; } catch(e) { updatedHtml = ''; }
                if (!updatedHtml && info.htmlSnapshot) {
                    updatedHtml = info.htmlSnapshot;
                } else if (updatedHtml.length > 800) {
                    updatedHtml = updatedHtml.substring(0, 800) + '\n\n... [ĐÃ CẮT BỚT DO QUÁ DÀI]';
                }
                info.html = updatedHtml || 'N/A';
            } catch (e) { }

            window.SystemLogger?.sendDomBlockLog(`Facebook - ${reason} | Tác giả: ${fbInfo.author} | Trích dẫn: "${snippet}"`, info);
        }
    }

    static hidePost(post, reason) {
        if (post.dataset.isCleaned === "spam") return;
        post.dataset.isCleaned = "spam";

        const fbInfo = this.getFbPostInfo(post);
        const info = window.SystemLogger?.extractElementInfo(post) || { src: "N/A" };
        info.src = fbInfo.postUrl !== "N/A" ? fbInfo.postUrl : info.src;

        let contentElement = post.querySelector('[data-ad-comet-preview="message"]') ||
            post.querySelector('div[dir="auto"]') || post;

        let seeMoreBtn = Array.from(contentElement.querySelectorAll('div[role="button"], span[role="button"]')).find(
            btn => {
                let t = (btn.textContent || "").trim().toLowerCase();
                return t === 'xem thêm' || t === 'see more';
            }
        );

        if (seeMoreBtn) {
            // [M-4] Chụp snapshot HTML trước khi click "Xem thêm" và ẩn bài.
            // Sau 800ms, React có thể unmount/recycle element → dùng snapshot làm fallback.
            const htmlSnapshot = (() => {
                try { return post.outerHTML.substring(0, 800) + '\n\n... [ĐÃ CẮT BỚT DO QUÁ DÀI]'; } catch(e) { return 'N/A'; }
            })();
            info.htmlSnapshot = htmlSnapshot;

            try { seeMoreBtn.click(); } catch (e) { }
            post.style.display = 'none';

            setTimeout(() => {
                this.finalizeLogging(post, reason, fbInfo, info);
            }, 800);
        } else {
            post.style.display = 'none';
            this.finalizeLogging(post, reason, fbInfo, info);
        }
    }

    static cleanFeed() {
        if (window.location.pathname !== '/' && window.location.pathname !== '/home.php') {
            return;
        }

        const startTime = performance.now();
        let scanned = 0;
        try {
            const posts = document.querySelectorAll('div[data-pagelet^="FeedUnit"], div[role="article"], div[aria-posinset]');
            scanned = posts.length;

            posts.forEach(post => {
                // [Opt] Skip if already cleaned or explicitly safe
                if (post.dataset.isCleaned === "spam" || post.dataset.isCleaned === "safe") return;
                
                // [Opt] If we've already tried scanning this many times and it's not spam, mark as safe
                const scanCount = parseInt(post.dataset.scanCount || "0");
                if (scanCount > 10) {
                    post.dataset.isCleaned = "safe";
                    return;
                }

                if (post.dataset.hoverForced !== "true") {
                    try {
                        const headerArea = post.querySelector('h3, h4, [data-ad-rendering-role="profile_name"]')?.closest('div');
                        const searchScope = headerArea || post;
                        const profileLinks = Array.from(searchScope.querySelectorAll('h3, h4, [data-ad-rendering-role="profile_name"]'));
                        const hoverTargets = searchScope.querySelectorAll('a[attributionsrc], a[role="link"]:not([href]), a[href="#"], span[role="button"]');
                        hoverTargets.forEach(el => {
                            const isProfile = profileLinks.some(p => p.contains(el));
                            if (isProfile) return;
                            try {
                                const hoverEvent = new MouseEvent('mouseover', { bubbles: true, cancelable: true, view: window, buttons: 1 });
                                el.dispatchEvent(hoverEvent);
                                const outEvent = new MouseEvent('mouseout', { bubbles: true, cancelable: true, view: window });
                                el.dispatchEvent(outEvent);
                            } catch(e) {}
                        });
                    } catch(e) {}
                    post.dataset.hoverForced = "true";
                }

                let spamReason = FacebookAdEngine.isFacebookSpam(post, this.settings);
                if (spamReason) {
                    this.hidePost(post, spamReason);
                } else {
                    let scanCount = parseInt(post.dataset.scanCount || "0");
                    post.dataset.scanCount = scanCount + 1;
                }
            });

            // Request an internal React scan once per cycle, throttled by requestFiberScan
            this.requestFiberScan();

        } catch (e) {
            window.SystemLogger?.log('ERROR', 'Lỗi cleanFeed', null, e);
        } finally {
            const timeTaken = performance.now() - startTime;
            if (timeTaken > 50) window.SystemLogger?.log('WARN', `cleanFeed mất quá nhiều thời gian (${timeTaken.toFixed(2)}ms)`, `Quét ${scanned} bài viết`);
        }
    }

    static startIntersectionObserver() {
        if (this._intersectionObserver) return;
        this._intersectionObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const post = entry.target;
                    // Only process if not already confirmed as spam
                    if (post.dataset.isCleaned !== "spam") {
                        // Small delay to ensure FB has rendered visible markers
                        setTimeout(() => this.processSinglePost(post), 100);
                    }
                }
            });
        }, { threshold: 0.1, rootMargin: '500px' });
    }

    static processSinglePost(post) {
        if (post.dataset.isCleaned === "spam") return;
        
        let spamReason = FacebookAdEngine.isFacebookSpam(post, this.settings);
        if (spamReason) {
            this.hidePost(post, spamReason);
        } else {
            let scanCount = parseInt(post.dataset.scanCount || "0");
            post.dataset.scanCount = scanCount + 1;
        }
    }

    static startObserver() {
        const FEED_PATHS = ['/', '/home.php'];
        this._observer = new MutationObserver((mutations) => {
            if (!FEED_PATHS.includes(window.location.pathname)) return;

            let newPostsFound = false;
            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType !== 1) continue;
                    
                    const postElements = node.querySelectorAll?.('div[data-pagelet^="FeedUnit"], div[role="article"], div[aria-posinset]') || [];
                    const posts = node.matches?.('div[data-pagelet^="FeedUnit"], div[role="article"], div[aria-posinset]') ? [node, ...postElements] : postElements;
                    
                    posts.forEach(post => {
                        this._intersectionObserver?.observe(post);
                        newPostsFound = true;
                    });
                }
            }
            // If new posts arrived, run a broader but infrequent "clean"
            if (newPostsFound) {
                if (window.requestIdleCallback) {
                    requestIdleCallback(() => this.cleanFeed());
                } else {
                    this.cleanFeed();
                }
            }
        });
        this._observer.observe(document.documentElement, { childList: true, subtree: true });
    }
}

// ==========================================
// BOOTSTRAP: Kiểm tra và khởi chạy Facebook Scanner
// ==========================================
chrome.storage.local.get(['enabledDomains'], (data) => {
    const enabledDomains = data.enabledDomains || [];
    const currentHost = window.location.hostname;

    if (!enabledDomains.includes(currentHost)) {
        return; // Core đã log trạng thái TẮT rồi
    }

    window.SystemLogger?.log('INFO', 'Định tuyến môi trường: Facebook - Bật Facebook Scanner');
    FacebookScanner.init();
});

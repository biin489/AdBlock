// === ANTI-DETECT INJECT ===
// Chạy trong page context (BEFORE site scripts) để bypass các kỹ thuật detect adblock phổ biến.
// Inject bởi content_core.js qua web_accessible_resources.

(function () {
    if (window.__ADBLOCK_ANTI_DETECT__) return;
    window.__ADBLOCK_ANTI_DETECT__ = true;

    // ==========================================
    // LAYER 1: FAKE AD ENVIRONMENT GLOBALS
    // ==========================================
    // Google AdSense queue — fake "loaded" + push hoạt động bình thường
    try {
        const fakeAdsQueue = [];
        fakeAdsQueue.loaded = true;
        fakeAdsQueue.push = function () {
            this.length += 1;
            return this.length;
        };
        Object.defineProperty(window, 'adsbygoogle', {
            value: fakeAdsQueue,
            writable: true,
            configurable: true
        });
    } catch (e) {
        window.adsbygoogle = { loaded: true, push: function () { } };
    }

    const fakes = {
        google_jobrunner: { adsbygoogle: { loaded: true } },
        google_ad_status: 1,
        google_onload_fired: true,
        canRunAds: true,
        canShowAds: true,
        isAdBlockActive: false,
        adBlockEnabled: false,
        adblock: false,
        adBlock: false
    };
    for (const k in fakes) {
        try { window[k] = fakes[k]; } catch (e) { }
    }

    // ==========================================
    // LAYER 2: SHIM ANTI-ADBLOCK LIBRARIES
    // (FuckAdBlock / BlockAdBlock / SniffAdBlock — public detection libs)
    // ==========================================
    const fakeDetector = {
        onDetected: function () { return this; },
        onNotDetected: function (cb) { try { typeof cb === 'function' && cb(); } catch (e) { } return this; },
        on: function (ev, cb) {
            if (ev === 'notDetected' && typeof cb === 'function') {
                try { cb(); } catch (e) { }
            }
            return this;
        },
        off: function () { return this; },
        emitEvent: function () { return this; },
        check: function () {
            const args = arguments;
            const cb = args[args.length - 1];
            if (typeof cb === 'function') { try { cb(false); } catch (e) { } }
            return false;
        },
        setOption: function () { return this; },
        clearEvent: function () { return this; },
        debug: { set: function () { } }
    };

    ['fuckAdBlock', 'FuckAdBlock', 'blockAdBlock', 'BlockAdBlock', 'sniffAdBlock', 'SniffAdBlock', 'adBlockDetector', 'AdBlockDetector'].forEach(function (name) {
        try {
            Object.defineProperty(window, name, {
                get: function () { return fakeDetector; },
                set: function () { },
                configurable: false
            });
        } catch (e) {
            window[name] = fakeDetector;
        }
    });

    // ==========================================
    // LAYER 3: AD URL PATTERN MATCHER
    // ==========================================
    const adUrlPatterns = [
        /googlesyndication\.com/i,
        /doubleclick\.net/i,
        /googleadservices\.com/i,
        /googletagservices\.com/i,
        /googletagmanager\.com\/gtag\/js.*=AW-/i,
        /amazon-adsystem\.com/i,
        /adnxs\.com/i,
        /adservice\.google/i,
        /pagead\d?\./i,
        /securepubads\./i,
        /\/show_ads\.js/i,
        /\/adsbygoogle\.js/i,
        /\/pagead\/show_ads/i,
        /\/pagead\/managed/i,
        /\/ads?\.js(\?|$)/i,
        /\/adframe/i,
        /\/advert(ising)?\//i
    ];

    function isAdUrl(url) {
        if (!url) return false;
        try {
            const s = String(url);
            for (let i = 0; i < adUrlPatterns.length; i++) {
                if (adUrlPatterns[i].test(s)) return true;
            }
        } catch (e) { }
        return false;
    }

    // ==========================================
    // LAYER 4: FETCH OVERRIDE — fake 200 cho ad probes
    // ==========================================
    if (typeof window.fetch === 'function') {
        const _fetch = window.fetch.bind(window);
        window.fetch = function (input, init) {
            try {
                const url = (typeof input === 'string') ? input : (input && input.url) || '';
                if (isAdUrl(url)) {
                    return Promise.resolve(new Response('', {
                        status: 200,
                        statusText: 'OK',
                        headers: { 'Content-Type': 'application/javascript' }
                    }));
                }
            } catch (e) { }
            return _fetch(input, init);
        };
    }

    // ==========================================
    // LAYER 5: XMLHttpRequest OVERRIDE
    // ==========================================
    try {
        const _open = XMLHttpRequest.prototype.open;
        const _send = XMLHttpRequest.prototype.send;
        XMLHttpRequest.prototype.open = function (method, url) {
            this.__adblock_isAd = isAdUrl(url);
            return _open.apply(this, arguments);
        };
        XMLHttpRequest.prototype.send = function () {
            if (this.__adblock_isAd) {
                const xhr = this;
                setTimeout(function () {
                    try {
                        Object.defineProperty(xhr, 'readyState', { value: 4, configurable: true });
                        Object.defineProperty(xhr, 'status', { value: 200, configurable: true });
                        Object.defineProperty(xhr, 'responseText', { value: '', configurable: true });
                        Object.defineProperty(xhr, 'response', { value: '', configurable: true });
                    } catch (e) { }
                    try { xhr.onreadystatechange && xhr.onreadystatechange(); } catch (e) { }
                    try { xhr.onload && xhr.onload(); } catch (e) { }
                    try { xhr.dispatchEvent(new Event('load')); } catch (e) { }
                }, 5);
                return;
            }
            return _send.apply(this, arguments);
        };
    } catch (e) { }

    // ==========================================
    // LAYER 6: SCRIPT INJECTION FAKE LOAD
    // Khi site append <script src="ads.js"> để check onerror → ta fake onload thành công
    // ==========================================
    try {
        const _appendChild = Element.prototype.appendChild;
        const _insertBefore = Element.prototype.insertBefore;

        function maybeFakeScript(node) {
            if (!node || node.tagName !== 'SCRIPT') return false;
            const src = node.src || (node.getAttribute && node.getAttribute('src')) || '';
            if (!isAdUrl(src)) return false;
            setTimeout(function () {
                try { node.onload && node.onload(); } catch (e) { }
                try { node.dispatchEvent(new Event('load')); } catch (e) { }
            }, 0);
            return true;
        }

        Element.prototype.appendChild = function (node) {
            if (maybeFakeScript(node)) return node;
            return _appendChild.apply(this, arguments);
        };
        Element.prototype.insertBefore = function (node, ref) {
            if (maybeFakeScript(node)) return node;
            return _insertBefore.apply(this, arguments);
        };
    } catch (e) { }

    // ==========================================
    // LAYER 7: BAIT HONEYPOT
    // Tạo ngầm các bait div với class quen thuộc → site query .ads/.adsbox sẽ thấy chúng có size > 0
    // ==========================================
    function createBaits() {
        const baitClasses = ['ads', 'adsbox', 'adsbygoogle', 'ad-banner', 'advertisement', 'pub_300x250', 'ad-placeholder', 'google-ad'];
        const container = document.createElement('div');
        container.setAttribute('aria-hidden', 'true');
        container.style.cssText = 'position:absolute!important;left:-9999px!important;top:-9999px!important;width:1px;height:1px;overflow:hidden;';
        baitClasses.forEach(function (cls) {
            const bait = document.createElement('ins');
            bait.className = cls;
            bait.id = cls + '_bait';
            bait.style.cssText = 'display:block!important;width:300px!important;height:100px!important;position:absolute!important;';
            bait.innerHTML = '&nbsp;';
            container.appendChild(bait);
        });
        (document.body || document.documentElement).appendChild(container);
    }
    if (document.body) {
        createBaits();
    } else {
        document.addEventListener('DOMContentLoaded', createBaits, { once: true });
    }
})();

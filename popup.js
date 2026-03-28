document.addEventListener('DOMContentLoaded', () => {
    PopupApp.init();
});

class PopupApp {
    static init() {
        this.cacheDOM();
        this.bindEvents();
        this.loadTabData();
        ChangelogManager.renderLatest();
    }

    static cacheDOM() {
        this.logList = document.getElementById('logList');
        this.totalCount = document.getElementById('totalCount');
        this.statDOM = document.getElementById('statDOM');
        this.statNetwork = document.getElementById('statNetwork');
        this.statPopup = document.getElementById('statPopup');

        this.currentDomain = document.getElementById('currentDomain');
        this.exportBtn = document.getElementById('exportBtn');
        this.exportSysBtn = document.getElementById('exportSysBtn');
        this.toggleBtn = document.getElementById('toggleBtn');

        this.fbSettingsPanel = document.getElementById('fbSettingsPanel');
        this.blockAdsCb = document.getElementById('blockAdsCb');
        this.blockSuggestedCb = document.getElementById('blockSuggestedCb');
        this.blockStrangersCb = document.getElementById('blockStrangersCb');

        this.manualBlockList = document.getElementById('manualBlockList');
        this.manualBlockCount = document.getElementById('manualBlockCount');

        this.currentTabData = null;
        this.currentUrl = "unknown";
        this.currentTabId = null;
        this.isEnabled = false;

        this.fbSettings = { block_ads: true, block_suggested: true, block_strangers: true };
    }

    static animateNumber(el, newVal) {
        if (!el) return;
        const currentVal = parseInt(el.textContent) || 0;
        if (currentVal !== newVal) {
            el.textContent = newVal;
            el.classList.remove('number-pop');
            void el.offsetWidth; // Trigger reflow
            el.classList.add('number-pop');
        }
    }

    static bindEvents() {
        // Real-time log update listener
        chrome.storage.onChanged.addListener((changes, namespace) => {
            if (namespace === 'local' && changes.logsByTab) {
                if (!this.currentTabId) return;
                const newLogsByTab = changes.logsByTab.newValue;
                if (newLogsByTab && newLogsByTab[this.currentTabId]) {
                    const tabData = newLogsByTab[this.currentTabId];
                    if (this.currentTabData && tabData.count === this.currentTabData.count) return;
                    this.currentTabData = tabData;
                    
                    if (this.totalCount) this.animateNumber(this.totalCount, tabData.count);
                    
                    if (tabData.stats) {
                        this.animateNumber(this.statDOM, tabData.stats.dom);
                        this.animateNumber(this.statNetwork, tabData.stats.network);
                        this.animateNumber(this.statPopup, tabData.stats.popup);
                    }

                    if (this.logList) LogRenderer.renderLogs(tabData, this.isEnabled, this.logList);
                }
            }
        });

        this.exportBtn.addEventListener('click', () => ExportManager.exportAdsLog());
        this.exportSysBtn.addEventListener('click', () => ExportManager.exportSysLog());

        // View Tab Toggle
        document.getElementById('openSettingsBtn').addEventListener('click', () => {
            document.getElementById('mainView').classList.remove('active');
            document.getElementById('advancedView').classList.add('active');
        });
        document.getElementById('closeSettingsBtn').addEventListener('click', () => {
            document.getElementById('advancedView').classList.remove('active');
            document.getElementById('mainView').classList.add('active');
        });



        const saveFBSettings = () => this.updateFBSettings();
        this.blockAdsCb.addEventListener('change', saveFBSettings);
        this.blockSuggestedCb.addEventListener('change', saveFBSettings);
        this.blockStrangersCb.addEventListener('change', saveFBSettings);

        this.toggleBtn.addEventListener('click', async () => {
            chrome.storage.local.get(['enabledDomains'], async (data) => {
                let enabledDomains = data.enabledDomains || [];
                
                if (this.isEnabled) {
                    // --- TẮT: Xóa domain khỏi danh sách bật ---
                    enabledDomains = enabledDomains.filter(domain => domain !== this.currentUrl);
                    // [PHƯƠNG ÁN B] Thêm allowlist rule để browser KHÔNG chặn mạng trên domain này
                    await AllowlistManager.addAllowRule(this.currentUrl);
                } else {
                    // --- BẬT: Thêm domain vào danh sách bật ---
                    if (!enabledDomains.includes(this.currentUrl)) {
                        enabledDomains.push(this.currentUrl);
                    }
                    // [PHƯƠNG ÁN B] Xóa allowlist rule → rules.json hoạt động trở lại bình thường
                    await AllowlistManager.removeAllowRule(this.currentUrl);

                    if (this.currentUrl.includes('facebook.com')) {
                        this.fbSettings = { block_ads: true, block_suggested: true, block_strangers: true };
                        this.blockAdsCb.checked = true; this.blockSuggestedCb.checked = true; this.blockStrangersCb.checked = true;
                        chrome.storage.local.set({ fb_settings: this.fbSettings });
                    }
                }

                chrome.storage.local.get(['allKnownDomains'], (knownData) => {
                    let allKnownDomains = knownData.allKnownDomains || [];
                    // Ghi nhớ domain này để syncAllowlistOnStartup tái tạo rule khi Service Worker thức dậy
                    if (!allKnownDomains.includes(this.currentUrl)) {
                        allKnownDomains.push(this.currentUrl);
                    }
                    // [H-5] Cap tại 200 entries để tránh storage bloat sau nhiều năm sử dụng
                    if (allKnownDomains.length > 200) {
                        allKnownDomains = allKnownDomains.slice(-200);
                    }
                    chrome.storage.local.set({ enabledDomains, allKnownDomains }, () => {
                        chrome.tabs.reload(this.currentTabId);
                        window.close();
                    });
                });
            });
        });
    }

    static loadTabData() {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (!tabs || tabs.length === 0) return;
            const currentTab = tabs[0];
            this.currentTabId = currentTab.id;
            
            try {
                this.currentUrl = new URL(currentTab.url).hostname;
            } catch(e) {
                this.currentUrl = "Trang hệ thống";
            }
            
            this.currentDomain.textContent = this.currentUrl;

            let host = this.currentUrl;
            let baseHost = host;
            if (host.startsWith('www.')) {
                baseHost = host.substring(4);
            }

            chrome.storage.local.get(null, (data) => {
                const enabledDomains = data.enabledDomains || [];
                this.isEnabled = (host !== "unknown" && enabledDomains.includes(host));

                if (data.fb_settings) {
                    this.fbSettings = data.fb_settings;
                    this.blockAdsCb.checked = this.fbSettings.block_ads;
                    this.blockSuggestedCb.checked = this.fbSettings.block_suggested;
                    this.blockStrangersCb.checked = this.fbSettings.block_strangers;
                }
                
                this.updateToggleBtnUI();

                // Dò tìm chính xác Array trên toàn bộ mảng của tên miền phụ/chính
                let manualAds = [];
                let exactStorageKey = `manual_ads_${host}`;
                
                for(let key in data) {
                    if (key.startsWith('manual_ads_')) {
                        let domainPart = key.replace('manual_ads_', '');
                        if (host === domainPart || domainPart === baseHost || host.endsWith('.' + domainPart)) {
                            manualAds = manualAds.concat(data[key]);
                            // Set the save target to the exact found key if we want accurate deletes
                            exactStorageKey = key;
                        }
                    }
                }
                
                // Filter trùng lặp trên cả rule string cũ và rule object mới
                let uniqueMap = {};
                manualAds.forEach(item => {
                    let sel = typeof item === 'string' ? item : item.selector;
                    if (!uniqueMap[sel]) {
                        uniqueMap[sel] = typeof item === 'string' ? { selector: item, text: 'Vùng giao diện (Tiêu chuẩn cũ)', type: 'OLD' } : item;
                    }
                });
                manualAds = Object.values(uniqueMap);
                
                this.renderManualBlockList(manualAds, exactStorageKey.replace('manual_ads_', ''));
                // Cập nhật hiển thị Version
                const manifest = chrome.runtime.getManifest();
                const versionDisplay = document.getElementById('versionDisplay');
                if (versionDisplay) {
                    versionDisplay.textContent = `v${manifest.version_name || manifest.version}`;
                }

                if (this.currentUrl.includes('facebook.com') && this.isEnabled) {
                    this.fbSettingsPanel.style.display = 'block';

                }

                const tabData = (data.logsByTab && data.logsByTab[this.currentTabId]) || { count: 0, stats: { network: 0, dom: 0, popup: 0 }, logs: [] };
                this.currentTabData = tabData; 
                this.animateNumber(this.totalCount, tabData.count);
                
                if (tabData.stats) {
                    this.animateNumber(this.statDOM, tabData.stats.dom);
                    this.animateNumber(this.statNetwork, tabData.stats.network);
                    this.animateNumber(this.statPopup, tabData.stats.popup);
                }
                
                LogRenderer.renderLogs(tabData, this.isEnabled, this.logList);
            });
        });
    }

    static updateToggleBtnUI() {
        if (this.isEnabled) {
            this.toggleBtn.classList.add('active');
            this.toggleBtn.classList.remove('inactive');
            this.toggleBtn.title = "Đang Bật - Nhấn để Tắt";
        } else {
            this.toggleBtn.classList.remove('active');
            this.toggleBtn.classList.add('inactive');
            this.toggleBtn.title = "Đang Tắt - Nhấn để Bật";
        }
    }

    static renderManualBlockList(selectors, host) {
        if (!this.manualBlockList || !this.manualBlockCount) return;

        this.manualBlockCount.innerText = selectors.length;
        if (selectors.length === 0) {
            this.manualBlockList.innerHTML = '<div style="text-align:center; color:var(--text-muted); font-size:11px; padding:12px;">Chưa xoá thủ công mục nào</div>';
            return;
        }

        this.manualBlockList.innerHTML = '';
        selectors.forEach((item, index) => {
            const row = document.createElement('div');
            row.style.cssText = 'display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; border-bottom: 1px solid var(--border-light); background: #ffffff; gap: 8px;';
            
            const txt = document.createElement('div');
            
            // Xử lý ICON dựa trên metadata
            let iconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>'; // LAYOUT
            if (item.type === 'TEXT') {
                iconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>';
            } else if (item.type === 'IMAGE') {
                iconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>';
            } else if (item.type === 'VIDEO') {
                iconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ec4899" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>';
            } else if (item.type === 'LINK') {
                iconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>';
            }

            txt.innerHTML = `
                <div style="display: flex; align-items: center; gap: 10px;">
                    <div style="display: flex; align-items: center; justify-content: center; background: #f1f5f9; padding: 6px; border-radius: 8px;">
                        ${iconSvg}
                    </div>
                    <div style="display: flex; flex-direction: column; overflow: hidden;">
                        <span style="font-weight:600; font-size:12px; color:var(--text-main); font-family:system-ui, sans-serif; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${item.text}</span>
                        <span style="font-size:11px; color:var(--text-muted); font-family:system-ui, sans-serif;">${item.type === 'OLD' ? 'Thiết lập cũ / Không mô tả' : ('Đã ẩn lúc ' + (item.ts ? new Date(item.ts).toLocaleTimeString('vi-VN', {hour: '2-digit', minute:'2-digit'}) : 'nay'))}</span>
                    </div>
                </div>
            `;
            txt.title = `Chi tiết kĩ thuật DOM:\n${item.selector}`;
            txt.style.cssText = 'flex: 1; min-width: 0; cursor: help;';
            
            const btn = document.createElement('button');
            btn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>';
            btn.style.cssText = 'background: #fee2e2; border: 1px solid #fca5a5; color: #ef4444; cursor: pointer; padding: 6px 8px; border-radius: 6px; display: flex; align-items: center; justify-content: center; transition: all 0.2s; box-shadow: 0 1px 2px rgba(0,0,0,0.05); flex-shrink: 0;';
            btn.title = "Khôi phục lại phần tử này";
            btn.onmouseover = () => { btn.style.background = '#fecaca'; btn.style.transform = 'scale(1.05)'; };
            btn.onmouseout = () => { btn.style.background = '#fee2e2'; btn.style.transform = 'scale(1)'; };
            btn.onclick = () => {
                btn.innerHTML = '⏳';
                chrome.tabs.sendMessage(this.currentTabId, { action: 'REMOVE_MANUAL_RULE', selector: item.selector }, () => {
                    const newSelectors = selectors.filter(s => s.selector !== item.selector);
                    this.renderManualBlockList(newSelectors, host);
                    
                    const key = `manual_ads_${host}`;
                    chrome.storage.local.get([key], (d) => {
                        let config = d[key] || [];
                        config = config.filter(s => {
                            let curr = typeof s === 'string' ? s : s.selector;
                            return curr !== item.selector;
                        });
                        chrome.storage.local.set({[key]: config});
                    });
                });
            };
            
            row.appendChild(txt);
            row.appendChild(btn);
            this.manualBlockList.appendChild(row);
        });
    }


    static updateFBSettings() {
        this.fbSettings = {
            block_ads: this.blockAdsCb.checked,
            block_suggested: this.blockSuggestedCb.checked,
            block_strangers: this.blockStrangersCb.checked
        };
        chrome.storage.local.set({ fb_settings: this.fbSettings });

        const isAnyEnabled = this.fbSettings.block_ads || this.fbSettings.block_suggested || this.fbSettings.block_strangers;
        
        let currentHost = this.currentUrl;

        chrome.storage.local.get(['enabledDomains'], (data) => {
            let enabledDomains = data.enabledDomains || [];
            let needsReload = false;

            if (!isAnyEnabled && this.isEnabled) {
                this.isEnabled = false;
                enabledDomains = enabledDomains.filter(domain => domain !== currentHost && domain !== this.currentUrl);
                needsReload = true;
            } else if (isAnyEnabled && !this.isEnabled) {
                this.isEnabled = true;
                if (!enabledDomains.includes(currentHost)) {
                    enabledDomains.push(currentHost);
                }
                needsReload = true;
            }

            this.updateToggleBtnUI();
            
            if (needsReload) {
                chrome.storage.local.set({ enabledDomains }, () => {
                    chrome.tabs.reload(this.currentTabId);
                    window.close();
                });
            }
        });
    }
}

class LogRenderer {
    static renderLogs(tabData, isEnabled, logListContainer) {
        logListContainer.innerHTML = '';
        
        if (!isEnabled) {
            logListContainer.innerHTML = `
                <div class="empty-state">
                    <span>😴</span>
                    <b>AdBlock đang ngủ...</b><br><br>
                    Mặc định trình chặn được tắt. Nhấn nút gạt phía trên để bảo vệ trang web này.
                </div>`;
            return;
        }

        if (tabData.logs.length === 0) {
            logListContainer.innerHTML = `
                <div class="empty-state">
                    <span>✨</span>
                    <b>Trang web sạch sẽ!</b><br><br>
                    Chưa phát hiện quảng cáo hay phần tử rác nào.
                </div>`;
            return;
        }

        // Hiển thị tối đa 10 log mới nhất (có thanh cuộn nội bộ nếu cần)
        const displayLogs = tabData.logs.slice(0, 10);

        displayLogs.forEach(log => {
            const div = document.createElement('div');
            
            let typeClass = 'NETWORK';
            let icon = '🌐';
            if (log.type.includes('GIAO DIỆN')) { typeClass = 'DOM'; icon = '👁️'; }
            if (log.type.includes('POPUP')) { typeClass = 'POPUP'; icon = '🛑'; }

            div.className = `log-item ${typeClass}`;
            
            const isFb = log.details.startsWith('Facebook - ');
            let htmlContent = '';

            if (isFb && log.elementInfo) {
                htmlContent = TemplateEngine.buildFacebookLog(log, icon, typeClass);
            } else {
                htmlContent = TemplateEngine.buildGenericLog(log, icon, typeClass);
            }

            div.innerHTML = htmlContent;
            div.addEventListener('click', (e) => {
                if (e.target.tagName === 'A' || e.target.tagName === 'SUMMARY') return;
                div.classList.toggle('expanded');
            });

            logListContainer.appendChild(div);
        });
    }
}

class TemplateEngine {
    static escapeHTML(str) {
        if (!str || str === 'N/A') return 'Không có mã HTML';
        return str.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    static buildFacebookLog(log, icon, typeClass) {
        const parts = log.details.split(' | ');
        let fbCategory = 'Không rõ';
        let fbAuthor = 'Không rõ';
        let fbSnippet = 'Không có nội dung';

        if (parts.length >= 3) {
            fbCategory = parts[0].replace('Facebook - ', '').trim();
            fbAuthor = parts[1].replace('Tác giả:', '').trim();
            fbAuthor = fbAuthor.replace(/\s*·\s*(Theo dõi|Tham gia|Follow|Join).*/gi, '');
            fbAuthor = fbAuthor.replace(/Tài khoản đã xác minh/gi, '');
            fbAuthor = fbAuthor.replace(/[\u00A0\u1680\u180E\u2000-\u200B\u202F\u205F\u3000]/g, '').trim();

            fbSnippet = parts.slice(2).join(' | ').replace('Trích dẫn:', '').trim();
            if (fbSnippet.startsWith('"') && fbSnippet.endsWith('"')) {
                fbSnippet = fbSnippet.substring(1, fbSnippet.length - 1);
            }
            fbSnippet = this.escapeHTML(fbSnippet);
        }

        const info = log.elementInfo;
        const escapedHTMLCode = this.escapeHTML(info.html);

        const summaryHTML = `
            <div class="log-header-row">
                <span class="log-type">${icon} Facebook Filter</span>
                <span class="log-time">${log.time}</span>
            </div>
            <div style="padding-right: 20px; display: flex; flex-direction: column; gap: 6px; margin-top: 4px;">
                <div>
                    <span style="background: #ffe4e6; color: #e11d48; padding: 3px 8px; border-radius: 6px; font-size: 10px; font-weight: 700; border: 1px solid #fecdd3; display: inline-block;">📌 ${fbCategory}</span>
                </div>
                <div style="color: #475569; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                    Từ: <b style="color: #0f172a;">${fbAuthor}</b>
                </div>
            </div>
            <span class="chevron">▼</span>
        `;

        const detailsHTML = `
            <div style="background: #eff6ff; padding: 12px; border-radius: 8px; margin-bottom: 10px; border: 1px solid #bfdbfe;">
                <p style="margin: 0 0 8px 0; font-size: 12px;"><strong>🔗 Liên kết:</strong> ${info.src !== 'N/A' ? `<a href="${info.src}" target="_blank" style="color: #2563eb; text-decoration: none; font-weight: 600;">Xem bài viết gốc ↗</a>` : '<span style="color:#94a3b8;">Không có đường dẫn</span>'}</p>
                
                <div style="margin-top: 12px; padding-top: 10px; border-top: 1px dashed #93c5fd;">
                    <strong style="font-size: 11px; color: #475569;">📝 Toàn bộ nội dung bài viết:</strong>
                    <div class="post-snippet">${fbSnippet}</div>
                </div>
            </div>
            
            <details style="margin-top: 8px; outline: none; padding-top: 8px; border-top: 1px dashed #cbd5e1;">
                <summary style="cursor: pointer; color: #64748b; font-weight: 600; font-size: 11px; padding: 4px 0; display: flex; align-items: center; gap: 6px;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>
                    Xem thông tin kỹ thuật (HTML/Class)
                </summary>
                <div style="margin-top: 8px; padding: 10px; background: #ffffff; border-radius: 8px; border: 1px solid #e2e8f0; box-shadow: 0 1px 2px rgba(0,0,0,0.02);">
                    <p style="margin: 0 0 6px 0; font-size: 11px; color: #475569;"><strong>Thẻ (Tag):</strong> <span class="tag">\${info.tag}</span></p>
                    <p style="margin: 0 0 6px 0; font-size: 11px; color: #475569; word-break: break-word;"><strong>Class:</strong> <span style="color: #0ea5e9; font-family: monospace;">\${info.className}</span></p>
                    <p style="margin: 0 0 8px 0; font-size: 11px; color: #475569;"><strong>Kích thước:</strong> \${info.size}</p>
                    <code class="html-code" style="margin-top: 4px;">\${escapedHTMLCode}</code>
                </div>
            </details>
        `;

        return `
            <div class="log-summary">${summaryHTML}</div>
            <div class="log-details">${detailsHTML}</div>
        `;
    }

    static buildGenericLog(log, icon, typeClass) {
        let genCategory = 'Bị chặn';
        let genDesc = log.details;
        let badgeColor = '#3b82f6'; let badgeBg = '#eff6ff'; let badgeBorder = '#bfdbfe';

        if (log.type.includes('MẠNG')) {
            genCategory = 'Kết nối mạng';
            let ruleIdMatch = log.details.match(/\d+/);
            let ruleId = ruleIdMatch ? ruleIdMatch[0] : '?';
            genDesc = `Ngăn chặn tải dữ liệu từ máy chủ quảng cáo (Quy tắc #${ruleId})`;
            badgeColor = '#0284c7'; badgeBg = '#e0f2fe'; badgeBorder = '#bae6fd';
        } else if (log.type.includes('POPUP')) {
            genCategory = 'Popup / Tab ẩn';
            genDesc = 'Ngăn chặn tự động mở trang web không mong muốn';
            badgeColor = '#ea580c'; badgeBg = '#fff7ed'; badgeBorder = '#fed7aa';
        } else if (log.type.includes('GIAO DIỆN')) {
            let text = log.details.toLowerCase();
            if (text.includes('cá cược') || text.includes('từ khóa')) {
                genCategory = 'Liên kết khả nghi';
                genDesc = 'Phần tử chứa liên kết hoặc từ khóa bị nhận diện là rác/độc hại';
                badgeColor = '#dc2626'; badgeBg = '#fef2f2'; badgeBorder = '#fecaca';
            } else if (text.includes('div chứa class ads') || text.includes('khối div rác')) {
                genCategory = 'Khung quảng cáo';
                genDesc = 'Vùng chứa quảng cáo được nhúng ngầm trong trang';
                badgeColor = '#ea580c'; badgeBg = '#fff7ed'; badgeBorder = '#fed7aa';
            } else if (text.includes('ghim cứng')) {
                genCategory = 'Banner bám dính';
                genDesc = 'Phần tử quảng cáo cố định che khuất tầm nhìn';
                badgeColor = '#9333ea'; badgeBg = '#faf5ff'; badgeBorder = '#e9d5ff';
            } else if (text.includes('lớp phủ vô hình')) {
                genCategory = 'Click-Jacking';
                genDesc = 'Lớp phủ trong suốt đánh lừa cú click chuột của bạn';
                badgeColor = '#e11d48'; badgeBg = '#fff1f2'; badgeBorder = '#fecdd3';
            } else if (text.includes('kích thước chuẩn')) {
                genCategory = 'Banner tiêu chuẩn';
                genDesc = 'Khối đồ họa có kích thước trùng khớp với quy chuẩn Ads';
                badgeColor = '#d97706'; badgeBg = '#fffbeb'; badgeBorder = '#fde68a';
            } else {
                genCategory = 'Phần tử trang';
                genDesc = log.details;
            }
        }

        const titleText = typeClass === 'NETWORK' ? 'Mạng' : (typeClass === 'DOM' ? 'Giao diện' : 'Popup');
        const summaryHTML = `
            <div class="log-header-row">
                <span class="log-type">${icon} Trình chặn ${titleText}</span>
                <span class="log-time">${log.time}</span>
            </div>
            <div style="padding-right: 20px; display: flex; flex-direction: column; gap: 6px; margin-top: 4px;">
                <div>
                    <span style="background: ${badgeBg}; color: ${badgeColor}; padding: 3px 8px; border-radius: 6px; font-size: 10px; font-weight: 700; border: 1px solid ${badgeBorder}; display: inline-block;">📌 ${genCategory}</span>
                </div>
                <div style="color: #475569; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                    <b style="color: #0f172a;">Chi tiết:</b> ${genDesc}
                </div>
            </div>
            <span class="chevron">▼</span>
        `;

        let detailsHTML = '<p>Không có thông tin kỹ thuật bổ sung.</p>';
        if (log.elementInfo) {
            const info = log.elementInfo;
            const escapedHTMLCode = this.escapeHTML(info.html);
            
            let targetUrl = info.src !== 'N/A' ? info.src : '';
            let hostName = 'Liên kết gốc';
            if (targetUrl && targetUrl.startsWith('http')) {
                try { hostName = new URL(targetUrl).hostname; } catch(e) {}
            }

            detailsHTML = `
                <div style="background: #f8fafc; padding: 12px; border-radius: 8px; margin-bottom: 10px; border: 1px solid #e2e8f0;">
                    <p style="margin: 0 0 8px 0; font-size: 12px;"><strong>🎯 Đối tượng:</strong> <span class="tag">${info.tag || 'N/A'}</span> ${info.id && info.id !== 'N/A' ? `(#${info.id})` : ''}</p>
                    <p style="margin: 0 0 8px 0; font-size: 12px;"><strong>📏 Kích thước:</strong> ${info.size || 'N/A'}</p>
                    <p style="margin: 0 0 8px 0; font-size: 12px;"><strong>🔗 Đích đến:</strong> ${targetUrl ? `<a href="${targetUrl}" target="_blank" style="color: #2563eb; text-decoration: none; font-weight: 600;">${hostName} ↗</a>` : '<span style="color:#94a3b8;">Không có đường dẫn truy cập</span>'}</p>
                    
                    <details style="margin-top: 12px; outline: none; padding-top: 10px; border-top: 1px dashed #cbd5e1;">
                        <summary style="cursor: pointer; color: #64748b; font-weight: 600; font-size: 11px; padding: 4px 0; display: flex; align-items: center; gap: 6px;">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>
                            Xem thông tin kỹ thuật (HTML/Class)
                        </summary>
                        <div style="margin-top: 8px; padding: 10px; background: #ffffff; border-radius: 8px; border: 1px solid #e2e8f0; box-shadow: 0 1px 2px rgba(0,0,0,0.02);">
                            <p style="margin: 0 0 8px 0; font-size: 11px; color: #475569; word-break: break-word;"><strong>Class:</strong> <span style="color: #0ea5e9; font-family: monospace;">\${info.className || 'N/A'}</span></p>
                            <code class="html-code" style="margin-top: 4px;">\${escapedHTMLCode}</code>
                        </div>
                    </details>
                </div>
            `;
        }

        return `
            <div class="log-summary">${summaryHTML}</div>
            <div class="log-details">${detailsHTML}</div>
        `;
    }
}

class ExportManager {
    static exportAdsLog() {
        if (!PopupApp.isEnabled) {
            alert("Trình chặn đang tắt trên trang này."); return;
        }
        if (!PopupApp.currentTabData || PopupApp.currentTabData.logs.length === 0) {
            alert("Không có dữ liệu quảng cáo nào bị chặn trên trang này để xuất!"); return;
        }

        const exportData = {
            metadata: { domain: PopupApp.currentUrl, exportedAt: new Date().toISOString(), totalBlocked: PopupApp.currentTabData.count, type: "Ads_Block_Log" },
            logs: PopupApp.currentTabData.logs
        };
        this.downloadJSON(exportData, `AdBlock_AdsLog_${PopupApp.currentUrl}_${new Date().getTime()}.json`);
    }

    static exportSysLog() {
        if (!PopupApp.isEnabled) {
            alert("Trình chặn đang tắt nên không có dữ liệu System Log."); return;
        }
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (!tabs || tabs.length === 0) return;
            chrome.tabs.sendMessage(tabs[0].id, { action: 'GET_SYSTEM_LOGS' }, (response) => {
                if (chrome.runtime.lastError || !response || !response.systemLogs) {
                    alert("Không thể lấy System Log từ trang này."); return;
                }
                if (response.systemLogs.length === 0) {
                    alert("System Log hiện đang trống."); return;
                }

                const exportData = {
                    metadata: { domain: PopupApp.currentUrl, exportedAt: new Date().toISOString(), type: "System_Debug_Log", totalEntries: response.systemLogs.length },
                    system_logs: response.systemLogs
                };
                this.downloadJSON(exportData, `AdBlock_SysLog_${PopupApp.currentUrl}_${new Date().getTime()}.json`);
            });
        });
    }

    static downloadJSON(data, filename) {
        const jsonString = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonString], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}

/**
 * Quản lý Dynamic Allowlist Rules cho declarativeNetRequest.
 */
class AllowlistManager {
    static _getOrCreateRuleId(hostname) {
        return new Promise((resolve) => {
            chrome.storage.local.get(['allowlistRuleMap'], (data) => {
                const ruleMap = data.allowlistRuleMap || {};
                if (!ruleMap[hostname]) {
                    ruleMap[hostname] = 10000 + Object.keys(ruleMap).length;
                    chrome.storage.local.set({ allowlistRuleMap: ruleMap }, () => {
                        resolve(ruleMap[hostname]);
                    });
                } else {
                    resolve(ruleMap[hostname]);
                }
            });
        });
    }

    static async addAllowRule(hostname) {
        if (!hostname || hostname === 'Trang hệ thống') return;
        const ruleId = await this._getOrCreateRuleId(hostname);
        chrome.declarativeNetRequest.updateDynamicRules({
            addRules: [{
                id: ruleId,
                priority: 100,
                action: { type: 'allow' },
                condition: { initiatorDomains: [hostname], resourceTypes: ['main_frame', 'sub_frame', 'script', 'image', 'xmlhttprequest', 'stylesheet', 'font', 'media', 'other'] }
            }],
            removeRuleIds: [ruleId]
        }, () => {
            if (chrome.runtime.lastError) console.error('[AllowlistManager] Lỗi:', chrome.runtime.lastError.message);
        });
    }

    static async removeAllowRule(hostname) {
        if (!hostname || hostname === 'Trang hệ thống') return;
        chrome.storage.local.get(['allowlistRuleMap'], (data) => {
            const ruleMap = data.allowlistRuleMap || {};
            const ruleId = ruleMap[hostname];
            if (!ruleId) return;
            chrome.declarativeNetRequest.updateDynamicRules({
                addRules: [],
                removeRuleIds: [ruleId]
            }, () => {
                if (chrome.runtime.lastError) console.error('[AllowlistManager] Lỗi:', chrome.runtime.lastError.message);
            });
        });
    }
}


/**
 * Manages the dynamic Change Log from CHANGELOG.md
 */
class ChangelogManager {
    static async renderLatest() {
        const listContainer = document.getElementById('changelogList');
        const titleEl = document.getElementById('changelogTitle');
        if (!listContainer) return;
        try {
            const url = chrome.runtime.getURL('CHANGELOG.md');
            const response = await fetch(url);
            if (!response.ok) throw new Error('Not found');
            const text = await response.text();
            const lines = text.split('\n');
            let latestItems = [];
            let latestVersion = '';
            let found = false;
            for (let line of lines) {
                const clean = line.trim();
                if (clean.startsWith('## [')) {
                    if (found) break;
                    found = true;
                    const match = clean.match(/## \[([^\]]+)\]/);
                    if (match) latestVersion = match[1];
                    continue;
                }
                if (found && clean.startsWith('- ')) latestItems.push(clean.substring(2));
            }
            if (titleEl && latestVersion) {
                titleEl.textContent = `Tính năng mới v${latestVersion}`;
            }
            if (latestItems.length > 0) {
                listContainer.innerHTML = latestItems.slice(0, 4).map(item => `
                    <li style="display: flex; gap: 8px; margin-bottom: 8px;">
                        <span style="color: #10b981;">•</span>
                        <span>${this.formatMarkdown(item)}</span>
                    </li>
                `).join('');
            } else {
                listContainer.innerHTML = '<li style="text-align: center; color: var(--text-muted);">Ổn định.</li>';
            }
        } catch (e) {
            listContainer.innerHTML = `<li style="display: flex; gap: 8px; margin-bottom: 8px;"><span style="color: #10b981;">•</span><span><b>v1.2:</b> Đã tối ưu cho Web Store.</span></li>`;
        }
    }
    static formatMarkdown(text) { return text.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>'); }
}

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
        this.toggleScanBtn = document.getElementById('toggleScanBtn');
        this.debugHint = document.getElementById('debugHint');
        this.fbSettingsPanel = document.getElementById('fbSettingsPanel');
        this.blockAdsCb = document.getElementById('blockAdsCb');
        this.blockSuggestedCb = document.getElementById('blockSuggestedCb');
        this.blockStrangersCb = document.getElementById('blockStrangersCb');

        this.currentTabData = null;
        this.currentUrl = "unknown";
        this.currentTabId = null;
        this.isEnabled = false;
        this.isDebugMode = false;
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

        this.toggleScanBtn.addEventListener('click', () => this.toggleDebugMode());

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

            chrome.storage.local.get(['logsByTab', 'enabledDomains', 'fb_settings'], (data) => {
                const enabledDomains = data.enabledDomains || [];
                this.isEnabled = enabledDomains.includes(this.currentUrl);

                if (data.fb_settings) {
                    this.fbSettings = data.fb_settings;
                    this.blockAdsCb.checked = this.fbSettings.block_ads;
                    this.blockSuggestedCb.checked = this.fbSettings.block_suggested;
                    this.blockStrangersCb.checked = this.fbSettings.block_strangers;
                }
                
                this.updateToggleBtnUI();

                // Cập nhật hiển thị Version
                const manifest = chrome.runtime.getManifest();
                const versionDisplay = document.getElementById('versionDisplay');
                if (versionDisplay) {
                    versionDisplay.textContent = `v${manifest.version_name || manifest.version}`;
                }

                if (this.currentUrl.includes('facebook.com') && this.isEnabled) {
                    this.fbSettingsPanel.style.display = 'block';
                    this.toggleScanBtn.style.display = 'block';
                    chrome.tabs.sendMessage(this.currentTabId, { action: 'GET_DEBUG_STATUS' }, (response) => {
                        if (!chrome.runtime.lastError && response && response.isDebugMode !== undefined) {
                            this.isDebugMode = response.isDebugMode;
                            this.updateDebugUI();
                        }
                    });
                } else {
                    this.fbSettingsPanel.style.display = 'none';
                    this.toggleScanBtn.style.display = 'none';
                    this.debugHint.style.display = 'none';
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

    static toggleDebugMode() {
        if (!this.currentTabId || !this.currentUrl.includes('facebook.com')) return;
        
        this.isDebugMode = !this.isDebugMode;
        chrome.tabs.sendMessage(this.currentTabId, { action: 'TOGGLE_DEBUG_MODE', state: this.isDebugMode }, (response) => {
            if (chrome.runtime.lastError) {
                this.isDebugMode = false;
            }
            this.updateDebugUI();
        });
    }

    static updateDebugUI() {
        if (this.isDebugMode) {
            this.toggleScanBtn.classList.add('active');
            this.toggleScanBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg> <span>Tắt Chế độ Quét</span>';
            this.debugHint.style.display = 'block';
        } else {
            this.toggleScanBtn.classList.remove('active');
            this.toggleScanBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg> <span>Công cụ Quét HTML Thủ Công</span>';
            this.debugHint.style.display = 'none';
        }
    }

    static updateFBSettings() {
        this.fbSettings = {
            block_ads: this.blockAdsCb.checked,
            block_suggested: this.blockSuggestedCb.checked,
            block_strangers: this.blockStrangersCb.checked
        };
        chrome.storage.local.set({ fb_settings: this.fbSettings });

        const isAnyEnabled = this.fbSettings.block_ads || this.fbSettings.block_suggested || this.fbSettings.block_strangers;
        
        chrome.storage.local.get(['enabledDomains'], (data) => {
            let enabledDomains = data.enabledDomains || [];
            let needsReload = false;

            if (!isAnyEnabled && this.isEnabled) {
                this.isEnabled = false;
                enabledDomains = enabledDomains.filter(domain => domain !== this.currentUrl);
                needsReload = true;
            } else if (isAnyEnabled && !this.isEnabled) {
                this.isEnabled = true;
                if (!enabledDomains.includes(this.currentUrl)) {
                    enabledDomains.push(this.currentUrl);
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

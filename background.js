// ==========================================
// BACKGROUND.JS - SERVICE WORKER
// Quản lý trạng thái Storage, Logs và Network Request
// ==========================================

class BackgroundService {
    static init() {
        this.setupInstallationEvent();
        this.setupTabEvents();
        this.setupMessageListener();
        this.setupNetworkRulesListener();
        this.syncAllowlistOnStartup();
    }

    // Sync allowlist on startup: dynamic rules are lost each time the Service Worker sleeps.
    // This function recreates them from storage immediately on SW startup.
    static async syncAllowlistOnStartup() {
        const data = await chrome.storage.local.get(['enabledDomains', 'allKnownDomains', 'allowlistRuleMap']);
        const enabledDomains = data.enabledDomains || [];
        const allKnownDomains = data.allKnownDomains || [];
        const allowlistRuleMap = data.allowlistRuleMap || {};

        // Find domains that are currently OFF (known but not in enabledDomains)
        const disabledDomains = allKnownDomains.filter(d => !enabledDomains.includes(d));
        if (disabledDomains.length === 0) return;

        // Only remove rules in our allowlist range (ID >= 10000) to avoid touching other rules
        const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
        const allowlistIdsToRemove = existingRules
            .map(r => r.id)
            .filter(id => id >= 10000);

        const rulesToAdd = disabledDomains
            .filter(hostname => allowlistRuleMap[hostname])
            .map(hostname => ({
                id: allowlistRuleMap[hostname],
                priority: 100,
                action: { type: 'allow' },
                condition: {
                    initiatorDomains: [hostname],
                    resourceTypes: [
                        'main_frame', 'sub_frame', 'script', 'image',
                        'xmlhttprequest', 'stylesheet', 'font', 'media', 'other'
                    ]
                }
            }));

        if (rulesToAdd.length === 0 && allowlistIdsToRemove.length === 0) return;

        chrome.declarativeNetRequest.updateDynamicRules({
            addRules: rulesToAdd,
            removeRuleIds: allowlistIdsToRemove
        });
    }

    // --- 1. KHỞI TẠO STORAGE KHI CÀI ĐẶT ---
    static setupInstallationEvent() {
        chrome.runtime.onInstalled.addListener(() => {
            chrome.storage.local.set({ logsByTab: {} });
            
            // Xóa hết menu cũ nếu có để tránh lỗi trùng lặp
            chrome.contextMenus.removeAll(() => {
                chrome.contextMenus.create({
                    id: "adblock_manual_hide",
                    title: "Xoá thủ công phần tử này",
                    contexts: ["all"]
                });
            });
        });

        chrome.contextMenus.onClicked.addListener((info, tab) => {
            if (info.menuItemId === "adblock_manual_hide" && tab && tab.id) {
                chrome.tabs.sendMessage(tab.id, { action: 'TOGGLE_MANUAL_BLOCKER' }).catch(() => {});
            }
        });
    }

    // --- 2. QUẢN LÝ TÀI NGUYÊN THEO TAB ---
    static setupTabEvents() {
        // Xóa log của Tab nếu người dùng Hard Reload (Tải lại hoàn toàn) hoặc Đổi sang trang web hoàn toàn khác.
        // Giữ nguyên log nếu Facebook dùng đường truyền ảo (Soft Navigation) để xem ảnh (cùng URL gốc).
        chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
            if (changeInfo.status === 'loading') {
                chrome.storage.local.get(['logsByTab'], (data) => {
                    let logsByTab = data.logsByTab || {};
                    let shouldReset = true;

                    if (logsByTab[tabId] && logsByTab[tabId].url && tab.url) {
                        try {
                            const oldUrl = new URL(logsByTab[tabId].url);
                            const newUrl = new URL(tab.url);
                            // Nếu vẫn chung Tên miền gốc (Origin), Tức là chuyển link FB ảo trong Tab nội bộ -> KHÔNG XÓA LOG
                            if (oldUrl.origin === newUrl.origin) {
                                shouldReset = false;
                                logsByTab[tabId].url = tab.url; // Cập nhật lại đường dẫn mới nhất
                            }
                        } catch(e) {}
                    }

                    if (shouldReset) {
                        logsByTab[tabId] = { 
                            count: 0, 
                            stats: { network: 0, dom: 0, popup: 0 },
                            logs: [], 
                            url: tab.url 
                        };
                        chrome.action.setBadgeText({ text: '', tabId: tabId });
                    }
                    
                    chrome.storage.local.set({ logsByTab });
                });
            }
        });

        // Dọn dẹp bộ nhớ Storage rác khi người dùng đóng Tab
        chrome.tabs.onRemoved.addListener((tabId) => {
            chrome.storage.local.get(['logsByTab'], (data) => {
                let logsByTab = data.logsByTab || {};
                delete logsByTab[tabId];
                chrome.storage.local.set({ logsByTab });
            });
        });
    }

    // --- 3. LẮNG NGHE SỰ KIỆN TỪ CONTENT SCRIPT (DOM & POPUP) ---
    static setupMessageListener() {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (sender.tab && sender.tab.id) {
                if (message.action === 'log_dom_block') {
                    this.saveLog('GIAO DIỆN', message.details, sender.tab.id, message.elementInfo);
                } else if (message.action === 'log_popup_block') {
                    this.saveLog('POPUP', 'Chặn chuyển hướng độc hại', sender.tab.id, message.elementInfo);
                }
            }
        });
    }

    // --- 4. LẮNG NGHE QUY TẮC MẠNG (DECLARATIVE NET REQUEST) ---
    static setupNetworkRulesListener() {
        // Ghi nhận log khi Quy tắc lưới (rules.json) bắt được request quảng cáo
        chrome.declarativeNetRequest.onRuleMatchedDebug.addListener((info) => {
            if (info.request.tabId !== -1) {
                const netInfo = { src: info.request.url, tag: info.request.resourceType };
                this.saveLog('MẠNG', `Quy tắc ID: ${info.rule.ruleId}`, info.request.tabId, netInfo);
            }
        });
    }

    // --- HÀM LƯU TRỮ LOG TỔNG HỢP VÀO STORAGE THIẾT BỊ ---
    static saveLog(type, details, tabId, elementInfo = null) {
        if (!tabId || tabId === -1) return;

        // [PHƯƠNG ÁN C] Guard: Kiểm tra domain có đang được BẬT không trước khi ghi log.
        // Ngăn counter tăng khi domain đang TẮT (dù declarativeNetRequest vẫn chặn ở tầng kernel).
        chrome.tabs.get(tabId, (tab) => {
            if (chrome.runtime.lastError || !tab || !tab.url) return;

            let currentHost;
            try {
                currentHost = new URL(tab.url).hostname;
            } catch (e) {
                return; // URL không hợp lệ (chrome://, about:blank,...) → bỏ qua
            }

            chrome.storage.local.get(['enabledDomains', 'logsByTab'], (data) => {
                const enabledDomains = data.enabledDomains || [];

                // NẾU domain KHÔNG nằm trong danh sách bật → không ghi log, không tăng counter
                if (!enabledDomains.includes(currentHost)) return;

                let logsByTab = data.logsByTab || {};
                if (!logsByTab[tabId]) {
                    logsByTab[tabId] = { 
                        count: 0, 
                        stats: { network: 0, dom: 0, popup: 0 },
                        logs: [] 
                    };
                }

                // Đảm bảo có stats object do mã cũ có thể không có
                if (!logsByTab[tabId].stats) {
                    logsByTab[tabId].stats = { network: 0, dom: 0, popup: 0 };
                }

                logsByTab[tabId].count += 1;
                
                // Increment logic for categories
                if (type.includes('MẠNG')) {
                    logsByTab[tabId].stats.network += 1;
                } else if (type.includes('GIAO DIỆN')) {
                    logsByTab[tabId].stats.dom += 1;
                } else if (type.includes('POPUP')) {
                    logsByTab[tabId].stats.popup += 1;
                }

                // Unshift để log mới nhất đẩy lên đầu danh sách
                logsByTab[tabId].logs.unshift({
                    time: new Date().toLocaleTimeString(),
                    type: type,
                    details: details,
                    elementInfo: elementInfo
                });

                // Tiết kiệm bộ nhớ: Chỉ giữ 100 log gần nhất trên mỗi Tab
                if (logsByTab[tabId].logs.length > 100) logsByTab[tabId].logs.pop();

                chrome.storage.local.set({ logsByTab });
                
                // Cập nhật số đếm màu đỏ hiển thị trên icon Extension
                chrome.action.setBadgeText({ text: logsByTab[tabId].count.toString(), tabId: tabId });
                chrome.action.setBadgeBackgroundColor({ color: '#FF0000', tabId: tabId });
            });
        });
    }
}

// Khởi động Service Worker
BackgroundService.init();
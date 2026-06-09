// background.js — Browser Pilot 后台 Service Worker v1.2
// 修复：execute_js 改用 world: "MAIN" 直接注入，绕过 CSP

// 监听扩展安装
chrome.runtime.onInstalled.addListener(() => {
    console.log('🤖 [Browser Pilot] 扩展已安装/更新 v1.2');
});

// 标签页心跳字典
const tabs = {};

// ============================================================
// 处理来自 content script 的消息
// ============================================================
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    
    // ========== execute_js（world: "MAIN" 绕过 CSP）==========
    if (request.type === "execute_js_request") {
        const code = request.code;
        if (!code) {
            sendResponse({ success: false, error: "missing code" });
            return false;
        }

        // 直接用 world: "MAIN" 注入，不受页面 CSP 限制
        chrome.scripting.executeScript({
            target: { tabId: sender.tab.id },
            func: (userCode) => {
                try {
                    // 在 MAIN world 执行，CSP 不拦截扩展注入的代码
                    const result = new Function(userCode)();
                    // 处理异步结果
                    if (result && typeof result.then === 'function') {
                        return result.then(r => ({ success: true, value: r }));
                    }
                    return { success: true, value: result };
                } catch(e) {
                    return { success: false, error: e.message };
                }
            },
            args: [code],
            world: "MAIN"
        }).then(results => {
            if (results && results[0] && results[0].result) {
                const r = results[0].result;
                if (r.success) {
                    sendResponse({ success: true, result: r.value });
                } else {
                    sendResponse({ success: false, error: r.error });
                }
            } else {
                sendResponse({ success: false, error: "executeScript returned empty" });
            }
        }).catch(error => {
            sendResponse({ success: false, error: error.message || String(error) });
        });
        return true;
    }

    // ========== 截图 ==========
    if (request.type === "screenshot_request") {
        chrome.tabs.captureVisibleTab(sender.tab.windowId, { format: "png" }, (dataUrl) => {
            if (chrome.runtime.lastError) {
                sendResponse({ success: false, error: chrome.runtime.lastError.message });
            } else {
                sendResponse({ success: true, data_url: dataUrl });
            }
        });
        return true;
    }

    // ========== 文件下载 ==========
    if (request.type === "download_request") {
        const downloadOptions = {
            url: request.url,
            filename: request.filename || ""
        };
        chrome.downloads.download(downloadOptions, (downloadId) => {
            if (chrome.runtime.lastError) {
                sendResponse({ success: false, error: chrome.runtime.lastError.message });
            } else {
                sendResponse({ success: true, download_id: downloadId });
            }
        });
        return true;
    }

    // ========== 新建标签页 ==========
    if (request.type === "new_tab_request") {
        chrome.tabs.create({ url: request.url || "about:blank" }, (tab) => {
            if (chrome.runtime.lastError) {
                sendResponse({ success: false, error: chrome.runtime.lastError.message });
            } else {
                sendResponse({ success: true, tab_id: String(tab.id), tab_url: tab.url });
            }
        });
        return true;
    }

    // ========== 切换标签页 ==========
    if (request.type === "switch_tab_request") {
        const tabId = parseInt(request.tab_id);
        chrome.tabs.update(tabId, { active: true }, (tab) => {
            if (chrome.runtime.lastError) {
                sendResponse({ success: false, error: chrome.runtime.lastError.message });
            } else {
                sendResponse({ success: true, tab_id: String(tab.id) });
            }
        });
        return true;
    }

    // ========== 关闭标签页 ==========
    if (request.type === "close_tab_request") {
        const tabId = parseInt(request.tab_id);
        chrome.tabs.remove(tabId, () => {
            if (chrome.runtime.lastError) {
                sendResponse({ success: false, error: chrome.runtime.lastError.message });
            } else {
                sendResponse({ success: true });
            }
        });
        return true;
    }

    // ========== 获取所有标签页 ==========
    if (request.type === "list_tabs_request") {
        chrome.tabs.query({}, (tabs) => {
            if (chrome.runtime.lastError) {
                sendResponse({ success: false, error: chrome.runtime.lastError.message });
            } else {
                const tabList = tabs.map(tab => ({
                    id: String(tab.id),
                    title: tab.title,
                    url: tab.url,
                    active: tab.active
                }));
                sendResponse({ success: true, tabs: tabList });
            }
        });
        return true;
    }

    // ========== 注册心跳 ==========
    if (request.type === "register") {
        const tabId = request.tab_id;
        tabs[tabId] = {
            title: request.title,
            url: request.url,
            last_seen: Date.now()
        };
        console.log('🤖 [BP] 标签页注册:', tabId, request.title);
        sendResponse({ success: true });
    }

    // ========== 轮询任务 ==========
    if (request.type === "poll") {
        const tabId = request.tab_id;
        // 更新最后访问时间
        if (tabs[tabId]) {
            tabs[tabId].last_seen = Date.now();
        }
        // 查找分配给此 tab 的待处理任务
        // 简化版：暂时返回 null（任务分发由 server.py 处理）
        sendResponse({ task_id: null, command: null });
        return false;
    }

});

// 清理过期标签页（每60秒）
setInterval(() => {
    const now = Date.now();
    for (const [tabId, info] of Object.entries(tabs)) {
        if (now - info.last_seen > 300000) {  // 5分钟过期
            delete tabs[tabId];
            console.log('🤖 [BP] 清理过期标签页:', tabId);
        }
    }
}, 60000);

console.log('🤖 [Browser Pilot] background.js v1.2 已加载');

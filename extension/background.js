// background.js — Browser Pilot 后台 Service Worker v1.1
// 新增：execute_js（绕过CSP）、截图、下载、多标签页管理

// 监听扩展安装
chrome.runtime.onInstalled.addListener(() => {
    console.log('🤖 [Browser Pilot] 扩展已安装/更新 v1.1');
});

// 监听来自 content script 的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    
    // ========== execute_js（world: MAIN 绕过 CSP）==========
    if (request.type === "execute_js_request") {
        // 注入 script 标签执行代码，绕过 CSP 对 eval 的限制
        // 先创建一个临时全局变量接收结果
        chrome.scripting.executeScript({
            target: { tabId: sender.tab.id },
            func: () => { window.__bp_result__ = undefined; }
        }).then(() => {
            // 通过 content script 注入 <script> 标签执行用户代码
            chrome.scripting.executeScript({
                target: { tabId: sender.tab.id },
                func: (code) => {
                    return new Promise((resolve) => {
                        const script = document.createElement('script');
                        script.textContent = `
                            try {
                                var __bp_raw__ = (function() { ${code} })();
                                window.__bp_result__ = { value: __bp_raw__ };
                            } catch(e) {
                                window.__bp_result__ = { error: e.message };
                            }
                        `;
                        document.documentElement.appendChild(script);
                        script.remove();
                        // 轮询结果
                        const check = () => {
                            if (window.__bp_result__ !== undefined) {
                                resolve(window.__bp_result__);
                            } else {
                                setTimeout(check, 10);
                            }
                        };
                        check();
                    });
                },
                args: [request.code],
                world: "MAIN"
            }).then(results => {
                if (results && results[0] && results[0].result !== undefined) {
                    const r = results[0].result;
                    if (r.error) {
                        sendResponse({ success: false, error: r.error });
                    } else {
                        sendResponse({ success: true, result: r.value });
                    }
                } else {
                    sendResponse({ success: false, error: "executeScript returned empty" });
                }
            }).catch(error => {
                sendResponse({ success: false, error: error.message || String(error) });
            });
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
                sendResponse({ success: true, tab_id: tab.id, tab_url: tab.url });
            }
        });
        return true;
    }

    // ========== 切换标签页 ==========
    if (request.type === "switch_tab_request") {
        chrome.tabs.update(parseInt(request.tab_id), { active: true }, (tab) => {
            if (chrome.runtime.lastError) {
                sendResponse({ success: false, error: chrome.runtime.lastError.message });
            } else {
                sendResponse({ success: true, tab_id: tab.id });
            }
        });
        return true;
    }

    // ========== 关闭标签页 ==========
    if (request.type === "close_tab_request") {
        chrome.tabs.remove(parseInt(request.tab_id), () => {
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
                    id: tab.id,
                    title: tab.title,
                    url: tab.url,
                    active: tab.active
                }));
                sendResponse({ success: true, tabs: tabList });
            }
        });
        return true;
    }

    // ========== 注册心跳（保留原逻辑）==========
    if (request.type === "register") {
        console.log('🤖 [BP] 标签页注册:', request.tab_id);
        sendResponse({ success: true });
    }

});

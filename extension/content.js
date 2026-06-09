// content.js — Browser Pilot 内容脚本 v1.2
// 修复：execute_js 改用 background.js + world: MAIN 注入
// 修复：new_tab 等待注册返回字符串 tab_id

(function() {
    'use strict';

    const SERVER = "http://127.0.0.1:19789";
    const POLL_INTERVAL = 2000;
    const REGISTER_INTERVAL = 60000;

    // 生成唯一标签页ID
    const TAB_ID = "tab_" + Math.random().toString(36).substr(2, 8)
                 + "_" + Date.now().toString(36);

    let currentTaskId = null;
    let isRunning = false;
    let pollTimer = null;

    console.log(`🤖 [Browser Pilot v1.1] 标签页已注册: ${TAB_ID}`);

    // ============================================================
    // 注册/心跳
    // ============================================================
    function register() {
        fetch(`${SERVER}/register?tab_id=${TAB_ID}&title=${encodeURIComponent(document.title)}&url=${encodeURIComponent(window.location.href)}`)
            .then(resp => resp.json())
            .then(data => {
                console.log(`🤖 [BP] 标签页注册成功: ${document.title}`);
            })
            .catch(() => {});
    }

    function updateRegistration() {
        fetch(`${SERVER}/register?tab_id=${TAB_ID}&title=${encodeURIComponent(document.title)}&url=${encodeURIComponent(window.location.href)}`)
            .catch(() => {});
    }

    // 监听 title 变化
    let lastTitle = document.title;
    const titleObserver = new MutationObserver(() => {
        if (document.title !== lastTitle) {
            lastTitle = document.title;
            updateRegistration();
        }
    });
    
    const titleElement = document.querySelector('title') || document.head;
    if (titleElement) {
        titleObserver.observe(titleElement, {
            childList: true,
            subtree: true,
            characterData: true
        });
    }

    // ============================================================
    // 轮询
    // ============================================================
    function poll() {
        if (isRunning) return;

        fetch(`${SERVER}/poll?tab_id=${TAB_ID}`)
            .then(resp => resp.json())
            .then(data => {
                if (data.task_id && data.command) {
                    currentTaskId = data.task_id;
                    executeCommand(data.command);
                }
            })
            .catch(err => {
                console.error('[BP] Poll error:', err);
            });
    }

    // ============================================================
    // 执行指令
    // ============================================================
    async function executeCommand(cmd) {
        if (isRunning) {
            console.warn('[BP] 已有指令在执行，跳过');
            return;
        }
        isRunning = true;
        const action = cmd.action;
        const params = cmd.params || {};
        let result = { success: false, message: "unknown action", data: null };

        console.log(`🤖 [BP] 执行: ${action}`, params);

        try {
            switch (action) {
                case "navigate":
                    result = await cmdNavigate(params);
                    break;
                case "click":
                    result = await cmdClick(params);
                    break;
                case "input":
                    result = await cmdInput(params);
                    break;
                case "type":
                    result = await cmdType(params);
                    break;
                case "extract":
                    result = await cmdExtract(params);
                    break;
                case "get_url":
                    result = { success: true, data: { url: window.location.href, title: document.title } };
                    break;
                case "get_title":
                    result = { success: true, data: { title: document.title } };
                    break;
                case "wait":
                    const ms = parseInt(params.ms) || 1000;
                    await sleep(ms);
                    result = { success: true, data: { waited_ms: ms } };
                    break;
                case "scroll":
                    result = await cmdScroll(params);
                    break;
                // ===== 新增指令 v1.1 =====
                case "execute_js":
                    result = await cmdExecuteJS(params);
                    break;
                case "screenshot":
                    result = await cmdScreenshot(params);
                    break;
                case "download":
                    result = await cmdDownload(params);
                    break;
                case "new_tab":
                    result = await cmdNewTab(params);
                    break;
                case "switch_tab":
                    result = await cmdSwitchTab(params);
                    break;
                case "close_tab":
                    result = await cmdCloseTab(params);
                    break;
                case "list_tabs":
                    result = await cmdListTabs(params);
                    break;
                default:
                    result = { success: false, message: `unknown action: ${action}` };
            }
        } catch(e) {
            result = { success: false, message: e.message || String(e), data: null };
        }

        submitResult(result);
    }

    // ============================================================
    // 原有指令实现
    // ============================================================

    async function cmdNavigate(params) {
        const url = params.url;
        if (!url) return { success: false, message: "missing url" };
        window.location.href = url;
        await sleep(500);
        return { success: true, data: { url: window.location.href } };
    }

    async function cmdClick(params) {
        const selector = params.selector;
        const text = params.text;
        let element = null;

        if (selector) {
            element = document.querySelector(selector);
        } else if (text) {
            const allElements = document.querySelectorAll("a, button, span, div, [role='button']");
            for (const el of allElements) {
                if (el.textContent.trim() === text || el.textContent.trim().includes(text)) {
                    element = el;
                    break;
                }
            }
        }

        if (!element) {
            return { success: false, message: `element not found` };
        }

        element.click();
        await sleep(300);
        return { success: true, data: { clicked: selector || text, tag: element.tagName } };
    }

    async function cmdInput(params) {
        const selector = params.selector;
        const value = params.value || "";
        const clear = params.clear !== false;

        if (!selector) return { success: false, message: "missing selector" };

        const el = document.querySelector(selector);
        if (!el) return { success: false, message: `element not found: ${selector}` };

        if (clear) el.value = "";
        el.value = value;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        await sleep(200);
        return { success: true, data: { input: selector, value: value } };
    }

    async function cmdType(params) {
        const selector = params.selector;
        const text = params.text || "";

        if (!selector) return { success: false, message: "missing selector" };

        const el = document.querySelector(selector);
        if (!el) return { success: false, message: `element not found: ${selector}` };

        el.focus();
        el.value = "";
        for (const char of text) {
            el.value += char;
            el.dispatchEvent(new Event("input", { bubbles: true }));
            await sleep(50);
        }
        el.dispatchEvent(new Event("change", { bubbles: true }));
        return { success: true, data: { typed: selector, text_length: text.length } };
    }

    async function cmdExtract(params) {
        const selector = params.selector;
        const attr = params.attr || null;
        const multiple = params.multiple !== false;

        if (!selector) {
            return { success: true, data: { text: document.body.innerText, url: window.location.href, title: document.title } };
        }

        if (multiple) {
            const elements = document.querySelectorAll(selector);
            const results = [];
            elements.forEach(el => {
                results.push({
                    text: el.textContent.trim().substring(0, 500),
                    html: el.innerHTML.substring(0, 300),
                    attr: attr ? el.getAttribute(attr) : null
                });
            });
            return { success: true, data: { count: results.length, items: results } };
        } else {
            const el = document.querySelector(selector);
            if (!el) return { success: false, message: `element not found: ${selector}` };
            return {
                success: true,
                data: {
                    text: el.textContent.trim().substring(0, 5000),
                    html: el.innerHTML.substring(0, 1000),
                    attr: attr ? el.getAttribute(attr) : null
                }
            };
        }
    }

    async function cmdScroll(params) {
        const direction = params.direction || "down";
        const amount = parseInt(params.amount) || 500;

        if (direction === "down") window.scrollBy(0, amount);
        else if (direction === "up") window.scrollBy(0, -amount);
        else if (direction === "top") window.scrollTo(0, 0);
        else if (direction === "bottom") window.scrollTo(0, document.body.scrollHeight);

        await sleep(300);
        return { success: true, data: { scrolled: direction, amount: amount, scrollY: window.scrollY } };
    }

    // ============================================================
    // 新增指令实现（v1.1）
    // ============================================================

    // execute_js — 通过 background.js 执行（绕过页面 CSP）
    async function cmdExecuteJS(params) {
        const code = params.code;
        if (!code) return { success: false, message: "missing code" };
        
        return new Promise((resolve) => {
            // 超时保护：background.js 不响应时防止 isRunning 永久卡死
            const timeout = setTimeout(() => {
                resolve({ success: false, message: "execute_js timeout (15秒)" });
            }, 15000);
            
            chrome.runtime.sendMessage(
                { type: "execute_js_request", code: code },
                (response) => {
                    clearTimeout(timeout);
                    if (response && response.success) {
                        resolve({ success: true, data: { result: response.result } });
                    } else {
                        resolve({ success: false, message: response ? response.error : "execute_js failed" });
                    }
                }
            );
        });
    }

    // screenshot — 截图（调用 chrome.tabs.captureVisibleTab）
    async function cmdScreenshot(params) {
        return new Promise((resolve) => {
            chrome.runtime.sendMessage(
                { type: "screenshot_request" },
                (response) => {
                    if (response && response.success) {
                        resolve({ success: true, data: { data_url: response.data_url } });
                    } else {
                        resolve({ success: false, message: response ? response.error : "screenshot failed" });
                    }
                }
            );
        });
    }

    // download — 下载文件（调用 chrome.downloads.download）
    async function cmdDownload(params) {
        const url = params.url;
        const filename = params.filename || "";
        if (!url) return { success: false, message: "missing url" };
        
        return new Promise((resolve) => {
            chrome.runtime.sendMessage(
                { type: "download_request", url: url, filename: filename },
                (response) => {
                    if (response && response.success) {
                        resolve({ success: true, data: { download_id: response.download_id } });
                    } else {
                        resolve({ success: false, message: response ? response.error : "download failed" });
                    }
                }
            );
        });
    }

    // new_tab — 新建标签页（等待新标签注册后返回字符串 tab_id）
    async function cmdNewTab(params) {
        const url = params.url || "about:blank";
        
        // 1. 记录当前已有标签页
        let tabsBefore = [];
        try {
            const resp = await fetch(`${SERVER}/tabs`);
            const data = await resp.json();
            tabsBefore = data.tabs || [];
        } catch(e) {}
        
        // 2. 通过 background.js 创建新标签页
        const createResult = await new Promise((resolve) => {
            chrome.runtime.sendMessage(
                { type: "new_tab_request", url: url },
                (response) => {
                    if (response && response.success) {
                        resolve({ success: true, tab_id: response.tab_id, tab_url: response.tab_url });
                    } else {
                        resolve({ success: false, message: response ? response.error : "new tab failed" });
                    }
                }
            );
        });
        
        if (!createResult.success) {
            return { success: false, message: createResult.message };
        }
        
        // 3. 轮询 /tabs 等待新标签页注册（最多等 10 秒）
        const beforeIds = new Set((tabsBefore).map(t => t.id));
        const beforeUrls = new Set((tabsBefore).map(t => t.url));
        const startTime = Date.now();
        let newTabId = null;
        
        while (Date.now() - startTime < 10000) {
            await sleep(500);
            try {
                const resp = await fetch(`${SERVER}/tabs`);
                const data = await resp.json();
                const currentTabs = data.tabs || [];
                for (const tab of currentTabs) {
                    if (!beforeIds.has(tab.id) && tab.url !== undefined) {
                        newTabId = tab.id;
                        break;
                    }
                }
                if (newTabId) break;
            } catch(e) {}
        }
        
        return {
            success: true,
            data: {
                tab_id: newTabId || createResult.tab_id,
                numeric_id: createResult.tab_id,
                tab_url: createResult.tab_url
            }
        };
    }

    // switch_tab — 切换标签页
    async function cmdSwitchTab(params) {
        const tabId = parseInt(params.tab_id);
        if (!tabId) return { success: false, message: "missing tab_id" };
        
        return new Promise((resolve) => {
            chrome.runtime.sendMessage(
                { type: "switch_tab_request", tab_id: tabId },
                (response) => {
                    if (response && response.success) {
                        resolve({ success: true, data: { tab_id: response.tab_id } });
                    } else {
                        resolve({ success: false, message: response ? response.error : "switch tab failed" });
                    }
                }
            );
        });
    }

    // close_tab — 关闭标签页
    async function cmdCloseTab(params) {
        const tabId = parseInt(params.tab_id);
        if (!tabId) return { success: false, message: "missing tab_id" };
        
        return new Promise((resolve) => {
            chrome.runtime.sendMessage(
                { type: "close_tab_request", tab_id: tabId },
                (response) => {
                    if (response && response.success) {
                        resolve({ success: true });
                    } else {
                        resolve({ success: false, message: response ? response.error : "close tab failed" });
                    }
                }
            );
        });
    }

    // list_tabs — 列出所有标签页
    async function cmdListTabs(params) {
        return new Promise((resolve) => {
            chrome.runtime.sendMessage(
                { type: "list_tabs_request" },
                (response) => {
                    if (response && response.success) {
                        resolve({ success: true, data: { tabs: response.tabs } });
                    } else {
                        resolve({ success: false, message: response ? response.error : "list tabs failed" });
                    }
                }
            );
        });
    }

    // ============================================================
    // 提交结果
    // ============================================================
    function submitResult(result) {
        if (!currentTaskId) {
            isRunning = false;
            return;
        }

        const payload = {
            task_id: currentTaskId,
            result: result,
            tab_id: TAB_ID
        };

        fetch(`${SERVER}/result`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        })
        .then(() => {
            currentTaskId = null;
            isRunning = false;
            console.log("🤖 [BP] 结果已提交");
        })
        .catch(() => {
            currentTaskId = null;
            isRunning = false;
            console.warn("🤖 [BP] 提交结果失败");
        });
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // ============================================================
    // 启动
    // ============================================================
    register();
    pollTimer = setInterval(poll, POLL_INTERVAL);
    setInterval(register, REGISTER_INTERVAL);
    poll();

    window.addEventListener("beforeunload", function() {
        if (pollTimer) clearInterval(pollTimer);
    });

})();

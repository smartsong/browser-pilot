---
name: browser-pilot
description: AI操控用户已登录浏览器的桥梁。本地服务+浏览器扩展实现导航、点击、输入、提取等。
---

# Browser Pilot

让 AI 操作用户**已登录**的浏览器。

## 架构

```
用户说"帮我查XX"
  → OpenClaw (AI)
  → HTTP POST /command
  localhost:19789 (Python本地服务)
  → 轮询 POLL
  浏览器扩展 (在用户浏览器里执行)
  → 页面 JS 操作
  目标网页（用户已登录）
```

## 前置条件

### 启动本地服务

```bash
cd E:\QClaw\workspace\projects\browser-pilot
python server.py
```

看到 `🚻 Browser Pilot 服务已启动 → http://127.0.0.1:19789` 即成功 ✅

### 安装浏览器扩展

1. 打开 Edge → `edge://extensions/`
2. 开启"开发人员模式"
3. "加载已解压的扩展程序"
4. 选择 `extension/` 目录
5. 打开任意网页，确认控制台有 `🚻 [Browser Pilot] 已注入页面` 日志

## 可用指令

### navigate — 导航到 URL
```json
{"action": "navigate", "params": {"url": "https://www.jd.com"}}
```

### click — 点击元素（支持CSS选择器和文本匹配）
```json
{"action": "click", "params": {"selector": "#search-btn"}}
{"action": "click", "params": {"text": "搜索"}}
```

### input — 输入文本到输入框
```json
{"action": "input", "params": {"selector": "#search-input", "text": "机械键盘"}}
```

### extract — 提取页面内容
```json
{"action": "extract"}
```

### screenshot — 页面截图
```json
{"action": "screenshot"}
```

### get_url — 获取当前URL和标题
```json
{"action": "get_url"}
```

### get_title — 获取页面标题
```json
{"action": "get_title"}
```

### execute_js — 执行自定义JS
```json
{"action": "execute_js", "params": {"code": "return document.title"}}
```

### scroll — 滚动页面
```json
{"action": "scroll", "params": {"direction": "down", "amount": 500}}
```

### wait — 等待指定毫秒
```json
{"action": "wait", "params": {"ms": 2000}}
```

## 调用示例

```python
import requests

# 导航到京东
requests.post("http://127.0.0.1:19789/command", json={
    "command": {"action": "navigate", "params": {"url": "https://www.jd.com"}},
    "tab_id": "tab_xxx"
})
```

## 补充说明

- 浏览器扩展需要先加载才能使用
- 每个浏览器标签页有独立 ID，通过 GET /tabs 查看
- 提交指令后通过 GET /result?task_id=xxx 轮询等待结果
- Server 和扩展在同一台机器上运行

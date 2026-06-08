# Browser Pilot 扩展 v1.0

独立浏览器扩展，让 AI 通过 HTTP API 操控浏览器页面。

## 安装方法

1. 打开 Edge/Chrome，进入 `edge://extensions/` 或 `chrome://extensions/`
2. 开启"开发人员模式"
3. 点击"加载已解压的扩展程序"
4. 选择 `extension/` 目录

## 架构

```
content.js (注入页面) → fetch() → server.py (HTTP服务) → AI
```

## 文件说明

- `manifest.json` — 扩展配置 (Manifest V3)
- `content.js` — 内容脚本，注入到每个页面
- `background.js` — 后台 Service Worker
- `popup.html/js` — 弹出界面
- `icons/` — 扩展图标

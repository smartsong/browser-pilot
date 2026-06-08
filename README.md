# Browser Pilot

让 AI 操作用户**已登录**的浏览器。

所有 AI 浏览器自动化的方案都是开一个"干净浏览器"——没有登录态、没有 Cookie、没有历史。但用户的日常在**自己的浏览器里**。Browser Pilot 解决的就是这个 gap。

---

## 架构

```
┌─────────────┐    HTTP     ┌──────────────────┐    轮询      ┌────────────────────┐
│  OpenClaw    │ ──────────→ │  本地服务          │ ←────────── │  Browser Pilot     │
│  (AI Agent)  │ ←────────── │  localhost:19789  │ ──────────→ │  浏览器扩展         │
└─────────────┘   返回结果    │  Python HTTP      │   发指令     │  (Edge/Chrome)     │
                              └──────────────────┘              └────────────────────┘
                                                                    ↑
                                                                在页面执行任意 JS
```

**核心逻辑：** AI 通过 HTTP 给 server.py 下指令，server.py 转发给浏览器里的扩展，扩展在页面上执行 JS 并把结果返回。

---

## 组件

| 组件 | 职责 | 技术 |
|------|------|------|
| `server.py` | HTTP 服务，接收 AI 指令，桥接浏览器扩展 | Python（内置 http.server） |
| 浏览器扩展 | 注入页面，轮询获取指令，执行 JS 并返回结果 | Manifest V3 Content Script |
| SKILL.md | OpenClaw 调用入口 | OpenClaw Skill 规范 |

---

## 已验证的能力

| 接口 | 功能 | 状态 |
|------|------|------|
| `GET /tabs` | 列出所有已打开的标签页 | ✅ |
| `GET /health` | 健康检查 | ✅ |
| `POST /command get_url` | 获取当前页面 URL 和标题 | ✅ |
| `POST /command extract` | 提取页面全文 | ✅ |
| `POST /command screenshot` | 截取当前页面 | ✅ |
| `POST /command navigate` | 跳转到指定 URL | ✅ |
| `POST /command click` | 点击页面元素 | ⬜ 待测 |
| `POST /command input` | 输入文本到表单 | ⬜ 待测 |

---

## 安装

1. **加载浏览器扩展**
   - 打开 `edge://extensions/`
   - 开启"开发人员模式"
   - "加载已解压的扩展程序"，选择 `extension/` 目录

2. **启动本地服务**
   ```bash
   python server.py
   ```

3. **OpenClaw 调用**
   - 通过 `POST http://127.0.0.1:19789/command` 发送指令

---

## 项目文件

```
browser-pilot/
├── server.py           # 本地 HTTP 服务
├── extension/          # 浏览器扩展
│   ├── manifest.json
│   ├── content.js      # 页面注入脚本
│   ├── background.js   # Service Worker
│   ├── popup.html/js   # 弹出界面
│   └── icons/
├── 文档/使用文档.md
├── README.md
└── SKILL.md
```

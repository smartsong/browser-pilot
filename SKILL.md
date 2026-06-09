---
name: browser-pilot
description: 通过本地HTTP服务控制用户已登录的浏览器（Edge/Chrome）。支持导航、点击、输入、截图、提取页面内容等操作。需要先在Edge中加载扩展并启动server.py。
---

# Browser Pilot Skill

让 AI 通过 REST API 操控用户**已登录**的浏览器。

## 前置条件

### 1. 启动本地服务

```powershell
cd E:\QClaw\workspace\projects\browser-pilot
python server.py
```

看到 `Browser Pilot 服务已启动 -> http://127.0.0.1:19789` 即成功。

### 2. 加载浏览器扩展

1. 打开 Edge `edge://extensions/`
2. 开启"开发人员模式"
3. "加载已解压的扩展程序" → 选择 `E:\QClaw\workspace\projects\browser-pilot\extension\`
4. 打开任意网页，确认控制台有 `Browser Pilot 已注入页面` 日志

## API 调用方式

所有指令通过 HTTP 调用，先 POST 提交指令，再 GET 轮询结果。

### 提交指令

```
POST http://127.0.0.1:19789/command
Content-Type: application/json

{
  "command": { "action": "<action>", "params": { ... } },
  "tab_id": "<扩展注入的tab_id字符串>"
}
```

返回：`{"task_id": "xxx", "status": "pending"}`

### 获取结果

```
GET http://127.0.0.1:19789/result?task_id=xxx
```

返回：`{"status": "done", "result": {...}}` 或 `{"status": "pending"}`

### 查看所有标签页

```
GET http://127.0.0.1:19789/tabs
```

## 可用指令

| action | 参数 | 说明 |
|--------|------|------|
| `navigate` | `url` | 导航到指定URL |
| `click` | `selector` 或 `text` | 点击元素（CSS选择器或文本匹配） |
| `input` | `selector`, `text` | 向输入框输入文本 |
| `extract` | 无 | 提取页面全文（Markdown格式） |
| `screenshot` | 无 | 页面截图（返回base64 PNG） |
| `get_url` | 无 | 获取当前URL |
| `get_title` | 无 | 获取页面标题 |
| `execute_js` | `code` | 在页面执行JS代码 |
| `scroll` | `direction`, `amount` | 滚动页面（down/up，像素值） |
| `wait` | `ms` | 等待指定毫秒 |
| `list_tabs` | 无 | 列出所有标签页 |
| `new_tab` | `url` | 新建标签页 |
| `switch_tab` | `tab_id` | 切换标签页 |
| `close_tab` | `tab_id` | 关闭标签页 |

## 调用示例（PowerShell）

```powershell
# 提交导航指令
$body = @{
    command = @{ action = "navigate"; params = @{ url = "https://www.baidu.com" } }
    tab_id = "tab_xxx"
} | ConvertTo-Json -Depth 3

$wc = New-Object System.Net.WebClient
$wc.Encoding = [System.Text.Encoding]::UTF8
$wc.Headers.Add("Content-Type", "application/json")
$resp = $wc.UploadString("http://127.0.0.1:19789/command", "POST", $body) | ConvertFrom-Json

# 轮询结果
Start-Sleep -Seconds 2
$result = $wc.DownloadString("http://127.0.0.1:19789/result?task_id=$($resp.task_id)") | ConvertFrom-Json
$result.result
```

## 注意事项

- `tab_id` 是扩展注入时生成的字符串（如 `tab_o7p2mwdp_mq4lrj1a`），通过 GET /tabs 获取
- `execute_js` 受页面 CSP 限制，严格执行 `eval` 的页面会失败
- 每次只能执行一个指令，前一个完成后才能提交下一个（isRunning 互斥锁）
- 截图返回 base64，需要手动解码保存为 PNG 文件

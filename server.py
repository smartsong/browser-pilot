#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Browser Pilot — 本地服务 v0.3.4
修复：
  - list_tabs result 不再 pop，改为标记 consumed
  - new_tab 等待注册后返回字符串 tab_id
  - 支持数字 tab_id → 字符串 tab_id 映射
  - 后台清理线程（60秒）
  - CORS 预检完整响应
"""

import json
import time
import uuid
import sys
import os
import threading
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

try:
    sys.stdout.reconfigure(encoding='utf-8')
except:
    pass

HOST = "127.0.0.1"
PORT = 19789

tasks = {}
tabs = {}  # tab_id -> {"title": ..., "url": ..., "first_seen": ..., "last_seen": ...}
TAB_TIMEOUT = 300  # 5分钟无心跳视为过期
numeric_to_string = {}  # 数字 tab_id -> 字符串 tab_id 映射（new_tab 用）


class PilotHandler(BaseHTTPRequestHandler):

    # ---------- GET ----------
    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        print(f"[GET] {path}")  # ← DEBUG
        qs = parse_qs(parsed.query)

        if path == "/health":
            self._json(200, {"status": "ok", "version": "0.3.4", "active_tabs": len(self._active_tabs())})

        elif path == "/tabs":
            active = self._active_tabs()
            self._json(200, {
                "tabs": [{"id": tid, "title": info["title"], "url": info["url"]}
                          for tid, info in active.items()]
            })

        elif path == "/poll":
            tab_id = qs.get("tab_id", [None])[0]
            if not tab_id:
                self._json(400, {"error": "missing tab_id"})
                return

            if tab_id in tasks:
                t = tasks[tab_id]
                if t["status"] == "pending":
                    t["status"] = "running"
                    self._json(200, {"task_id": tab_id, "command": t["command"]})
                    return

            # 查找发给这个 tab 的待处理任务
            for tid, t in tasks.items():
                if t["status"] == "pending" and (t["target_tab"] is None or t["target_tab"] == tab_id):
                    t["status"] = "running"
                    self._json(200, {"task_id": tid, "command": t["command"]})
                    return

            self._json(200, {"task_id": None, "command": None})

        elif path == "/register":
            print(f"[REGISTER] {qs}")  # ← DEBUG
            tab_id = qs.get("tab_id", [None])[0]
            title = qs.get("title", [""])[0]
            url = qs.get("url", [""])[0]
            if tab_id:
                tabs[tab_id] = {
                    "title": title,
                    "url": url,
                    "first_seen": time.time(),
                    "last_seen": time.time()
                }
                self._json(200, {"success": True})
            else:
                self._json(400, {"error": "missing tab_id"})

        elif path == "/result":
            tid = qs.get("task_id", [None])[0]
            if tid and tid in tasks:
                t = tasks[tid]
                if t["status"] == "done":
                    t["status"] = "consumed"
                    self._json(200, t["result"])
                elif t["status"] == "consumed":
                    self._json(200, t["result"])
                else:
                    self._json(200, {"status": t["status"], "result": None})
            else:
                self._json(200, {"status": "not_found", "result": None})

        else:
            self._json(404, {"error": "not found"})

    # ---------- POST ----------
    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/command":
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length)
            try:
                data = json.loads(body)
            except:
                self._json(400, {"error": "invalid json"})
                return

            cmd = data.get("command", {})
            action = cmd.get("action")
            if not action:
                self._json(400, {"error": "missing command.action"})
                return

            valid_actions = [
                "navigate", "click", "input", "extract", "wait", "scroll",
                "type", "get_url", "get_title", "execute_js",
                "screenshot", "download", "new_tab", "switch_tab",
                "close_tab", "list_tabs"
            ]
            if action not in valid_actions:
                self._json(400, {"error": f"unknown action: {action}"})
                return

            # 统一 tab_id 处理：接受数字或字符串 ID
            raw_tab = data.get("tab_id")
            tab_id = None
            if raw_tab:
                if str(raw_tab) in numeric_to_string:
                    tab_id = numeric_to_string[str(raw_tab)]
                else:
                    tab_id = str(raw_tab)

            # 方案2：拒绝无 tab_id 的指令（避免竞态）
            if tab_id is None:
                self._json(400, {"error": "must specify tab_id"})
                return

            tid = str(uuid.uuid4())[:8]
            tasks[tid] = {
                "command": cmd,
                "status": "pending",
                "result": None,
                "target_tab": tab_id,
                "created_at": time.time()
            }
            target = f" -> tab:{tab_id}" if tab_id else " (广播)"
            print(f"[Pilot] 新指令 {action}{target} [{tid}]")
            self._json(200, {"task_id": tid, "status": "pending", "target_tab": tab_id})

        elif path == "/result":
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length)
            try:
                data = json.loads(body)
            except:
                self._json(400, {"error": "invalid json"})
                return

            tid = data.get("task_id")
            if tid and tid in tasks:
                tasks[tid]["status"] = "done"
                tasks[tid]["result"] = data.get("result", {})
                
                # 如果是 new_tab 的结果，记录数字→字符串映射
                cmd = tasks[tid]["command"]
                if cmd.get("action") == "new_tab":
                    result = data.get("result", {})
                    if result.get("success") and "data" in result:
                        numeric_id = result["data"].get("numeric_id")
                        string_id = result["data"].get("tab_id")
                        if numeric_id and string_id:
                            numeric_to_string[str(numeric_id)] = string_id
                            print(f"[Pilot] 记录 tab 映射：{numeric_id} → {string_id}")
                
                self._json(200, {"status": "ok"})
            else:
                self._json(404, {"error": f"task {tid} not found"})

        else:
            self._json(404, {"error": "not found"})

    # ---------- OPTIONS (CORS) ----------
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Max-Age", "86400")
        self.end_headers()
        self.wfile.write(b"")

    # ---------- 辅助 ----------
    def _active_tabs(self):
        now = time.time()
        return {tid: info for tid, info in tabs.items()
                if now - info["last_seen"] < TAB_TIMEOUT}

    def _json(self, status, data):
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode("utf-8"))

    def log_message(self, format, *args):
        print(f"[Pilot] {args[0]} {args[1]} {args[2]}")


def _cleanup_loop():
    """定时清理过期任务和过期标签页"""
    while True:
        time.sleep(60)
        now = time.time()
        # 清理 300 秒前完成的 consumed 任务
        before_clean = len(tasks)
        for tid, t in list(tasks.items()):
            if t["status"] == "consumed":
                created = t.get("created_at", now)
                if now - created > 300:
                    del tasks[tid]
        # 清理 600 秒未活跃的 tab
        for tid, info in list(tabs.items()):
            if now - info["last_seen"] > 600:
                del tabs[tid]
        after_clean = len(tasks)
        if before_clean != after_clean:
            print(f"[Pilot] 清理：{before_clean - after_clean} 个过期任务, 当前任务: {after_clean}, 标签页: {len(tabs)}")


def main():
    # 启动后台清理线程
    cleaner = threading.Thread(target=_cleanup_loop, daemon=True)
    cleaner.start()

    server = HTTPServer((HOST, PORT), PilotHandler)
    print(f"[Browser Pilot v0.3.4] 服务已启动 -> http://{HOST}:{PORT}")
    print(f"  POST /command       提交指令（支持 tab_id 参数定向）")
    print(f"  GET  /poll?tab_id=   content.js 轮询（tab_id 必传）")
    print(f"  GET  /register       content.js 注册/心跳")
    print(f"  GET  /tabs          列出活跃标签页")
    print(f"  GET  /result?task_id=  查询结果")
    print(f"  GET  /health        健康检查")
    print(f"  cleanup             每60秒自动清理过期任务和标签页")
    print()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[Browser Pilot] 服务已停止")
        server.server_close()


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        import traceback
        with open("server_crash.log", "a", encoding="utf-8") as f:
            f.write(f"\n=== CRASH {time.strftime('%Y-%m-%d %H:%M:%S')} ===\n")
            traceback.print_exc(file=f)
        raise()

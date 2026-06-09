#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Browser Pilot — 本地服务 v0.3.1
新增：screenshot / download / new_tab / switch_tab / close_tab / list_tabs
修复：去掉所有 [DEBUG] 输出
"""

import json
import time
import uuid
import sys
import os
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
        qs = parse_qs(parsed.query)

        if path == "/health":
            self._json(200, {
                "status": "ok",
                "tasks_pending": sum(1 for t in tasks.values() if t["status"] == "pending"),
                "tabs_active": len(self._active_tabs())
            })

        elif path == "/register":
            tab_id = qs.get("tab_id", [None])[0]
            if tab_id:
                now = time.time()
                old = tabs.get(tab_id)
                tabs[tab_id] = {
                    "title": qs.get("title", [""])[0],
                    "url": qs.get("url", [""])[0],
                    "first_seen": old["first_seen"] if old else now,
                    "last_seen": now
                }
                self._json(200, {"status": "ok", "tab_id": tab_id})
            else:
                self._json(400, {"error": "missing tab_id"})

        elif path == "/tabs":
            active = self._active_tabs()
            self._json(200, {
                "count": len(active),
                "tabs": [{"id": tid, **info} for tid, info in active.items()]
            })

        elif path == "/poll":
            tab_id = qs.get("tab_id", [None])[0]
            for tid, task in list(tasks.items()):
                if task["status"] != "pending":
                    continue
                target = task.get("target_tab")
                if target is None or target == tab_id:
                    task["status"] = "running"
                    self._json(200, {"task_id": tid, "command": task["command"]})
                    return
            self._json(200, {"task_id": None, "command": None})

        elif path == "/result":
            tid = qs.get("task_id", [None])[0]
            if tid and tid in tasks:
                t = tasks[tid]
                if t["status"] == "done":
                    # 不直接 pop，标记为 consumed 避免重复查询
                    t["status"] = "consumed"
                    self._json(200, t["result"])
                elif t["status"] == "consumed":
                    # 已查询过，直接返回结果
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

            tab_id = data.get("tab_id")  # 可选：指定标签页
            tid = str(uuid.uuid4())[:8]
            tasks[tid] = {
                "command": cmd,
                "status": "pending",
                "result": None,
                "target_tab": tab_id
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
                self._json(200, {"status": "ok"})
            else:
                self._json(404, {"error": f"task {tid} not found"})

        else:
            self._json(404, {"error": "not found"})

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

    def do_OPTIONS(self):
        self._json(200, {})

    def log_message(self, format, *args):
        print(f"[Pilot] {args[0]} {args[1]} {args[2]}")


def main():
    server = HTTPServer((HOST, PORT), PilotHandler)
    print(f"[Browser Pilot v0.3.1] 服务已启动 -> http://{HOST}:{PORT}")
    print(f"  POST /command       提交指令（支持 tab_id 参数定向）")
    print(f"  GET  /poll?tab_id=   content.js 轮询（tab_id 必传）")
    print(f"  GET  /register       content.js 注册/心跳")
    print(f"  GET  /tabs          列出活跃标签页")
    print(f"  GET  /result?task_id=  查询结果")
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

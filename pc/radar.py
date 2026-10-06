"""Human Radar PC hub.

Bridges the ESP32 (USB serial) to the web dashboard in pc/web/index.html:
  GET  /           dashboard
  GET  /data       latest reading + status   {"r":{...},"st":{...},"hub":true}
  GET  /cmd?c=...  send a command to the radar firmware, returns its ack
  GET  /history    arrive/leave events from the last 24 h (stored in events.jsonl)
  GET/POST /room   room layout (room.json)
Also beeps on arrival and logs every event.

    python radar.py                 # auto-find the ESP32, serve on 127.0.0.1:8765, open a window
    python radar.py --port COM6 --no-window --no-beep
Tailscale (phone access): tailscale serve --bg --set-path /radar http://127.0.0.1:8765
"""
import argparse
import json
import subprocess
import threading
import time
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import serial
from serial.tools import list_ports

HERE = Path(__file__).parent
WEB = HERE / "web" / "index.html"
EVENTS = HERE / "events.jsonl"
ROOM = HERE / "room.json"
FLOORPLAN = HERE / "floorplan.jpg"
DAY_MS = 86_400_000


def now_ms():
    return int(time.time() * 1000)


def find_port():
    # Only USB-UART bridge chips (the radar's DevKit uses a CP210x). Native-USB Espressif boards
    # (VID 0x303A, e.g. ESP32-S3 projects) are skipped so the hub never grabs another device's port.
    for p in list_ports.comports():
        if p.vid in (0x10C4, 0x1A86, 0x0403):  # CP210x, CH340, FTDI
            return p.device
    return None


class Hub:
    def __init__(self, port, beep):
        self.port, self.beep = port, beep
        self.lock = threading.Lock()
        self.ack_cv = threading.Condition(self.lock)
        self.r, self.st, self.acks = None, None, []
        self.ser = None
        self.link = "connecting"
        self.present, self.since = False, 0
        self.events = self._load_events()

    # ---- events -------------------------------------------------------------------------
    def _load_events(self):
        out, cutoff = [], now_ms() - DAY_MS
        if EVENTS.exists():
            for line in EVENTS.read_text(encoding="utf-8").splitlines():
                try:
                    e = json.loads(line)
                    if e["t"] >= cutoff:
                        out.append(e)
                except (ValueError, KeyError):
                    pass
        return out

    def _event(self, e):
        self.events.append(e)
        cutoff = now_ms() - DAY_MS
        while self.events and self.events[0]["t"] < cutoff:
            self.events.pop(0)
        with EVENTS.open("a", encoding="utf-8") as f:
            f.write(json.dumps(e) + "\n")

    def _on_reading(self, r):
        p = bool(r.get("p"))
        if p and not self.present:
            self.since = now_ms()
            d = (r.get("md") if r.get("s", 0) & 1 else r.get("sd")) or r.get("dd")
            self._event({"t": self.since, "type": "arrive", "d": d, "s": r.get("s", 0)})
            print(f"{time.strftime('%H:%M:%S')}  HUMAN DETECTED at {d / 100 if d else 0:.2f} m", flush=True)
            if self.beep:
                threading.Thread(target=_beep, daemon=True).start()
        elif not p and self.present:
            dur = (now_ms() - self.since) / 1000
            self._event({"t": now_ms(), "type": "leave", "dur": round(dur, 1)})
            print(f"{time.strftime('%H:%M:%S')}  clear after {dur:.0f} s", flush=True)
        self.present = p

    # ---- serial -------------------------------------------------------------------------
    def run_serial(self):
        while True:
            port = self.port or find_port()
            if not port:
                self.link = "no ESP32 found on USB"
                time.sleep(2)
                continue
            try:
                s = serial.Serial()
                s.port, s.baudrate, s.timeout = port, 115200, 1
                s.dtr = s.rts = False  # don't reset the board when the port opens
                s.open()
                self.ser, self.link = s, f"connected to {port}"
                print(f"Radar on {port}", flush=True)
                while True:
                    line = s.readline().decode(errors="ignore").strip()
                    if not line.startswith("{"):
                        continue
                    try:
                        msg = json.loads(line)
                    except ValueError:
                        continue
                    t = msg.get("t")
                    with self.lock:
                        if t == "r":
                            self.r = msg
                            self._on_reading(msg)
                        elif t == "st":
                            self.st = msg
                        elif t == "ack":
                            self.acks.append(msg)
                            self.acks = self.acks[-20:]
                            self.ack_cv.notify_all()
            except (serial.SerialException, OSError) as e:
                self.link = f"{port}: {e}"[:160]
                self.ser = None
                time.sleep(2)

    def command(self, c, timeout=8.0):
        c = c.strip().replace('"', "'").replace("\\", "/")[:120]
        if not c:
            return {"t": "ack", "ok": False, "msg": "empty command"}
        if not self.ser:
            return {"t": "ack", "cmd": c, "ok": False, "msg": "radar not connected"}
        with self.lock:
            self.acks.clear()
        self.ser.write((c + "\n").encode())
        deadline = time.time() + timeout
        with self.ack_cv:
            while time.time() < deadline:
                for a in self.acks:
                    if a.get("cmd") == c:
                        return a
                self.ack_cv.wait(deadline - time.time())
        return {"t": "ack", "cmd": c, "ok": False, "msg": "no reply from radar"}


def _beep():
    try:
        import winsound
        winsound.Beep(1800, 160)
        winsound.Beep(2400, 160)
    except Exception:
        pass


def make_handler(hub):
    class H(BaseHTTPRequestHandler):
        # Keep-alive: the dashboard polls ~9x/s; a new TCP connection per request exhausts Windows sockets.
        protocol_version = "HTTP/1.1"

        def log_message(self, *a):
            pass

        def _send(self, code, body, ctype="application/json"):
            data = body if isinstance(body, bytes) else body.encode()
            self.send_response(code)
            self.send_header("Content-Type", ctype)
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def do_GET(self):
            u = urlparse(self.path)
            if "/assets/" in u.path:  # 3D model files next to the dashboard
                name = u.path.rsplit("/", 1)[-1]
                f = WEB.parent / "assets" / name
                if name and "/" not in name and "\\" not in name and not name.startswith(".") and f.is_file():
                    ctype = {".glb": "model/gltf-binary", ".webp": "image/webp"}.get(f.suffix, "application/octet-stream")
                    return self._send(200, f.read_bytes(), ctype)
                return self._send(404, '{"error":"not found"}')
            path = u.path.rstrip("/").rsplit("/", 1)[-1] if u.path not in ("/", "") else ""
            if path in ("", "index.html", "radar"):
                return self._send(200, WEB.read_bytes(), "text/html; charset=utf-8")
            if path == "data":
                with hub.lock:
                    st = dict(hub.st or {"t": "st", "ok": False, "wiring": hub.link})
                    st["hub_link"] = hub.link
                    body = json.dumps({"r": hub.r if hub.ser else None, "st": st, "hub": True})
                return self._send(200, body)
            if path == "cmd":
                c = parse_qs(u.query).get("c", [""])[0]
                return self._send(200, json.dumps(hub.command(c)))
            if path == "history":
                with hub.lock:
                    return self._send(200, json.dumps({"events": hub.events}))
            if path == "room":
                return self._send(200, ROOM.read_text(encoding="utf-8") if ROOM.exists() else "null")
            if path == "floorplan":
                if not FLOORPLAN.exists():
                    return self._send(404, '{"error":"no floor plan"}')
                return self._send(200, FLOORPLAN.read_bytes(), "image/jpeg")
            self._send(404, '{"error":"not found"}')

        def do_POST(self):
            if urlparse(self.path).path.rstrip("/").endswith("floorplan"):
                n = int(self.headers.get("Content-Length", 0))
                if n > 6_000_000:
                    return self._send(413, '{"ok":false}')
                body = self.rfile.read(n)
                if not body:
                    FLOORPLAN.unlink(missing_ok=True)
                elif body[:3] == b"\xff\xd8\xff":  # JPEG (the page re-encodes uploads as JPEG)
                    FLOORPLAN.write_bytes(body)
                else:
                    return self._send(400, '{"ok":false}')
                return self._send(200, '{"ok":true}')
            if urlparse(self.path).path.rstrip("/").endswith("room"):
                n = int(self.headers.get("Content-Length", 0))
                if n > 20000:
                    return self._send(413, '{"ok":false}')
                body = self.rfile.read(n)
                try:
                    json.loads(body)
                except ValueError:
                    return self._send(400, '{"ok":false}')
                ROOM.write_bytes(body)
                return self._send(200, '{"ok":true}')
            self._send(404, '{"error":"not found"}')

    return H


def open_window(url):
    for exe in (r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
                r"C:\Program Files\Microsoft\Edge\Application\msedge.exe"):
        if Path(exe).exists():
            subprocess.Popen([exe, f"--app={url}", "--window-size=1400,950"])
            return
    webbrowser.open(url)


def main():
    ap = argparse.ArgumentParser(description="Human Radar PC hub")
    ap.add_argument("--port", help="serial port, e.g. COM6 (default: auto)")
    ap.add_argument("--http-port", type=int, default=8765)
    ap.add_argument("--host", default="127.0.0.1", help="bind address (Tailscale Serve proxies to localhost)")
    ap.add_argument("--no-window", action="store_true")
    ap.add_argument("--no-beep", action="store_true")
    a = ap.parse_args()

    hub = Hub(a.port, beep=not a.no_beep)
    threading.Thread(target=hub.run_serial, daemon=True).start()
    srv = ThreadingHTTPServer((a.host, a.http_port), make_handler(hub))
    url = f"http://127.0.0.1:{a.http_port}/"
    print(f"Human Radar dashboard: {url}", flush=True)
    if not a.no_window:
        open_window(url)
    srv.serve_forever()


if __name__ == "__main__":
    main()

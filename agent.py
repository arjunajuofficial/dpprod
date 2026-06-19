"""
Station Monitor — Client Agent
================================
Deploy this on every monitored Windows server.

Requirements:
    pip install psutil

Usage:
    python agent.py                  # runs on default port 9000
    python agent.py --port 9001      # custom port

Auto-start (Task Scheduler — run as Administrator):
    schtasks /create /tn "StationMonitorAgent" ^
      /tr "C:\\Python314\\python.exe C:\\StationAgent\\agent.py" ^
      /sc onstart /ru Administrator /rl HIGHEST /f

Firewall (run as Administrator):
    netsh advfirewall firewall add rule name="Station Monitor Agent" ^
      dir=in action=allow protocol=TCP localport=9000

Endpoints:
    GET  /quick                          -> {cpu, ram, disk, uptime}
    GET  /events?ids=6008&hours=48       -> {events: [...]}
    GET  /services/discover              -> [{name, display_name, status, start_type}]
    POST /services/check                 -> [{name, type, status, healthy}]
"""

import argparse
import json
import subprocess
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse, parse_qs

try:
    import psutil
except ImportError:
    raise SystemExit("psutil not installed. Run: pip install psutil")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _quick_metrics() -> dict:
    return {
        "cpu":    round(psutil.cpu_percent(interval=1), 1),
        "ram":    round(psutil.virtual_memory().percent, 1),
        "disk":   round(psutil.disk_usage('C:\\').percent, 1),
        "uptime": int(time.time() - psutil.boot_time()),
    }


def _discover_services() -> list[dict]:
    """Return all Windows services via psutil."""
    results = []
    try:
        for svc in psutil.win_service_iter():
            try:
                info = svc.as_dict()
                results.append({
                    "name":         info["name"],
                    "display_name": info.get("display_name", info["name"]),
                    "status":       info.get("status", "unknown"),
                    "start_type":   info.get("start_type", "unknown"),
                })
            except Exception:
                pass
    except Exception:
        pass
    return sorted(results, key=lambda x: x["display_name"].lower())


def _check_services(service_names: list[str], process_names: list[str]) -> list[dict]:
    """Check specific Windows services and processes."""
    results = []

    for name in service_names:
        try:
            svc = psutil.win_service_get(name)
            info = svc.as_dict()
            running = info.get("status") == "running"
            results.append({
                "name":    name,
                "type":    "service",
                "status":  info.get("status", "unknown"),
                "healthy": running,
            })
        except Exception:
            results.append({
                "name":    name,
                "type":    "service",
                "status":  "not_found",
                "healthy": False,
            })

    lower_procs = {p.info["name"].lower() for p in psutil.process_iter(["name"])}
    for name in process_names:
        found = name.lower() in lower_procs
        results.append({
            "name":    name,
            "type":    "process",
            "status":  "running" if found else "stopped",
            "healthy": found,
        })

    return results


def _get_event_logs(event_ids: list[int], hours: int = 48) -> list[dict]:
    """Query Windows Event Log via PowerShell."""
    if not event_ids:
        return []
    id_array = ",".join(str(i) for i in event_ids)
    ps = f"""
$cutoff = (Get-Date).AddHours(-{hours})
$evs = Get-WinEvent -FilterHashtable @{{LogName='System';Id=@({id_array});StartTime=$cutoff}} -ErrorAction SilentlyContinue
if ($evs) {{
    $evs | Select-Object `
        @{{n='timestamp';e={{$_.TimeCreated.ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')}}}},
        @{{n='event_id';e={{$_.Id}}}},
        @{{n='level';e={{$_.LevelDisplayName}}}},
        @{{n='source';e={{$_.ProviderName}}}},
        @{{n='message';e={{($_.Message -split '[\\r\\n]+')[0].Trim()}}}} |
    ConvertTo-Json -AsArray
}} else {{ Write-Output '[]' }}
"""
    try:
        r = subprocess.run(
            ["powershell", "-NonInteractive", "-NoProfile", "-Command", ps],
            capture_output=True, text=True, timeout=15,
        )
        if r.returncode == 0 and r.stdout.strip():
            data = json.loads(r.stdout.strip())
            return [data] if isinstance(data, dict) else (data or [])
    except Exception:
        pass
    return []


# ---------------------------------------------------------------------------
# HTTP handler
# ---------------------------------------------------------------------------

class AgentHandler(BaseHTTPRequestHandler):

    def do_GET(self):
        parsed = urlparse(self.path)
        qs = parse_qs(parsed.query)

        if parsed.path == "/quick":
            self._json(200, _quick_metrics())

        elif parsed.path == "/services/discover":
            self._json(200, _discover_services())

        elif parsed.path == "/events":
            raw_ids = qs.get("ids", ["6008"])[0]
            hours   = int(qs.get("hours", ["48"])[0])
            ids     = [int(x.strip()) for x in raw_ids.split(",") if x.strip().isdigit()]
            self._json(200, {"events": _get_event_logs(ids, hours)})

        else:
            self._json(404, {"error": "not found"})

    def do_POST(self):
        parsed = urlparse(self.path)

        if parsed.path == "/services/check":
            try:
                length = int(self.headers.get("Content-Length", 0))
                body   = json.loads(self.rfile.read(length)) if length else {}
                services  = body.get("services", [])
                processes = body.get("processes", [])
                self._json(200, _check_services(services, processes))
            except Exception as e:
                self._json(400, {"error": str(e)})
        else:
            self._json(404, {"error": "not found"})

    def _json(self, code: int, data):
        body = json.dumps(data).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Station Monitor Agent")
    parser.add_argument("--port", type=int, default=9000)
    args = parser.parse_args()

    srv = HTTPServer(("0.0.0.0", args.port), AgentHandler)
    print(f"[agent] Listening on port {args.port}")
    print(f"[agent]   GET  /quick")
    print(f"[agent]   GET  /services/discover")
    print(f"[agent]   POST /services/check")
    print(f"[agent]   GET  /events?ids=6008&hours=48")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("[agent] Stopped.")

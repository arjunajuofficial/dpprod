"""
Monitoring worker — runs as an asyncio background task.

MOCK_MONITORING=true  → simulates realistic fluctuating metrics (no real network calls)
MOCK_MONITORING=false → real ICMP ping + agent HTTP checks
"""
import asyncio
import os
import platform
import random
from datetime import datetime, timezone

from sqlalchemy import select, update
from database import AsyncSessionLocal
from models import Server, Alert, Metric, ServerEventLog, ServiceMonitor, ServiceStatus
from ws_manager import manager
from agent_client import agent_headers
import notifications

MOCK_MONITORING = os.getenv("MOCK_MONITORING", "false").lower() == "true"
PING_INTERVAL = int(os.getenv("PING_INTERVAL", "15"))
METRICS_INTERVAL = int(os.getenv("METRICS_INTERVAL", "60"))
OFFLINE_THRESHOLD = int(os.getenv("OFFLINE_THRESHOLD", "3"))
ONLINE_THRESHOLD = int(os.getenv("ONLINE_THRESHOLD", "2"))  # consecutive successes to confirm recovery
EVENTS_INTERVAL   = int(os.getenv("EVENTS_INTERVAL",   "120"))  # seconds between event log checks
SERVICES_INTERVAL = int(os.getenv("SERVICES_INTERVAL", "30"))   # seconds between service checks

_metrics_tick  = 0
_events_tick   = 0
_svc_tick      = 0
_consecutive_successes: dict[int, int]      = {}  # server_id -> consecutive ping successes (offline recovery)
_svc_prev_healthy: dict[int, bool | None]   = {}  # monitor_id -> last known healthy state
_svc_sms_cooldown: dict[int, datetime]      = {}  # monitor_id -> last SMS sent time
SVC_SMS_COOLDOWN = 300                            # seconds between SMS per service


def _in_maintenance(server: Server) -> bool:
    """True if the server is inside its maintenance window (alerts suppressed)."""
    until = server.maintenance_until
    if until is None:
        return False
    if until.tzinfo is None:  # naive datetime from SQLite — treat as UTC
        until = until.replace(tzinfo=timezone.utc)
    return datetime.now(timezone.utc) < until


# ---------------------------------------------------------------------------
# Real network checks
# ---------------------------------------------------------------------------

async def _real_ping(ip: str) -> tuple[bool, float | None]:
    try:
        if platform.system() == "Windows":
            args = ["ping", "-n", "1", "-w", "1000", ip]
        else:
            args = ["ping", "-c", "1", "-W", "1", ip]
        t0 = asyncio.get_event_loop().time()
        proc = await asyncio.create_subprocess_exec(
            *args,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )
        await asyncio.wait_for(proc.wait(), timeout=3.0)
        latency = (asyncio.get_event_loop().time() - t0) * 1000
        return proc.returncode == 0, round(latency, 1) if proc.returncode == 0 else None
    except Exception:
        return False, None


async def _check_agent(ip: str, port: int) -> dict | None:
    import httpx
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            r = await client.get(f"http://{ip}:{port}/quick", headers=agent_headers())
            if r.status_code == 200:
                return r.json()
    except Exception:
        pass
    return None


# ---------------------------------------------------------------------------
# Mock mode helpers
# ---------------------------------------------------------------------------

def _fluctuate(base: float, spread: float = 12.0) -> float:
    return max(0.0, min(100.0, base + random.gauss(0, spread / 3)))


def _mock_latency(base: float) -> float:
    return max(1.0, base + random.gauss(0, base * 0.15))


# ---------------------------------------------------------------------------
# Status logic
# ---------------------------------------------------------------------------

async def _process_server_mock(server: Server) -> dict:
    """Return updated fields for a server in mock mode."""
    if server.status == "offline" and server.consecutive_failures > 0:
        # Keep it offline (seeded as offline)
        return {
            "status": "offline",
            "vpn_connected": False,
            "latency_ms": None,
            "cpu": 0.0,
            "ram": 0.0,
            "disk": 0.0,
            "consecutive_failures": server.consecutive_failures,
            "last_seen": server.last_seen,
        }

    cpu = _fluctuate(server.cpu_base)
    ram = _fluctuate(server.ram_base, 6.0)
    disk = _fluctuate(server.disk_base, 2.0)
    latency = _mock_latency(server.latency_base)

    # Derive status from resource levels
    if cpu >= 85 or ram >= 85 or latency > 80:
        status = "warning"
    else:
        status = "online"

    return {
        "status": status,
        "vpn_connected": True,
        "latency_ms": round(latency, 1),
        "cpu": round(cpu, 1),
        "ram": round(ram, 1),
        "disk": round(disk, 1),
        "consecutive_failures": 0,
        "last_seen": datetime.now(timezone.utc),
        "uptime_seconds": (server.uptime_seconds or 0) + PING_INTERVAL,
    }


async def _process_server_real(server: Server) -> dict:
    """Ping + agent check, return updated fields."""
    reachable, latency = await _real_ping(server.ip_address)

    if not reachable:
        # Reset success streak on any failure
        _consecutive_successes.pop(server.id, None)
        failures = server.consecutive_failures + 1
        new_status = "offline" if failures >= OFFLINE_THRESHOLD else server.status
        return {
            "status": new_status,
            "vpn_connected": False,
            "latency_ms": None,
            "consecutive_failures": failures,
            "last_seen": server.last_seen,
        }

    # Ping succeeded — but if server is currently offline, require ONLINE_THRESHOLD
    # consecutive successes before declaring it recovered (prevents ghost-online from a
    # single stray ICMP reply, VPN blip, or IP conflict)
    if server.status == "offline":
        streak = _consecutive_successes.get(server.id, 0) + 1
        _consecutive_successes[server.id] = streak
        if streak < ONLINE_THRESHOLD:
            # Not enough consecutive successes yet — stay offline
            return {
                "status": "offline",
                "vpn_connected": False,
                "latency_ms": None,
                "consecutive_failures": server.consecutive_failures,
                "last_seen": server.last_seen,
            }
        # Threshold met — confirm recovery, clear counter
        _consecutive_successes.pop(server.id, None)
    else:
        # Already online — clear any leftover counter
        _consecutive_successes.pop(server.id, None)

    # Try agent endpoint for metrics
    agent_data = await _check_agent(server.ip_address, server.agent_port)
    cpu = float(agent_data.get("cpu", 0)) if agent_data else 0.0
    ram = float(agent_data.get("ram", 0)) if agent_data else 0.0
    disk = float(agent_data.get("disk", 0)) if agent_data else 0.0
    uptime = int(agent_data.get("uptime", server.uptime_seconds or 0)) if agent_data else (server.uptime_seconds or 0) + PING_INTERVAL

    status = "warning" if (cpu >= 85 or ram >= 85) else "online"

    return {
        "status": status,
        "vpn_connected": True,
        "latency_ms": latency,
        "cpu": round(cpu, 1),
        "ram": round(ram, 1),
        "disk": round(disk, 1),
        "uptime_seconds": uptime,
        "consecutive_failures": 0,
        "last_seen": datetime.now(timezone.utc),
    }


# ---------------------------------------------------------------------------
# Alert engine
# ---------------------------------------------------------------------------

async def _handle_alerts(session, server: Server, old_status: str, new_status: str):
    """Create or resolve alerts based on status transitions."""
    if old_status == new_status:
        return

    now = datetime.now(timezone.utc)

    if new_status == "offline" and old_status != "offline":
        msg = f"{server.hostname} unreachable — {OFFLINE_THRESHOLD} consecutive ping failures, VPN tunnel may be down"
        alert = Alert(
            server_id=server.id,
            severity="critical",
            message=msg,
            sms_sent=False,
            timestamp=now,
        )
        session.add(alert)
        asyncio.create_task(notifications.dispatch(
            f"ALERT: {server.hostname} ({server.site}) is OFFLINE — {OFFLINE_THRESHOLD} ping failures",
            server_id=server.id, severity="critical",
            hostname=server.hostname, site=server.site,
        ))

    elif old_status == "offline" and new_status in ("online", "warning"):
        alert = Alert(
            server_id=server.id,
            severity="resolved",
            message="Server recovered — connectivity restored",
            sms_sent=False,
            timestamp=now,
            resolved_at=now,
        )
        session.add(alert)
        # Mark previous critical alerts as resolved
        result = await session.execute(
            select(Alert).where(
                Alert.server_id == server.id,
                Alert.severity == "critical",
                Alert.resolved_at.is_(None),
            )
        )
        for a in result.scalars().all():
            a.resolved_at = now
            a.severity = "resolved"

        # Recovery SMS gated by sms_on_recovery setting (checked inside service)
        asyncio.create_task(_enqueue_recovery_sms(server))

    elif new_status == "warning" and old_status == "online":
        alert = Alert(
            server_id=server.id,
            severity="warning",
            message=f"High resource usage — CPU {server.cpu:.0f}%, RAM {server.ram:.0f}%, latency {server.latency_ms or 0:.0f}ms",
            sms_sent=False,
            timestamp=now,
        )
        session.add(alert)


async def _enqueue_recovery_sms(server: Server):
    from api.settings_routes import get_all_settings
    cfg = await get_all_settings()
    if cfg.get("sms_on_recovery", "true").lower() == "true":
        await notifications.dispatch(
            f"RECOVERY: {server.hostname} ({server.site}) is back ONLINE",
            server_id=server.id, severity="resolved",
            hostname=server.hostname, site=server.site,
        )


# ---------------------------------------------------------------------------
# Service monitoring
# ---------------------------------------------------------------------------

async def _agent_check_services(ip: str, port: int, services: list[str], processes: list[str]) -> list[dict]:
    """Call agent POST /services/check and return results."""
    import httpx
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.post(
                f"http://{ip}:{port}/services/check",
                json={"services": services, "processes": processes},
                headers=agent_headers(),
            )
            if r.status_code == 200:
                return r.json()
    except Exception:
        pass
    return []


async def _check_tcp_port(ip: str, port: int) -> tuple[bool, float | None]:
    """Try opening a TCP connection; return (reachable, latency_ms)."""
    import time
    try:
        t0 = time.monotonic()
        reader, writer = await asyncio.wait_for(
            asyncio.open_connection(ip, port), timeout=3.0
        )
        ms = round((time.monotonic() - t0) * 1000, 1)
        writer.close()
        try:
            await writer.wait_closed()
        except Exception:
            pass
        return True, ms
    except Exception:
        return False, None


async def _check_http_endpoint(url: str, server_ip: str) -> tuple[bool, float | None, str]:
    """HTTP GET health check; replaces localhost/127.0.0.1 with actual server IP."""
    import httpx, time
    url = url.replace("localhost", server_ip).replace("127.0.0.1", server_ip)
    try:
        t0 = time.monotonic()
        async with httpx.AsyncClient(timeout=5.0, follow_redirects=True) as client:
            r = await client.get(url)
        ms = round((time.monotonic() - t0) * 1000, 1)
        ok = r.status_code < 400
        return ok, ms, f"HTTP {r.status_code}"
    except Exception as e:
        return False, None, str(e)[:120]


async def _upsert_service_status(
    session,
    monitor: ServiceMonitor,
    status: str,
    healthy: bool,
    response_ms: float | None,
    message: str,
) -> bool:
    """
    Update or create the ServiceStatus row.
    Returns True if health state changed (triggers alert).
    Seeds _svc_prev_healthy from DB on first call so alerts fire correctly
    even if the service was already down when the backend started.
    """
    now = datetime.now(timezone.utc)
    result = await session.execute(
        select(ServiceStatus).where(ServiceStatus.service_monitor_id == monitor.id)
    )
    row = result.scalar_one_or_none()

    # Seed in-memory cache from DB on first encounter (survives backend restarts)
    if monitor.id not in _svc_prev_healthy:
        _svc_prev_healthy[monitor.id] = row.healthy if row else None

    prev_healthy = _svc_prev_healthy.get(monitor.id)
    changed = prev_healthy is not None and prev_healthy != healthy

    if changed:
        print(f"[services] {monitor.display_name}: {prev_healthy} -> {healthy} (status={status})")

    if row:
        row.status           = status
        row.healthy          = healthy
        row.last_check       = now
        row.response_time_ms = response_ms
        row.message          = message
    else:
        session.add(ServiceStatus(
            service_monitor_id=monitor.id,
            status=status,
            healthy=healthy,
            last_check=now,
            response_time_ms=response_ms,
            message=message,
        ))

    _svc_prev_healthy[monitor.id] = healthy
    return changed


async def _service_alert(session, monitor: ServiceMonitor, server: Server, healthy: bool) -> None:
    """Create an alert and optionally send SMS when service health changes."""
    if not monitor.alert_enabled or _in_maintenance(server):
        return

    now = datetime.now(timezone.utc)
    if healthy:
        severity = "resolved"
        msg = f"Service recovered: {monitor.display_name} on {server.hostname} is back UP"
    else:
        severity = "critical"
        msg = f"Service down: {monitor.display_name} ({monitor.monitor_type}: {monitor.target_name}) on {server.hostname}"

    session.add(Alert(
        server_id=server.id,
        severity=severity,
        message=msg,
        timestamp=now,
    ))

    if healthy:
        # RECOVERY: always send immediately — use a distinct rate bucket so a recent
        # DOWN alert never blocks the recovery.  Rate key offset by 100000 keeps it
        # fully independent from both ping-alert buckets and DOWN buckets.
        asyncio.create_task(notifications.dispatch(
            msg, server_id=server.id, severity="resolved",
            hostname=server.hostname, site=server.site,
            rate_key=-(monitor.id + 100000),
        ))
    else:
        # DOWN: apply cooldown so a flapping service doesn't spam SMS.
        # Rate key -monitor.id is independent from ping-alert bucket (server_id).
        last_sms = _svc_sms_cooldown.get(monitor.id)
        if last_sms is None or (now - last_sms).total_seconds() > SVC_SMS_COOLDOWN:
            _svc_sms_cooldown[monitor.id] = now
            asyncio.create_task(notifications.dispatch(
                msg, server_id=server.id, severity="critical",
                hostname=server.hostname, site=server.site,
                rate_key=-monitor.id,
            ))


async def _check_service_monitors(session, server: Server) -> None:
    """Run all enabled service monitors for a given server."""
    result = await session.execute(
        select(ServiceMonitor).where(
            ServiceMonitor.server_id == server.id,
            ServiceMonitor.is_enabled == True,
        )
    )
    monitors: list[ServiceMonitor] = result.scalars().all()
    if not monitors:
        return

    print(f"[services] Checking {len(monitors)} monitor(s) on {server.hostname}")

    # Group by type
    win_svc  = [m for m in monitors if m.monitor_type == "windows_service"]
    procs    = [m for m in monitors if m.monitor_type == "process"]
    ports    = [m for m in monitors if m.monitor_type == "port"]
    http_eps = [m for m in monitors if m.monitor_type == "http"]

    # ── Windows services + processes via agent ───────────────────────────────
    if win_svc or procs:
        agent_results = await _agent_check_services(
            server.ip_address, server.agent_port,
            [m.target_name for m in win_svc],
            [m.target_name for m in procs],
        )
        result_map = {r["name"]: r for r in agent_results}

        for monitor in win_svc + procs:
            r = result_map.get(monitor.target_name)
            if r:
                healthy = bool(r.get("healthy", False))
                status  = r.get("status", "unknown")
                msg     = ""
            else:
                healthy, status, msg = False, "agent_error", "Agent did not return status"

            changed = await _upsert_service_status(session, monitor, status, healthy, None, msg)
            if changed:
                await _service_alert(session, monitor, server, healthy)

    # ── TCP port checks ───────────────────────────────────────────────────────
    for monitor in ports:
        try:
            port_num = int(monitor.target_name)
        except ValueError:
            continue
        reachable, ms = await _check_tcp_port(server.ip_address, port_num)
        status = "up" if reachable else "down"
        changed = await _upsert_service_status(session, monitor, status, reachable, ms, "")
        if changed:
            await _service_alert(session, monitor, server, reachable)

    # ── HTTP health checks ────────────────────────────────────────────────────
    for monitor in http_eps:
        ok, ms, msg = await _check_http_endpoint(monitor.target_name, server.ip_address)
        status = "up" if ok else "down"
        changed = await _upsert_service_status(session, monitor, status, ok, ms, msg)
        if changed:
            await _service_alert(session, monitor, server, ok)


# ---------------------------------------------------------------------------
# Windows Event Log watcher
# ---------------------------------------------------------------------------

async def _check_server_events(session, server: Server, watch_ids: list[int]) -> None:
    """
    Poll agent /events endpoint, store new entries, alert on watched event IDs.
    Only runs when server is online and agent is reachable.
    """
    if not watch_ids or server.status == "offline":
        return

    import httpx
    try:
        ids_param = ",".join(str(i) for i in watch_ids)
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.get(
                f"http://{server.ip_address}:{server.agent_port}/events",
                params={"ids": ids_param, "hours": "48"},
                headers=agent_headers(),
            )
            if r.status_code != 200:
                return
            raw_events = r.json().get("events", [])
    except Exception:
        return

    if not raw_events:
        return

    # Known event timestamps for this server (dedup)
    existing = await session.execute(
        select(ServerEventLog.event_time)
        .where(ServerEventLog.server_id == server.id)
    )
    known_times = {row[0] for row in existing.fetchall()}

    for ev in raw_events:
        try:
            ev_time = datetime.fromisoformat(ev["timestamp"].replace("Z", "+00:00"))
        except Exception:
            continue

        # Already processed
        if ev_time in known_times:
            continue

        event_id = int(ev.get("event_id", 0))
        message = ev.get("message", "")
        level = ev.get("level", "")
        source = ev.get("source", "System")

        log_entry = ServerEventLog(
            server_id=server.id,
            event_id=event_id,
            event_time=ev_time,
            source=source,
            level=level,
            message=message,
            alerted=True,
        )
        session.add(log_entry)

        # Create alert for known critical events
        severity = "critical" if event_id in (6008,) else "info"
        event_labels = {
            6008: "Unexpected shutdown detected",
        }
        label = event_labels.get(event_id, f"Event {event_id}")
        if not _in_maintenance(server):
            alert = Alert(
                server_id=server.id,
                severity=severity,
                message=f"{label} on {server.hostname} — {message[:200] if message else 'No details'}",
                timestamp=ev_time,
            )
            session.add(alert)
        print(f"[events] {server.hostname}: Event {event_id} at {ev_time} → {label}")

        # SMS for critical events
        if severity == "critical" and not _in_maintenance(server):
            asyncio.create_task(notifications.dispatch(
                f"EVENT {event_id}: {label} on {server.hostname} ({server.site}) at {ev_time.strftime('%H:%M %d/%m')}",
                server_id=server.id, severity="critical",
                hostname=server.hostname, site=server.site,
            ))


# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------

async def monitoring_loop():
    global _metrics_tick
    print(f"[monitor] Starting — mock={MOCK_MONITORING}, interval={PING_INTERVAL}s")

    while True:
        try:
            await _run_cycle()
        except asyncio.CancelledError:
            print("[monitor] Cancelled.")
            return
        except Exception as e:
            print(f"[monitor] Error in cycle: {e}")

        await asyncio.sleep(PING_INTERVAL)


async def _run_cycle():
    global _metrics_tick, _events_tick, _svc_tick
    _metrics_tick += 1
    _events_tick  += 1
    _svc_tick     += 1
    record_metrics = (_metrics_tick * PING_INTERVAL) % METRICS_INTERVAL  == 0
    check_events   = not MOCK_MONITORING and (_events_tick * PING_INTERVAL)  % EVENTS_INTERVAL   == 0
    check_services = not MOCK_MONITORING and (_svc_tick   * PING_INTERVAL)   % SERVICES_INTERVAL == 0

    async with AsyncSessionLocal() as session:
        result = await session.execute(select(Server))
        servers = result.scalars().all()

        # Load watched event IDs from settings once per cycle (only when needed)
        watch_ids: list[int] = []
        if check_events:
            from api.settings_routes import get_all_settings
            cfg = await get_all_settings()
            raw = cfg.get("watch_event_ids", "6008")
            watch_ids = [int(x.strip()) for x in raw.split(",") if x.strip().isdigit()]

        updated_servers = []

        for server in servers:
            old_status = server.status

            if MOCK_MONITORING:
                updates = await _process_server_mock(server)
            else:
                updates = await _process_server_real(server)

            # Apply updates
            for key, val in updates.items():
                setattr(server, key, val)

            # Auto-clear expired maintenance windows
            if server.maintenance_until is not None and not _in_maintenance(server):
                server.maintenance_until = None

            # Suppress alerting (but keep monitoring) during maintenance
            if not _in_maintenance(server):
                await _handle_alerts(session, server, old_status, server.status)

            # Reset uptime when server comes back online (no agent = no real uptime data)
            if old_status == "offline" and server.status in ("online", "warning"):
                server.uptime_seconds = 0

            # Poll Windows Event Log on agent
            if check_events and watch_ids:
                await _check_server_events(session, server, watch_ids)

            # Check service monitors
            if check_services and server.status != "offline":
                await _check_service_monitors(session, server)

            if record_metrics and server.status != "offline":
                session.add(Metric(
                    server_id=server.id,
                    cpu=server.cpu,
                    ram=server.ram,
                    disk=server.disk,
                    latency_ms=server.latency_ms,
                ))

            updated_servers.append({
                "id": server.id,
                "hostname": server.hostname,
                "ip_address": server.ip_address,
                "site": server.site,
                "os_type": server.os_type,
                "agent_port": server.agent_port,
                "status": server.status,
                "vpn_connected": server.vpn_connected,
                "latency_ms": server.latency_ms,
                "cpu": server.cpu,
                "ram": server.ram,
                "disk": server.disk,
                "uptime_seconds": server.uptime_seconds,
                "last_seen": (server.last_seen.replace(tzinfo=timezone.utc).isoformat().replace('+00:00', 'Z') if server.last_seen else None),
                "consecutive_failures": server.consecutive_failures,
                "maintenance_until": (server.maintenance_until.replace(tzinfo=timezone.utc).isoformat().replace('+00:00', 'Z') if server.maintenance_until else None),
            })

        await session.commit()

    # Broadcast to all WebSocket clients
    if manager.count > 0:
        await manager.broadcast({"type": "servers", "data": updated_servers})

"""Seed initial data — idempotent (runs only if no servers exist)."""
import os
from datetime import datetime, timezone
from sqlalchemy import select
from database import AsyncSessionLocal
from models import Server, User, Alert, Setting
from auth import hash_password


SERVERS = [
    dict(hostname="PROD-WIN-01",  ip_address="10.10.1.11", site="Site A", os_type="Windows Server 2022", agent_port=5000, status="online",  vpn_connected=True,  latency_ms=12,  cpu=34, ram=62, disk=48, uptime_seconds=1234567, cpu_base=34, ram_base=62, disk_base=48, latency_base=12),
    dict(hostname="PROD-WIN-02",  ip_address="10.10.1.12", site="Site A", os_type="Windows Server 2022", agent_port=5000, status="online",  vpn_connected=True,  latency_ms=18,  cpu=71, ram=78, disk=55, uptime_seconds=1234567, cpu_base=71, ram_base=78, disk_base=55, latency_base=18),
    dict(hostname="FILE-SRV-01",  ip_address="10.10.2.10", site="Site A", os_type="Windows Server 2019", agent_port=5000, status="online",  vpn_connected=True,  latency_ms=9,   cpu=12, ram=44, disk=82, uptime_seconds=2592000, cpu_base=12, ram_base=44, disk_base=82, latency_base=9),
    dict(hostname="DB-SERVER-01", ip_address="10.10.2.20", site="Site B", os_type="Windows Server 2022", agent_port=5000, status="online",  vpn_connected=True,  latency_ms=22,  cpu=55, ram=88, disk=61, uptime_seconds=604800,  cpu_base=55, ram_base=88, disk_base=61, latency_base=22),
    dict(hostname="APP-SRV-01",   ip_address="10.10.3.5",  site="Site B", os_type="Windows Server 2019", agent_port=5000, status="online",  vpn_connected=True,  latency_ms=15,  cpu=28, ram=51, disk=39, uptime_seconds=1814400, cpu_base=28, ram_base=51, disk_base=39, latency_base=15),
    dict(hostname="BACKUP-SRV",   ip_address="10.10.3.8",  site="Site B", os_type="Windows Server 2019", agent_port=5000, status="online",  vpn_connected=True,  latency_ms=11,  cpu=6,  ram=33, disk=91, uptime_seconds=3888000, cpu_base=6,  ram_base=33, disk_base=91, latency_base=11),
    dict(hostname="RELAY-WIN-01", ip_address="10.10.4.1",  site="Site C", os_type="Windows Server 2022", agent_port=5000, status="online",  vpn_connected=True,  latency_ms=31,  cpu=19, ram=40, disk=30, uptime_seconds=432000,  cpu_base=19, ram_base=40, disk_base=30, latency_base=31),
    dict(hostname="MON-PROXY-01", ip_address="10.10.4.2",  site="Site C", os_type="Windows Server 2019", agent_port=5000, status="online",  vpn_connected=True,  latency_ms=14,  cpu=45, ram=57, disk=44, uptime_seconds=864000,  cpu_base=45, ram_base=57, disk_base=44, latency_base=14),
    dict(hostname="EDGE-WIN-01",  ip_address="10.10.4.9",  site="Site C", os_type="Windows Server 2019", agent_port=5000, status="warning", vpn_connected=True,  latency_ms=88,  cpu=89, ram=91, disk=67, uptime_seconds=172800,  cpu_base=89, ram_base=91, disk_base=67, latency_base=88),
    dict(hostname="PROD-WIN-03",  ip_address="10.10.1.13", site="Site A", os_type="Windows Server 2022", agent_port=5000, status="offline", vpn_connected=False, latency_ms=None, cpu=0,  ram=0,  disk=0,  uptime_seconds=0,       cpu_base=40, ram_base=60, disk_base=50, latency_base=14, consecutive_failures=3),
    dict(hostname="SITE-B-GW",    ip_address="10.10.2.1",  site="Site B", os_type="Windows Server 2019", agent_port=5000, status="offline", vpn_connected=False, latency_ms=None, cpu=0,  ram=0,  disk=0,  uptime_seconds=0,       cpu_base=30, ram_base=55, disk_base=45, latency_base=20, consecutive_failures=5),
    dict(hostname="NVR-SRV-01",   ip_address="10.10.5.10", site="Site C", os_type="Windows 10",          agent_port=5000, status="online",  vpn_connected=True,  latency_ms=27,  cpu=38, ram=66, disk=73, uptime_seconds=518400,  cpu_base=38, ram_base=66, disk_base=73, latency_base=27),
]

SEED_ALERTS = [
    dict(server_hostname="PROD-WIN-03", severity="critical", message="Server unreachable — VPN tunnel down, 3 consecutive ping failures", sms_sent=True),
    dict(server_hostname="SITE-B-GW",   severity="critical", message="Gateway offline — no agent heartbeat for 64 minutes", sms_sent=True),
    dict(server_hostname="EDGE-WIN-01", severity="warning",  message="High resource usage — CPU 89%, RAM 91%, latency 88ms", sms_sent=False),
    dict(server_hostname="BACKUP-SRV",  severity="warning",  message="Disk usage at 91% — approaching critical threshold", sms_sent=False),
]


async def seed_database():
    async with AsyncSessionLocal() as session:
        # Skip if already seeded
        result = await session.execute(select(Server))
        if result.scalars().first():
            return

        print("[seed] Seeding initial data...")
        now = datetime.now(timezone.utc)

        # Servers
        server_map: dict[str, Server] = {}
        for data in SERVERS:
            s = Server(
                **{k: v for k, v in data.items() if k != "consecutive_failures"},
                last_seen=now if data["status"] != "offline" else None,
                consecutive_failures=data.get("consecutive_failures", 0),
            )
            session.add(s)
            server_map[data["hostname"]] = s

        await session.flush()  # get IDs

        # Seed alerts
        for a in SEED_ALERTS:
            server = server_map.get(a["server_hostname"])
            if server:
                session.add(Alert(
                    server_id=server.id,
                    severity=a["severity"],
                    message=a["message"],
                    sms_sent=a["sms_sent"],
                    timestamp=now,
                ))

        # Admin user — skip if already exists
        admin_username = os.getenv("ADMIN_USERNAME", "admin")
        admin_password = os.getenv("ADMIN_PASSWORD", "admin123")
        existing_user = await session.execute(select(User).where(User.username == admin_username))
        if not existing_user.scalar_one_or_none():
            session.add(User(
                username=admin_username,
                password_hash=hash_password(admin_password),
                role="admin",
            ))

        # Default settings
        default_settings = {
            "tg100_host": "192.168.1.250",
            "tg100_port": "8088",
            "tg100_username": "admin",
            "tg100_password": "admin",
            "sms_destination": "+91XXXXXXXXXX",
            "sms_enabled": "true",
            "sms_on_recovery": "true",
            "sms_rate_limit": "true",
            "ping_interval": os.getenv("PING_INTERVAL", "15"),
            "agent_interval": "30",
            "metrics_interval": os.getenv("METRICS_INTERVAL", "60"),
            "offline_threshold": os.getenv("OFFLINE_THRESHOLD", "3"),
            "cpu_threshold": "85",
            "ram_threshold": "85",
            "disk_threshold": "90",
            "latency_threshold": "100",
            # Call search — shared credentials for all PBX servers
            "db_user": "pbxuser",
            "db_password": "",
            "db_name": "pbxdb",
            "db_port": "3306",
            "ssh_user": "root",
            "ssh_password": "",
            "ssh_port": "22",
        }
        existing_keys = set((await session.execute(select(Setting.key))).scalars().all())
        for key, value in default_settings.items():
            if key not in existing_keys:
                session.add(Setting(key=key, value=value))

        await session.commit()
        print(f"[seed] Done — {len(SERVERS)} servers, {len(SEED_ALERTS)} alerts, user '{admin_username}'")

from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, ForeignKey, Text, UniqueConstraint
from sqlalchemy.orm import relationship
from database import Base


class Server(Base):
    __tablename__ = "servers"

    id = Column(Integer, primary_key=True, index=True)
    hostname = Column(String, nullable=False)
    ip_address = Column(String, nullable=False)
    site = Column(String, nullable=False, default="")
    os_type = Column(String, default="Windows Server")
    agent_port = Column(Integer, default=5000)

    status = Column(String, default="unknown")  # online | offline | warning | unknown
    vpn_connected = Column(Boolean, default=False)
    latency_ms = Column(Float, nullable=True)
    cpu = Column(Float, default=0.0)
    ram = Column(Float, default=0.0)
    disk = Column(Float, default=0.0)
    uptime_seconds = Column(Integer, default=0)
    last_seen = Column(DateTime(timezone=True), nullable=True)
    consecutive_failures = Column(Integer, default=0)
    # Maintenance mode — alerts/SMS suppressed until this time (NULL = not in maintenance)
    maintenance_until = Column(DateTime(timezone=True), nullable=True)

    # Baseline values used in mock mode
    cpu_base = Column(Float, default=30.0)
    ram_base = Column(Float, default=50.0)
    disk_base = Column(Float, default=40.0)
    latency_base = Column(Float, default=20.0)

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    alerts = relationship("Alert", back_populates="server", lazy="select")
    metrics = relationship("Metric", back_populates="server", lazy="select")


class Alert(Base):
    __tablename__ = "alerts"

    id = Column(Integer, primary_key=True, index=True)
    server_id = Column(Integer, ForeignKey("servers.id"), nullable=False)
    severity = Column(String, nullable=False)  # critical | warning | info | resolved
    message = Column(Text, nullable=False)
    sms_sent = Column(Boolean, default=False)
    timestamp = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    resolved_at = Column(DateTime(timezone=True), nullable=True)
    acknowledged_at = Column(DateTime(timezone=True), nullable=True)
    acknowledged_by = Column(String, nullable=True)

    server = relationship("Server", back_populates="alerts")


class Metric(Base):
    __tablename__ = "metrics"

    id = Column(Integer, primary_key=True, index=True)
    server_id = Column(Integer, ForeignKey("servers.id"), nullable=False)
    cpu = Column(Float, default=0.0)
    ram = Column(Float, default=0.0)
    disk = Column(Float, default=0.0)
    latency_ms = Column(Float, nullable=True)
    timestamp = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    server = relationship("Server", back_populates="metrics")


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, nullable=False)
    password_hash = Column(String, nullable=False)
    role = Column(String, default="operator")
    last_login = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class SmsLog(Base):
    __tablename__ = "sms_logs"

    id = Column(Integer, primary_key=True, index=True)
    server_id = Column(Integer, ForeignKey("servers.id", ondelete="SET NULL"), nullable=True)
    recipient = Column(String, nullable=False)
    message = Column(Text, nullable=False)
    status = Column(String, default="queued")  # queued | sent | failed
    attempts = Column(Integer, default=0)
    timestamp = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    sent_at = Column(DateTime(timezone=True), nullable=True)
    error = Column(Text, nullable=True)


class Setting(Base):
    __tablename__ = "settings"

    key = Column(String, primary_key=True)
    value = Column(Text, nullable=False, default="")
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class ServiceMonitor(Base):
    """Configuration: what to monitor on a given server."""
    __tablename__ = "service_monitors"

    id             = Column(Integer, primary_key=True, index=True)
    server_id      = Column(Integer, ForeignKey("servers.id", ondelete="CASCADE"), nullable=False)
    monitor_type   = Column(String, nullable=False)   # windows_service | process | port | http
    target_name    = Column(String, nullable=False)   # svc name / exe / port / URL
    display_name   = Column(String, nullable=False)
    expected_status = Column(String, default="running")
    alert_enabled  = Column(Boolean, default=True)
    is_enabled     = Column(Boolean, default=True)
    created_at     = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at     = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    current_status = relationship(
        "ServiceStatus", back_populates="monitor",
        uselist=False, cascade="all, delete-orphan",
    )


class ServiceStatus(Base):
    """Latest observed status for a ServiceMonitor (one row per monitor)."""
    __tablename__ = "service_status"

    id                 = Column(Integer, primary_key=True, index=True)
    service_monitor_id = Column(
        Integer,
        ForeignKey("service_monitors.id", ondelete="CASCADE"),
        nullable=False, unique=True,
    )
    status             = Column(String, default="unknown")  # running|stopped|up|down|unknown
    healthy            = Column(Boolean, nullable=True)
    last_check         = Column(DateTime(timezone=True), nullable=True)
    response_time_ms   = Column(Float, nullable=True)
    message            = Column(Text, nullable=True)

    monitor = relationship("ServiceMonitor", back_populates="current_status")


class AuditLog(Base):
    """Who did what, when — admin actions and security-relevant events."""
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, nullable=False, default="system")
    action = Column(String, nullable=False)     # e.g. server.create, settings.update, user.delete
    detail = Column(Text, default="")
    timestamp = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class ServerEventLog(Base):
    """Windows Event Log entries collected from client agents."""
    __tablename__ = "server_event_logs"

    id = Column(Integer, primary_key=True, index=True)
    server_id = Column(Integer, ForeignKey("servers.id", ondelete="CASCADE"), nullable=False)
    event_id = Column(Integer, nullable=False)          # e.g. 6008
    event_time = Column(DateTime(timezone=True), nullable=False)  # actual time on the server
    source = Column(String, default="System")           # Event log source
    level = Column(String, default="")                  # Error / Warning / Information
    message = Column(Text, default="")
    alerted = Column(Boolean, default=False)            # whether an Alert was created
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

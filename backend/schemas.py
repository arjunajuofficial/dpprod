from datetime import datetime
from typing import Annotated, Optional
from pydantic import BaseModel
from pydantic.functional_serializers import PlainSerializer
from utils import utc_iso


# Use these types on any datetime field that goes to the browser
UTCDatetime = Annotated[datetime, PlainSerializer(utc_iso, return_type=str, when_used='json')]
OptUTCDatetime = Annotated[Optional[datetime], PlainSerializer(utc_iso, return_type=Optional[str], when_used='json')]


class ServerCreate(BaseModel):
    hostname: str
    ip_address: str
    site: str = ""
    os_type: str = "Windows Server"
    agent_port: int = 5000


class ServerUpdate(BaseModel):
    hostname: Optional[str] = None
    ip_address: Optional[str] = None
    site: Optional[str] = None
    os_type: Optional[str] = None
    agent_port: Optional[int] = None


class ServerResponse(BaseModel):
    id: int
    hostname: str
    ip_address: str
    site: str
    os_type: str
    agent_port: int
    status: str
    vpn_connected: bool
    latency_ms: Optional[float]
    cpu: float
    ram: float
    disk: float
    uptime_seconds: int
    last_seen: OptUTCDatetime
    consecutive_failures: int
    maintenance_until: OptUTCDatetime = None

    model_config = {"from_attributes": True}


class AlertResponse(BaseModel):
    id: int
    server_id: int
    server_hostname: str
    server_site: str
    severity: str
    message: str
    sms_sent: bool
    timestamp: UTCDatetime
    resolved_at: OptUTCDatetime
    acknowledged_at: OptUTCDatetime = None
    acknowledged_by: Optional[str] = None

    model_config = {"from_attributes": True}


class MetricResponse(BaseModel):
    id: int
    server_id: int
    cpu: float
    ram: float
    disk: float
    latency_ms: Optional[float]
    timestamp: UTCDatetime

    model_config = {"from_attributes": True}


class ServiceMonitorCreate(BaseModel):
    monitor_type: str
    target_name: str
    display_name: str
    expected_status: str = "running"
    alert_enabled: bool = True
    is_enabled: bool = True


class ServiceMonitorUpdate(BaseModel):
    monitor_type: Optional[str] = None
    target_name: Optional[str] = None
    display_name: Optional[str] = None
    expected_status: Optional[str] = None
    alert_enabled: Optional[bool] = None
    is_enabled: Optional[bool] = None


class ServiceStatusResponse(BaseModel):
    status: str
    healthy: Optional[bool]
    last_check: OptUTCDatetime
    response_time_ms: Optional[float]
    message: Optional[str]
    model_config = {"from_attributes": True}


class ServiceMonitorResponse(BaseModel):
    id: int
    server_id: int
    monitor_type: str
    target_name: str
    display_name: str
    expected_status: str
    alert_enabled: bool
    is_enabled: bool
    created_at: UTCDatetime
    updated_at: UTCDatetime
    current_status: Optional[ServiceStatusResponse] = None
    model_config = {"from_attributes": True}


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict


class LoginRequest(BaseModel):
    username: str
    password: str

import { Server } from '../types/server';
import { Alert } from '../types/alert';
import { ServiceMonitor, ServiceMonitorCreatePayload, ServiceMonitorUpdatePayload, DiscoveredService } from '../types/service';

export const API_BASE = import.meta.env.VITE_API_BASE || '';

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('sm_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

// Broadcast a forced logout. client.ts stays decoupled from the React store:
// it clears persisted auth and fires an event that App.tsx listens for to
// reactively flip the UI back to the login screen.
function forceLogout(): void {
  localStorage.removeItem('sm_token');
  localStorage.removeItem('sm_user');
  window.dispatchEvent(new CustomEvent('sm:unauthorized'));
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { ...authHeaders(), ...(init.headers as Record<string, string> ?? {}) },
  });
  if (!res.ok) {
    // Any expired/invalid token, anywhere in the app → log out and bounce to login.
    if (res.status === 401) {
      forceLogout();
    }
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? 'Request failed');
  }
  // 204 No Content — nothing to parse
  if (res.status === 204) return undefined as T;
  return res.json() as T;
}

// ── Mappers ──────────────────────────────────────────────────────────────────

export function mapServer(raw: Record<string, any>): Server {
  return {
    id: String(raw.id),
    hostname: raw.hostname,
    ipAddress: raw.ip_address,
    site: raw.site,
    osType: raw.os_type,
    agentPort: raw.agent_port,
    status: raw.status,
    vpnConnected: raw.vpn_connected,
    latencyMs: raw.latency_ms ?? null,
    cpu: raw.cpu ?? 0,
    ram: raw.ram ?? 0,
    disk: raw.disk ?? 0,
    uptimeSeconds: raw.uptime_seconds ?? 0,
    lastSeen: raw.last_seen ? new Date(raw.last_seen) : new Date(),
    services: [],
    maintenanceUntil: raw.maintenance_until ? new Date(raw.maintenance_until) : null,
  };
}

export function mapAlert(raw: Record<string, any>): Alert {
  return {
    id: String(raw.id),
    serverId: String(raw.server_id),
    hostname: raw.server_hostname,
    site: raw.server_site,
    severity: raw.severity,
    message: raw.message,
    smsSent: raw.sms_sent,
    timestamp: new Date(raw.timestamp),
    resolvedAt: raw.resolved_at ? new Date(raw.resolved_at) : null,
    acknowledgedAt: raw.acknowledged_at ? new Date(raw.acknowledged_at) : null,
    acknowledgedBy: raw.acknowledged_by ?? null,
  };
}

// ── Shared helpers ────────────────────────────────────────────────────────────

async function downloadCsv(path: string, filename: string): Promise<void> {
  const token = localStorage.getItem('sm_token') ?? '';
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Export failed');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export interface ManagedUser {
  id: number;
  username: string;
  role: string;
  last_login: string | null;
  created_at: string;
}

export interface AuditEntry {
  id: number;
  username: string;
  action: string;
  detail: string;
  timestamp: string;
}

export interface MetricPoint {
  time: string;
  cpu: number;
  ram: number;
  disk: number;
  latency: number;
}

export function mapMetric(raw: Record<string, any>): MetricPoint {
  const t = new Date(raw.timestamp);
  return {
    time: t.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
    cpu: raw.cpu,
    ram: raw.ram,
    disk: raw.disk ?? 0,
    latency: raw.latency_ms ?? 0,
  };
}

export interface SmsLogEntry {
  id: number;
  serverId: number | null;
  hostname: string | null;
  recipient: string;
  message: string;
  status: 'queued' | 'sent' | 'failed';
  attempts: number;
  timestamp: string;
  sentAt: string | null;
  error: string | null;
}

export function mapSmsLog(raw: Record<string, any>): SmsLogEntry {
  return {
    id: raw.id,
    serverId: raw.server_id,
    hostname: raw.hostname,
    recipient: raw.recipient,
    message: raw.message,
    status: raw.status,
    attempts: raw.attempts,
    timestamp: raw.timestamp,
    sentAt: raw.sent_at,
    error: raw.error,
  };
}

// ── API calls ─────────────────────────────────────────────────────────────────

export const api = {
  login: (username: string, password: string) =>
    request<{ access_token: string; token_type: string; user: { username: string; role: string } }>(
      '/api/auth/login',
      { method: 'POST', body: JSON.stringify({ username, password }) },
    ),

  me: () => request<{ username: string; role: string }>('/api/auth/me'),

  servers: () =>
    request<Record<string, any>[]>('/api/servers').then((list) => list.map(mapServer)),

  createServer: (data: { hostname: string; ip_address: string; site: string; os_type: string; agent_port: number }) =>
    request<Record<string, any>>('/api/servers', {
      method: 'POST',
      body: JSON.stringify(data),
    }).then(mapServer),

  updateServer: (id: string, data: { hostname?: string; ip_address?: string; site?: string; os_type?: string; agent_port?: number }) =>
    request<Record<string, any>>(`/api/servers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }).then(mapServer),

  deleteServer: (id: string) =>
    request<void>(`/api/servers/${id}`, { method: 'DELETE' }),

  alerts: () =>
    request<Record<string, any>[]>('/api/alerts').then((list) => list.map(mapAlert)),

  ackAlert: (id: string) =>
    request<Record<string, any>>(`/api/alerts/${id}/ack`, { method: 'POST' }).then(mapAlert),

  resolveAlert: (id: string) =>
    request<Record<string, any>>(`/api/alerts/${id}/resolve`, { method: 'POST' }).then(mapAlert),

  exportAlertsCsv: () => downloadCsv('/api/alerts/export.csv', 'alerts.csv'),

  exportMetricsCsv: (serverId: string) =>
    downloadCsv(`/api/metrics/${serverId}/export.csv`, `metrics_${serverId}.csv`),

  exportSmsLogsCsv: () => downloadCsv('/api/sms/logs/export.csv', 'sms_logs.csv'),

  setMaintenance: (serverId: string, minutes: number | null) =>
    request<Record<string, any>>(`/api/servers/${serverId}/maintenance`, {
      method: 'PUT',
      body: JSON.stringify({ minutes }),
    }).then(mapServer),

  users: {
    list: () => request<ManagedUser[]>('/api/auth/users'),
    create: (username: string, password: string, role: string) =>
      request<ManagedUser>('/api/auth/users', {
        method: 'POST',
        body: JSON.stringify({ username, password, role }),
      }),
    update: (id: number, data: { role?: string; password?: string }) =>
      request<ManagedUser>(`/api/auth/users/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    remove: (id: number) =>
      request<void>(`/api/auth/users/${id}`, { method: 'DELETE' }),
    changePassword: (currentPassword: string, newPassword: string) =>
      request<{ ok: boolean }>('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      }),
  },

  audit: {
    list: (limit = 100) => request<AuditEntry[]>(`/api/audit?limit=${limit}`),
  },

  notifications: {
    testEmail: () =>
      request<{ ok: boolean; detail: string }>('/api/notifications/test-email', { method: 'POST' }),
    testWebhook: () =>
      request<{ ok: boolean; detail: string }>('/api/notifications/test-webhook', { method: 'POST' }),
  },

  metrics: (serverId: string) =>
    request<Record<string, any>[]>(`/api/metrics/${serverId}`).then((list) => list.map(mapMetric)),

  events: (serverId: string) =>
    request<ServerEvent[]>(`/api/events/${serverId}`),

  services: {
    list: (serverId: string) =>
      request<ServiceMonitor[]>(`/api/servers/${serverId}/services`),

    create: (serverId: string, payload: ServiceMonitorCreatePayload) =>
      request<ServiceMonitor>(`/api/servers/${serverId}/services`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),

    update: (serverId: string, monitorId: number, payload: ServiceMonitorUpdatePayload) =>
      request<ServiceMonitor>(`/api/servers/${serverId}/services/${monitorId}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      }),

    delete: (serverId: string, monitorId: number) =>
      request<void>(`/api/servers/${serverId}/services/${monitorId}`, { method: 'DELETE' }),

    checkNow: (serverId: string) =>
      request<ServiceMonitor[]>(`/api/servers/${serverId}/services/check-now`, { method: 'POST' }),

    discover: (serverId: string) =>
      request<DiscoveredService[]>(`/api/servers/${serverId}/services/discover`, { method: 'POST' }),
  },

  settings: {
    get: () => request<Record<string, string>>('/api/settings'),
    save: (settings: Record<string, string>) =>
      request<Record<string, string>>('/api/settings', {
        method: 'PUT',
        body: JSON.stringify({ settings }),
      }),
  },

  sms: {
    logs: (limit = 50) =>
      request<Record<string, any>[]>(`/api/sms/logs?limit=${limit}`).then((list) =>
        list.map(mapSmsLog),
      ),
    test: (recipient?: string) =>
      request<{ queued: boolean }>('/api/sms/test', {
        method: 'POST',
        body: JSON.stringify({ recipient: recipient ?? null }),
      }),
  },

  calls: {
    columns: (serverId: string) =>
      request<{ name: string; type: string }[]>(`/api/servers/${serverId}/calls/columns`),

    search: (
      serverId: string,
      params: { from_date: string; to_date: string; source?: string; destination?: string; keyword?: string },
    ) =>
      request<CallRecord[]>(`/api/servers/${serverId}/calls/search`, {
        method: 'POST',
        body: JSON.stringify(params),
      }),

    downloadBulk: async (serverId: string, paths: string[]): Promise<void> => {
      const token = localStorage.getItem('sm_token') ?? '';
      const res = await fetch(`${API_BASE}/api/servers/${serverId}/calls/download-bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ paths }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail ?? 'Bulk download failed');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'recordings.zip';
      a.click();
      URL.revokeObjectURL(url);
    },

    streamUrl: (serverId: string, path: string): string => {
      const token = localStorage.getItem('sm_token') ?? '';
      return `${API_BASE}/api/servers/${serverId}/calls/stream?path=${encodeURIComponent(path)}&token=${encodeURIComponent(token)}`;
    },

    downloadUrl: (serverId: string, path: string): string => {
      const token = localStorage.getItem('sm_token') ?? '';
      return `${API_BASE}/api/servers/${serverId}/calls/download?path=${encodeURIComponent(path)}&token=${encodeURIComponent(token)}`;
    },
  },
};

export interface ServerEvent {
  id: number;
  event_id: number;
  event_time: string;
  source: string;
  level: string;
  message: string;
}

export interface CallRecord {
  start: string;
  end: string;
  source: string;
  destination: string;
  direction: 'Incoming' | 'Outgoing';
  duration_seconds: number;
  recording_path: string;
}

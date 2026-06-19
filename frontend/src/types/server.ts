export type ServerStatus = 'online' | 'offline' | 'warning';

export interface ServiceStatus {
  name: string;
  running: boolean;
}

export interface Server {
  id: string;
  hostname: string;
  ipAddress: string;
  site: string;
  osType: string;
  agentPort: number;
  status: ServerStatus;
  vpnConnected: boolean;
  latencyMs: number | null;
  cpu: number;
  ram: number;
  disk: number;
  uptimeSeconds: number;
  lastSeen: Date;
  services: ServiceStatus[];
  maintenanceUntil: Date | null;
}

export interface DashboardStats {
  total: number;
  online: number;
  offline: number;
  warning: number;
  activeAlerts: number;
  smsQueue: number;
}

export type MonitorType = 'windows_service' | 'process' | 'port' | 'http';

export interface ServiceCurrentStatus {
  status: string;
  healthy: boolean | null;
  last_check: string | null;
  response_time_ms: number | null;
  message: string | null;
}

export interface ServiceMonitor {
  id: number;
  server_id: number;
  monitor_type: MonitorType;
  target_name: string;
  display_name: string;
  expected_status: string;
  alert_enabled: boolean;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
  current_status: ServiceCurrentStatus | null;
}

export interface DiscoveredService {
  name: string;
  display_name: string;
  status: string;
  start_type: string;
}

export interface ServiceMonitorCreatePayload {
  monitor_type: MonitorType;
  target_name: string;
  display_name: string;
  expected_status?: string;
  alert_enabled?: boolean;
  is_enabled?: boolean;
}

export interface ServiceMonitorUpdatePayload {
  monitor_type?: MonitorType;
  target_name?: string;
  display_name?: string;
  expected_status?: string;
  alert_enabled?: boolean;
  is_enabled?: boolean;
}

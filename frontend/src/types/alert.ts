export type AlertSeverity = 'critical' | 'warning' | 'info' | 'resolved';

export interface Alert {
  id: string;
  serverId: string;
  hostname: string;
  site: string;
  severity: AlertSeverity;
  message: string;
  smsSent: boolean;
  timestamp: Date;
  resolvedAt: Date | null;
  acknowledgedAt: Date | null;
  acknowledgedBy: string | null;
}

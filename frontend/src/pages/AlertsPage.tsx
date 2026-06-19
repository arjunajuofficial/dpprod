import { useState, useEffect } from 'react';
import { Alert, AlertSeverity } from '../types/alert';
import { useStore } from '../store/useStore';
import { api, SmsLogEntry } from '../api/client';

const SEV_STYLES: Record<AlertSeverity, { color: string; bg: string; border: string; label: string }> = {
  critical: { color: '#f85149', bg: '#f8514922', border: '#f8514944', label: 'Critical' },
  warning:  { color: '#e3b341', bg: '#e3b34122', border: '#e3b34144', label: 'Warning'  },
  info:     { color: '#79c0ff', bg: '#79c0ff22', border: '#79c0ff44', label: 'Info'     },
  resolved: { color: '#7d8590', bg: '#7d859022', border: '#7d859044', label: 'Resolved' },
};

const SMS_STATUS_STYLES = {
  sent:   { color: '#3fb950', bg: '#3fb95022', border: '#3fb95044' },
  failed: { color: '#f85149', bg: '#f8514922', border: '#f8514944' },
  queued: { color: '#e3b341', bg: '#e3b34122', border: '#e3b34144' },
};

function timeAgo(date: Date): string {
  const diff = Math.floor((Date.now() - date.getTime()) / 60000);
  if (diff < 1) return 'just now';
  if (diff < 60) return `${diff}m ago`;
  return `${Math.floor(diff / 60)}h ${diff % 60}m ago`;
}

function timeAgoStr(iso: string | null): string {
  if (!iso) return '—';
  return timeAgo(new Date(iso));
}

function AlertRow({ alert, onChanged }: { alert: Alert; onChanged: (a: Alert) => void }) {
  const sev = SEV_STYLES[alert.severity];
  const { servers, setSelectedServer, setPage } = useStore();
  const [busy, setBusy] = useState(false);

  function openServer() {
    const server = servers.find((s) => s.id === alert.serverId);
    if (server) { setSelectedServer(server); setPage('dashboard'); }
  }

  async function handleAck() {
    setBusy(true);
    try { onChanged(await api.ackAlert(alert.id)); } catch { /* keep row as-is */ }
    setBusy(false);
  }

  async function handleResolve() {
    setBusy(true);
    try { onChanged(await api.resolveAlert(alert.id)); } catch { /* keep row as-is */ }
    setBusy(false);
  }

  const isOpen = !alert.resolvedAt;

  return (
    <div className="group flex items-start gap-3 px-4 py-3 border-b border-[#21262d] hover:bg-[#21262d44] transition-colors">
      <div className="shrink-0 mt-1.5">
        <div className="w-2 h-2 rounded-full" style={{
          backgroundColor: sev.color,
          boxShadow: alert.resolvedAt ? 'none' : `0 0 6px ${sev.color}88`,
        }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] px-2 py-0.5 rounded-full border font-medium"
            style={{ color: sev.color, backgroundColor: sev.bg, borderColor: sev.border }}>
            {sev.label}
          </span>
          <button onClick={openServer}
            className="text-[12px] font-medium text-[#e6edf3] hover:text-[#00d4aa] transition-colors">
            {alert.hostname}
          </button>
          <span className="text-[11px] text-[#7d8590]">{alert.site}</span>
          {alert.smsSent && (
            <span className="text-[10px] text-[#79c0ff] bg-[#79c0ff22] border border-[#79c0ff44] px-2 py-0.5 rounded-full">
              SMS sent
            </span>
          )}
          {alert.acknowledgedAt && (
            <span className="text-[10px] text-[#d2a8ff] bg-[#d2a8ff22] border border-[#d2a8ff44] px-2 py-0.5 rounded-full">
              Ack by {alert.acknowledgedBy ?? '—'}
            </span>
          )}
        </div>
        <p className="text-[12px] text-[#7d8590] mt-0.5 leading-relaxed">{alert.message}</p>
        <div className="flex items-center gap-3 mt-1 text-[10px] text-[#7d8590]">
          <span>{timeAgo(alert.timestamp)}</span>
          {alert.resolvedAt && <span className="text-[#3fb950]">Resolved {timeAgo(alert.resolvedAt)}</span>}
        </div>
      </div>
      {isOpen && (
        <div className="flex gap-1.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity self-center">
          {!alert.acknowledgedAt && (
            <button onClick={handleAck} disabled={busy}
              className="text-[10px] px-2.5 py-1 rounded-md border border-[#d2a8ff44] bg-[#d2a8ff11] text-[#d2a8ff] hover:bg-[#d2a8ff22] transition-colors disabled:opacity-40">
              Acknowledge
            </button>
          )}
          <button onClick={handleResolve} disabled={busy}
            className="text-[10px] px-2.5 py-1 rounded-md border border-[#3fb95044] bg-[#3fb95011] text-[#3fb950] hover:bg-[#3fb95022] transition-colors disabled:opacity-40">
            Resolve
          </button>
        </div>
      )}
    </div>
  );
}

function SmsRow({ entry }: { entry: SmsLogEntry }) {
  const style = SMS_STATUS_STYLES[entry.status];
  return (
    <div className="flex items-start gap-3 px-4 py-3 border-b border-[#21262d] hover:bg-[#21262d44] transition-colors">
      <div className="shrink-0 mt-1.5">
        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: style.color }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] px-2 py-0.5 rounded-full border font-medium capitalize"
            style={{ color: style.color, backgroundColor: style.bg, borderColor: style.border }}>
            {entry.status}
          </span>
          {entry.hostname && (
            <span className="text-[12px] font-medium text-[#e6edf3]">{entry.hostname}</span>
          )}
          <span className="text-[11px] font-mono text-[#7d8590]">{entry.recipient}</span>
          {entry.attempts > 1 && (
            <span className="text-[10px] text-[#7d8590]">{entry.attempts} attempts</span>
          )}
        </div>
        <p className="text-[12px] text-[#7d8590] mt-0.5 leading-relaxed truncate">{entry.message}</p>
        <div className="flex items-center gap-3 mt-1 text-[10px] text-[#7d8590]">
          <span>{timeAgoStr(entry.timestamp)}</span>
          {entry.sentAt && <span className="text-[#3fb950]">Sent {timeAgoStr(entry.sentAt)}</span>}
          {entry.error && <span className="text-[#f85149] truncate max-w-[200px]">{entry.error}</span>}
        </div>
      </div>
    </div>
  );
}

const ALERT_FILTERS = ['All', 'Critical', 'Warning', 'Info', 'Resolved'] as const;
type Tab = 'alerts' | 'sms';

export function AlertsPage() {
  const { alerts, setAlerts } = useStore();
  const [tab, setTab] = useState<Tab>('alerts');
  const [filter, setFilter] = useState<string>('All');
  const [refreshing, setRefreshing] = useState(false);
  const [smsLogs, setSmsLogs] = useState<SmsLogEntry[]>([]);
  const [smsLoading, setSmsLoading] = useState(false);

  async function refresh() {
    setRefreshing(true);
    try {
      const fresh = await api.alerts();
      setAlerts(fresh);
    } finally {
      setRefreshing(false);
    }
  }

  async function refreshSms() {
    setSmsLoading(true);
    try {
      const logs = await api.sms.logs();
      setSmsLogs(logs);
    } finally {
      setSmsLoading(false);
    }
  }

  function patchAlert(updated: Alert) {
    setAlerts(alerts.map((a) => (a.id === updated.id ? updated : a)));
  }

  async function handleExport() {
    try {
      if (tab === 'alerts') await api.exportAlertsCsv();
      else await api.exportSmsLogsCsv();
    } catch { /* button stays usable */ }
  }

  useEffect(() => { refresh(); }, []);

  useEffect(() => {
    if (tab === 'sms') refreshSms();
  }, [tab]);

  const filtered = alerts.filter((a) =>
    filter === 'All' || a.severity === filter.toLowerCase()
  );

  const counts = {
    critical: alerts.filter((a) => a.severity === 'critical' && !a.resolvedAt).length,
    warning:  alerts.filter((a) => a.severity === 'warning'  && !a.resolvedAt).length,
    resolved: alerts.filter((a) => a.resolvedAt != null).length,
    total:    alerts.length,
  };

  return (
    <div className="flex flex-col h-full">
      <div className="bg-[#161b22] border-b border-[#21262d] px-5 py-3 pr-[168px] flex items-center justify-between">
        <div>
          <h1 className="text-[15px] font-medium text-[#e6edf3]">Alerts &amp; Events</h1>
          <p className="text-[11px] text-[#7d8590] mt-0.5">Active alerts, historical events, and SMS dispatch log</p>
        </div>
        <div className="flex items-center gap-4">
          {tab === 'alerts' ? (
            <>
              <div className="text-[11px] flex gap-3">
                <span className="text-[#f85149]">{counts.critical} critical</span>
                <span className="text-[#e3b341]">{counts.warning} warning</span>
                <span className="text-[#3fb950]">{counts.resolved} resolved</span>
              </div>
              <button onClick={refresh} disabled={refreshing}
                className="text-[11px] text-[#7d8590] hover:text-[#e6edf3] transition-colors disabled:opacity-40">
                {refreshing ? 'Refreshing…' : '↻ Refresh'}
              </button>
            </>
          ) : (
            <button onClick={refreshSms} disabled={smsLoading}
              className="text-[11px] text-[#7d8590] hover:text-[#e6edf3] transition-colors disabled:opacity-40">
              {smsLoading ? 'Refreshing…' : '↻ Refresh'}
            </button>
          )}
          <button onClick={handleExport}
            className="text-[11px] text-[#7d8590] hover:text-[#e6edf3] border border-[#30363d] hover:border-[#7d8590] rounded-md px-3 py-1 transition-colors">
            ⤓ Export CSV
          </button>
        </div>
      </div>

      {/* Stats row — alerts tab only */}
      {tab === 'alerts' && (
        <div className="grid grid-cols-4 gap-px bg-[#21262d] border-b border-[#21262d]">
          {[
            { label: 'Total Events',    value: counts.total,    color: '#e6edf3' },
            { label: 'Critical Active', value: counts.critical, color: '#f85149' },
            { label: 'Warning Active',  value: counts.warning,  color: '#e3b341' },
            { label: 'Resolved',        value: counts.resolved, color: '#3fb950' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-[#161b22] px-4 py-3 text-center">
              <div className="text-[22px] font-medium font-mono" style={{ color }}>{value}</div>
              <div className="text-[10px] text-[#7d8590] mt-0.5 uppercase tracking-widest">{label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Tab bar */}
      <div className="bg-[#0d1117] border-b border-[#21262d] px-5 py-2 flex gap-1.5">
        <button onClick={() => setTab('alerts')}
          className={`text-[11px] px-3 py-1 rounded-md transition-colors ${
            tab === 'alerts'
              ? 'bg-[#00d4aa22] text-[#00d4aa] border border-[#00d4aa44]'
              : 'text-[#7d8590] hover:text-[#e6edf3] hover:bg-[#21262d]'
          }`}>
          Alerts
        </button>
        <button onClick={() => setTab('sms')}
          className={`text-[11px] px-3 py-1 rounded-md transition-colors ${
            tab === 'sms'
              ? 'bg-[#00d4aa22] text-[#00d4aa] border border-[#00d4aa44]'
              : 'text-[#7d8590] hover:text-[#e6edf3] hover:bg-[#21262d]'
          }`}>
          SMS Logs
        </button>

        {tab === 'alerts' && (
          <>
            <div className="w-px bg-[#21262d] mx-1" />
            {ALERT_FILTERS.map((f) => (
              <button key={f} onClick={() => setFilter(f)}
                className={`text-[11px] px-3 py-1 rounded-md transition-colors ${
                  filter === f
                    ? 'bg-[#00d4aa22] text-[#00d4aa] border border-[#00d4aa44]'
                    : 'text-[#7d8590] hover:text-[#e6edf3] hover:bg-[#21262d]'
                }`}>
                {f}
              </button>
            ))}
            <span className="ml-auto text-[11px] text-[#7d8590] self-center">{filtered.length} events</span>
          </>
        )}

        {tab === 'sms' && (
          <span className="ml-auto text-[11px] text-[#7d8590] self-center">{smsLogs.length} entries</span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {tab === 'alerts' ? (
          filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-[#7d8590]">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mb-3 opacity-40">
                <path d="M22 11.08V12a10 10 0 11-5.93-9.14" /><polyline points="22,4 12,14.01 9,11.01" />
              </svg>
              <p className="text-[13px]">No events for this filter</p>
            </div>
          ) : (
            filtered.map((a) => <AlertRow key={a.id} alert={a} onChanged={patchAlert} />)
          )
        ) : smsLoading ? (
          <div className="flex items-center justify-center h-full text-[#7d8590] text-[12px]">
            Loading SMS logs…
          </div>
        ) : smsLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-[#7d8590]">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mb-3 opacity-40">
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
            </svg>
            <p className="text-[13px]">No SMS messages sent yet</p>
            <p className="text-[11px] mt-1 opacity-60">Use Settings → Send Test SMS to verify your TG100 setup</p>
          </div>
        ) : (
          smsLogs.map((l) => <SmsRow key={l.id} entry={l} />)
        )}
      </div>
    </div>
  );
}

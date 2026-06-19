import { useEffect, useState } from 'react';
import { useStore } from '../store/useStore';
import { launchRdp } from '../utils/rdp';
import { Server } from '../types/server';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { api, MetricPoint, ServerEvent } from '../api/client';
import { ServicesTab } from './services/ServicesTab';

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatUptime(s: number) {
  if (s === 0) return '—';
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  if (d > 0) return `${d}d ${h}h`;
  return `${h}h ${Math.floor((s % 3600) / 60)}m`;
}

function formatLastSeen(date: Date): string {
  const diff = Math.floor((Date.now() - date.getTime()) / 60000);
  if (diff < 1) return 'just now';
  if (diff < 60) return `${diff}m ago`;
  const h = Math.floor(diff / 60);
  return `${h}h ${diff % 60}m ago`;
}

function metricColor(v: number) {
  if (v >= 85) return '#f85149';
  if (v >= 65) return '#e3b341';
  return '#00d4aa';
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Ring({ value, label }: { value: number; label: string }) {
  const r = 28, circ = 2 * Math.PI * r, dash = (value / 100) * circ;
  const color = metricColor(value);
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="72" height="72" viewBox="0 0 72 72">
        <circle cx="36" cy="36" r={r} fill="none" stroke="#21262d" strokeWidth="6" />
        <circle cx="36" cy="36" r={r} fill="none" stroke={color} strokeWidth="6"
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          transform="rotate(-90 36 36)" style={{ transition: 'stroke-dasharray 0.6s ease' }} />
        <text x="36" y="41" textAnchor="middle" fontSize="14" fontWeight="600" fill={color} fontFamily="monospace">
          {value}%
        </text>
      </svg>
      <span className="text-[10px] text-[#7d8590] uppercase tracking-widest">{label}</span>
    </div>
  );
}

const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded px-3 py-2 text-[11px]">
      <div className="text-[#7d8590] mb-1">{label}</div>
      {payload.map((p: any) => (
        <div key={p.name} style={{ color: p.color }}>
          {p.name}: {p.value}{p.name === 'Latency' ? ' ms' : '%'}
        </div>
      ))}
    </div>
  );
};

// ── Tab definitions ───────────────────────────────────────────────────────────

type Tab = 'overview' | 'metrics' | 'services' | 'alerts';

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview',  label: 'Overview'  },
  { id: 'metrics',   label: 'Metrics'   },
  { id: 'services',  label: 'Services'  },
  { id: 'alerts',    label: 'Alerts'    },
];

// ── Main component ────────────────────────────────────────────────────────────

const MAINT_OPTIONS = [
  { label: '1 hour',  minutes: 60 },
  { label: '4 hours', minutes: 240 },
  { label: '24 hours', minutes: 1440 },
];

export function ServerDetailPanel() {
  const { selectedServer: server, setSelectedServer, alerts: allAlerts, updateServer } = useStore();
  const [tab, setTab]         = useState<Tab>('overview');
  const [metrics, setMetrics] = useState<MetricPoint[]>([]);
  const [events, setEvents]   = useState<ServerEvent[]>([]);
  const [maintBusy, setMaintBusy] = useState(false);

  async function setMaintenance(minutes: number | null) {
    if (!server) return;
    setMaintBusy(true);
    try {
      const updated: Server = await api.setMaintenance(server.id, minutes);
      // Preserve services list — the maintenance response doesn't include it
      updateServer({ ...updated, services: server.services });
    } catch { /* leave state untouched */ }
    setMaintBusy(false);
  }

  // Reset tab when server changes
  useEffect(() => { setTab('overview'); }, [server?.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelectedServer(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setSelectedServer]);

  useEffect(() => {
    if (!server) { setMetrics([]); return; }
    api.metrics(server.id).then(setMetrics).catch(() => setMetrics([]));
  }, [server?.id]);

  useEffect(() => {
    if (!server) { setEvents([]); return; }
    api.events(server.id).then(setEvents).catch(() => setEvents([]));
  }, [server?.id]);

  if (!server) return null;

  const isOffline   = server.status === 'offline';
  const statusColor = isOffline ? '#f85149' : server.status === 'warning' ? '#e3b341' : '#00d4aa';
  const inMaintenance = server.maintenanceUntil != null && server.maintenanceUntil.getTime() > Date.now();
  const serverAlerts = allAlerts
    .filter((a) => a.serverId === server.id)
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    .slice(0, 30);

  // ── Tab content ─────────────────────────────────────────────────────────────

  function renderOverview() {
    if (!server) return null;
    return (
      <div className="space-y-5">
        {/* System info grid */}
        <section>
          <h3 className="text-[10px] text-[#7d8590] uppercase tracking-widest mb-3">System</h3>
          <div className="grid grid-cols-2 gap-2">
            {[
              ['OS',        server.osType],
              ['Reachable', server.vpnConnected ? 'Yes' : 'No'],
              ['Uptime',    formatUptime(server.uptimeSeconds)],
              ['Last Seen', formatLastSeen(server.lastSeen)],
              ['Latency',   server.latencyMs != null ? `${server.latencyMs} ms` : 'timeout'],
            ].map(([label, val]) => (
              <div key={label} className="bg-[#0d1117] rounded px-3 py-2">
                <div className="text-[10px] text-[#7d8590] mb-0.5">{label}</div>
                <div className="text-[12px] text-[#e6edf3] font-mono">{val}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Resource rings */}
        {!isOffline && (
          <section>
            <h3 className="text-[10px] text-[#7d8590] uppercase tracking-widest mb-3">Resources</h3>
            <div className="flex justify-around bg-[#0d1117] rounded-lg py-4">
              <Ring value={server.cpu}  label="CPU"  />
              <Ring value={server.ram}  label="RAM"  />
              <Ring value={server.disk} label="Disk" />
            </div>
          </section>
        )}

        {isOffline && (
          <div className="text-[13px] text-[#f85149] text-center py-6 bg-[#f8514911] rounded-lg border border-dashed border-[#f8514933]">
            <div className="text-[28px] mb-2">⚠</div>
            Server offline — no metrics available<br />
            <span className="text-[11px] text-[#7d8590] mt-1 block">
              Last seen {formatLastSeen(server.lastSeen)}
            </span>
          </div>
        )}
      </div>
    );
  }

  function renderMetrics() {
    if (!server) return null;
    if (isOffline) {
      return (
        <div className="text-[12px] text-[#7d8590] text-center py-12">
          No metrics available while server is offline.
        </div>
      );
    }
    if (metrics.length === 0) {
      return (
        <div className="text-[12px] text-[#7d8590] text-center py-12">
          No metric history yet — data collects every 60 seconds.
        </div>
      );
    }
    return (
      <div className="bg-[#0d1117] rounded-lg p-3">
        <h3 className="text-[10px] text-[#7d8590] uppercase tracking-widest mb-3">2-Hour Trend</h3>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={metrics} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
            <XAxis dataKey="time" tick={{ fill: '#7d8590', fontSize: 9 }} tickLine={false} interval={5} />
            <YAxis tick={{ fill: '#7d8590', fontSize: 9 }} tickLine={false} domain={[0, 100]} />
            <Tooltip content={<ChartTooltip />} />
            <Line type="monotone" dataKey="cpu"     name="CPU"     stroke="#00d4aa" strokeWidth={1.5} dot={false} />
            <Line type="monotone" dataKey="ram"     name="RAM"     stroke="#79c0ff" strokeWidth={1.5} dot={false} />
            <Line type="monotone" dataKey="disk"    name="Disk"    stroke="#e3b341" strokeWidth={1.5} dot={false} />
            <Line type="monotone" dataKey="latency" name="Latency" stroke="#d2a8ff" strokeWidth={1.5} dot={false} />
          </LineChart>
        </ResponsiveContainer>
        <div className="flex gap-4 mt-3 justify-center flex-wrap">
          {[['CPU','#00d4aa'],['RAM','#79c0ff'],['Disk','#e3b341'],['Latency','#d2a8ff']].map(([l,c])=>(
            <div key={l} className="flex items-center gap-1.5 text-[10px] text-[#7d8590]">
              <div className="w-3 h-0.5 rounded" style={{ backgroundColor: c }} />{l}
            </div>
          ))}
        </div>
      </div>
    );
  }

  function renderAlerts() {
    if (!server) return null;
    const EVENT_LABELS: Record<number, string> = { 6008: 'Unexpected Shutdown' };
    return (
      <div className="space-y-4">
        {/* Windows Event Log */}
        {events.length > 0 && (
          <section>
            <h3 className="text-[10px] text-[#7d8590] uppercase tracking-widest mb-3">Event Log</h3>
            <div className="space-y-1.5">
              {events.slice(0, 10).map((ev) => {
                const color = ev.event_id === 6008 ? '#f85149' : '#e3b341';
                return (
                  <div key={ev.id} className="bg-[#0d1117] rounded px-3 py-2">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-[11px] font-medium" style={{ color }}>
                        {EVENT_LABELS[ev.event_id] ?? `Event ${ev.event_id}`}
                      </span>
                      <span className="text-[10px] text-[#7d8590] font-mono">
                        {new Date(ev.event_time).toLocaleString('en-GB', {
                          day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <p className="text-[10px] text-[#7d8590] leading-relaxed line-clamp-2">{ev.message}</p>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Server alerts */}
        <section>
          <h3 className="text-[10px] text-[#7d8590] uppercase tracking-widest mb-3">Recent Alerts</h3>
          {serverAlerts.length === 0 ? (
            <div className="text-[12px] text-[#7d8590] text-center py-8 bg-[#0d1117] rounded-lg">
              No alerts for this server.
            </div>
          ) : (
            <div className="space-y-1.5">
              {serverAlerts.map((a) => {
                const color = a.severity === 'critical' ? '#f85149'
                  : a.severity === 'warning' ? '#e3b341' : '#00d4aa';
                return (
                  <div key={a.id} className="bg-[#0d1117] rounded px-3 py-2">
                    <div className="flex items-center justify-between mb-0.5">
                      <span
                        className="text-[10px] uppercase font-medium px-2 py-0.5 rounded-full border"
                        style={{
                          color,
                          borderColor: color + '44',
                          backgroundColor: color + '15',
                        }}
                      >
                        {a.severity}
                      </span>
                      <span className="text-[10px] text-[#7d8590] font-mono">
                        {a.timestamp.toLocaleString('en-GB', {
                          day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <p className="text-[11px] text-[#e6edf3] mt-1 leading-relaxed">{a.message}</p>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 z-40" onClick={() => setSelectedServer(null)} />

      {/* Panel */}
      <div className="fixed top-0 right-0 h-full w-[460px] bg-[#161b22] border-l border-[#21262d] z-50 flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#21262d] shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[15px] font-medium text-[#e6edf3]">{server.hostname}</span>
              <span
                className="text-[10px] px-2 py-0.5 rounded-full border font-medium"
                style={{ color: statusColor, borderColor: statusColor + '55', backgroundColor: statusColor + '22' }}
              >
                {server.status.toUpperCase()}
              </span>
              {inMaintenance && (
                <span
                  title={`Alerts muted until ${server.maintenanceUntil!.toLocaleString()}`}
                  className="text-[10px] px-2 py-0.5 rounded-full border font-medium bg-[#d2a8ff22] text-[#d2a8ff] border-[#d2a8ff44]"
                >
                  MAINTENANCE
                </span>
              )}
            </div>
            <div className="text-[12px] text-[#7d8590] font-mono mt-0.5">
              {server.ipAddress} · {server.site} · Port {server.agentPort}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {inMaintenance ? (
              <button
                onClick={() => setMaintenance(null)}
                disabled={maintBusy}
                title="End maintenance window — alerts resume"
                className="text-[11px] px-2.5 py-1.5 rounded border border-[#d2a8ff44] bg-[#d2a8ff11] text-[#d2a8ff] hover:bg-[#d2a8ff22] transition-colors disabled:opacity-40"
              >
                End Maint
              </button>
            ) : (
              <select
                value=""
                disabled={maintBusy}
                onChange={(e) => { const m = parseInt(e.target.value, 10); if (m) setMaintenance(m); }}
                title="Start a maintenance window — alerts and SMS muted"
                className="text-[11px] px-2 py-1.5 rounded border border-[#30363d] bg-[#21262d] text-[#7d8590] hover:text-[#e6edf3] focus:outline-none cursor-pointer disabled:opacity-40"
              >
                <option value="" disabled>Maint…</option>
                {MAINT_OPTIONS.map((o) => (
                  <option key={o.minutes} value={o.minutes}>{o.label}</option>
                ))}
              </select>
            )}
            <button
              onClick={() => launchRdp(server)}
              title="Remote Desktop"
              className="flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded border border-[#79c0ff44] bg-[#79c0ff11] text-[#79c0ff] hover:bg-[#79c0ff22] transition-colors"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>
              </svg>
              RDP
            </button>
            <button onClick={() => setSelectedServer(null)} className="text-[#7d8590] hover:text-[#e6edf3] transition-colors">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-[#21262d] shrink-0">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 py-2.5 text-[11px] font-medium transition-colors border-b-2 ${
                tab === t.id
                  ? 'border-[#388bfd] text-[#79c0ff]'
                  : 'border-transparent text-[#7d8590] hover:text-[#e6edf3]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {tab === 'overview'  && renderOverview()}
          {tab === 'metrics'   && renderMetrics()}
          {tab === 'services'  && <ServicesTab serverId={server.id} serverOnline={!isOffline} />}
          {tab === 'alerts'    && renderAlerts()}
        </div>
      </div>
    </>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api/client';
import { ServiceMonitor, MonitorType } from '../../types/service';
import { AddServiceModal } from './AddServiceModal';

interface Props {
  serverId: string;
  serverOnline: boolean;
}

const TYPE_LABEL: Record<MonitorType, string> = {
  windows_service: 'Windows Service',
  process:         'Process',
  port:            'TCP Port',
  http:            'HTTP',
};

const TYPE_COLOR: Record<MonitorType, string> = {
  windows_service: '#79c0ff',
  process:         '#d2a8ff',
  port:            '#e3b341',
  http:            '#00d4aa',
};

function HealthBadge({ healthy }: { healthy: boolean | null }) {
  if (healthy === null || healthy === undefined) {
    return <span className="inline-block w-2 h-2 rounded-full bg-[#484f58]" title="Unknown" />;
  }
  return (
    <span
      className="inline-block w-2 h-2 rounded-full"
      style={{ backgroundColor: healthy ? '#00d4aa' : '#f85149' }}
      title={healthy ? 'Healthy' : 'Down'}
    />
  );
}

function relativeTime(iso: string | null): string {
  if (!iso) return '—';
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

export function ServicesTab({ serverId }: Props) {
  const [monitors, setMonitors]   = useState<ServiceMonitor[]>([]);
  const [loading, setLoading]     = useState(true);    // true only on first load
  const [refreshing, setRefreshing] = useState(false); // true on background polls
  const [showModal, setModal]     = useState(false);
  const [editing, setEditing]     = useState<ServiceMonitor | null>(null);
  const [deleting, setDeleting]   = useState<number | null>(null);

  // silent=true: background poll (no spinner); silent=false: show spinner
  // forceCheck=true: POST /check-now to trigger immediate agent query (used by Refresh button)
  const load = useCallback(async (silent = false, forceCheck = false) => {
    if (silent) setRefreshing(true); else setLoading(true);
    try {
      const data = forceCheck
        ? await api.services.checkNow(serverId)
        : await api.services.list(serverId);
      setMonitors(data);
    } catch {
      // On force-check failure fall back to a regular list read
      if (forceCheck) {
        try {
          const data = await api.services.list(serverId);
          setMonitors(data);
        } catch { /* keep existing */ }
      } else if (!silent) {
        setMonitors([]);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [serverId]);

  useEffect(() => {
    load(false, false); // show spinner on first load, just read DB
    const interval = setInterval(() => load(true, true), 15000); // every 15s: force-check silently
    return () => clearInterval(interval);
  }, [load]);

  async function handleManualRefresh() { await load(false, true); } // always force-check on manual

  async function handleDelete(id: number) {
    if (!confirm('Delete this service monitor?')) return;
    setDeleting(id);
    try {
      await api.services.delete(serverId, id);
      setMonitors((m) => m.filter((s) => s.id !== id));
    } catch {
      // silent
    } finally {
      setDeleting(null);
    }
  }

  async function handleToggleEnabled(monitor: ServiceMonitor) {
    try {
      const updated = await api.services.update(serverId, monitor.id, {
        is_enabled: !monitor.is_enabled,
      });
      setMonitors((m) => m.map((s) => (s.id === updated.id ? updated : s)));
    } catch {
      // silent
    }
  }

  function openAdd() { setEditing(null); setModal(true); }
  function openEdit(m: ServiceMonitor) { setEditing(m); setModal(true); }
  function onSaved() { setModal(false); load(); }

  // ── Summary stats ────────────────────────────────────────────────────────
  const healthy = monitors.filter((m) => m.current_status?.healthy === true).length;
  const failed  = monitors.filter((m) => m.current_status?.healthy === false).length;
  const unknown = monitors.filter(
    (m) => m.current_status?.healthy === null || m.current_status?.healthy === undefined || !m.current_status,
  ).length;
  const total = monitors.length;

  return (
    <>
      {/* Health summary */}
      {total > 0 && (
        <div className="flex gap-2 mb-4">
          {[
            { label: 'Healthy', count: healthy, color: '#00d4aa', bg: '#00d4aa15' },
            { label: 'Down',    count: failed,  color: '#f85149', bg: '#f8514915' },
            { label: 'Unknown', count: unknown, color: '#7d8590', bg: '#7d859015' },
          ].map(({ label, count, color, bg }) => (
            <div
              key={label}
              className="flex-1 rounded px-3 py-2 text-center"
              style={{ backgroundColor: bg, border: `1px solid ${color}33` }}
            >
              <div className="text-[18px] font-bold" style={{ color }}>{count}</div>
              <div className="text-[10px] text-[#7d8590] uppercase tracking-wider">{label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] text-[#7d8590]">
          {total} monitor{total !== 1 ? 's' : ''} configured
        </span>
        <div className="flex gap-2">
          <button
            onClick={handleManualRefresh}
            disabled={loading || refreshing}
            title="Refresh"
            className="flex items-center gap-1 text-[11px] px-2 py-1 rounded border border-[#30363d] text-[#7d8590] hover:border-[#484f58] hover:text-[#e6edf3] disabled:opacity-40 transition-colors"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
              className={refreshing ? 'animate-spin' : ''}>
              <polyline points="23 4 23 10 17 10"/>
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
            </svg>
            {loading ? '…' : refreshing ? 'Checking…' : 'Refresh'}
          </button>
          <button
            onClick={openAdd}
            className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded bg-[#238636] hover:bg-[#2ea043] text-white transition-colors"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Add Service
          </button>
        </div>
      </div>

      {/* Table */}
      {loading && monitors.length === 0 ? (
        <div className="text-[12px] text-[#7d8590] text-center py-8">Loading…</div>
      ) : monitors.length === 0 ? (
        <div className="text-center py-10 bg-[#0d1117] rounded-lg border border-dashed border-[#30363d]">
          <div className="text-[24px] mb-2">📡</div>
          <div className="text-[13px] text-[#7d8590]">No services configured</div>
          <div className="text-[11px] text-[#484f58] mt-1">Click "Add Service" to start monitoring</div>
        </div>
      ) : (
        <div className="space-y-1.5">
          {monitors.map((m) => {
            const s = m.current_status;
            return (
              <div
                key={m.id}
                className={`bg-[#0d1117] rounded px-3 py-2.5 border transition-colors ${
                  m.is_enabled ? 'border-[#21262d]' : 'border-[#21262d] opacity-50'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <HealthBadge healthy={s?.healthy ?? null} />

                  {/* Name + type */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] text-[#e6edf3] truncate">{m.display_name}</span>
                      <span
                        className="text-[9px] px-1.5 py-0.5 rounded border shrink-0"
                        style={{
                          color: TYPE_COLOR[m.monitor_type],
                          borderColor: TYPE_COLOR[m.monitor_type] + '44',
                          backgroundColor: TYPE_COLOR[m.monitor_type] + '15',
                        }}
                      >
                        {TYPE_LABEL[m.monitor_type]}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-[#7d8590] font-mono truncate">{m.target_name}</span>
                      {s && (
                        <>
                          <span className="text-[#30363d]">·</span>
                          <span
                            className="text-[10px]"
                            style={{ color: s.healthy ? '#00d4aa' : s.healthy === false ? '#f85149' : '#7d8590' }}
                          >
                            {s.status}
                          </span>
                          <span className="text-[#30363d]">·</span>
                          <span className="text-[10px] text-[#7d8590]">{relativeTime(s.last_check)}</span>
                          {s.response_time_ms != null && (
                            <>
                              <span className="text-[#30363d]">·</span>
                              <span className="text-[10px] text-[#7d8590]">{s.response_time_ms}ms</span>
                            </>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handleToggleEnabled(m)}
                      title={m.is_enabled ? 'Disable' : 'Enable'}
                      className="p-1.5 rounded hover:bg-[#21262d] text-[#7d8590] hover:text-[#e6edf3] transition-colors"
                    >
                      {m.is_enabled ? (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                          <circle cx="12" cy="12" r="3"/>
                        </svg>
                      ) : (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/>
                          <line x1="1" y1="1" x2="23" y2="23"/>
                        </svg>
                      )}
                    </button>
                    <button
                      onClick={() => openEdit(m)}
                      title="Edit"
                      className="p-1.5 rounded hover:bg-[#21262d] text-[#7d8590] hover:text-[#e6edf3] transition-colors"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                      </svg>
                    </button>
                    <button
                      onClick={() => handleDelete(m.id)}
                      disabled={deleting === m.id}
                      title="Delete"
                      className="p-1.5 rounded hover:bg-[#21262d] text-[#7d8590] hover:text-[#f85149] disabled:opacity-40 transition-colors"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
                        <path d="M10 11v6M14 11v6"/>
                        <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Error message */}
                {s?.message && !s.healthy && (
                  <p className="text-[10px] text-[#f85149] mt-1.5 pl-[18px] opacity-80 truncate">{s.message}</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showModal && (
        <AddServiceModal
          serverId={serverId}
          editing={editing}
          onClose={() => setModal(false)}
          onSaved={onSaved}
        />
      )}
    </>
  );
}

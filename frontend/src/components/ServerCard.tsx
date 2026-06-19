import { Server, ServerStatus } from '../types/server';
import { useStore } from '../store/useStore';
import { launchRdp } from '../utils/rdp';

interface ServerCardProps {
  server: Server;
  onClick?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

function formatUptime(seconds: number): string {
  if (seconds === 0) return '—';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  if (d > 0) return `${d}d ${h}h`;
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

function formatLastSeen(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  const remMins = diffMins % 60;
  return `${diffHrs}h ${remMins}m ago`;
}

function metricBarColor(value: number): string {
  if (value >= 85) return '#f85149';
  if (value >= 65) return '#e3b341';
  return '#00d4aa';
}

function metricTextColor(value: number): string {
  if (value >= 85) return '#f85149';
  if (value >= 65) return '#e3b341';
  return '#00d4aa';
}

function latencyColor(ms: number | null): string {
  if (ms === null) return '#f85149';
  if (ms > 60) return '#e3b341';
  return '#00d4aa';
}

const STATUS_STYLES: Record<ServerStatus, { badge: string; border: string }> = {
  online: {
    badge: 'bg-[#00d4aa22] text-[#00d4aa] border border-[#00d4aa44]',
    border: 'border-l-[3px] border-l-[#00d4aa]',
  },
  warning: {
    badge: 'bg-[#e3b34122] text-[#e3b341] border border-[#e3b34144]',
    border: 'border-l-[3px] border-l-[#e3b341]',
  },
  offline: {
    badge: 'bg-[#f8514922] text-[#f85149] border border-[#f8514944]',
    border: 'border-l-[3px] border-l-[#f85149]',
  },
};

export function ServerCard({ server, onClick, onEdit, onDelete }: ServerCardProps) {
  const { badge, border } = STATUS_STYLES[server.status];
  const { setPage, setCallServerId } = useStore();

  function openCallSearch(e: React.MouseEvent) {
    e.stopPropagation();
    setCallServerId(server.id);
    setPage('calls');
  }
  const isOffline = server.status === 'offline';
  const inMaintenance = server.maintenanceUntil != null && server.maintenanceUntil.getTime() > Date.now();

  return (
    <div
      onClick={onClick}
      className={`
        group bg-[#161b22] border border-[#21262d] rounded-lg p-3.5 relative
        hover:border-[#30363d] transition-colors duration-200
        ${onClick ? 'cursor-pointer hover:border-[#00d4aa55]' : ''}
        ${border}
        ${isOffline ? 'bg-[#1a1217]' : ''}
      `}
    >
      {/* Edit / Delete action buttons — visible on hover */}
      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-10">
        <button
          onClick={openCallSearch}
          title="Search calls"
          className="w-6 h-6 flex items-center justify-center rounded bg-[#21262d] border border-[#30363d] text-[#7d8590] hover:text-[#00d4aa] hover:border-[#00d4aa44] transition-colors"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 10.8 19.79 19.79 0 01.12 2.18 2 2 0 012.11 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
          </svg>
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); launchRdp(server); }}
          title="Remote Desktop"
          className="w-6 h-6 flex items-center justify-center rounded bg-[#21262d] border border-[#30363d] text-[#7d8590] hover:text-[#79c0ff] hover:border-[#79c0ff44] transition-colors"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>
          </svg>
        </button>
        {onEdit && (
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            title="Edit station"
            className="w-6 h-6 flex items-center justify-center rounded bg-[#21262d] border border-[#30363d] text-[#7d8590] hover:text-[#e6edf3] hover:border-[#7d8590] transition-colors"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </button>
        )}
        {onDelete && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            title="Remove station"
            className="w-6 h-6 flex items-center justify-center rounded bg-[#21262d] border border-[#30363d] text-[#7d8590] hover:text-[#f85149] hover:border-[#f8514944] transition-colors"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3,6 5,6 21,6" />
              <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
              <path d="M10 11v6M14 11v6M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
            </svg>
          </button>
        )}
      </div>

      {/* Card header */}
      <div className="flex items-start justify-between mb-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[13px] font-medium text-[#e6edf3] truncate">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-[#7d8590]">
              <rect x="2" y="3" width="20" height="14" rx="2"/>
              <path d="M8 21h8M12 17v4"/>
            </svg>
            {server.hostname}
          </div>
          <div className="text-[11px] text-[#7d8590] font-mono mt-0.5">{server.ipAddress}</div>
          <div className="flex items-center gap-1 text-[11px] text-[#7d8590] mt-0.5">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
              <polyline points="9,22 9,12 15,12 15,22"/>
            </svg>
            {server.site}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0 ml-2">
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium tracking-wide ${badge}`}>
            {server.status.toUpperCase()}
          </span>
          {inMaintenance && (
            <span
              title={`Alerts muted until ${server.maintenanceUntil!.toLocaleString()}`}
              className="text-[9px] px-2 py-0.5 rounded-full font-medium tracking-wide bg-[#d2a8ff22] text-[#d2a8ff] border border-[#d2a8ff44]">
              MAINT
            </span>
          )}
        </div>
      </div>

      {/* Offline state */}
      {isOffline ? (
        <div className="text-[12px] text-[#f85149] text-center py-2 px-3 bg-[#f8514911] rounded border border-dashed border-[#f8514933] my-2">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="inline-block mr-1.5 align-middle">
            <line x1="1" y1="1" x2="23" y2="23"/><path d="M16.72 11.06A10.94 10.94 0 0119 12.55M5 12.55a10.94 10.94 0 015.17-2.39M10.71 5.05A16 16 0 0122.56 9M1.42 9a15.91 15.91 0 014.7-2.88M8.53 16.11a6 6 0 016.95 0M12 20h.01"/>
          </svg>
          No connection — last seen {formatLastSeen(server.lastSeen)}
        </div>
      ) : (
        <>
          {/* Metric bars */}
          <div className="grid grid-cols-3 gap-1.5 my-2.5">
            {[
              { label: 'CPU', value: server.cpu },
              { label: 'RAM', value: server.ram },
              { label: 'Disk', value: server.disk },
            ].map(({ label, value }) => (
              <div key={label} className="bg-[#0d1117] rounded p-1.5">
                <div className="text-[10px] text-[#7d8590] uppercase tracking-wide">{label}</div>
                <div
                  className="text-[13px] font-medium font-mono mt-0.5"
                  style={{ color: metricTextColor(value) }}
                >
                  {value}%
                </div>
                <div className="h-[3px] bg-[#21262d] rounded-sm mt-1 overflow-hidden">
                  <div
                    className="h-full rounded-sm transition-all duration-500"
                    style={{ width: `${value}%`, backgroundColor: metricBarColor(value) }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Services */}
          {server.services.length > 0 && (
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] text-[#7d8590] uppercase tracking-wide">Services</span>
              <div className="flex gap-1 flex-wrap justify-end">
                {server.services.map((svc) => (
                  <div
                    key={svc.name}
                    title={svc.name}
                    className="w-[7px] h-[7px] rounded-full"
                    style={{ backgroundColor: svc.running ? '#00d4aa' : '#f85149' }}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-2 border-t border-[#21262d] text-[11px] text-[#7d8590]">
        <span className="flex items-center gap-1">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/>
          </svg>
          {formatUptime(server.uptimeSeconds)}
        </span>
        <span className="flex items-center gap-1">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
          </svg>
          {formatLastSeen(server.lastSeen)}
        </span>
        <span
          className="font-mono font-medium"
          style={{ color: latencyColor(server.latencyMs) }}
        >
          {server.latencyMs !== null ? `${server.latencyMs}ms` : 'timeout'}
        </span>
      </div>
    </div>
  );
}

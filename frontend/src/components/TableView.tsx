import { Server } from '../types/server';
import { useStore } from '../store/useStore';
import { launchRdp } from '../utils/rdp';

interface Props {
  servers: Server[];
  onEdit?: (s: Server) => void;
  onDelete?: (s: Server) => void;
}

function formatLastSeen(date: Date): string {
  const diff = Math.floor((Date.now() - date.getTime()) / 60000);
  if (diff < 1) return 'just now';
  if (diff < 60) return `${diff}m ago`;
  return `${Math.floor(diff / 60)}h ${diff % 60}m ago`;
}

function metricColor(v: number) {
  if (v >= 85) return '#f85149';
  if (v >= 65) return '#e3b341';
  return '#00d4aa';
}

const STATUS_COLOR: Record<string, string> = {
  online: '#00d4aa',
  warning: '#e3b341',
  offline: '#f85149',
};

export function TableView({ servers, onEdit, onDelete }: Props) {
  const setSelectedServer = useStore((s) => s.setSelectedServer);

  return (
    <div className="overflow-x-auto rounded-lg border border-[#21262d]">
      <table className="w-full text-[12px] border-collapse">
        <thead>
          <tr className="bg-[#161b22] border-b border-[#21262d]">
            {['Hostname', 'IP', 'Site', 'Status', 'VPN', 'CPU', 'RAM', 'Disk', 'Latency', 'Last Seen', 'RDP', ''].map((h) => (
              <th
                key={h}
                className="px-3 py-2.5 text-left text-[10px] text-[#7d8590] uppercase tracking-widest font-medium whitespace-nowrap"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {servers.map((s, i) => {
            const isOffline = s.status === 'offline';
            const statusColor = STATUS_COLOR[s.status];
            return (
              <tr
                key={s.id}
                className={`
                  border-b border-[#21262d] cursor-pointer transition-colors duration-100
                  ${i % 2 === 0 ? 'bg-[#0d1117]' : 'bg-[#161b2288]'}
                  hover:bg-[#21262d]
                `}
                onClick={() => setSelectedServer(s)}
              >
                <td className="px-3 py-2 font-medium text-[#e6edf3] whitespace-nowrap">
                  <div className="flex items-center gap-1.5">
                    <div
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ backgroundColor: statusColor }}
                    />
                    {s.hostname}
                  </div>
                </td>
                <td className="px-3 py-2 font-mono text-[#7d8590]">{s.ipAddress}</td>
                <td className="px-3 py-2 text-[#7d8590]">{s.site}</td>
                <td className="px-3 py-2">
                  <span
                    className="text-[10px] px-2 py-0.5 rounded-full border font-medium"
                    style={{
                      color: statusColor,
                      borderColor: statusColor + '55',
                      backgroundColor: statusColor + '22',
                    }}
                  >
                    {s.status.toUpperCase()}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <span style={{ color: s.vpnConnected ? '#00d4aa' : '#f85149' }}>
                    {s.vpnConnected ? 'Connected' : 'Down'}
                  </span>
                </td>
                {['cpu', 'ram', 'disk'].map((key) => {
                  const val = s[key as keyof Server] as number;
                  return (
                    <td key={key} className="px-3 py-2 font-mono" style={{ color: isOffline ? '#7d8590' : metricColor(val) }}>
                      {isOffline ? '—' : `${val}%`}
                    </td>
                  );
                })}
                <td className="px-3 py-2 font-mono" style={{ color: s.latencyMs != null ? (s.latencyMs > 60 ? '#e3b341' : '#00d4aa') : '#f85149' }}>
                  {s.latencyMs != null ? `${s.latencyMs}ms` : 'timeout'}
                </td>
                <td className="px-3 py-2 text-[#7d8590] whitespace-nowrap">{formatLastSeen(s.lastSeen)}</td>
                <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => launchRdp(s)}
                    title="Remote Desktop"
                    className="w-6 h-6 flex items-center justify-center rounded text-[#7d8590] hover:text-[#79c0ff] hover:bg-[#79c0ff11] transition-colors"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>
                    </svg>
                  </button>
                </td>
                <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center gap-1">
                    {onEdit && (
                      <button
                        onClick={() => onEdit(s)}
                        title="Edit"
                        className="w-6 h-6 flex items-center justify-center rounded text-[#7d8590] hover:text-[#e6edf3] hover:bg-[#21262d] transition-colors"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                      </button>
                    )}
                    {onDelete && (
                      <button
                        onClick={() => onDelete(s)}
                        title="Remove"
                        className="w-6 h-6 flex items-center justify-center rounded text-[#7d8590] hover:text-[#f85149] hover:bg-[#f8514911] transition-colors"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="3,6 5,6 21,6" />
                          <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
                          <path d="M10 11v6M14 11v6M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
                        </svg>
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

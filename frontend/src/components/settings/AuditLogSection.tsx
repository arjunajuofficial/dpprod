import { useEffect, useState } from 'react';
import { api, AuditEntry } from '../../api/client';

export function AuditLogSection() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(false);

  async function refresh() {
    setLoading(true);
    try { setEntries(await api.audit.list(100)); }
    catch { setEntries([]); }
    finally { setLoading(false); }
  }

  useEffect(() => { refresh(); }, []);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-[#7d8590]">{entries.length} recent entries</span>
        <button onClick={refresh} disabled={loading}
          className="text-[11px] text-[#7d8590] hover:text-[#e6edf3] transition-colors disabled:opacity-40">
          {loading ? 'Refreshing…' : '↻ Refresh'}
        </button>
      </div>
      <div className="max-h-72 overflow-y-auto space-y-1 pr-1">
        {entries.map((e) => (
          <div key={e.id} className="flex items-baseline gap-2 bg-[#0d1117] rounded px-3 py-1.5 text-[11px]">
            <span className="text-[#7d8590] font-mono shrink-0 w-32">
              {new Date(e.timestamp).toLocaleString('en-GB', {
                day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
              })}
            </span>
            <span className="text-[#00d4aa] shrink-0 w-20 truncate">{e.username}</span>
            <span className="text-[#e6edf3] shrink-0">{e.action}</span>
            <span className="text-[#7d8590] truncate">{e.detail}</span>
          </div>
        ))}
        {entries.length === 0 && !loading && (
          <div className="text-[12px] text-[#7d8590] py-4 text-center">No audit entries yet.</div>
        )}
      </div>
    </div>
  );
}

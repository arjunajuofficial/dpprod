import { useState, useMemo, useEffect } from 'react';
import { Server, DashboardStats } from '../types/server';
import { ServerCard } from '../components/ServerCard';
import { SummaryBar } from '../components/SummaryBar';
import { TableView } from '../components/TableView';
import { StationModal } from '../components/StationModal';
import { DeleteConfirmDialog } from '../components/DeleteConfirmDialog';
import { useStore } from '../store/useStore';

const SITES = ['All sites', 'Site A', 'Site B', 'Site C'];
const STATUS_OPTIONS = ['All status', 'online', 'offline', 'warning'] as const;

function LiveBadge() {
  const wsConnected = useStore((s) => s.wsConnected);
  return (
    <div className={`flex items-center gap-1.5 text-[12px] px-2.5 py-1 rounded-full border transition-colors ${
      wsConnected
        ? 'text-[#00d4aa] bg-[#00d4aa11] border-[#00d4aa33]'
        : 'text-[#7d8590] bg-[#21262d] border-[#30363d]'
    }`}>
      <span className={`w-[7px] h-[7px] rounded-full ${wsConnected ? 'bg-[#00d4aa] animate-pulse' : 'bg-[#7d8590]'}`} />
      {wsConnected ? 'Live' : 'Connecting…'}
    </div>
  );
}

function Clock() {
  const [time, setTime] = useState(() => new Date().toLocaleTimeString('en-GB'));
  useEffect(() => {
    const id = setInterval(() => setTime(new Date().toLocaleTimeString('en-GB')), 1000);
    return () => clearInterval(id);
  }, []);
  return <span className="text-[12px] text-[#7d8590] font-mono">{time}</span>;
}

function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 my-4">
      <div className="flex-1 h-px bg-[#21262d]" />
      <span className="text-[11px] text-[#f85149] uppercase tracking-wider bg-[#1a1217] px-2 py-0.5 rounded border border-[#f8514933]">
        {label}
      </span>
      <div className="flex-1 h-px bg-[#21262d]" />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-[#7d8590]">
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mb-3 opacity-30 animate-pulse">
        <circle cx="12" cy="12" r="10" /><polyline points="12,6 12,12 16,14" />
      </svg>
      <p className="text-[13px]">Loading servers…</p>
    </div>
  );
}

const GridIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
  </svg>
);
const TableIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
  </svg>
);

export function MonitoringPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All status');
  const [siteFilter, setSiteFilter] = useState('All sites');
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Server | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Server | null>(null);
  const { viewMode, setViewMode, setSelectedServer, servers, loading } = useStore();

  const filtered = useMemo<Server[]>(() => {
    const q = search.toLowerCase();
    return servers.filter((s) => {
      const matchQ = !q || s.hostname.toLowerCase().includes(q) || s.ipAddress.includes(q) || s.site.toLowerCase().includes(q);
      const matchStatus = statusFilter === 'All status' || s.status === statusFilter;
      const matchSite = siteFilter === 'All sites' || s.site === siteFilter;
      return matchQ && matchStatus && matchSite;
    });
  }, [servers, search, statusFilter, siteFilter]);

  const stats = useMemo<DashboardStats>(() => {
    const online = servers.filter((s) => s.status === 'online').length;
    const offline = servers.filter((s) => s.status === 'offline').length;
    const warning = servers.filter((s) => s.status === 'warning').length;
    return { total: servers.length, online, offline, warning, activeAlerts: offline + warning, smsQueue: offline > 0 ? 1 : 0 };
  }, [servers]);

  const onlineServers = filtered.filter((s) => s.status === 'online' || s.status === 'warning');
  const offlineServers = filtered.filter((s) => s.status === 'offline');

  return (
    <div className="flex flex-col h-full min-h-0">
      <header className="bg-[#161b22] border-b border-[#21262d] px-5 py-3 pr-[168px] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-[15px] font-medium">Station Monitor</span>
          <span className="text-[12px] text-[#7d8590] ml-1">NOC Dashboard</span>
        </div>
        <div className="flex items-center gap-4">
          <LiveBadge />
          <Clock />
        </div>
      </header>

      <SummaryBar stats={stats} />

      <div className="bg-[#0d1117] border-b border-[#21262d] px-5 py-2.5 flex items-center gap-2.5 flex-wrap shrink-0">
        <input
          type="text"
          placeholder="Search servers, IPs, sites…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-[#161b22] border border-[#30363d] text-[#e6edf3] text-[12px] rounded-md px-3 py-1.5 w-52 placeholder-[#7d8590] focus:outline-none focus:border-[#00d4aa55] focus:ring-1 focus:ring-[#00d4aa33]"
        />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-[#161b22] border border-[#30363d] text-[#e6edf3] text-[12px] rounded-md px-3 py-1.5 focus:outline-none focus:border-[#00d4aa55]">
          {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
        </select>
        <select value={siteFilter} onChange={(e) => setSiteFilter(e.target.value)}
          className="bg-[#161b22] border border-[#30363d] text-[#e6edf3] text-[12px] rounded-md px-3 py-1.5 focus:outline-none focus:border-[#00d4aa55]">
          {SITES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>

        <div className="flex items-center border border-[#30363d] rounded-md overflow-hidden">
          {(['grid', 'table'] as const).map((mode) => (
            <button key={mode} onClick={() => setViewMode(mode)} title={mode === 'grid' ? 'Grid view' : 'Table view'}
              className={`px-2.5 py-1.5 transition-colors ${viewMode === mode ? 'bg-[#00d4aa22] text-[#00d4aa]' : 'text-[#7d8590] hover:text-[#e6edf3] hover:bg-[#21262d]'}`}>
              {mode === 'grid' ? <GridIcon /> : <TableIcon />}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-3">
          <span className="text-[12px] text-[#7d8590]">{filtered.length} of {servers.length} servers</span>
          <button
            onClick={() => setAddOpen(true)}
            className="flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-md bg-[#00d4aa22] text-[#00d4aa] border border-[#00d4aa44] hover:bg-[#00d4aa33] transition-colors font-medium"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add Station
          </button>
        </div>
      </div>

      <main className="flex-1 overflow-y-auto px-5 py-4">
        {loading && servers.length === 0 ? (
          <EmptyState />
        ) : viewMode === 'table' ? (
          filtered.length > 0 && (
            <TableView servers={filtered}
              onEdit={(s) => setEditTarget(s)}
              onDelete={(s) => setDeleteTarget(s)}
            />
          )
        ) : (
          <>
            {onlineServers.length > 0 && (
              <>
                <p className="text-[11px] text-[#7d8590] uppercase tracking-widest mb-2.5">
                  Online servers — {onlineServers.length}
                </p>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-2.5">
                  {onlineServers.map((s) => (
                    <ServerCard key={s.id} server={s}
                      onClick={() => setSelectedServer(s)}
                      onEdit={() => setEditTarget(s)}
                      onDelete={() => setDeleteTarget(s)}
                    />
                  ))}
                </div>
              </>
            )}
            {offlineServers.length > 0 && (
              <>
                <SectionDivider label="Offline / Degraded" />
                <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-2.5">
                  {offlineServers.map((s) => (
                    <ServerCard key={s.id} server={s}
                      onClick={() => setSelectedServer(s)}
                      onEdit={() => setEditTarget(s)}
                      onDelete={() => setDeleteTarget(s)}
                    />
                  ))}
                </div>
              </>
            )}
            {filtered.length === 0 && servers.length > 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-[#7d8590]">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mb-3 opacity-40">
                  <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <p className="text-[14px]">No servers match your filters</p>
                <button onClick={() => { setSearch(''); setStatusFilter('All status'); setSiteFilter('All sites'); }}
                  className="mt-3 text-[12px] text-[#00d4aa] hover:underline">Clear filters</button>
              </div>
            )}
          </>
        )}
      </main>

      {addOpen && <StationModal mode="add" onClose={() => setAddOpen(false)} />}
      {editTarget && (
        <StationModal mode="edit" server={editTarget} onClose={() => setEditTarget(null)} />
      )}
      {deleteTarget && (
        <DeleteConfirmDialog server={deleteTarget} onClose={() => setDeleteTarget(null)} />
      )}
    </div>
  );
}

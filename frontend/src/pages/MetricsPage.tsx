import { useState, useEffect } from 'react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, AreaChart, Area, Legend,
} from 'recharts';
import { useStore } from '../store/useStore';
import { api, MetricPoint } from '../api/client';

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded px-3 py-2 text-[11px]">
      <div className="text-[#7d8590] mb-1 font-mono">{label}</div>
      {payload.map((p: any) => (
        <div key={p.name} style={{ color: p.color }}>
          {p.name}: {p.value}{p.name === 'Latency' ? 'ms' : '%'}
        </div>
      ))}
    </div>
  );
};

export function MetricsPage() {
  const { servers, setSelectedServer, setPage } = useStore();
  const onlineServers = servers.filter((s) => s.status !== 'offline');

  const [selectedId, setSelectedId] = useState<string>('');
  const [metrics, setMetrics] = useState<MetricPoint[]>([]);
  const [loadingMetrics, setLoadingMetrics] = useState(false);

  // Set default selected server when servers load
  useEffect(() => {
    if (!selectedId && onlineServers.length > 0) {
      setSelectedId(onlineServers[0].id);
    }
  }, [onlineServers, selectedId]);

  // Fetch metrics when selection changes
  useEffect(() => {
    if (!selectedId) return;
    setLoadingMetrics(true);
    api.metrics(selectedId)
      .then(setMetrics)
      .catch(() => setMetrics([]))
      .finally(() => setLoadingMetrics(false));
  }, [selectedId]);

  const server = servers.find((s) => s.id === selectedId);

  const cpuComparison = onlineServers.map((s) => ({
    name: s.hostname,
    cpu: s.cpu,
    ram: s.ram,
  }));

  function openDetail() {
    if (!server) return;
    setSelectedServer(server);
    setPage('dashboard');
  }

  return (
    <div className="flex flex-col h-full">
      <div className="bg-[#161b22] border-b border-[#21262d] px-5 py-3 pr-[168px]">
        <h1 className="text-[15px] font-medium text-[#e6edf3]">Metrics &amp; Trends</h1>
        <p className="text-[11px] text-[#7d8590] mt-0.5">Historical metrics per server (sampled every 60 s)</p>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">

        {/* Server selector */}
        <section>
          <h2 className="text-[10px] text-[#7d8590] uppercase tracking-widest mb-2">Select Server</h2>
          {onlineServers.length === 0 ? (
            <p className="text-[12px] text-[#7d8590]">No online servers available.</p>
          ) : (
            <div className="flex gap-1.5 flex-wrap">
              {onlineServers.map((s) => (
                <button key={s.id} onClick={() => setSelectedId(s.id)}
                  className={`text-[11px] px-3 py-1.5 rounded-md border transition-colors ${
                    selectedId === s.id
                      ? 'bg-[#00d4aa22] text-[#00d4aa] border-[#00d4aa44]'
                      : 'text-[#7d8590] border-[#30363d] hover:text-[#e6edf3] hover:border-[#7d8590]'
                  }`}>
                  {s.hostname}
                </button>
              ))}
            </div>
          )}
        </section>

        {/* CPU & RAM trend */}
        {server && (
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[10px] text-[#7d8590] uppercase tracking-widest">
                {server.hostname} — CPU &amp; RAM Trend
              </h2>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => api.exportMetricsCsv(server.id).catch(() => {})}
                  className="text-[11px] text-[#7d8590] hover:text-[#e6edf3] border border-[#30363d] hover:border-[#7d8590] rounded-md px-2.5 py-0.5 transition-colors">
                  ⤓ Export CSV
                </button>
                <button onClick={openDetail} className="text-[11px] text-[#00d4aa] hover:underline">
                  Full detail →
                </button>
              </div>
            </div>
            <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-4">
              {loadingMetrics ? (
                <div className="h-[220px] flex items-center justify-center text-[#7d8590] text-[12px]">
                  Loading metrics…
                </div>
              ) : metrics.length === 0 ? (
                <div className="h-[220px] flex flex-col items-center justify-center text-[#7d8590] text-[12px] gap-2">
                  <p>No historical data yet.</p>
                  <p className="text-[11px] opacity-60">Metrics are recorded every 60 s — check back soon.</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={metrics} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
                    <defs>
                      <linearGradient id="cpu" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#00d4aa" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#00d4aa" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="ram" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#79c0ff" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#79c0ff" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                    <XAxis dataKey="time" tick={{ fill: '#7d8590', fontSize: 9 }} tickLine={false} interval={4} />
                    <YAxis tick={{ fill: '#7d8590', fontSize: 9 }} tickLine={false} domain={[0, 100]} unit="%" />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend iconType="plainline" wrapperStyle={{ fontSize: 11, color: '#7d8590', paddingTop: 8 }} />
                    <Area type="monotone" dataKey="cpu" name="CPU" stroke="#00d4aa" fill="url(#cpu)" strokeWidth={1.8} dot={false} />
                    <Area type="monotone" dataKey="ram" name="RAM" stroke="#79c0ff" fill="url(#ram)" strokeWidth={1.8} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </section>
        )}

        {/* Latency trend */}
        {server && metrics.length > 0 && (
          <section>
            <h2 className="text-[10px] text-[#7d8590] uppercase tracking-widest mb-3">
              {server.hostname} — Latency Trend
            </h2>
            <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-4">
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={metrics} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                  <XAxis dataKey="time" tick={{ fill: '#7d8590', fontSize: 9 }} tickLine={false} interval={4} />
                  <YAxis tick={{ fill: '#7d8590', fontSize: 9 }} tickLine={false} unit="ms" />
                  <Tooltip content={<CustomTooltip />} />
                  <Line type="monotone" dataKey="latency" name="Latency" stroke="#e3b341" strokeWidth={1.8} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>
        )}

        {/* Fleet snapshot */}
        {cpuComparison.length > 0 && (
          <section>
            <h2 className="text-[10px] text-[#7d8590] uppercase tracking-widest mb-3">
              Fleet Snapshot — Current Values (Live)
            </h2>
            <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-4">
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={cpuComparison} margin={{ top: 4, right: 8, bottom: 40, left: -16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                  <XAxis dataKey="name" tick={{ fill: '#7d8590', fontSize: 9 }} tickLine={false} angle={-35} textAnchor="end" />
                  <YAxis tick={{ fill: '#7d8590', fontSize: 9 }} tickLine={false} domain={[0, 100]} unit="%" />
                  <Tooltip content={<CustomTooltip />} />
                  <Line type="monotone" dataKey="cpu" name="CPU" stroke="#00d4aa" strokeWidth={2} dot={{ fill: '#00d4aa', r: 4 }} />
                  <Line type="monotone" dataKey="ram" name="RAM" stroke="#79c0ff" strokeWidth={2} dot={{ fill: '#79c0ff', r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>
        )}

        {/* Top CPU consumers */}
        <section>
          <h2 className="text-[10px] text-[#7d8590] uppercase tracking-widest mb-3">Top CPU Consumers</h2>
          <div className="space-y-2">
            {[...onlineServers].sort((a, b) => b.cpu - a.cpu).slice(0, 5).map((s) => (
              <div key={s.id}
                className="flex items-center gap-3 bg-[#161b22] border border-[#21262d] rounded-lg px-4 py-2.5 cursor-pointer hover:border-[#30363d] transition-colors"
                onClick={() => { setSelectedServer(s); setPage('dashboard'); }}>
                <span className="text-[12px] font-medium text-[#e6edf3] w-36 shrink-0 truncate">{s.hostname}</span>
                <div className="flex-1 h-[6px] bg-[#21262d] rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${s.cpu}%`, backgroundColor: s.cpu >= 85 ? '#f85149' : s.cpu >= 65 ? '#e3b341' : '#00d4aa' }} />
                </div>
                <span className="text-[12px] font-mono w-10 text-right"
                  style={{ color: s.cpu >= 85 ? '#f85149' : s.cpu >= 65 ? '#e3b341' : '#00d4aa' }}>
                  {s.cpu.toFixed(0)}%
                </span>
              </div>
            ))}
          </div>
        </section>

      </div>
    </div>
  );
}

import { DashboardStats } from '../types/server';

interface SummaryBarProps {
  stats: DashboardStats;
}

interface StatCellProps {
  value: number;
  label: string;
  color: string;
}

function StatCell({ value, label, color }: StatCellProps) {
  return (
    <div className="bg-[#161b22] px-4 py-3 text-center">
      <div className="text-[22px] font-medium font-mono" style={{ color }}>
        {value}
      </div>
      <div className="text-[11px] text-[#7d8590] mt-0.5 uppercase tracking-widest">{label}</div>
    </div>
  );
}

export function SummaryBar({ stats }: SummaryBarProps) {
  return (
    <div className="grid grid-cols-6 gap-px bg-[#21262d] border-b border-[#21262d]">
      <StatCell value={stats.total}        label="Total"     color="#e6edf3" />
      <StatCell value={stats.online}       label="Online"    color="#00d4aa" />
      <StatCell value={stats.offline}      label="Offline"   color="#f85149" />
      <StatCell value={stats.warning}      label="Warning"   color="#e3b341" />
      <StatCell value={stats.activeAlerts} label="Alerts"    color="#ff7b72" />
      <StatCell value={stats.smsQueue}     label="SMS Queue" color="#79c0ff" />
    </div>
  );
}

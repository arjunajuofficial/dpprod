import { useStore, Page } from '../store/useStore';

interface NavItem {
  id: Page;
  label: string;
  icon: React.ReactNode;
  badge?: number;
}

const DashIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
  </svg>
);
const AlertIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);
const MetricsIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <polyline points="22,12 18,12 15,21 9,3 6,12 2,12" />
  </svg>
);
const CallsIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 10.8 19.79 19.79 0 01.12 2.18 2 2 0 012.11 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
  </svg>
);
const UsersIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" />
  </svg>
);
const SettingsIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
  </svg>
);

export function Sidebar() {
  const { page, setPage, alerts, user } = useStore();
  const isAdmin = user?.role === 'admin';
  const activeAlertCount = alerts.filter(
    (a) => (a.severity === 'critical' || a.severity === 'warning') && !a.resolvedAt
  ).length;

  const NAV_ITEMS: NavItem[] = [
    { id: 'dashboard', label: 'Dashboard',   icon: <DashIcon /> },
    { id: 'alerts',    label: 'Alerts',      icon: <AlertIcon />, badge: activeAlertCount },
    { id: 'metrics',   label: 'Metrics',     icon: <MetricsIcon /> },
    { id: 'calls',     label: 'Call Search', icon: <CallsIcon /> },
    ...(isAdmin ? [{ id: 'users' as Page, label: 'Users', icon: <UsersIcon /> }] : []),
    { id: 'settings',  label: 'Settings',    icon: <SettingsIcon /> },
  ];

  return (
    <aside className="w-[56px] bg-[#161b22] border-r border-[#21262d] flex flex-col items-center py-3 gap-1 shrink-0">
      {/* Logo */}
      <div className="w-8 h-8 bg-[#00d4aa22] border border-[#00d4aa55] rounded-lg flex items-center justify-center mb-3">
        <div className="w-3 h-3 bg-[#00d4aa] rounded-full" />
      </div>

      {NAV_ITEMS.map((item) => {
        const active = page === item.id;
        return (
          <button
            key={item.id}
            title={item.label}
            onClick={() => setPage(item.id)}
            className={`
              relative w-10 h-10 rounded-lg flex items-center justify-center transition-all duration-150
              ${active
                ? 'bg-[#00d4aa22] text-[#00d4aa] border border-[#00d4aa44]'
                : 'text-[#7d8590] hover:text-[#e6edf3] hover:bg-[#21262d]'}
            `}
          >
            {item.icon}
            {item.badge != null && item.badge > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-[#f85149] rounded-full text-[9px] text-white flex items-center justify-center font-bold leading-none">
                {item.badge > 9 ? '9+' : item.badge}
              </span>
            )}
          </button>
        );
      })}
    </aside>
  );
}

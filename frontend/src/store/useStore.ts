import { create } from 'zustand';
import { Server } from '../types/server';
import { Alert } from '../types/alert';

export type Page = 'dashboard' | 'alerts' | 'metrics' | 'settings' | 'calls' | 'users';
export type ViewMode = 'grid' | 'table';

interface AuthUser {
  username: string;
  role: string;
}

interface AppStore {
  // ── Navigation ──────────────────────────────────────────────────────────────
  page: Page;
  setPage: (p: Page) => void;

  // ── View mode ───────────────────────────────────────────────────────────────
  viewMode: ViewMode;
  setViewMode: (m: ViewMode) => void;

  // ── Server detail panel ─────────────────────────────────────────────────────
  selectedServer: Server | null;
  setSelectedServer: (s: Server | null) => void;

  // ── Live server data ─────────────────────────────────────────────────────────
  servers: Server[];
  setServers: (servers: Server[]) => void;
  updateServers: (raws: Record<string, any>[]) => void;
  addServer: (server: Server) => void;
  updateServer: (server: Server) => void;
  removeServer: (id: string) => void;

  // ── Alerts ───────────────────────────────────────────────────────────────────
  alerts: Alert[];
  setAlerts: (alerts: Alert[]) => void;

  // ── Auth ─────────────────────────────────────────────────────────────────────
  token: string | null;
  user: AuthUser | null;
  setAuth: (token: string, user: AuthUser) => void;
  clearAuth: () => void;

  // ── Connection status ────────────────────────────────────────────────────────
  wsConnected: boolean;
  setWsConnected: (v: boolean) => void;

  // ── Call search pre-selected server ─────────────────────────────────────────
  callServerId: string | null;
  setCallServerId: (id: string | null) => void;

  // ── Loading ──────────────────────────────────────────────────────────────────
  loading: boolean;
  setLoading: (v: boolean) => void;
}

// Persist token/user across page reloads
const storedToken = localStorage.getItem('sm_token');
const storedUser = (() => {
  try {
    const s = localStorage.getItem('sm_user');
    return s ? (JSON.parse(s) as AuthUser) : null;
  } catch {
    return null;
  }
})();

export const useStore = create<AppStore>((set, get) => ({
  page: 'dashboard',
  setPage: (page) => set({ page }),

  viewMode: 'grid',
  setViewMode: (viewMode) => set({ viewMode }),

  selectedServer: null,
  setSelectedServer: (selectedServer) => {
    // Keep selectedServer in sync when servers update
    set({ selectedServer });
  },

  servers: [],
  setServers: (servers) => {
    const { selectedServer } = get();
    const updated = selectedServer
      ? (servers.find((s) => s.id === selectedServer.id) ?? selectedServer)
      : null;
    set({ servers, selectedServer: updated });
  },
  updateServers: (raws) => {
    // Called from WebSocket — merge live data preserving services[]
    const { servers: current, selectedServer } = get();
    const next = raws.map((raw) => {
      const existing = current.find((s) => s.id === String(raw.id));
      return {
        id: String(raw.id),
        hostname: raw.hostname,
        ipAddress: raw.ip_address,
        site: raw.site,
        osType: raw.os_type ?? existing?.osType ?? '',
        agentPort: raw.agent_port ?? existing?.agentPort ?? 5000,
        status: raw.status,
        vpnConnected: raw.vpn_connected,
        latencyMs: raw.latency_ms ?? null,
        cpu: raw.cpu ?? 0,
        ram: raw.ram ?? 0,
        disk: raw.disk ?? 0,
        uptimeSeconds: raw.uptime_seconds ?? 0,
        lastSeen: raw.last_seen ? new Date(raw.last_seen) : (existing?.lastSeen ?? new Date()),
        services: existing?.services ?? [],
        maintenanceUntil: raw.maintenance_until ? new Date(raw.maintenance_until) : null,
      } as Server;
    });
    const updatedSelected = selectedServer
      ? (next.find((s) => s.id === selectedServer.id) ?? selectedServer)
      : null;
    set({ servers: next, selectedServer: updatedSelected });
  },

  addServer: (server) => set((s) => ({ servers: [...s.servers, server] })),
  updateServer: (server) =>
    set((s) => ({
      servers: s.servers.map((sv) => (sv.id === server.id ? server : sv)),
      selectedServer: s.selectedServer?.id === server.id ? server : s.selectedServer,
    })),
  removeServer: (id) =>
    set((s) => ({
      servers: s.servers.filter((sv) => sv.id !== id),
      selectedServer: s.selectedServer?.id === id ? null : s.selectedServer,
    })),

  alerts: [],
  setAlerts: (alerts) => set({ alerts }),

  token: storedToken,
  user: storedUser,
  setAuth: (token, user) => {
    localStorage.setItem('sm_token', token);
    localStorage.setItem('sm_user', JSON.stringify(user));
    set({ token, user });
  },
  clearAuth: () => {
    localStorage.removeItem('sm_token');
    localStorage.removeItem('sm_user');
    set({ token: null, user: null, servers: [], alerts: [], wsConnected: false });
  },

  wsConnected: false,
  setWsConnected: (wsConnected) => set({ wsConnected }),

  callServerId: null,
  setCallServerId: (callServerId) => set({ callServerId }),

  loading: false,
  setLoading: (loading) => set({ loading }),
}));

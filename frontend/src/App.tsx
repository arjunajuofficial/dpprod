import { useEffect, useRef, useCallback } from 'react';
import { useStore } from './store/useStore';
import { api } from './api/client';
import { Sidebar } from './components/Sidebar';
import { UserMenu } from './components/UserMenu';
import { ServerDetailPanel } from './components/ServerDetailPanel';
import { LoginPage } from './pages/LoginPage';
import { MonitoringPage } from './pages/MonitoringPage';
import { AlertsPage } from './pages/AlertsPage';
import { MetricsPage } from './pages/MetricsPage';
import { SettingsPage } from './pages/SettingsPage';
import { CallSearchPage } from './pages/CallSearchPage';

const WS_URL = import.meta.env.VITE_WS_URL ||
  `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`;

export default function App() {
  const { token, user, clearAuth, setServers, setAlerts, setWsConnected, setLoading, page } = useStore();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [servers, alerts] = await Promise.all([api.servers(), api.alerts()]);
      setServers(servers);
      setAlerts(alerts);
    } catch (err: any) {
      if (err.message?.includes('401') || err.message?.includes('Invalid')) {
        clearAuth();
      }
    } finally {
      setLoading(false);
    }
  }, [clearAuth, setServers, setAlerts, setLoading]);

  const connectWs = useCallback((currentToken: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    const ws = new WebSocket(`${WS_URL}?token=${currentToken}`);
    wsRef.current = ws;
    ws.onopen = () => setWsConnected(true);
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'servers') {
          useStore.getState().updateServers(msg.data);
        }
      } catch {
        // ignore malformed frames
      }
    };
    ws.onclose = () => {
      setWsConnected(false);
      if (useStore.getState().token) {
        reconnectTimer.current = setTimeout(() => connectWs(currentToken), 5000);
      }
    };
    ws.onerror = () => ws.close();
  }, [setWsConnected]);

  // Forced logout on a 401 from anywhere in the app → bounce to login.
  useEffect(() => {
    const onUnauthorized = () => clearAuth();
    window.addEventListener('sm:unauthorized', onUnauthorized);
    return () => window.removeEventListener('sm:unauthorized', onUnauthorized);
  }, [clearAuth]);

  useEffect(() => {
    if (!token) return;
    fetchData();
    connectWs(token);
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [token, fetchData, connectWs]);

  if (!token || !user) {
    return <LoginPage />;
  }

  return (
    <div className="flex h-screen bg-[#0d1117] text-[#e6edf3] font-sans overflow-hidden">
      <Sidebar />
      <UserMenu />
      <div className="flex-1 min-w-0 overflow-hidden flex flex-col">
        {page === 'dashboard' && <MonitoringPage />}
        {page === 'alerts'    && <AlertsPage />}
        {page === 'metrics'   && <MetricsPage />}
        {page === 'calls'     && <CallSearchPage />}
        {page === 'settings'  && <SettingsPage onLogout={clearAuth} />}
        {page === 'users'     && <SettingsPage onLogout={clearAuth} focusSection="users" />}
      </div>
      <ServerDetailPanel />
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { api } from '../../api/client';
import {
  DiscoveredService, MonitorType, ServiceMonitor,
  ServiceMonitorCreatePayload, ServiceMonitorUpdatePayload,
} from '../../types/service';

interface Props {
  serverId: string;
  editing: ServiceMonitor | null;
  onClose: () => void;
  onSaved: () => void;
}

const TYPE_LABELS: Record<MonitorType, string> = {
  windows_service: 'Windows Service',
  process:         'Process',
  port:            'TCP Port',
  http:            'HTTP Health Check',
};

export function AddServiceModal({ serverId, editing, onClose, onSaved }: Props) {
  const [type, setType]             = useState<MonitorType>(editing?.monitor_type ?? 'windows_service');
  const [target, setTarget]         = useState(editing?.target_name ?? '');
  const [displayName, setDisplay]   = useState(editing?.display_name ?? '');
  const [alertEnabled, setAlert]    = useState(editing?.alert_enabled ?? true);
  const [isEnabled, setEnabled]     = useState(editing?.is_enabled ?? true);

  const [discovered, setDiscovered] = useState<DiscoveredService[]>([]);
  const [discovering, setDiscover]  = useState(false);
  const [discoverErr, setDiscoverErr] = useState('');
  const [search, setSearch]         = useState('');
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState('');

  const firstFocus = useRef<HTMLInputElement>(null);
  useEffect(() => { firstFocus.current?.focus(); }, []);

  const filteredServices = discovered.filter(
    (s) =>
      s.display_name.toLowerCase().includes(search.toLowerCase()) ||
      s.name.toLowerCase().includes(search.toLowerCase()),
  );

  async function handleDiscover() {
    setDiscover(true); setDiscoverErr('');
    try {
      const list = await api.services.discover(serverId);
      setDiscovered(list);
    } catch {
      setDiscoverErr('Could not reach agent. Make sure it is running on this server.');
    } finally {
      setDiscover(false);
    }
  }

  function selectService(svc: DiscoveredService) {
    setTarget(svc.name);
    setDisplay(svc.display_name || svc.name);
    setDiscovered([]);
    setSearch('');
  }

  async function handleSave() {
    if (!target.trim()) { setError('Target is required.'); return; }
    if (!displayName.trim()) { setError('Display name is required.'); return; }
    setSaving(true); setError('');
    try {
      if (editing) {
        const payload: ServiceMonitorUpdatePayload = {
          monitor_type: type, target_name: target.trim(),
          display_name: displayName.trim(), alert_enabled: alertEnabled, is_enabled: isEnabled,
        };
        await api.services.update(serverId, editing.id, payload);
      } else {
        const payload: ServiceMonitorCreatePayload = {
          monitor_type: type, target_name: target.trim(),
          display_name: displayName.trim(), alert_enabled: alertEnabled, is_enabled: isEnabled,
        };
        await api.services.create(serverId, payload);
      }
      onSaved();
    } catch (e: any) {
      setError(e.message ?? 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-[480px] max-h-[90vh] overflow-y-auto bg-[#161b22] border border-[#30363d] rounded-xl shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#21262d]">
          <span className="text-[14px] font-medium text-[#e6edf3]">
            {editing ? 'Edit Service Monitor' : 'Add Service Monitor'}
          </span>
          <button onClick={onClose} className="text-[#7d8590] hover:text-[#e6edf3] transition-colors">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Monitor Type */}
          <div>
            <label className="block text-[11px] text-[#7d8590] mb-1.5 uppercase tracking-wider">Monitor Type</label>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(TYPE_LABELS) as MonitorType[]).map((t) => (
                <button
                  key={t}
                  onClick={() => { setType(t); setTarget(''); setDisplay(''); setDiscovered([]); }}
                  className={`py-2 px-3 rounded text-[12px] border transition-colors text-left ${
                    type === t
                      ? 'border-[#388bfd] bg-[#388bfd22] text-[#79c0ff]'
                      : 'border-[#30363d] text-[#7d8590] hover:border-[#484f58]'
                  }`}
                >
                  {TYPE_LABELS[t]}
                </button>
              ))}
            </div>
          </div>

          {/* Target input — varies by type */}
          {type === 'windows_service' && (
            <div>
              <label className="block text-[11px] text-[#7d8590] mb-1.5 uppercase tracking-wider">Windows Service</label>
              <div className="flex gap-2 mb-2">
                <input
                  ref={firstFocus}
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  placeholder="MSSQLSERVER"
                  className="flex-1 bg-[#0d1117] border border-[#30363d] rounded px-3 py-2 text-[12px] text-[#e6edf3] font-mono focus:outline-none focus:border-[#388bfd]"
                />
                <button
                  onClick={handleDiscover}
                  disabled={discovering}
                  className="px-3 py-2 rounded border border-[#30363d] text-[11px] text-[#7d8590] hover:border-[#484f58] hover:text-[#e6edf3] disabled:opacity-50 whitespace-nowrap transition-colors"
                >
                  {discovering ? '…' : 'Discover'}
                </button>
              </div>
              {discoverErr && <p className="text-[11px] text-[#f85149] mb-2">{discoverErr}</p>}
              {discovered.length > 0 && (
                <div className="border border-[#30363d] rounded overflow-hidden">
                  <div className="px-2 py-1.5 border-b border-[#21262d]">
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search services…"
                      className="w-full bg-transparent text-[12px] text-[#e6edf3] focus:outline-none placeholder-[#484f58]"
                    />
                  </div>
                  <div className="max-h-48 overflow-y-auto">
                    {filteredServices.map((svc) => (
                      <button
                        key={svc.name}
                        onClick={() => selectService(svc)}
                        className="w-full flex items-center justify-between px-3 py-2 hover:bg-[#21262d] transition-colors text-left"
                      >
                        <div>
                          <div className="text-[12px] text-[#e6edf3]">{svc.display_name}</div>
                          <div className="text-[10px] text-[#7d8590] font-mono">{svc.name}</div>
                        </div>
                        <span
                          className="text-[10px] px-2 py-0.5 rounded-full border"
                          style={{
                            color: svc.status === 'running' ? '#00d4aa' : '#f85149',
                            borderColor: (svc.status === 'running' ? '#00d4aa' : '#f85149') + '44',
                            backgroundColor: (svc.status === 'running' ? '#00d4aa' : '#f85149') + '15',
                          }}
                        >
                          {svc.status}
                        </span>
                      </button>
                    ))}
                    {filteredServices.length === 0 && (
                      <p className="text-[11px] text-[#7d8590] px-3 py-3">No services match.</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {type === 'process' && (
            <div>
              <label className="block text-[11px] text-[#7d8590] mb-1.5 uppercase tracking-wider">Process Name</label>
              <input
                ref={firstFocus}
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder="nginx.exe"
                className="w-full bg-[#0d1117] border border-[#30363d] rounded px-3 py-2 text-[12px] text-[#e6edf3] font-mono focus:outline-none focus:border-[#388bfd]"
              />
            </div>
          )}

          {type === 'port' && (
            <div>
              <label className="block text-[11px] text-[#7d8590] mb-1.5 uppercase tracking-wider">TCP Port</label>
              <input
                ref={firstFocus}
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder="1433"
                type="number"
                min="1" max="65535"
                className="w-full bg-[#0d1117] border border-[#30363d] rounded px-3 py-2 text-[12px] text-[#e6edf3] font-mono focus:outline-none focus:border-[#388bfd]"
              />
            </div>
          )}

          {type === 'http' && (
            <div>
              <label className="block text-[11px] text-[#7d8590] mb-1.5 uppercase tracking-wider">Health Check URL</label>
              <input
                ref={firstFocus}
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder="http://localhost:8080/health"
                className="w-full bg-[#0d1117] border border-[#30363d] rounded px-3 py-2 text-[12px] text-[#e6edf3] font-mono focus:outline-none focus:border-[#388bfd]"
              />
              <p className="text-[10px] text-[#7d8590] mt-1">
                Use <code className="text-[#79c0ff]">localhost</code> — it will be replaced with the server's IP at check time.
              </p>
            </div>
          )}

          {/* Display Name */}
          <div>
            <label className="block text-[11px] text-[#7d8590] mb-1.5 uppercase tracking-wider">Display Name</label>
            <input
              value={displayName}
              onChange={(e) => setDisplay(e.target.value)}
              placeholder="SQL Server"
              className="w-full bg-[#0d1117] border border-[#30363d] rounded px-3 py-2 text-[12px] text-[#e6edf3] focus:outline-none focus:border-[#388bfd]"
            />
          </div>

          {/* Toggles */}
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={alertEnabled}
                onChange={(e) => setAlert(e.target.checked)}
                className="accent-[#388bfd]"
              />
              <span className="text-[12px] text-[#7d8590]">Alert on state change</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isEnabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="accent-[#388bfd]"
              />
              <span className="text-[12px] text-[#7d8590]">Enabled</span>
            </label>
          </div>

          {error && <p className="text-[11px] text-[#f85149]">{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-[#21262d]">
          <button
            onClick={onClose}
            className="px-4 py-2 text-[12px] text-[#7d8590] hover:text-[#e6edf3] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-[12px] rounded bg-[#238636] hover:bg-[#2ea043] text-white disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving…' : editing ? 'Save Changes' : 'Add Monitor'}
          </button>
        </div>
      </div>
    </div>
  );
}

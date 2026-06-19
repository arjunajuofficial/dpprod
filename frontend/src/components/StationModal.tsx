import { useState, useEffect, useRef } from 'react';
import { Server } from '../types/server';
import { api } from '../api/client';
import { useStore } from '../store/useStore';

const OS_OPTIONS = [
  'Windows Server 2022',
  'Windows Server 2019',
  'Windows Server 2016',
  'Windows 10',
  'Windows 11',
];

interface Props {
  mode: 'add' | 'edit';
  server?: Server;
  onClose: () => void;
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] text-[#7d8590] mb-1.5 uppercase tracking-wide">{label}</label>
      {children}
      {error && <p className="text-[11px] text-[#f85149] mt-1">{error}</p>}
    </div>
  );
}

function Input({ value, onChange, placeholder, monospace, type = 'text' }: {
  value: string; onChange: (v: string) => void;
  placeholder?: string; monospace?: boolean; type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={`w-full bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-2 text-[12px] text-[#e6edf3] placeholder-[#7d8590] focus:outline-none focus:border-[#00d4aa55] focus:ring-1 focus:ring-[#00d4aa33] ${monospace ? 'font-mono' : ''}`}
    />
  );
}

export function StationModal({ mode, server, onClose }: Props) {
  const { addServer, updateServer, servers } = useStore();

  const [hostname, setHostname] = useState(server?.hostname ?? '');
  const [ipAddress, setIpAddress] = useState(server?.ipAddress ?? '');
  const [site, setSite] = useState(server?.site ?? '');
  const [osType, setOsType] = useState(server?.osType ?? 'Windows Server 2022');
  const [agentPort, setAgentPort] = useState(String(server?.agentPort ?? 5000));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [apiError, setApiError] = useState('');

  // Unique existing sites for datalist suggestions
  const existingSites = [...new Set(servers.map((s) => s.site).filter(Boolean))].sort();

  const firstRef = useRef<HTMLInputElement>(null);
  useEffect(() => { firstRef.current?.focus(); }, []);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  function validate() {
    const errs: Record<string, string> = {};
    if (!hostname.trim()) errs.hostname = 'Required';
    if (!ipAddress.trim()) errs.ipAddress = 'Required';
    else if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(ipAddress.trim())) errs.ipAddress = 'Invalid IP format';
    const port = parseInt(agentPort, 10);
    if (isNaN(port) || port < 1 || port > 65535) errs.agentPort = 'Must be 1–65535';
    return errs;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    setErrors({});
    setApiError('');
    setSaving(true);
    try {
      const payload = {
        hostname: hostname.trim(),
        ip_address: ipAddress.trim(),
        site: site.trim(),
        os_type: osType,
        agent_port: parseInt(agentPort, 10),
      };
      if (mode === 'add') {
        const created = await api.createServer(payload);
        addServer(created);
      } else {
        const updated = await api.updateServer(server!.id, payload);
        updateServer(updated);
      }
      onClose();
    } catch (err: any) {
      setApiError(err.message ?? 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl w-full max-w-md mx-4 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#21262d]">
          <h2 className="text-[14px] font-semibold text-[#e6edf3]">
            {mode === 'add' ? 'Add Station' : 'Edit Station'}
          </h2>
          <button onClick={onClose} className="text-[#7d8590] hover:text-[#e6edf3] transition-colors">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Hostname *" error={errors.hostname}>
              <input
                ref={firstRef}
                type="text"
                value={hostname}
                onChange={(e) => setHostname(e.target.value)}
                placeholder="PROD-WIN-01"
                className="w-full bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-2 text-[12px] text-[#e6edf3] placeholder-[#7d8590] focus:outline-none focus:border-[#00d4aa55] focus:ring-1 focus:ring-[#00d4aa33] font-mono"
              />
            </Field>
            <Field label="IP Address *" error={errors.ipAddress}>
              <Input value={ipAddress} onChange={setIpAddress} placeholder="10.10.1.11" monospace />
            </Field>
          </div>

          <Field label="Site">
            <input
              list="site-suggestions"
              value={site}
              onChange={(e) => setSite(e.target.value)}
              placeholder="Site A"
              className="w-full bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-2 text-[12px] text-[#e6edf3] placeholder-[#7d8590] focus:outline-none focus:border-[#00d4aa55] focus:ring-1 focus:ring-[#00d4aa33]"
            />
            <datalist id="site-suggestions">
              {existingSites.map((s) => <option key={s} value={s} />)}
            </datalist>
          </Field>

          <Field label="OS Type">
            <select
              value={osType}
              onChange={(e) => setOsType(e.target.value)}
              className="w-full bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-2 text-[12px] text-[#e6edf3] focus:outline-none focus:border-[#00d4aa55]"
            >
              {OS_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </Field>

          <Field label="Agent Port" error={errors.agentPort}>
            <Input value={agentPort} onChange={setAgentPort} placeholder="5000" monospace type="number" />
          </Field>

          {apiError && (
            <p className="text-[12px] text-[#f85149] bg-[#f8514911] border border-[#f8514933] rounded px-3 py-2">
              {apiError}
            </p>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2 rounded-md text-[12px] font-medium bg-[#00d4aa22] text-[#00d4aa] border border-[#00d4aa44] hover:bg-[#00d4aa33] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? 'Saving…' : mode === 'add' ? 'Add Station' : 'Save Changes'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-md text-[12px] text-[#7d8590] border border-[#30363d] hover:text-[#e6edf3] hover:border-[#7d8590] transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

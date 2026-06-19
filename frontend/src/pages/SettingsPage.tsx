import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../api/client';
import { useStore } from '../store/useStore';
import { UserManagement } from '../components/settings/UserManagement';
import { AuditLogSection } from '../components/settings/AuditLogSection';

interface ToggleProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}

function Toggle({ checked, onChange, disabled }: ToggleProps) {
  return (
    <button
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={`w-9 h-5 rounded-full relative transition-colors duration-200 ${
        disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
      } ${checked ? 'bg-[#00d4aa]' : 'bg-[#30363d]'}`}
    >
      <div
        className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${checked ? 'translate-x-4' : 'translate-x-0.5'}`}
      />
    </button>
  );
}

interface InputProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  monospace?: boolean;
  disabled?: boolean;
  password?: boolean;
}

function LabeledInput({ label, value, onChange, type = 'text', placeholder, monospace, disabled, password }: InputProps) {
  const [show, setShow] = useState(false);
  const inputType = password ? (show ? 'text' : 'password') : type;
  return (
    <div>
      <label className="block text-[11px] text-[#7d8590] mb-1.5 uppercase tracking-wide">{label}</label>
      <div className="relative">
        <input
          type={inputType}
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className={`
            w-full bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-2
            text-[12px] text-[#e6edf3] placeholder-[#7d8590]
            focus:outline-none focus:border-[#00d4aa55] focus:ring-1 focus:ring-[#00d4aa33]
            disabled:opacity-40 disabled:cursor-not-allowed
            ${monospace ? 'font-mono' : ''}
            ${password ? 'pr-10' : ''}
          `}
        />
        {password && (
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-[#7d8590] hover:text-[#e6edf3] text-[10px]"
          >
            {show ? 'hide' : 'show'}
          </button>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-[#161b22] border border-[#21262d] rounded-lg p-5">
      <h2 className="text-[13px] font-medium text-[#e6edf3] mb-4">{title}</h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function SettingRow({ label, desc, children }: { label: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex-1">
        <div className="text-[12px] text-[#e6edf3]">{label}</div>
        {desc && <div className="text-[11px] text-[#7d8590] mt-0.5">{desc}</div>}
      </div>
      {children}
    </div>
  );
}

// Default columns shown when no preference is saved
const DEFAULT_VISIBLE = ['CVSSDT', 'CVSEDT', 'CVSC01', 'CVSC00', 'CVSDIR', 'CVSLCT'];

export function SettingsPage({ onLogout, focusSection }: { onLogout?: () => void; focusSection?: 'users' }) {
  const { servers, user } = useStore();
  const isAdmin = user?.role === 'admin';
  const usersRef = useRef<HTMLDivElement | null>(null);

  // When opened via the sidebar "Users" shortcut, scroll user management into view.
  useEffect(() => {
    if (focusSection === 'users' && isAdmin) {
      // Defer until the section has rendered.
      const t = setTimeout(() => usersRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
      return () => clearTimeout(t);
    }
  }, [focusSection, isAdmin]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedIndicator, setSavedIndicator] = useState(false);
  const [testSmsState, setTestSmsState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [testEmailState, setTestEmailState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [testWebhookState, setTestWebhookState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  // Email notifications
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState('587');
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPassword, setSmtpPassword] = useState('');
  const [smtpTls, setSmtpTls] = useState(true);
  const [emailFrom, setEmailFrom] = useState('');
  const [emailTo, setEmailTo] = useState('');

  // Webhook notifications
  const [webhookEnabled, setWebhookEnabled] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState('');

  // Data retention
  const [metricsRetention, setMetricsRetention] = useState('30');
  const [alertsRetention, setAlertsRetention] = useState('90');
  const [smsRetention, setSmsRetention] = useState('90');
  const [eventsRetention, setEventsRetention] = useState('30');
  const [auditRetention, setAuditRetention] = useState('180');

  // Change own password
  const [curPw, setCurPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [pwState, setPwState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [pwError, setPwError] = useState('');

  // SMS Gateway
  const [smsEnabled, setSmsEnabled] = useState(true);
  const [smsOnRecovery, setSmsOnRecovery] = useState(true);
  const [rateLimitEnabled, setRateLimitEnabled] = useState(true);
  const [rateWindow, setRateWindow] = useState('300');
  const [tg100Host, setTg100Host] = useState('192.168.1.250');
  const [tg100GsmPort, setTg100GsmPort] = useState('1');
  const [tg100Username, setTg100Username] = useState('apiuser');
  const [tg100Password, setTg100Password] = useState('apipass');
  const [smsDest, setSmsDest] = useState('+91XXXXXXXXXX');

  // Monitoring
  const [pingInterval, setPingInterval] = useState('15');
  const [agentInterval, setAgentInterval] = useState('30');
  const [metricsInterval, setMetricsInterval] = useState('60');
  const [offlineThreshold, setOfflineThreshold] = useState('3');
  const [watchEventIds, setWatchEventIds] = useState('6008');

  // Thresholds
  const [cpuThreshold, setCpuThreshold] = useState('85');
  const [ramThreshold, setRamThreshold] = useState('85');
  const [diskThreshold, setDiskThreshold] = useState('90');
  const [latencyThreshold, setLatencyThreshold] = useState('100');

  // Call column visibility
  const [colServerId, setColServerId] = useState('');
  const [allColumns, setAllColumns] = useState<{ name: string; type: string }[]>([]);
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(new Set(DEFAULT_VISIBLE));
  const [colsLoading, setColsLoading] = useState(false);
  const [colsError, setColsError] = useState('');

  // Call search credentials
  const [dbUser, setDbUser] = useState('pbxuser');
  const [dbPassword, setDbPassword] = useState('');
  const [dbName, setDbName] = useState('pbxdb');
  const [dbPort, setDbPort] = useState('3306');
  const [sshUser, setSshUser] = useState('root');
  const [sshPassword, setSshPassword] = useState('');
  const [sshPort, setSshPort] = useState('22');
  const [recordingsRoot, setRecordingsRoot] = useState('D:/');

  useEffect(() => {
    api.settings.get()
      .then((cfg) => {
        setSmsEnabled(cfg.sms_enabled !== 'false');
        setSmsOnRecovery(cfg.sms_on_recovery !== 'false');
        setRateLimitEnabled(cfg.sms_rate_limit !== 'false');
        setRateWindow(cfg.sms_rate_window ?? '300');
        setTg100Host(cfg.tg100_host ?? '192.168.1.250');
        setTg100GsmPort(cfg.tg100_gsm_port ?? '1');
        setTg100Username(cfg.tg100_username ?? 'apiuser');
        setTg100Password(cfg.tg100_password ?? 'apipass');
        setSmsDest(cfg.sms_destination ?? '+91XXXXXXXXXX');
        setPingInterval(cfg.ping_interval ?? '15');
        setAgentInterval(cfg.agent_interval ?? '30');
        setMetricsInterval(cfg.metrics_interval ?? '60');
        setOfflineThreshold(cfg.offline_threshold ?? '3');
        setWatchEventIds(cfg.watch_event_ids ?? '6008');
        setCpuThreshold(cfg.cpu_threshold ?? '85');
        setRamThreshold(cfg.ram_threshold ?? '85');
        setDiskThreshold(cfg.disk_threshold ?? '90');
        setLatencyThreshold(cfg.latency_threshold ?? '100');
        setDbUser(cfg.db_user ?? 'pbxuser');
        setDbPassword(cfg.db_password ?? '');
        setDbName(cfg.db_name ?? 'pbxdb');
        setDbPort(cfg.db_port ?? '3306');
        setSshUser(cfg.ssh_user ?? 'root');
        setSshPassword(cfg.ssh_password ?? '');
        setSshPort(cfg.ssh_port ?? '22');
        setRecordingsRoot(cfg.recordings_root ?? 'D:/');
        if (cfg.call_columns_visible) {
          setVisibleColumns(new Set(cfg.call_columns_visible.split(',')));
        }
        setEmailEnabled(cfg.email_enabled === 'true');
        setSmtpHost(cfg.smtp_host ?? '');
        setSmtpPort(cfg.smtp_port ?? '587');
        setSmtpUser(cfg.smtp_user ?? '');
        setSmtpPassword(cfg.smtp_password ?? '');
        setSmtpTls(cfg.smtp_tls !== 'false');
        setEmailFrom(cfg.email_from ?? '');
        setEmailTo(cfg.email_to ?? '');
        setWebhookEnabled(cfg.webhook_enabled === 'true');
        setWebhookUrl(cfg.webhook_url ?? '');
        setMetricsRetention(cfg.metrics_retention_days ?? '30');
        setAlertsRetention(cfg.alerts_retention_days ?? '90');
        setSmsRetention(cfg.sms_retention_days ?? '90');
        setEventsRetention(cfg.events_retention_days ?? '30');
        setAuditRetention(cfg.audit_retention_days ?? '180');
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      await api.settings.save({
        sms_enabled: smsEnabled ? 'true' : 'false',
        sms_on_recovery: smsOnRecovery ? 'true' : 'false',
        sms_rate_limit: rateLimitEnabled ? 'true' : 'false',
        sms_rate_window: rateWindow,
        tg100_host: tg100Host,
        tg100_gsm_port: tg100GsmPort,
        tg100_username: tg100Username,
        tg100_password: tg100Password,
        sms_destination: smsDest,
        ping_interval: pingInterval,
        agent_interval: agentInterval,
        metrics_interval: metricsInterval,
        offline_threshold: offlineThreshold,
        watch_event_ids: watchEventIds,
        cpu_threshold: cpuThreshold,
        ram_threshold: ramThreshold,
        disk_threshold: diskThreshold,
        latency_threshold: latencyThreshold,
        db_user: dbUser,
        db_password: dbPassword,
        db_name: dbName,
        db_port: dbPort,
        ssh_user: sshUser,
        ssh_password: sshPassword,
        ssh_port: sshPort,
        recordings_root: recordingsRoot,
        call_columns_visible: Array.from(visibleColumns).join(','),
        email_enabled: emailEnabled ? 'true' : 'false',
        smtp_host: smtpHost,
        smtp_port: smtpPort,
        smtp_user: smtpUser,
        smtp_password: smtpPassword,
        smtp_tls: smtpTls ? 'true' : 'false',
        email_from: emailFrom,
        email_to: emailTo,
        webhook_enabled: webhookEnabled ? 'true' : 'false',
        webhook_url: webhookUrl,
        metrics_retention_days: metricsRetention,
        alerts_retention_days: alertsRetention,
        sms_retention_days: smsRetention,
        events_retention_days: eventsRetention,
        audit_retention_days: auditRetention,
      });
      setSavedIndicator(true);
      setTimeout(() => setSavedIndicator(false), 2500);
    } catch {
      // silent — user will notice Save didn't turn green
    } finally {
      setSaving(false);
    }
  }

  async function handleTestSms() {
    setTestSmsState('sending');
    try {
      await api.sms.test();
      setTestSmsState('sent');
      setTimeout(() => setTestSmsState('idle'), 3000);
    } catch {
      setTestSmsState('error');
      setTimeout(() => setTestSmsState('idle'), 3000);
    }
  }

  const fetchColumns = useCallback(async (sid: string) => {
    if (!sid) return;
    setColsLoading(true);
    setColsError('');
    setAllColumns([]);
    try {
      const cols = await api.calls.columns(sid);
      setAllColumns(cols);
    } catch (err: any) {
      setColsError(err.message ?? 'Failed to fetch columns');
    } finally {
      setColsLoading(false);
    }
  }, []);

  async function handleTestEmail() {
    setTestEmailState('sending');
    try {
      const r = await api.notifications.testEmail();
      setTestEmailState(r.ok ? 'sent' : 'error');
    } catch {
      setTestEmailState('error');
    }
    setTimeout(() => setTestEmailState('idle'), 3000);
  }

  async function handleTestWebhook() {
    setTestWebhookState('sending');
    try {
      const r = await api.notifications.testWebhook();
      setTestWebhookState(r.ok ? 'sent' : 'error');
    } catch {
      setTestWebhookState('error');
    }
    setTimeout(() => setTestWebhookState('idle'), 3000);
  }

  async function handleChangePassword() {
    setPwError('');
    if (newPw.length < 8) { setPwError('New password must be at least 8 characters'); return; }
    setPwState('saving');
    try {
      await api.users.changePassword(curPw, newPw);
      setPwState('saved');
      setCurPw(''); setNewPw('');
    } catch (e: any) {
      setPwState('error');
      setPwError(e.message ?? 'Failed to change password');
    }
    setTimeout(() => setPwState('idle'), 3000);
  }

  const testLabel = {
    idle: 'Send Test SMS',
    sending: 'Sending…',
    sent: 'Queued!',
    error: 'Failed',
  }[testSmsState];

  const channelTestLabel = (s: 'idle' | 'sending' | 'sent' | 'error', idle: string) =>
    ({ idle, sending: 'Testing…', sent: 'OK!', error: 'Failed' }[s]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-[#161b22] border-b border-[#21262d] px-5 py-3 pr-[168px] flex items-center justify-between">
        <div>
          <h1 className="text-[15px] font-medium text-[#e6edf3]">Settings</h1>
          <p className="text-[11px] text-[#7d8590] mt-0.5">Monitoring thresholds, SMS gateway, and alert rules</p>
        </div>
        {isAdmin && <button
          onClick={handleSave}
          disabled={saving || loading}
          className={`
            text-[12px] px-4 py-1.5 rounded-md border font-medium transition-all duration-200
            disabled:opacity-40 disabled:cursor-not-allowed
            ${savedIndicator
              ? 'bg-[#3fb95022] text-[#3fb950] border-[#3fb95044]'
              : 'bg-[#00d4aa22] text-[#00d4aa] border-[#00d4aa44] hover:bg-[#00d4aa33]'}
          `}
        >
          {saving ? 'Saving…' : savedIndicator ? 'Saved!' : 'Save Changes'}
        </button>}
        {!isAdmin && (
          <span className="text-[11px] text-[#7d8590]">Read-only — admin role required to change settings</span>
        )}
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center text-[#7d8590] text-[12px]">
          Loading settings…
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 max-w-2xl">

          <Section title="SMS Gateway — Yeastar TG100">
            <SettingRow label="Enable SMS Alerts" desc="Send SMS when servers go offline or recover">
              <Toggle checked={smsEnabled} onChange={setSmsEnabled} />
            </SettingRow>
            <SettingRow label="Send Recovery SMS" desc="Also send SMS when a server comes back online">
              <Toggle checked={smsOnRecovery} onChange={setSmsOnRecovery} disabled={!smsEnabled} />
            </SettingRow>
            <SettingRow label="Rate Limiting" desc="Prevent duplicate SMS per server within the configured window">
              <Toggle checked={rateLimitEnabled} onChange={setRateLimitEnabled} disabled={!smsEnabled} />
            </SettingRow>
            <SettingRow label="Rate Limit Window" desc="Seconds between allowed SMS per server (e.g. 300 = 5 min, 60 = 1 min, 0 = unlimited)">
              <LabeledInput label="" value={rateWindow} onChange={setRateWindow} placeholder="300" monospace disabled={!rateLimitEnabled || !smsEnabled} />
            </SettingRow>
            <div className="grid grid-cols-2 gap-4">
              <LabeledInput label="TG100 Host" value={tg100Host} onChange={setTg100Host} placeholder="192.168.1.x" monospace />
              <LabeledInput label="GSM Port" value={tg100GsmPort} onChange={setTg100GsmPort} placeholder="1" monospace />
              <LabeledInput label="API Username" value={tg100Username} onChange={setTg100Username} monospace />
              <LabeledInput label="API Password" value={tg100Password} onChange={setTg100Password} monospace password />
            </div>
            <LabeledInput label="Destination Number" value={smsDest} onChange={setSmsDest} placeholder="+91XXXXXXXXXX" monospace />
            <div className="flex items-center gap-3 pt-1">
              <button
                onClick={handleTestSms}
                disabled={testSmsState === 'sending' || !smsEnabled}
                className={`
                  text-[12px] px-4 py-1.5 rounded-md border font-medium transition-all duration-200
                  disabled:opacity-40 disabled:cursor-not-allowed
                  ${testSmsState === 'sent'
                    ? 'bg-[#3fb95022] text-[#3fb950] border-[#3fb95044]'
                    : testSmsState === 'error'
                    ? 'bg-[#f8514922] text-[#f85149] border-[#f8514944]'
                    : 'bg-[#21262d] text-[#7d8590] border-[#30363d] hover:text-[#e6edf3] hover:border-[#7d8590]'}
                `}
              >
                {testLabel}
              </button>
              <span className="text-[11px] text-[#7d8590]">
                Sends a test message to {smsDest}
              </span>
            </div>
          </Section>

          <Section title="Monitoring Intervals">
            <div className="grid grid-cols-2 gap-4">
              <LabeledInput label="Ping Interval (sec)" value={pingInterval} onChange={setPingInterval} type="number" />
              <LabeledInput label="Agent Poll (sec)" value={agentInterval} onChange={setAgentInterval} type="number" />
              <LabeledInput label="Metrics Poll (sec)" value={metricsInterval} onChange={setMetricsInterval} type="number" />
              <LabeledInput label="Failures before Offline" value={offlineThreshold} onChange={setOfflineThreshold} type="number" />
              <LabeledInput label="Watch Event IDs" value={watchEventIds} onChange={setWatchEventIds} placeholder="6008" monospace />
            </div>
            <div className="text-[11px] text-[#7d8590] bg-[#0d1117] rounded px-3 py-2 mt-1">
              Offline detection: {offlineThreshold} consecutive ping failures → mark offline → send SMS alert
            </div>
          </Section>

          <Section title="Call Search — PBX Database &amp; SSH">
            <div className="text-[11px] text-[#7d8590] bg-[#0d1117] rounded px-3 py-2">
              Shared credentials used to connect to all PBX servers for call record queries and recording retrieval.
            </div>
            <div className="grid grid-cols-2 gap-4">
              <LabeledInput label="MySQL User" value={dbUser} onChange={setDbUser} monospace />
              <LabeledInput label="MySQL Password" value={dbPassword} onChange={setDbPassword} monospace password />
              <LabeledInput label="Database Name" value={dbName} onChange={setDbName} monospace />
              <LabeledInput label="MySQL Port" value={dbPort} onChange={setDbPort} type="number" monospace />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <LabeledInput label="SSH User" value={sshUser} onChange={setSshUser} monospace />
              <LabeledInput label="SSH Password" value={sshPassword} onChange={setSshPassword} monospace password />
              <LabeledInput label="SSH Port" value={sshPort} onChange={setSshPort} type="number" monospace />
              <LabeledInput label="Recordings Root Path" value={recordingsRoot} onChange={setRecordingsRoot} placeholder="D:/" monospace />
            </div>
          </Section>

          <Section title="Call Dashboard — Visible Columns">
            <div className="text-[11px] text-[#7d8590] bg-[#0d1117] rounded px-3 py-2">
              Select a PBX server to load its table columns, then toggle which ones appear in the Call Search results.
            </div>

            {/* Server picker + Load button */}
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <label className="block text-[10px] text-[#7d8590] uppercase tracking-wide mb-1.5">PBX Server</label>
                <select
                  value={colServerId}
                  onChange={(e) => setColServerId(e.target.value)}
                  className="w-full bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-2 text-[12px] text-[#e6edf3] focus:outline-none focus:border-[#00d4aa55]"
                >
                  <option value="">— Select a server —</option>
                  {servers.map((s) => (
                    <option key={s.id} value={s.id}>{s.hostname} ({s.site})</option>
                  ))}
                </select>
              </div>
              <button
                onClick={() => fetchColumns(colServerId)}
                disabled={!colServerId || colsLoading}
                className="text-[12px] px-4 py-2 rounded-md border font-medium transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed bg-[#21262d] text-[#7d8590] border-[#30363d] hover:text-[#e6edf3] hover:border-[#7d8590]"
              >
                {colsLoading ? 'Loading…' : 'Load Columns'}
              </button>
            </div>

            {colsError && (
              <div className="text-[12px] text-[#f85149] bg-[#f8514911] border border-[#f8514933] rounded px-3 py-2">
                {colsError}
              </div>
            )}

            {allColumns.length > 0 && (
              <>
                {/* Select all / none */}
                <div className="flex items-center gap-3 text-[11px]">
                  <button
                    onClick={() => setVisibleColumns(new Set(allColumns.map((c) => c.name)))}
                    className="text-[#00d4aa] hover:underline"
                  >
                    Select all
                  </button>
                  <span className="text-[#30363d]">|</span>
                  <button
                    onClick={() => setVisibleColumns(new Set())}
                    className="text-[#7d8590] hover:text-[#e6edf3] hover:underline"
                  >
                    Clear all
                  </button>
                  <span className="text-[#7d8590] ml-auto">{visibleColumns.size} of {allColumns.length} selected</span>
                </div>

                {/* Column grid */}
                <div className="grid grid-cols-2 gap-1.5 max-h-72 overflow-y-auto pr-1">
                  {allColumns.map((col) => {
                    const on = visibleColumns.has(col.name);
                    return (
                      <button
                        key={col.name}
                        onClick={() => {
                          setVisibleColumns((prev) => {
                            const next = new Set(prev);
                            on ? next.delete(col.name) : next.add(col.name);
                            return next;
                          });
                        }}
                        className={`flex items-center justify-between gap-2 px-3 py-2 rounded-md border text-left transition-colors ${
                          on
                            ? 'bg-[#00d4aa11] border-[#00d4aa33] text-[#e6edf3]'
                            : 'bg-[#0d1117] border-[#21262d] text-[#7d8590] hover:border-[#30363d] hover:text-[#e6edf3]'
                        }`}
                      >
                        <div>
                          <div className="text-[12px] font-mono">{col.name}</div>
                          <div className="text-[10px] text-[#7d8590] mt-0.5">{col.type}</div>
                        </div>
                        <div className={`w-2 h-2 rounded-full shrink-0 ${on ? 'bg-[#00d4aa]' : 'bg-[#30363d]'}`} />
                      </button>
                    );
                  })}
                </div>
                <div className="text-[11px] text-[#7d8590]">
                  Changes apply after clicking <span className="text-[#e6edf3]">Save Changes</span> above.
                </div>
              </>
            )}
          </Section>

          <Section title="Alert Thresholds">
            <div className="grid grid-cols-2 gap-4">
              <LabeledInput label="CPU Warning (%)" value={cpuThreshold} onChange={setCpuThreshold} type="number" />
              <LabeledInput label="RAM Warning (%)" value={ramThreshold} onChange={setRamThreshold} type="number" />
              <LabeledInput label="Disk Warning (%)" value={diskThreshold} onChange={setDiskThreshold} type="number" />
              <LabeledInput label="Latency Warning (ms)" value={latencyThreshold} onChange={setLatencyThreshold} type="number" />
            </div>
          </Section>

          <Section title="Email Notifications — SMTP">
            <SettingRow label="Enable Email Alerts" desc="Send alert emails in addition to SMS">
              <Toggle checked={emailEnabled} onChange={setEmailEnabled} />
            </SettingRow>
            <div className="grid grid-cols-2 gap-4">
              <LabeledInput label="SMTP Host" value={smtpHost} onChange={setSmtpHost} placeholder="smtp.gmail.com" monospace disabled={!emailEnabled} />
              <LabeledInput label="SMTP Port" value={smtpPort} onChange={setSmtpPort} type="number" monospace disabled={!emailEnabled} />
              <LabeledInput label="SMTP Username" value={smtpUser} onChange={setSmtpUser} monospace disabled={!emailEnabled} />
              <LabeledInput label="SMTP Password" value={smtpPassword} onChange={setSmtpPassword} monospace password disabled={!emailEnabled} />
              <LabeledInput label="From Address" value={emailFrom} onChange={setEmailFrom} placeholder="noc@company.com" monospace disabled={!emailEnabled} />
              <LabeledInput label="To (comma-separated)" value={emailTo} onChange={setEmailTo} placeholder="ops@company.com" monospace disabled={!emailEnabled} />
            </div>
            <SettingRow label="Use STARTTLS" desc="Recommended for port 587">
              <Toggle checked={smtpTls} onChange={setSmtpTls} disabled={!emailEnabled} />
            </SettingRow>
            <div className="flex items-center gap-3 pt-1">
              <button
                onClick={handleTestEmail}
                disabled={testEmailState === 'sending' || !emailEnabled}
                className={`text-[12px] px-4 py-1.5 rounded-md border font-medium transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed ${
                  testEmailState === 'sent' ? 'bg-[#3fb95022] text-[#3fb950] border-[#3fb95044]'
                  : testEmailState === 'error' ? 'bg-[#f8514922] text-[#f85149] border-[#f8514944]'
                  : 'bg-[#21262d] text-[#7d8590] border-[#30363d] hover:text-[#e6edf3] hover:border-[#7d8590]'}`}
              >
                {channelTestLabel(testEmailState, 'Send Test Email')}
              </button>
              <span className="text-[11px] text-[#7d8590]">Save settings first, then test</span>
            </div>
          </Section>

          <Section title="Webhook Notifications">
            <SettingRow label="Enable Webhook" desc="POST alert JSON to Slack, Teams, Discord, or any HTTP endpoint">
              <Toggle checked={webhookEnabled} onChange={setWebhookEnabled} />
            </SettingRow>
            <LabeledInput label="Webhook URL" value={webhookUrl} onChange={setWebhookUrl}
              placeholder="https://hooks.slack.com/services/…" monospace disabled={!webhookEnabled} />
            <div className="flex items-center gap-3 pt-1">
              <button
                onClick={handleTestWebhook}
                disabled={testWebhookState === 'sending' || !webhookEnabled}
                className={`text-[12px] px-4 py-1.5 rounded-md border font-medium transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed ${
                  testWebhookState === 'sent' ? 'bg-[#3fb95022] text-[#3fb950] border-[#3fb95044]'
                  : testWebhookState === 'error' ? 'bg-[#f8514922] text-[#f85149] border-[#f8514944]'
                  : 'bg-[#21262d] text-[#7d8590] border-[#30363d] hover:text-[#e6edf3] hover:border-[#7d8590]'}`}
              >
                {channelTestLabel(testWebhookState, 'Send Test Webhook')}
              </button>
              <span className="text-[11px] text-[#7d8590]">Save settings first, then test</span>
            </div>
          </Section>

          <Section title="Data Retention">
            <div className="text-[11px] text-[#7d8590] bg-[#0d1117] rounded px-3 py-2">
              Old rows are pruned automatically every hour. Set 0 to keep forever. Active (unresolved) alerts are never pruned.
            </div>
            <div className="grid grid-cols-2 gap-4">
              <LabeledInput label="Metrics (days)" value={metricsRetention} onChange={setMetricsRetention} type="number" />
              <LabeledInput label="Resolved Alerts (days)" value={alertsRetention} onChange={setAlertsRetention} type="number" />
              <LabeledInput label="SMS Logs (days)" value={smsRetention} onChange={setSmsRetention} type="number" />
              <LabeledInput label="Event Logs (days)" value={eventsRetention} onChange={setEventsRetention} type="number" />
              <LabeledInput label="Audit Log (days)" value={auditRetention} onChange={setAuditRetention} type="number" />
            </div>
          </Section>

          {isAdmin && (
            <div ref={usersRef}>
              <Section title="User Management">
                <UserManagement />
              </Section>
            </div>
          )}

          <Section title="Account — Change Password">
            <div className="grid grid-cols-2 gap-4">
              <LabeledInput label="Current Password" value={curPw} onChange={setCurPw} password monospace />
              <LabeledInput label="New Password (min 8)" value={newPw} onChange={setNewPw} password monospace />
            </div>
            {pwError && (
              <div className="text-[12px] text-[#f85149]">{pwError}</div>
            )}
            <button
              onClick={handleChangePassword}
              disabled={pwState === 'saving' || !curPw || !newPw}
              className={`text-[12px] px-4 py-1.5 rounded-md border font-medium transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed ${
                pwState === 'saved' ? 'bg-[#3fb95022] text-[#3fb950] border-[#3fb95044]'
                : pwState === 'error' ? 'bg-[#f8514922] text-[#f85149] border-[#f8514944]'
                : 'bg-[#21262d] text-[#7d8590] border-[#30363d] hover:text-[#e6edf3] hover:border-[#7d8590]'}`}
            >
              {{ idle: 'Change Password', saving: 'Saving…', saved: 'Changed!', error: 'Failed' }[pwState]}
            </button>
          </Section>

          {isAdmin && (
            <Section title="Audit Log">
              <AuditLogSection />
            </Section>
          )}

          <Section title="About">
            <div className="space-y-2 text-[12px] text-[#7d8590]">
              {[
                ['Platform', 'Station Monitor NOC Dashboard'],
                ['Frontend', 'React 18 + TypeScript + Vite + TailwindCSS'],
                ['Charts', 'Recharts 2.x'],
                ['State', 'Zustand'],
                ['Backend', 'FastAPI + asyncio monitoring, notification & retention workers'],
                ['Database', 'SQLite (aiosqlite)'],
                ['Version', 'v1.0.0 — RBAC, audit, maintenance, multi-channel alerts'],
              ].map(([label, val]) => (
                <div key={label} className="flex items-baseline gap-2">
                  <span className="text-[#7d8590] w-24 shrink-0">{label}:</span>
                  <span className="text-[#e6edf3]">{val}</span>
                </div>
              ))}
            </div>
          </Section>

          {onLogout && (
            <section className="bg-[#1a1217] border border-[#f8514933] rounded-lg p-5">
              <h2 className="text-[13px] font-medium text-[#e6edf3] mb-4">Session</h2>
              <button
                onClick={onLogout}
                className="text-[12px] text-[#f85149] border border-[#f8514944] bg-[#f8514911] hover:bg-[#f8514922] px-4 py-2 rounded-md transition-colors"
              >
                Sign out
              </button>
            </section>
          )}

        </div>
      )}
    </div>
  );
}

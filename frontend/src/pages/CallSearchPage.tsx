import { useState, useEffect, useRef } from 'react';
import WaveSurfer from 'wavesurfer.js';
import { api, CallRecord } from '../api/client';
import { useStore } from '../store/useStore';

// Maps raw CVS column names → { header label, cell renderer }
const COLUMN_DEFS: Record<string, { label: string; render: (rec: CallRecord & Record<string, any>) => React.ReactNode }> = {
  CVSSDT: { label: 'Start',       render: (r) => <span className="font-mono text-[#e6edf3] whitespace-nowrap">{formatDateTime(r.start)}</span> },
  CVSEDT: { label: 'End',         render: (r) => <span className="font-mono text-[#7d8590] whitespace-nowrap">{formatDateTime(r.end)}</span> },
  CVSC01: { label: 'Source',      render: (r) => <span className="font-mono text-[#e6edf3]">{r.source || '—'}</span> },
  CVSC00: { label: 'Destination', render: (r) => <span className="font-mono text-[#e6edf3]">{r.destination || '—'}</span> },
  CVSDIR: { label: 'Direction',   render: (r) => (
    <span className={`flex items-center gap-1 ${r.direction === 'Incoming' ? 'text-[#00d4aa]' : 'text-[#e3b341]'}`}>
      {r.direction === 'Incoming' ? <PhoneInIcon /> : <PhoneOutIcon />}
      {r.direction}
    </span>
  )},
  CVSLCT: { label: 'Duration',    render: (r) => <span className="font-mono text-[#7d8590]">{formatDuration(r.duration_seconds)}</span> },
};

const DEFAULT_COLUMNS = ['CVSSDT', 'CVSEDT', 'CVSC01', 'CVSC00', 'CVSDIR', 'CVSLCT'];

function formatDuration(seconds: number): string {
  if (!seconds) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatDateTime(dt: string): string {
  if (!dt) return '—';
  const d = new Date(dt.replace(' ', 'T'));
  return d.toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'medium' });
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function weekAgo(): string {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString().slice(0, 10);
}

const PhoneInIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="16,2 16,8 22,8" /><line x1="23" y1="1" x2="16" y2="8" />
    <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 10.8 19.79 19.79 0 01.12 2.18 2 2 0 012.11 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
  </svg>
);

const PhoneOutIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="23,7 23,1 17,1" /><line x1="16" y1="8" x2="23" y2="1" />
    <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 10.8 19.79 19.79 0 01.12 2.18 2 2 0 012.11 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
  </svg>
);

const PlayIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none">
    <polygon points="5,3 19,12 5,21" />
  </svg>
);

const DownloadIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
    <polyline points="7,10 12,15 17,10" /><line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);


interface WavePlayerProps {
  src: string;
  label: string;
  onClose: () => void;
}

function WavePlayer({ src, label, onClose }: WavePlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WaveSurfer | null>(null);
  const [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!containerRef.current) return;
    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: '#30363d',
      progressColor: '#00d4aa',
      cursorColor: '#00d4aa',
      height: 36,
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      normalize: true,
    });
    wsRef.current = ws;
    ws.load(src);
    ws.on('ready', () => { setReady(true); setDuration(ws.getDuration()); });
    ws.on('play', () => setPlaying(true));
    ws.on('pause', () => setPlaying(false));
    ws.on('finish', () => setPlaying(false));
    ws.on('timeupdate', (t) => setCurrentTime(t));
    ws.on('error', () => setError('Failed to decode audio'));
    return () => {
      ws.stop();
      ws.unAll();
      ws.destroy();
      wsRef.current = null;
    };
  }, [src]);

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  return (
    <div className="bg-[#161b22] border-t border-[#30363d] px-4 py-2.5 flex items-center gap-3 shrink-0">
      {/* Play/Pause */}
      <button
        onClick={() => wsRef.current?.playPause()}
        disabled={!ready}
        className="w-7 h-7 flex items-center justify-center rounded-full bg-[#00d4aa22] text-[#00d4aa] hover:bg-[#00d4aa33] disabled:opacity-30 shrink-0 transition-colors"
      >
        {playing
          ? <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="3" width="4" height="18"/><rect x="15" y="3" width="4" height="18"/></svg>
          : <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
        }
      </button>

      {/* Label + waveform */}
      <div className="flex-1 min-w-0">
        <div className="text-[10px] text-[#7d8590] truncate mb-1">{label}</div>
        {error
          ? <div className="text-[11px] text-[#f85149]">{error}</div>
          : <div ref={containerRef} className="w-full" />
        }
      </div>

      {/* Time */}
      <div className="text-[11px] font-mono text-[#7d8590] shrink-0 w-20 text-right">
        {ready ? `${fmt(currentTime)} / ${fmt(duration)}` : 'Loading…'}
      </div>

      {/* Close */}
      <button
        onClick={onClose}
        className="w-6 h-6 flex items-center justify-center text-[#7d8590] hover:text-[#e6edf3] shrink-0"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>
  );
}

export function CallSearchPage() {
  const { servers, callServerId, setCallServerId } = useStore();

  const [serverId, setServerId] = useState<string>(callServerId ?? '');
  const [fromDate, setFromDate] = useState(weekAgo());
  const [toDate, setToDate] = useState(today());
  const [filterMode, setFilterMode] = useState<'fields' | 'keyword'>('fields');
  const [source, setSource] = useState('');
  const [destination, setDestination] = useState('');
  const [keyword, setKeyword] = useState('');

  const [results, setResults] = useState<CallRecord[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState('');

  const [activeColumns, setActiveColumns] = useState<string[]>(DEFAULT_COLUMNS);
  const [playingRecord, setPlayingRecord] = useState<CallRecord | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkDownloading, setBulkDownloading] = useState(false);
  const [bulkError, setBulkError] = useState('');

  // Load column visibility from settings
  useEffect(() => {
    api.settings.get()
      .then((cfg) => {
        if (cfg.call_columns_visible) {
          const cols = cfg.call_columns_visible.split(',').filter(Boolean);
          if (cols.length > 0) setActiveColumns(cols);
        }
      })
      .catch(() => {});
  }, []);

  // Clear callServerId on unmount
  useEffect(() => {
    return () => setCallServerId(null);
  }, [setCallServerId]);

  // Sync server selector when navigating from a card
  useEffect(() => {
    if (callServerId) setServerId(callServerId);
  }, [callServerId]);

  async function handleSearch() {
    if (!serverId) { setError('Select a server first'); return; }
    setSearching(true);
    setError('');
    setSearched(false);
    try {
      const params = {
        from_date: fromDate,
        to_date: toDate,
        source: filterMode === 'fields' ? source : '',
        destination: filterMode === 'fields' ? destination : '',
        keyword: filterMode === 'keyword' ? keyword : '',
      };
      const data = await api.calls.search(serverId, params);
      setResults(data);
      setSearched(true);
      setSelected(new Set());
    } catch (err: any) {
      setError(err.message ?? 'Search failed');
    } finally {
      setSearching(false);
    }
  }

  async function handleBulkDownload() {
    const paths = Array.from(selected)
      .map((i) => results[i]?.recording_path)
      .filter(Boolean) as string[];
    if (!paths.length) return;
    setBulkDownloading(true);
    setBulkError('');
    try {
      await api.calls.downloadBulk(serverId, paths);
    } catch (err: any) {
      setBulkError(err.message ?? 'Bulk download failed');
    } finally {
      setBulkDownloading(false);
    }
  }

  const allWithRecordings = results
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => r.recording_path);
  const allSelected = allWithRecordings.length > 0 &&
    allWithRecordings.every(({ i }) => selected.has(i));

  function toggleSelectAll() {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(allWithRecordings.map(({ i }) => i)));
    }
  }

  const selectedServer = servers.find((s) => s.id === serverId);

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <header className="bg-[#161b22] border-b border-[#21262d] px-5 py-3 pr-[168px] flex items-center justify-between shrink-0">
        <div>
          <div className="text-[15px] font-medium">Call Search</div>
          <div className="text-[12px] text-[#7d8590] mt-0.5">Search and play recordings from PBX servers</div>
        </div>
        {selectedServer && (
          <div className="flex items-center gap-2 text-[12px] text-[#7d8590]">
            <div className="w-1.5 h-1.5 rounded-full bg-[#00d4aa]" />
            {selectedServer.hostname}
            <span className="font-mono text-[11px]">{selectedServer.ipAddress}</span>
          </div>
        )}
      </header>

      {/* Search form */}
      <div className="bg-[#0d1117] border-b border-[#21262d] px-5 py-3 space-y-3 shrink-0">
        {/* Server + dates row */}
        <div className="flex items-end gap-3 flex-wrap">
          <div>
            <label className="block text-[10px] text-[#7d8590] uppercase tracking-wide mb-1">Server</label>
            <select
              value={serverId}
              onChange={(e) => setServerId(e.target.value)}
              className="bg-[#161b22] border border-[#30363d] text-[#e6edf3] text-[12px] rounded-md px-3 py-1.5 w-52 focus:outline-none focus:border-[#00d4aa55]"
            >
              <option value="">— Select a server —</option>
              {servers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.hostname} ({s.site})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] text-[#7d8590] uppercase tracking-wide mb-1">From date</label>
            <input
              type="date"
              value={fromDate}
              max={toDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="bg-[#161b22] border border-[#30363d] text-[#e6edf3] text-[12px] rounded-md px-3 py-1.5 focus:outline-none focus:border-[#00d4aa55]"
            />
          </div>

          <div>
            <label className="block text-[10px] text-[#7d8590] uppercase tracking-wide mb-1">To date</label>
            <input
              type="date"
              value={toDate}
              min={fromDate}
              max={today()}
              onChange={(e) => setToDate(e.target.value)}
              className="bg-[#161b22] border border-[#30363d] text-[#e6edf3] text-[12px] rounded-md px-3 py-1.5 focus:outline-none focus:border-[#00d4aa55]"
            />
          </div>
        </div>

        {/* Filter mode + search */}
        <div className="flex items-end gap-3 flex-wrap">
          <div className="flex items-center border border-[#30363d] rounded-md overflow-hidden text-[12px]">
            {(['fields', 'keyword'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setFilterMode(mode)}
                className={`px-3 py-1.5 transition-colors ${filterMode === mode ? 'bg-[#00d4aa22] text-[#00d4aa]' : 'text-[#7d8590] hover:text-[#e6edf3] hover:bg-[#21262d]'}`}
              >
                {mode === 'fields' ? 'Source / Destination' : 'Keyword Search'}
              </button>
            ))}
          </div>

          {filterMode === 'fields' ? (
            <>
              <div>
                <label className="block text-[10px] text-[#7d8590] uppercase tracking-wide mb-1">Source (caller)</label>
                <input
                  type="text"
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  placeholder="e.g. 1001"
                  className="bg-[#161b22] border border-[#30363d] text-[#e6edf3] text-[12px] rounded-md px-3 py-1.5 w-36 font-mono placeholder-[#7d8590] focus:outline-none focus:border-[#00d4aa55]"
                />
              </div>
              <div>
                <label className="block text-[10px] text-[#7d8590] uppercase tracking-wide mb-1">Destination</label>
                <input
                  type="text"
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  placeholder="e.g. 0491234567"
                  className="bg-[#161b22] border border-[#30363d] text-[#e6edf3] text-[12px] rounded-md px-3 py-1.5 w-40 font-mono placeholder-[#7d8590] focus:outline-none focus:border-[#00d4aa55]"
                />
              </div>
            </>
          ) : (
            <div>
              <label className="block text-[10px] text-[#7d8590] uppercase tracking-wide mb-1">Keyword (matches source or dest)</label>
              <input
                type="text"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="e.g. 0491"
                className="bg-[#161b22] border border-[#30363d] text-[#e6edf3] text-[12px] rounded-md px-3 py-1.5 w-52 font-mono placeholder-[#7d8590] focus:outline-none focus:border-[#00d4aa55]"
              />
            </div>
          )}

          <button
            onClick={handleSearch}
            disabled={searching || !serverId}
            className="px-4 py-1.5 rounded-md text-[12px] font-medium bg-[#00d4aa22] text-[#00d4aa] border border-[#00d4aa44] hover:bg-[#00d4aa33] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {searching ? 'Searching…' : 'Search Calls'}
          </button>
        </div>

        {error && (
          <div className="text-[12px] text-[#f85149] bg-[#f8514911] border border-[#f8514933] rounded px-3 py-2">
            {error}
          </div>
        )}
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto">
        {!searched && !searching ? (
          <div className="flex flex-col items-center justify-center py-24 text-[#7d8590]">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" className="mb-3 opacity-25">
              <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 10.8 19.79 19.79 0 01.12 2.18 2 2 0 012.11 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
            </svg>
            <p className="text-[13px]">Select a server and run a search to see call records</p>
          </div>
        ) : searching ? (
          <div className="flex items-center justify-center py-24 text-[#7d8590] text-[12px]">
            Querying remote database…
          </div>
        ) : results.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-[#7d8590]">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mb-3 opacity-30">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <p className="text-[13px]">No call records found for the selected criteria</p>
          </div>
        ) : (
          <div className="px-5 py-3">
            <div className="flex items-center justify-between mb-2 gap-3">
              <span className="text-[11px] text-[#7d8590]">
                {results.length} record{results.length !== 1 ? 's' : ''} found
                {results.length === 500 && ' — showing first 500, refine your search for more'}
              </span>
              <div className="flex items-center gap-2">
                {selected.size > 0 && (
                  <span className="text-[11px] text-[#7d8590]">{selected.size} selected</span>
                )}
                <button
                  onClick={handleBulkDownload}
                  disabled={selected.size === 0 || bulkDownloading}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium border transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-[#00d4aa22] text-[#00d4aa] border-[#00d4aa44] hover:bg-[#00d4aa33]"
                >
                  <DownloadIcon />
                  {bulkDownloading ? 'Zipping…' : 'Download Selected'}
                </button>
              </div>
            </div>
            {bulkError && (
              <div className="text-[12px] text-[#f85149] bg-[#f8514911] border border-[#f8514933] rounded px-3 py-2 mb-2">
                {bulkError}
              </div>
            )}
            <div className="rounded-lg border border-[#21262d] overflow-hidden">
              <table className="w-full text-[12px] border-collapse">
                <thead>
                  <tr className="bg-[#161b22] border-b border-[#21262d]">
                    <th className="px-3 py-2.5 w-8">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={toggleSelectAll}
                        title="Select all with recordings"
                        className="accent-[#00d4aa] cursor-pointer"
                      />
                    </th>
                    {activeColumns.map((col) => (
                      <th
                        key={col}
                        className="px-3 py-2.5 text-left text-[10px] text-[#7d8590] uppercase tracking-widest font-medium whitespace-nowrap"
                      >
                        {COLUMN_DEFS[col]?.label ?? col}
                      </th>
                    ))}
                    <th className="px-3 py-2.5 text-left text-[10px] text-[#7d8590] uppercase tracking-widest font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {results.map((rec, i) => {
                    return (
                      <tr
                        key={i}
                        className={`border-b border-[#21262d] transition-colors ${
                          playingRecord === rec ? 'bg-[#00d4aa11]' : i % 2 === 0 ? 'bg-[#0d1117]' : 'bg-[#161b2288]'
                        } hover:bg-[#21262d]`}
                      >
                        <td className="px-3 py-2 w-8">
                          {rec.recording_path ? (
                            <input
                              type="checkbox"
                              checked={selected.has(i)}
                              onChange={() => {
                                setSelected((prev) => {
                                  const next = new Set(prev);
                                  next.has(i) ? next.delete(i) : next.add(i);
                                  return next;
                                });
                                if (playingRecord === rec) setPlayingRecord(null);
                              }}
                              className="accent-[#00d4aa] cursor-pointer"
                            />
                          ) : null}
                        </td>
                        {activeColumns.map((col) => (
                          <td key={col} className="px-3 py-2">
                            {COLUMN_DEFS[col]
                              ? COLUMN_DEFS[col].render(rec as any)
                              : <span className="font-mono text-[#7d8590]">{(rec as any)[col] ?? '—'}</span>
                            }
                          </td>
                        ))}
                        <td className="px-3 py-2">
                          {rec.recording_path ? (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => setPlayingRecord(playingRecord === rec ? null : rec)}
                                disabled={selected.has(i)}
                                title={selected.has(i) ? 'Uncheck to play' : 'Play recording'}
                                className={`w-6 h-6 flex items-center justify-center rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
                                  playingRecord === rec
                                    ? 'bg-[#00d4aa22] text-[#00d4aa]'
                                    : 'text-[#7d8590] hover:text-[#00d4aa] hover:bg-[#00d4aa11]'
                                }`}
                              >
                                <PlayIcon />
                              </button>
                              <a
                                href={api.calls.downloadUrl(serverId, rec.recording_path)}
                                download
                                title="Download recording"
                                className="w-6 h-6 flex items-center justify-center rounded text-[#7d8590] hover:text-[#e6edf3] hover:bg-[#21262d] transition-colors"
                              >
                                <DownloadIcon />
                              </a>
                            </div>
                          ) : (
                            <span className="text-[#7d8590] text-[11px]">no file</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {playingRecord && (
        <WavePlayer
          key={playingRecord.recording_path}
          src={api.calls.streamUrl(serverId, playingRecord.recording_path)}
          label={`${playingRecord.source} → ${playingRecord.destination}  •  ${formatDateTime(playingRecord.start)}`}
          onClose={() => setPlayingRecord(null)}
        />
      )}
    </div>
  );
}

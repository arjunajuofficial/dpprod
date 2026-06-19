import { useState, useRef, useEffect } from 'react';
import { useStore } from '../store/useStore';

const ROLE_STYLES: Record<string, string> = {
  admin:    'bg-[#00d4aa22] text-[#00d4aa] border-[#00d4aa44]',
  operator: 'bg-[#388bfd22] text-[#58a6ff] border-[#388bfd44]',
  viewer:   'bg-[#7d859022] text-[#7d8590] border-[#7d859044]',
};

function initials(name: string): string {
  const parts = name.trim().split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function UserMenu() {
  const { user, clearAuth, setPage } = useStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  // Close on outside click or Escape
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!user) return null;

  const roleClass = ROLE_STYLES[user.role] ?? ROLE_STYLES.viewer;

  return (
    <div ref={ref} className="fixed top-3 right-4 z-50">
      <button
        onClick={() => setOpen((o) => !o)}
        title={`${user.username} · ${user.role}`}
        className="flex items-center gap-2 bg-[#161b22] border border-[#21262d] hover:border-[#30363d] rounded-full pl-1 pr-2.5 py-1 transition-colors"
      >
        <span className="w-7 h-7 rounded-full bg-[#00d4aa22] border border-[#00d4aa55] text-[#00d4aa] text-[11px] font-bold flex items-center justify-center">
          {initials(user.username)}
        </span>
        <span className="text-[12px] text-[#e6edf3] max-w-[120px] truncate">{user.username}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          className={`text-[#7d8590] transition-transform ${open ? 'rotate-180' : ''}`}>
          <polyline points="6,9 12,15 18,9" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-56 bg-[#161b22] border border-[#21262d] rounded-lg shadow-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-[#21262d]">
            <div className="text-[13px] text-[#e6edf3] font-medium truncate">{user.username}</div>
            <span className={`inline-block mt-1.5 text-[10px] uppercase tracking-wide px-2 py-0.5 rounded border ${roleClass}`}>
              {user.role}
            </span>
          </div>

          <button
            onClick={() => { setPage('settings'); setOpen(false); }}
            className="w-full text-left px-4 py-2.5 text-[12px] text-[#e6edf3] hover:bg-[#21262d] transition-colors"
          >
            Account &amp; settings
          </button>

          <button
            onClick={() => { setOpen(false); clearAuth(); }}
            className="w-full text-left px-4 py-2.5 text-[12px] text-[#f85149] hover:bg-[#f8514911] border-t border-[#21262d] transition-colors"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

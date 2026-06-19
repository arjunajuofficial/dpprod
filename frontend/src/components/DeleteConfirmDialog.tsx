import { useEffect, useState } from 'react';
import { Server } from '../types/server';
import { api } from '../api/client';
import { useStore } from '../store/useStore';

interface Props {
  server: Server;
  onClose: () => void;
}

export function DeleteConfirmDialog({ server, onClose }: Props) {
  const { removeServer } = useStore();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function handleDelete() {
    setDeleting(true);
    setError('');
    try {
      await api.deleteServer(server.id);
      removeServer(server.id);
      onClose();
    } catch (err: any) {
      setError(err.message ?? 'Delete failed');
      setDeleting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-[#161b22] border border-[#f8514944] rounded-xl w-full max-w-sm mx-4 shadow-2xl">
        <div className="px-5 py-4 border-b border-[#21262d]">
          <h2 className="text-[14px] font-semibold text-[#e6edf3]">Remove Station</h2>
        </div>
        <div className="px-5 py-4 space-y-3">
          <p className="text-[12px] text-[#7d8590]">
            Remove <span className="text-[#e6edf3] font-medium font-mono">{server.hostname}</span>
            {server.site ? ` (${server.site})` : ''} from monitoring?
          </p>
          <p className="text-[11px] text-[#7d8590] bg-[#f8514911] border border-[#f8514933] rounded px-3 py-2">
            This will delete all associated alerts and metrics history and cannot be undone.
          </p>
          {error && <p className="text-[11px] text-[#f85149]">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="flex-1 py-2 rounded-md text-[12px] font-medium bg-[#f8514922] text-[#f85149] border border-[#f8514944] hover:bg-[#f8514933] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {deleting ? 'Removing…' : 'Remove Station'}
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-md text-[12px] text-[#7d8590] border border-[#30363d] hover:text-[#e6edf3] hover:border-[#7d8590] transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

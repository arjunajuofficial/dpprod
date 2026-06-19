import { useEffect, useState } from 'react';
import { api, ManagedUser } from '../../api/client';
import { useStore } from '../../store/useStore';

const ROLES = ['admin', 'operator', 'viewer'] as const;

const inputCls =
  'w-full bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-2 text-[12px] text-[#e6edf3] ' +
  'placeholder-[#7d8590] focus:outline-none focus:border-[#00d4aa55]';

export function UserManagement() {
  const { user: me } = useStore();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // New user form
  const [newName, setNewName] = useState('');
  const [newPass, setNewPass] = useState('');
  const [newRole, setNewRole] = useState<string>('operator');

  async function refresh() {
    try {
      setUsers(await api.users.list());
      setError('');
    } catch (e: any) {
      setError(e.message ?? 'Failed to load users');
    }
  }

  useEffect(() => { refresh(); }, []);

  async function handleCreate() {
    if (!newName || newPass.length < 8) {
      setError('Username required; password must be at least 8 characters');
      return;
    }
    setBusy(true);
    try {
      await api.users.create(newName, newPass, newRole);
      setNewName(''); setNewPass(''); setNewRole('operator');
      await refresh();
    } catch (e: any) {
      setError(e.message ?? 'Failed to create user');
    } finally {
      setBusy(false);
    }
  }

  async function handleRoleChange(u: ManagedUser, role: string) {
    setBusy(true);
    try { await api.users.update(u.id, { role }); await refresh(); }
    catch (e: any) { setError(e.message ?? 'Failed to update role'); }
    finally { setBusy(false); }
  }

  async function handleResetPassword(u: ManagedUser) {
    const pw = window.prompt(`New password for ${u.username} (min 8 chars):`);
    if (!pw) return;
    if (pw.length < 8) { setError('Password must be at least 8 characters'); return; }
    setBusy(true);
    try { await api.users.update(u.id, { password: pw }); setError(''); }
    catch (e: any) { setError(e.message ?? 'Failed to reset password'); }
    finally { setBusy(false); }
  }

  async function handleDelete(u: ManagedUser) {
    if (!window.confirm(`Delete user "${u.username}"? This cannot be undone.`)) return;
    setBusy(true);
    try { await api.users.remove(u.id); await refresh(); }
    catch (e: any) { setError(e.message ?? 'Failed to delete user'); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="text-[12px] text-[#f85149] bg-[#f8514911] border border-[#f8514933] rounded px-3 py-2">
          {error}
        </div>
      )}

      {/* Existing users */}
      <div className="space-y-1.5">
        {users.map((u) => (
          <div key={u.id} className="flex items-center gap-3 bg-[#0d1117] rounded-md px-3 py-2">
            <div className="flex-1 min-w-0">
              <span className="text-[12px] text-[#e6edf3] font-medium">{u.username}</span>
              {u.username === me?.username && (
                <span className="text-[10px] text-[#00d4aa] ml-2">(you)</span>
              )}
              <div className="text-[10px] text-[#7d8590]">
                Last login: {u.last_login ? new Date(u.last_login).toLocaleString() : 'never'}
              </div>
            </div>
            <select
              value={u.role}
              disabled={busy || u.username === me?.username}
              onChange={(e) => handleRoleChange(u, e.target.value)}
              className="text-[11px] bg-[#21262d] border border-[#30363d] rounded px-2 py-1 text-[#e6edf3] disabled:opacity-40"
            >
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            <button onClick={() => handleResetPassword(u)} disabled={busy}
              className="text-[11px] text-[#7d8590] hover:text-[#e6edf3] border border-[#30363d] rounded px-2 py-1 transition-colors disabled:opacity-40">
              Reset PW
            </button>
            <button onClick={() => handleDelete(u)} disabled={busy || u.username === me?.username}
              className="text-[11px] text-[#f85149] border border-[#f8514933] rounded px-2 py-1 hover:bg-[#f8514911] transition-colors disabled:opacity-40">
              Delete
            </button>
          </div>
        ))}
        {users.length === 0 && !error && (
          <div className="text-[12px] text-[#7d8590]">Loading users…</div>
        )}
      </div>

      {/* Add user */}
      <div className="border-t border-[#21262d] pt-4">
        <div className="text-[11px] text-[#7d8590] uppercase tracking-wide mb-2">Add User</div>
        <div className="grid grid-cols-3 gap-3">
          <input value={newName} onChange={(e) => setNewName(e.target.value)}
            placeholder="username" className={inputCls} />
          <input value={newPass} onChange={(e) => setNewPass(e.target.value)} type="password"
            placeholder="password (min 8)" className={inputCls} />
          <div className="flex gap-2">
            <select value={newRole} onChange={(e) => setNewRole(e.target.value)}
              className="flex-1 bg-[#0d1117] border border-[#30363d] rounded-md px-2 py-2 text-[12px] text-[#e6edf3] focus:outline-none">
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            <button onClick={handleCreate} disabled={busy}
              className="text-[12px] px-3 rounded-md border font-medium bg-[#00d4aa22] text-[#00d4aa] border-[#00d4aa44] hover:bg-[#00d4aa33] transition-colors disabled:opacity-40">
              Add
            </button>
          </div>
        </div>
        <div className="text-[10px] text-[#7d8590] mt-2">
          Roles: <span className="text-[#e6edf3]">admin</span> — full control ·{' '}
          <span className="text-[#e6edf3]">operator</span> — monitor, ack/resolve alerts, maintenance ·{' '}
          <span className="text-[#e6edf3]">viewer</span> — read-only
        </div>
      </div>
    </div>
  );
}

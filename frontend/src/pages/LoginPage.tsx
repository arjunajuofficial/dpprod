import { useState, FormEvent } from 'react';
import { api } from '../api/client';
import { useStore } from '../store/useStore';

export function LoginPage() {
  const setAuth = useStore((s) => s.setAuth);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.login(username, password);
      setAuth(res.access_token, res.user);
    } catch (err: any) {
      setError(err.message ?? 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0d1117] flex items-center justify-center">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 bg-[#00d4aa22] border border-[#00d4aa55] rounded-xl flex items-center justify-center mb-4">
            <div className="w-5 h-5 bg-[#00d4aa] rounded-full" />
          </div>
          <h1 className="text-[20px] font-medium text-[#e6edf3]">Station Monitor</h1>
          <p className="text-[12px] text-[#7d8590] mt-1">NOC Dashboard — Sign in to continue</p>
        </div>

        {/* Form */}
        <form
          onSubmit={handleSubmit}
          className="bg-[#161b22] border border-[#21262d] rounded-xl p-6 space-y-4"
        >
          <div>
            <label className="block text-[11px] text-[#7d8590] uppercase tracking-wide mb-1.5">
              Username
            </label>
            <input
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              className="
                w-full bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-2
                text-[13px] text-[#e6edf3] placeholder-[#7d8590]
                focus:outline-none focus:border-[#00d4aa55] focus:ring-1 focus:ring-[#00d4aa33]
              "
            />
          </div>

          <div>
            <label className="block text-[11px] text-[#7d8590] uppercase tracking-wide mb-1.5">
              Password
            </label>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="
                w-full bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-2
                text-[13px] text-[#e6edf3] placeholder-[#7d8590]
                focus:outline-none focus:border-[#00d4aa55] focus:ring-1 focus:ring-[#00d4aa33]
              "
            />
          </div>

          {error && (
            <div className="text-[12px] text-[#f85149] bg-[#f8514911] border border-[#f8514933] rounded px-3 py-2">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="
              w-full bg-[#00d4aa22] hover:bg-[#00d4aa33] border border-[#00d4aa55]
              text-[#00d4aa] text-[13px] font-medium rounded-md py-2.5
              transition-colors duration-150 disabled:opacity-50
            "
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <p className="text-center text-[11px] text-[#7d8590] mt-4">
          Default: <span className="font-mono text-[#e6edf3]">admin</span> / <span className="font-mono text-[#e6edf3]">admin123</span>
        </p>
      </div>
    </div>
  );
}

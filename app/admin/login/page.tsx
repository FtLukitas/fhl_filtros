'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminLoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError('Por favor completá todos los campos');
      return;
    }

    setCargando(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Error al iniciar sesión');
        setCargando(false);
        return;
      }

      router.push('/admin');
      router.refresh();
    } catch {
      setError('Error de conexión con el servidor');
      setCargando(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-lg shadow-2xl p-8 border border-slate-100 animate-in fade-in zoom-in-95 duration-200">
        <div className="text-center mb-8">
          <img
            src="/logo.png"
            alt="FHL Filtros Logo"
            className="h-16 mx-auto mb-4 object-contain"
          />
          <h1 className="text-2xl font-black text-slate-800 tracking-tight">
            Panel de Control
          </h1>
          <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">
            FHL Filtros — Acceso Administrativo
          </p>
        </div>

        {error && (
          <div role="alert" aria-live="assertive" className="mb-6 p-3.5 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm font-medium flex items-center gap-2">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4" noValidate>
          <div>
            <label htmlFor="admin-username" className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
              Usuario
            </label>
            <input
              id="admin-username"
              type="text"
              autoFocus
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Ingresá tu usuario..."
              className="w-full border border-slate-300 rounded-md px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600 transition-all font-medium"
            />
          </div>

          <div>
            <label htmlFor="admin-password" className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
              Contraseña
            </label>
            <input
              id="admin-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full border border-slate-300 rounded-md px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600 transition-all font-medium"
            />
          </div>

          <button
            type="submit"
            disabled={cargando}
            aria-busy={cargando}
            className="w-full bg-blue-900 hover:bg-blue-800 active:scale-[0.98] text-white font-bold py-3.5 rounded-md transition-all shadow-md hover:shadow-lg disabled:opacity-50 flex items-center justify-center gap-2 mt-6 cursor-pointer"
          >
            {cargando ? (
              <>
                <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" aria-hidden="true" />
                <span>Ingresando...</span>
              </>
            ) : (
              <span>Iniciar Sesión</span>
            )}
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-slate-100 text-center">
          <a
            href="/"
            className="text-xs font-bold text-slate-500 hover:text-blue-900 transition-colors uppercase tracking-wider inline-flex items-center gap-1.5"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
              <path d="M15 18l-6-6 6-6" />
            </svg>
            Volver al catálogo público
          </a>
        </div>
      </div>
    </div>
  );
}

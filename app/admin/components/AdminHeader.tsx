'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

export default function AdminHeader() {
  const [menuAbierto, setMenuAbierto] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const menuRef = useRef<HTMLDivElement>(null);

  // Cerrar menú al clickear afuera
  useEffect(() => {
    const handleClickFuera = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuAbierto(false);
      }
    };
    document.addEventListener('mousedown', handleClickFuera);
    return () => document.removeEventListener('mousedown', handleClickFuera);
  }, []);

  // Si estamos en la página de login, no mostrar el header
  if (pathname === '/admin/login') {
    return null;
  }

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/admin/login');
      router.refresh();
    } catch {
      router.push('/admin/login');
    }
  };

  const navItems = [
    {
      label: 'Dashboard',
      href: '/admin',
      exact: true,
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="3" width="7" height="7" />
          <rect x="14" y="3" width="7" height="7" />
          <rect x="14" y="14" width="7" height="7" />
          <rect x="3" y="14" width="7" height="7" />
        </svg>
      ),
    },
    {
      label: 'Productos',
      href: '/admin/productos',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
          <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
          <line x1="12" y1="22.08" x2="12" y2="12" />
        </svg>
      ),
    },
    {
      label: 'Clientes',
      href: '/admin/clientes',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 00-3-3.87" />
          <path d="M16 3.13a4 4 0 010 7.75" />
        </svg>
      ),
    },
    {
      label: 'Pedidos',
      href: '/admin/pedidos',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
          <rect x="9" y="3" width="6" height="4" rx="1" />
          <path d="M9 14l2 2 4-4" />
        </svg>
      ),
    },
    {
      label: 'Nuevo Pedido',
      href: '/admin/facturador',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="16" />
          <line x1="8" y1="12" x2="16" y2="12" />
        </svg>
      ),
    },
    {
      label: 'Listas de Precios',
      href: '/admin/listas-precios',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
          <line x1="7" y1="7" x2="7.01" y2="7" />
        </svg>
      ),
    },
    {
      label: 'Auditoría IA',
      href: '/admin/auditoria',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
      ),
    },
  ];

  return (
    <header className="bg-blue-900 shadow-md sticky top-0 z-50" aria-label="Navegación del panel de control">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          
          {/* Logo y Nombre */}
          <div className="flex items-center gap-4">
            <Link href="/admin" className="flex-shrink-0 flex items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white rounded-md" aria-label="FHL Panel Principal">
              <img
                src="/logo.png"
                alt="FHL Filtros Logo"
                className="h-10 w-auto object-contain"
              />
            </Link>

            <div className="hidden sm:block h-6 w-px bg-blue-700" aria-hidden="true" />
            <span className="hidden sm:inline text-white font-bold text-sm tracking-tight">
              Panel Administrativo
            </span>
          </div>

          {/* Links directos en Desktop */}
          <nav className="hidden lg:flex items-center gap-1" aria-label="Módulos de administración">
            {navItems.map((item) => {
              const isActive = item.exact
                ? pathname === item.href
                : pathname.startsWith(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${
                    isActive
                      ? 'bg-blue-800 text-white shadow-sm border border-blue-700'
                      : 'text-blue-200 hover:text-white hover:bg-blue-800/50'
                  }`}
                  aria-current={isActive ? 'page' : undefined}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* Botones de acción & Menú Mobile */}
          <div className="flex items-center gap-3" ref={menuRef}>
            
            {/* Botón Ver Sitio */}
            <a
              href="/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-200 hover:text-white text-xs font-semibold transition-colors flex items-center gap-1.5 bg-blue-800/40 hover:bg-blue-800 px-2.5 py-1.5 rounded-md border border-blue-700/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              title="Ver catálogo público en nueva pestaña"
              aria-label="Abrir catálogo público en una nueva pestaña"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
              <span className="hidden sm:inline">Ver Sitio</span>
            </a>

            {/* Botón Cerrar Sesión en Desktop */}
            <button
              onClick={handleLogout}
              className="hidden lg:flex text-red-300 hover:text-red-100 hover:bg-red-600/30 text-xs font-bold transition-colors p-1.5 rounded-md items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white cursor-pointer"
              title="Cerrar sesión de administrador"
              aria-label="Cerrar sesión de administrador"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </button>

            {/* Menú Desplegable SOLO en Mobile/Tablet (< lg) */}
            <div className="relative lg:hidden">
              <button
                onClick={() => setMenuAbierto(!menuAbierto)}
                className="bg-blue-800 hover:bg-blue-750 text-white p-2 rounded-md text-xs font-bold flex items-center gap-1.5 border border-blue-700/60 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white cursor-pointer"
                aria-expanded={menuAbierto}
                aria-label={menuAbierto ? "Cerrar menú de administración" : "Abrir menú de administración móvil"}
                aria-haspopup="menu"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  {menuAbierto ? (
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                  )}
                </svg>
              </button>

              {/* Dropdown Mobile Flotante */}
              {menuAbierto && (
                <div
                  role="menu"
                  aria-label="Opciones de administración móvil"
                  className="absolute right-0 mt-2 w-60 bg-white rounded-md shadow-2xl border border-slate-200 py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150"
                >
                  <div className="px-3 py-1.5 border-b border-slate-100 mb-1">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Módulos de Gestión
                    </p>
                  </div>

                  <div className="space-y-0.5 px-1.5">
                    {navItems.map((item) => {
                      const isActive = item.exact
                        ? pathname === item.href
                        : pathname.startsWith(item.href);

                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setMenuAbierto(false)}
                          role="menuitem"
                          className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-semibold transition-all ${
                            isActive
                              ? 'bg-blue-900 text-white shadow-sm'
                              : 'text-slate-700 hover:bg-slate-100 hover:text-blue-900'
                          }`}
                          aria-current={isActive ? 'page' : undefined}
                        >
                          <span className={isActive ? 'text-blue-200' : 'text-slate-400'}>
                            {item.icon}
                          </span>
                          <span>{item.label}</span>
                        </Link>
                      );
                    })}
                  </div>

                  <div className="border-t border-slate-100 mt-2 pt-1 px-1.5">
                    <button
                      onClick={handleLogout}
                      role="menuitem"
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-semibold text-red-600 hover:bg-red-50 transition-colors text-left cursor-pointer"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
                        <polyline points="16 17 21 12 16 7" />
                        <line x1="21" y1="12" x2="9" y2="12" />
                      </svg>
                      <span>Cerrar Sesión</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

          </div>

        </div>
      </div>
    </header>
  );
}

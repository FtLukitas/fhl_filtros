'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

  const links = [
    { name: 'Inicio', href: '/' },
    { name: 'Quiénes Somos', href: '/quienes-somos' },
    { name: 'Contacto', href: '/contacto' },
  ];

  return (
    <nav className="bg-blue-900 border-b border-slate-200 sticky top-0 z-[110] shadow-sm" aria-label="Navegación principal">
      <div className="max-w-6xl mx-auto px-4">
        {/* ALTURA: h-20 en mobile, h-24 en desktop */}
        <div className="flex justify-between items-center h-20 md:h-24">

          {/* LOGO */}
          <Link href="/" className="flex items-center focus-visible:ring-2 focus-visible:ring-white rounded-md focus-visible:outline-none" aria-label="FHL Filtros - Ir al inicio">
            <img
              src="/logo.png"
              alt="FHL Filtros Logo"
              className="h-15 md:h-16 w-auto object-contain hover:opacity-80 transition-opacity"
            />
          </Link>

          {/* BOTON HAMBURGUESA (Solo se ve en mobile) */}
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="md:hidden p-2 text-white rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-white transition-colors"
            aria-label={isOpen ? "Cerrar menú de navegación móvil" : "Abrir menú de navegación móvil"}
            aria-expanded={isOpen}
            aria-controls="mobile-navigation"
          >
            <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              {isOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" />
              )}
            </svg>
          </button>

          {/* LINKS DESKTOP */}
          <div className="hidden md:flex gap-4" role="menubar">
            {links.map((link) => {
              const isActive = pathname === link.href;
              const className = `px-4 py-2 rounded-md text-sm font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${
                isActive
                  ? 'bg-red-600 text-white shadow-sm'
                  : 'text-white hover:text-blue-900 hover:bg-slate-50'
              }`;

              return (
                <Link
                  key={link.name}
                  href={link.href}
                  className={className}
                  role="menuitem"
                  aria-current={isActive ? 'page' : undefined}
                >
                  {link.name}
                </Link>
              );
            })}
          </div>
        </div>

        {/* MENÚ MÓVIL DESPLEGABLE */}
        <div
          id="mobile-navigation"
          className={`md:hidden overflow-hidden transition-all duration-300 ease-in-out ${
            isOpen ? 'max-h-64 pb-6' : 'max-h-0'
          }`}
          aria-hidden={!isOpen}
        >
          <div className="flex flex-col gap-2" role="menu">
            {links.map((link) => {
              const isActive = pathname === link.href;
              const className = `px-4 py-3 rounded-md text-base font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${
                isActive
                  ? 'bg-red-600 text-white shadow-sm'
                  : 'text-slate-700 bg-slate-50 hover:bg-slate-100 hover:text-blue-900'
              }`;

              return (
                <Link
                  key={link.name}
                  href={link.href}
                  onClick={() => setIsOpen(false)}
                  className={className}
                  role="menuitem"
                  aria-current={isActive ? 'page' : undefined}
                >
                  {link.name}
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </nav>
  );
}
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
    <nav className="bg-blue-900 border-b border-slate-200 sticky top-0 z-[110] shadow-sm">
      <div className="max-w-6xl mx-auto px-4">
        {/* ALTURA: h-20 en móvil, h-24 en desktop */}
        <div className="flex justify-between items-center h-20 md:h-24">
          
          {/* LOGO */}
          <Link href="/" className="flex items-center">
            <img 
              src="/logo.png" 
              alt="FHL Filtros Logo" 
              className="h-20 md:h-16 w-auto object-contain hover:opacity-80 transition-opacity"
            />
          </Link>

          {/* BOTÓN HAMBURGUESA (Solo se ve en móviles) */}
          <button 
            onClick={() => setIsOpen(!isOpen)}
            className="md:hidden p-2 text-white focus:outline-none"
          >
            <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              {isOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" />
              )}
            </svg>
          </button>

          {/* LINKS DESKTOP (Se ocultan en móviles) */}
          <div className="hidden md:flex gap-4">
            {links.map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.name}
                  href={link.href}
                  className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                    isActive 
                      ? 'bg-red-600 text-white shadow-red-200' // Activo: Rojo con texto blanco
                      : 'text-white hover:text-blue-900 hover:bg-slate-50'
                  }`}
                >
                  {link.name}
                </Link>
              );
            })}
          </div>
        </div>

        {/* MENÚ MÓVIL DESPLEGABLE */}
        <div className={`md:hidden overflow-hidden transition-all duration-300 ease-in-out ${isOpen ? 'max-h-64 pb-6' : 'max-h-0'}`}>
          <div className="flex flex-col gap-2">
            {links.map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.name}
                  href={link.href}
                  onClick={() => setIsOpen(false)} // Cierra el menú al clickear
                  className={`px-4 py-3 rounded-xl text-base font-bold ${
                    isActive 
                      ? 'bg-red-600 text-white' 
                      : 'text-slate-600 bg-slate-50'
                  }`}
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
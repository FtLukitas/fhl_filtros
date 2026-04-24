'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function Navbar() {
  const pathname = usePathname();

  const links = [
    { name: 'Inicio', href: '/' },
    { name: 'Quiénes Somos', href: '/quienes-somos' },
    { name: 'Contacto', href: '/contacto' },
  ];

  return (
    <nav className="bg-blue-900 border-b border-slate-200 sticky top-0 z-[110] shadow-sm">
      <div className="max-w-6xl mx-auto px-4">
        <div className="flex justify-between items-center h-24">
          
          {/* LOGO - Reemplazamos el texto por la imagen */}
          <Link href="/" className="flex items-center">
            <img 
              src="/logo.png" 
              alt="FHL Filtros Logo" 
              className="h-20 w-auto object-contain hover:opacity-80 transition-opacity"
            />
          </Link>

          {/* LINKS / PESTAÑAS */}
          <div className="flex gap-1 md:gap-4">
            {links.map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.name}
                  href={link.href}
                  className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                    isActive 
                      ? 'bg-blue-50 text-blue-900' 
                      : 'text-slate-500 hover:text-blue-900 hover:bg-slate-50'
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
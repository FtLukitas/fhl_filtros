import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Contacto | FHL Filtros',
  description: 'Contactá a FHL Filtros por WhatsApp, teléfono o email. Ventas y administración de filtros de habitáculo.',
};

export default function Contacto() {
  return (
    <main className="min-h-screen bg-slate-50 flex flex-col items-center pt-12 md:pt-20 p-4">
      {/* TARJETA CENTRAL */}
      <div className="bg-white p-8 md:p-12 rounded-lg shadow-sm border border-slate-200 w-full max-w-md text-center">
        
        {/* Ícono de encabezado */}
        <div className="w-16 h-16 bg-blue-50 rounded-md flex items-center justify-center mx-auto mb-6 text-blue-900 border border-blue-100">
          <svg width="32" height="32" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
          </svg>
        </div>

        <h1 className="text-3xl font-black text-slate-900 italic mb-2">CONTACTO</h1>
        <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mb-8">
          Comunicate con nosotros
        </p>

        {/* LISTA DE CONTACTOS */}
        <div className="space-y-3 text-left">
          
          {/* Teléfono 1 (Ventas / WhatsApp) */}
          <a
            href="https://wa.me/5491159534330"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Contactar por WhatsApp o teléfono a Ventas: +54 9 11 5953-4330"
            className="flex items-center gap-4 p-4 rounded-md bg-slate-50 hover:bg-green-50/60 border border-slate-200 hover:border-green-300 transition-all group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 block"
          >
            <div className="text-green-600 group-hover:scale-110 transition-transform">
              <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 5h2l2 5-2.5 1.5A11 11 0 0012 19.5L13.5 17l5 2v2a2 2 0 01-2 2h-1C8 21 3 15 3 7V5z"/>
              </svg>
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">Ventas / WhatsApp</p>
              <p className="text-base font-black text-slate-900 group-hover:text-green-700 transition-colors">+54 9 11 5953-4330</p>
            </div>
          </a>

          {/* Teléfono 2 (Taller / Administración) */}
          <a
            href="https://wa.me/5491131679782"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Contactar por WhatsApp o teléfono a Administración: +54 9 11 3167-9782"
            className="flex items-center gap-4 p-4 rounded-md bg-slate-50 hover:bg-blue-50/60 border border-slate-200 hover:border-blue-300 transition-all group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 block"
          >
            <div className="text-blue-600 group-hover:scale-110 transition-transform">
              <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 5h2l2 5-2.5 1.5A11 11 0 0012 19.5L13.5 17l5 2v2a2 2 0 01-2 2h-1C8 21 3 15 3 7V5z"/>
              </svg>
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">Taller / Administración</p>
              <p className="text-base font-black text-slate-900 group-hover:text-blue-900 transition-colors">+54 9 11 3167-9782</p>
            </div>
          </a>

          {/* Email */}
          <div className="flex items-center gap-4 p-4 rounded-md bg-slate-50 border border-slate-200 text-slate-400">
            <div className="text-slate-400">
              <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
              </svg>
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Correo Electrónico</p>
              <p className="text-base font-bold text-slate-500">Próximamente</p>
            </div>
          </div>

        </div>
      </div>
    </main>
  );
}
export default function Contacto() {
  return (
    <main className="min-h-screen bg-slate-50 flex flex-col items-center pt-12 md:pt-24 p-4">
      {/* TARJETA CENTRAL */}
      <div className="bg-white p-8 md:p-12 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.05)] border border-slate-200 w-full max-w-md text-center">
        
        {/* Ícono de encabezado */}
        <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-6 transform -rotate-3">
          <svg width="32" height="32" fill="none" stroke="currentColor" viewBox="0 0 24 24" className="text-blue-900">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
          </svg>
        </div>

        <h1 className="text-3xl font-black text-gray-900 italic mb-2">CONTACTO</h1>
        <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mb-10">
          Comunicate con nosotros
        </p>

        {/* LISTA DE CONTACTOS */}
        <div className="space-y-4 text-left">
          
          {/* Teléfono 1 */}
          <div className="flex items-center gap-5 p-4 rounded-xl bg-slate-50 hover:bg-blue-50/50 border border-slate-100 hover:border-blue-200 transition-colors group">
            <div className="text-blue-400 group-hover:text-blue-600 transition-colors">
              <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M3 5h2l2 5-2.5 1.5A11 11 0 0012 19.5L13.5 17l5 2v2a2 2 0 01-2 2h-1C8 21 3 15 3 7V5z"/></svg>
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Ventas / WhatsApp</p>
              <p className="text-lg font-black text-slate-800">+54 9 11 5953-4330</p>
            </div>
          </div>

          {/* Teléfono 2 */}
          <div className="flex items-center gap-5 p-4 rounded-xl bg-slate-50 hover:bg-blue-50/50 border border-slate-100 hover:border-blue-200 transition-colors group">
            <div className="text-blue-400 group-hover:text-blue-600 transition-colors">
              <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M3 5h2l2 5-2.5 1.5A11 11 0 0012 19.5L13.5 17l5 2v2a2 2 0 01-2 2h-1C8 21 3 15 3 7V5z"/></svg>
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Taller / Administración</p>
              <p className="text-lg font-black text-slate-800">+54 9 11 3167-9782</p>
            </div>
          </div>

          {/* Email */}
          <div className="flex items-center gap-5 p-4 rounded-xl bg-slate-50 hover:bg-blue-50/50 border border-slate-100 hover:border-blue-200 transition-colors group">
            <div className="text-blue-400 group-hover:text-blue-600 transition-colors">
              <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Correo Electrónico</p>
              <p className="text-lg font-black text-slate-800">PROXIMAMENTE</p>
            </div>
          </div>

        </div>
      </div>
    </main>
  );
}
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "FHL Filtros - Panel Admin",
  description: "Panel de administración y facturación de FHL Filtros",
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-100">
      {/* Header Admin */}
      <header className="bg-blue-900 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <a href="/" className="flex-shrink-0">
                <img
                  src="/logo.png"
                  alt="FHL Filtros Logo"
                  className="h-10 w-auto object-contain"
                />
              </a>
              <div className="hidden sm:block h-8 w-px bg-blue-700" />
              <h1 className="text-white font-bold text-lg tracking-tight">
                Panel de Facturación
              </h1>
            </div>
            <a
              href="/"
              className="text-blue-300 hover:text-white text-sm font-medium transition-colors flex items-center gap-1.5"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 18l-6-6 6-6" />
              </svg>
              Volver al sitio
            </a>
          </div>
        </div>
      </header>

      {/* Contenido */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}

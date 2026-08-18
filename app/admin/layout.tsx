import type { Metadata } from 'next';
import AdminHeader from './components/AdminHeader';
import AdminAuthGuard from './components/AdminAuthGuard';

export const metadata: Metadata = {
  title: 'FHL Filtros - Panel Administrativo',
  description: 'Panel de administración, productos, clientes, pedidos y facturación de FHL Filtros',
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AdminAuthGuard>
      <div className="min-h-screen bg-slate-100 flex flex-col">
        <AdminHeader />
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {children}
        </main>
      </div>
    </AdminAuthGuard>
  );
}

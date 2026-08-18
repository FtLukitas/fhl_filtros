import type { Metadata } from 'next';
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
  return <AdminAuthGuard>{children}</AdminAuthGuard>;
}

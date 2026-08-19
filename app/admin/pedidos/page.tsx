'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import type { Pedido, EstadoPedido } from '@/lib/types';

export default function PedidosAdminPage() {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [pagosMap, setPagosMap] = useState<Map<string, number>>(new Map());
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<EstadoPedido | 'todos' | 'con_deuda'>('todos');
  const [verEliminados, setVerEliminados] = useState(false);

  const cargarPedidos = useCallback(async () => {
    setCargando(true);
    try {
      const { data: dbPedidos, error: errPed } = await supabase
        .from('pedidos')
        .select('*, cliente:clientes(*), items:items_pedido(*)')
        .order('created_at', { ascending: false });

      if (errPed) throw errPed;
      setPedidos((dbPedidos as Pedido[]) || []);

      // Cargar pagos
      const { data: dbPagos } = await supabase.from('pagos').select('pedido_id, monto');
      const mapa = new Map<string, number>();
      if (dbPagos) {
        dbPagos.forEach((p: any) => {
          mapa.set(p.pedido_id, (mapa.get(p.pedido_id) || 0) + Number(p.monto || 0));
        });
      }
      setPagosMap(mapa);
    } catch (err) {
      console.error('Error al cargar pedidos:', err);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargarPedidos();
  }, [cargarPedidos]);

  // Acciones de papelera y borrado
  const handleSoftDelete = async (p: Pedido) => {
    if (!confirm(`¿Mover a papelera el Pedido #${p.id.slice(0, 8)}?`)) return;
    const { error } = await supabase.from('pedidos').update({ eliminado: true }).eq('id', p.id);
    if (!error) cargarPedidos();
  };

  const handleRestaurar = async (p: Pedido) => {
    const { error } = await supabase.from('pedidos').update({ eliminado: false }).eq('id', p.id);
    if (!error) cargarPedidos();
  };

  const handleEliminarPermanente = async (p: Pedido) => {
    if (!confirm(`ATENCIÓN: ¿Eliminar PERMANENTEMENTE el Pedido #${p.id.slice(0, 8)} de la base de datos?\n\nEsta acción NO se puede deshacer. Se borrarán definitivamente el pedido, sus ítems y los registros de pagos asociados.`)) return;

    try {
      setCargando(true);
      // 1. Eliminar pagos
      await supabase.from('pagos').delete().eq('pedido_id', p.id);

      // 2. Eliminar ítems
      await supabase.from('items_pedido').delete().eq('pedido_id', p.id);

      // 3. Eliminar pedido
      const { error } = await supabase.from('pedidos').delete().eq('id', p.id);
      if (error) throw error;

      await cargarPedidos();
    } catch (err: any) {
      console.error('Error al eliminar pedido permanentemente:', err);
      alert(`Error al eliminar pedido: ${err.message || 'Error desconocido'}`);
    } finally {
      setCargando(false);
    }
  };

  // Filtrado
  const pedidosFiltrados = pedidos.filter((p) => {
    // Papelera
    if (verEliminados ? !p.eliminado : p.eliminado) return false;

    const pagado = pagosMap.get(p.id) || 0;
    const deuda = Math.max(0, Number(p.total || 0) - pagado);

    if (filtroEstado === 'con_deuda' && (deuda <= 0 || p.estado === 'cancelado')) return false;
    if (filtroEstado !== 'todos' && filtroEstado !== 'con_deuda' && p.estado !== filtroEstado) return false;

    if (!busqueda) return true;
    const b = busqueda.toLowerCase().trim();
    const clienteNombre = p.cliente?.nombre?.toLowerCase() || '';
    const idStr = p.id.toLowerCase();
    const tieneFiltro = p.items?.some((it) => it.codigo_fhl.toLowerCase().includes(b));

    return clienteNombre.includes(b) || idStr.includes(b) || tieneFiltro;
  });

  const totalActivos = pedidos.filter((p) => !p.eliminado).length;
  const totalEnPapelera = pedidos.filter((p) => p.eliminado).length;

  return (
    <div className="space-y-6">
      
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-800 tracking-tight">
            Gestión de Pedidos
          </h2>
          <p className="text-xs text-slate-500 font-medium mt-1">
            Control de pedidos, estados de entrega, saldos y registro de cobranzas.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/admin/facturador"
            className="bg-blue-900 hover:bg-blue-800 text-white px-4 py-2 rounded-md text-xs font-bold transition-all shadow-sm flex items-center gap-1.5"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span>Cargar Nuevo Pedido</span>
          </Link>
        </div>
      </div>

      {/* Barra de Filtros */}
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          
          {/* Filtros por estado */}
          <div className="flex items-center gap-1.5 flex-wrap" role="group" aria-label="Filtrar pedidos por estado">
            <button
              onClick={() => setFiltroEstado('todos')}
              aria-pressed={filtroEstado === 'todos'}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                filtroEstado === 'todos'
                  ? 'bg-blue-900 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Todos ({verEliminados ? totalEnPapelera : totalActivos})
            </button>
            <button
              onClick={() => setFiltroEstado('pendiente')}
              aria-pressed={filtroEstado === 'pendiente'}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                filtroEstado === 'pendiente'
                  ? 'bg-amber-500 text-white shadow-sm'
                  : 'bg-amber-50 text-amber-800 hover:bg-amber-100'
              }`}
            >
              Pendientes ({pedidos.filter((p) => (!verEliminados ? !p.eliminado : p.eliminado) && p.estado === 'pendiente').length})
            </button>
            <button
              onClick={() => setFiltroEstado('confirmado')}
              aria-pressed={filtroEstado === 'confirmado'}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                filtroEstado === 'confirmado'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-blue-50 text-blue-800 hover:bg-blue-100'
              }`}
            >
              Confirmados ({pedidos.filter((p) => (!verEliminados ? !p.eliminado : p.eliminado) && p.estado === 'confirmado').length})
            </button>
            <button
              onClick={() => setFiltroEstado('entregado')}
              aria-pressed={filtroEstado === 'entregado'}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                filtroEstado === 'entregado'
                  ? 'bg-green-700 text-white shadow-sm'
                  : 'bg-green-50 text-green-800 hover:bg-green-100'
              }`}
            >
              Entregados ({pedidos.filter((p) => (!verEliminados ? !p.eliminado : p.eliminado) && p.estado === 'entregado').length})
            </button>
            <button
              onClick={() => setFiltroEstado('cancelado')}
              aria-pressed={filtroEstado === 'cancelado'}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                filtroEstado === 'cancelado'
                  ? 'bg-slate-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Cancelados
            </button>
            <button
              onClick={() => setFiltroEstado('con_deuda')}
              aria-pressed={filtroEstado === 'con_deuda'}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                filtroEstado === 'con_deuda'
                  ? 'bg-red-600 text-white shadow-sm'
                  : 'bg-red-50 text-red-700 hover:bg-red-100'
              }`}
            >
              Con Deuda Pendiente
            </button>
          </div>

          {/* Toggle Papelera */}
          <button
            onClick={() => setVerEliminados(!verEliminados)}
            className={`text-xs font-bold px-3 py-1.5 rounded-md border transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
              verEliminados
                ? 'bg-red-50 border-red-200 text-red-700'
                : 'bg-slate-50 border-slate-200 text-slate-500 hover:text-slate-800'
            }`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
            </svg>
            <span>{verEliminados ? `Viendo Papelera (${totalEnPapelera})` : `Ver Papelera (${totalEnPapelera})`}</span>
          </button>
        </div>

        {/* Buscador */}
        <div className="relative">
          <svg
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por cliente, ID de pedido o código de filtro..."
            aria-label="Buscar pedidos por cliente, ID o código de filtro"
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-md text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white transition-all"
          />
        </div>
      </div>

      {/* Tabla de Pedidos */}
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider">
              <tr>
                <th scope="col" className="p-3.5">ID / Fecha</th>
                <th scope="col" className="p-3.5">Cliente</th>
                <th scope="col" className="p-3.5">Estado</th>
                <th scope="col" className="p-3.5">Ítems</th>
                <th scope="col" className="p-3.5 text-right">Total</th>
                <th scope="col" className="p-3.5 text-right">Pagado</th>
                <th scope="col" className="p-3.5 text-right">Deuda</th>
                <th scope="col" className="p-3.5 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {cargando ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-400">
                    <div className="flex items-center justify-center gap-2">
                      <div className="h-4 w-4 border-2 border-blue-900 border-t-transparent rounded-full animate-spin" aria-hidden="true" />
                      <span>Cargando pedidos...</span>
                    </div>
                  </td>
                </tr>
              ) : pedidosFiltrados.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-400">
                    {verEliminados ? 'No hay pedidos en la papelera.' : 'No se encontraron pedidos con los filtros seleccionados.'}
                  </td>
                </tr>
              ) : (
                pedidosFiltrados.map((p) => {
                  const pagado = pagosMap.get(p.id) || 0;
                  const deuda = Math.max(0, Number(p.total || 0) - pagado);

                  return (
                    <tr key={p.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="p-3.5">
                        <span className="font-bold text-slate-900 block font-mono">
                          #{p.id.slice(0, 8)}
                        </span>
                        <span className="text-[11px] text-slate-400">
                          {new Date(p.created_at).toLocaleDateString('es-AR', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                          })}
                        </span>
                      </td>

                      <td className="p-3.5">
                        {p.cliente ? (
                          <Link
                            href={`/admin/clientes/${p.cliente.id}`}
                            className="font-bold text-blue-900 hover:underline block"
                          >
                            {p.cliente.nombre}
                          </Link>
                        ) : (
                          <span className="text-slate-400 italic">Cliente no encontrado</span>
                        )}
                        {p.cliente?.cuit && (
                          <span className="text-[10px] text-slate-400 font-mono">
                            {p.cliente.cuit}
                          </span>
                        )}
                      </td>

                      <td className="p-3.5">
                        <span
                          className={`px-2.5 py-1 rounded text-[10px] font-bold uppercase ${
                            p.estado === 'entregado'
                              ? 'bg-green-100 text-green-800'
                              : p.estado === 'confirmado'
                              ? 'bg-blue-100 text-blue-800'
                              : p.estado === 'cancelado'
                              ? 'bg-slate-100 text-slate-600'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {p.estado}
                        </span>
                      </td>

                      <td className="p-3.5 text-slate-600">
                        <span className="font-bold text-slate-800">
                          {p.items?.reduce((s, it) => s + it.cantidad, 0) || 0}
                        </span>{' '}
                        unidades ({p.items?.length || 0} tipos)
                      </td>

                      <td className="p-3.5 text-right font-black text-slate-900 font-mono text-sm">
                        ${Number(p.total || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                      </td>

                      <td className="p-3.5 text-right font-bold text-green-700 font-mono">
                        ${pagado.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                      </td>

                      <td className="p-3.5 text-right font-black font-mono">
                        <span className={deuda > 0 ? 'text-red-600' : 'text-slate-400'}>
                          ${deuda.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                        </span>
                      </td>

                      <td className="p-3.5 text-right">
                        {!verEliminados ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <Link
                              href={`/admin/facturador?pedidoId=${p.id}`}
                              className="p-1.5 text-slate-500 hover:text-amber-600 rounded-md hover:bg-amber-50 transition-colors cursor-pointer"
                              title="Editar pedido"
                              aria-label={`Editar pedido #${p.id.slice(0, 8)}`}
                            >
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                              </svg>
                            </Link>
                            <Link
                              href={`/admin/pedidos/${p.id}`}
                              className="px-3 py-1.5 bg-blue-900 hover:bg-blue-800 text-white rounded-md font-bold text-[11px] transition-colors shadow-xs"
                            >
                              Ver Detalle →
                            </Link>
                            <button
                              onClick={() => handleSoftDelete(p)}
                              className="text-slate-400 hover:text-red-600 p-1.5 rounded-md hover:bg-red-50 transition-colors cursor-pointer"
                              title="Mover a papelera"
                              aria-label={`Mover a papelera pedido #${p.id.slice(0, 8)}`}
                            >
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                              </svg>
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => handleRestaurar(p)}
                              className="text-xs bg-green-600 hover:bg-green-700 text-white font-bold px-2.5 py-1 rounded-md transition-colors cursor-pointer"
                              title="Restaurar pedido"
                              aria-label={`Restaurar pedido #${p.id.slice(0, 8)}`}
                            >
                              Restaurar
                            </button>
                            <button
                              onClick={() => handleEliminarPermanente(p)}
                              className="text-xs bg-red-600 hover:bg-red-700 text-white font-bold px-2.5 py-1 rounded-md transition-colors cursor-pointer"
                              title="Eliminar de forma permanente de la base de datos"
                              aria-label={`Eliminar permanentemente pedido #${p.id.slice(0, 8)}`}
                            >
                              Eliminar Definitivo
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}

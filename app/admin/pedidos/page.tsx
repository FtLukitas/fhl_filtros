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
  const [filtroEstado, setFiltroEstado] = useState<EstadoPedido | 'todos'>('todos');
  const [filtroPago, setFiltroPago] = useState<'todos' | 'con_deuda' | 'saldados'>('todos');
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

      // Cargar pagos agrupados
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
      await supabase.from('movimientos_saldo').delete().eq('referencia_pedido_id', p.id);
      await supabase.from('pagos').delete().eq('pedido_id', p.id);
      await supabase.from('items_pedido').delete().eq('pedido_id', p.id);
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

  // Cálculos globales
  const pedidosActivos = pedidos.filter((p) => !p.eliminado);
  const totalFacturadoActivo = pedidosActivos
    .filter((p) => p.estado !== 'cancelado')
    .reduce((sum, p) => sum + Number(p.total || 0), 0);

  const totalCobradoActivo = pedidosActivos
    .filter((p) => p.estado !== 'cancelado')
    .reduce((sum, p) => sum + (pagosMap.get(p.id) || 0), 0);

  const totalDeudaActiva = Math.max(0, totalFacturadoActivo - totalCobradoActivo);

  // Filtrado
  const pedidosFiltrados = pedidos.filter((p) => {
    // Papelera
    if (verEliminados ? !p.eliminado : p.eliminado) return false;

    const pagado = pagosMap.get(p.id) || 0;
    const deuda = Math.max(0, Number(p.total || 0) - pagado);

    // Filtro logístico
    if (filtroEstado !== 'todos' && p.estado !== filtroEstado) return false;

    // Filtro de pago
    if (filtroPago === 'con_deuda' && (deuda <= 0 || p.estado === 'cancelado')) return false;
    if (filtroPago === 'saldados' && (deuda > 0 || p.estado === 'cancelado')) return false;

    if (!busqueda) return true;
    const b = busqueda.toLowerCase().trim();
    const clienteNombre = p.cliente?.nombre?.toLowerCase() || '';
    const idStr = p.id.toLowerCase();
    const tieneFiltro = p.items?.some((it) => it.codigo_fhl.toLowerCase().includes(b));

    return clienteNombre.includes(b) || idStr.includes(b) || tieneFiltro;
  });

  const totalActivosCount = pedidosActivos.length;
  const totalEnPapeleraCount = pedidos.filter((p) => p.eliminado).length;

  return (
    <div className="space-y-6">
      
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-800 tracking-tight">
            Gestión de Pedidos & Cobranzas
          </h2>
          <p className="text-xs text-slate-500 font-medium mt-1">
            Control de pedidos, entregas logísticas, estados de pago y saldos de clientes.
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

      {/* KPI Cards Financieros */}
      {!verEliminados && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-lg p-4 border border-slate-200 shadow-xs">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">
              Total Facturado
            </span>
            <span className="text-xl font-black text-slate-900 font-mono mt-1 block">
              ${totalFacturadoActivo.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
            </span>
            <span className="text-[11px] text-slate-500 mt-0.5 block">
              {pedidosActivos.filter(p => p.estado !== 'cancelado').length} pedidos activos
            </span>
          </div>

          <div className="bg-white rounded-lg p-4 border border-slate-200 shadow-xs">
            <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest block">
              Total Cobrado
            </span>
            <span className="text-xl font-black text-emerald-700 font-mono mt-1 block">
              ${totalCobradoActivo.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
            </span>
            <span className="text-[11px] text-emerald-600/80 mt-0.5 block">
              {totalFacturadoActivo > 0 ? `${Math.round((totalCobradoActivo / totalFacturadoActivo) * 100)}% de efectividad` : 'Sin pedidos'}
            </span>
          </div>

          <div className="bg-white rounded-lg p-4 border border-slate-200 shadow-xs">
            <span className="text-[10px] font-bold text-red-600 uppercase tracking-widest block">
              Deuda Pendiente
            </span>
            <span className="text-xl font-black text-red-600 font-mono mt-1 block">
              ${totalDeudaActiva.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
            </span>
            <span className="text-[11px] text-red-600/80 mt-0.5 block">
              {pedidosActivos.filter(p => (Number(p.total || 0) - (pagosMap.get(p.id) || 0)) > 0 && p.estado !== 'cancelado').length} pedidos con saldo pendiente
            </span>
          </div>
        </div>
      )}

      {/* Barra de Filtros */}
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          
          {/* Filtros por estado logístico */}
          <div className="flex items-center gap-1.5 flex-wrap" role="group" aria-label="Filtrar pedidos por estado">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1">Logística:</span>
            <button
              onClick={() => setFiltroEstado('todos')}
              aria-pressed={filtroEstado === 'todos'}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                filtroEstado === 'todos'
                  ? 'bg-blue-900 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Todos ({verEliminados ? totalEnPapeleraCount : totalActivosCount})
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
          </div>

          {/* Filtros por estado de pago */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1">Cobro:</span>
            <button
              onClick={() => setFiltroPago('todos')}
              className={`px-2.5 py-1 rounded text-xs font-bold transition-all cursor-pointer ${
                filtroPago === 'todos'
                  ? 'bg-slate-800 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Todos
            </button>
            <button
              onClick={() => setFiltroPago('con_deuda')}
              className={`px-2.5 py-1 rounded text-xs font-bold transition-all cursor-pointer ${
                filtroPago === 'con_deuda'
                  ? 'bg-red-600 text-white'
                  : 'bg-red-50 text-red-700 hover:bg-red-100'
              }`}
            >
              Impagos / Deuda
            </button>
            <button
              onClick={() => setFiltroPago('saldados')}
              className={`px-2.5 py-1 rounded text-xs font-bold transition-all cursor-pointer ${
                filtroPago === 'saldados'
                  ? 'bg-emerald-700 text-white'
                  : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
              }`}
            >
              Saldados
            </button>

            {/* Toggle Papelera */}
            <button
              onClick={() => setVerEliminados(!verEliminados)}
              className={`text-xs font-bold px-3 py-1 rounded-md border transition-all flex items-center gap-1.5 shrink-0 ml-2 cursor-pointer ${
                verEliminados
                  ? 'bg-red-50 border-red-200 text-red-700'
                  : 'bg-slate-50 border-slate-200 text-slate-500 hover:text-slate-800'
              }`}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
              </svg>
              <span>{verEliminados ? `Papelera (${totalEnPapeleraCount})` : `Papelera (${totalEnPapeleraCount})`}</span>
            </button>
          </div>

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
        {cargando ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3">
            <div className="h-8 w-8 border-3 border-blue-900 border-t-transparent rounded-full animate-spin" />
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Cargando pedidos...
            </p>
          </div>
        ) : pedidosFiltrados.length === 0 ? (
          <div className="py-16 text-center text-slate-400">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto mb-2 text-slate-300">
              <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
              <path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16" />
            </svg>
            <p className="text-xs font-bold text-slate-600">No se encontraron pedidos</p>
            <p className="text-[11px] text-slate-400 mt-1">
              Probá cambiando los filtros o cargá un nuevo pedido desde el Facturador.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200 uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="p-3.5">Pedido / Fecha</th>
                  <th className="p-3.5">Cliente</th>
                  <th className="p-3.5">Logística</th>
                  <th className="p-3.5">Cobro</th>
                  <th className="p-3.5">Unidades</th>
                  <th className="p-3.5 text-right">Total</th>
                  <th className="p-3.5 text-right">Pagado</th>
                  <th className="p-3.5 text-right">Deuda</th>
                  <th className="p-3.5 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pedidosFiltrados.map((p) => {
                  const pagado = pagosMap.get(p.id) || 0;
                  const deuda = Math.max(0, Number(p.total || 0) - pagado);
                  const estadoPago = deuda === 0 && Number(p.total || 0) > 0 ? 'saldado' : pagado > 0 ? 'parcial' : 'impago';

                  return (
                    <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                      <td className="p-3.5">
                        <Link
                          href={`/admin/pedidos/${p.id}`}
                          className="font-bold text-blue-900 font-mono text-sm hover:underline block"
                        >
                          #{p.id.slice(0, 8)}
                        </Link>
                        <span className="text-[10px] text-slate-400">
                          {new Date(p.created_at).toLocaleDateString('es-AR')}
                        </span>
                      </td>

                      <td className="p-3.5">
                        {p.cliente ? (
                          <Link
                            href={`/admin/clientes/${p.cliente.id}`}
                            className="font-bold text-slate-900 hover:text-blue-900 hover:underline block"
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
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
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

                      <td className="p-3.5">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${
                            estadoPago === 'saldado'
                              ? 'bg-emerald-100 text-emerald-800'
                              : estadoPago === 'parcial'
                              ? 'bg-amber-100 text-amber-900'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {estadoPago === 'saldado' ? 'Saldado' : estadoPago === 'parcial' ? 'Parcial' : 'Impago'}
                        </span>
                      </td>

                      <td className="p-3.5 text-slate-600">
                        <span className="font-bold text-slate-800">
                          {p.items?.reduce((s, it) => s + it.cantidad, 0) || 0}
                        </span>{' '}
                        u.
                      </td>

                      <td className="p-3.5 text-right font-black text-slate-900 font-mono text-sm">
                        ${Number(p.total || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                      </td>

                      <td className="p-3.5 text-right font-bold text-emerald-700 font-mono">
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
                              {deuda > 0 ? 'Cobrar / Ver →' : 'Ver Detalle →'}
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
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
}

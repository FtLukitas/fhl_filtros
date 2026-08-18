'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { generarPDF } from '@/lib/generarPDF';
import type { Pedido, Cliente, Presupuesto } from '@/lib/types';

export default function AdminDashboardPage() {
  const [cargando, setCargando] = useState(true);
  const [metricas, setMetricas] = useState({
    pedidosPendientes: 0,
    totalPedidos: 0,
    clientesConDeuda: 0,
    totalClientes: 0,
    montoTotalDeuda: 0,
    facturacionMes: 0,
    saldoAFavorTotal: 0,
    totalFiltros: 0,
    totalVehiculos: 0,
    totalPresupuestos: 0,
  });

  const [ultimosPedidos, setUltimosPedidos] = useState<Pedido[]>([]);
  const [topClientesDeuda, setTopClientesDeuda] = useState<{ cliente: Cliente; deuda: number }[]>([]);
  const [ultimosPresupuestos, setUltimosPresupuestos] = useState<Presupuesto[]>([]);

  const cargarDashboard = useCallback(async () => {
    setCargando(true);
    try {
      // 1. Clientes
      const { data: dbClientes } = await supabase.from('clientes').select('*').eq('eliminado', false);
      const clientes = (dbClientes as Cliente[]) || [];

      // 2. Pedidos no cancelados
      const { data: dbPedidos } = await supabase
        .from('pedidos')
        .select('*, cliente:clientes(*), items:items_pedido(*)')
        .order('created_at', { ascending: false });
      const pedidos = (dbPedidos as Pedido[]) || [];

      // 3. Pagos
      const { data: dbPagos } = await supabase.from('pagos').select('*');
      const pagos = dbPagos || [];

      // 4. Movimientos saldo
      const { data: dbSaldo } = await supabase.from('movimientos_saldo').select('*');
      const saldoMovs = dbSaldo || [];

      // 5. Presupuestos
      const { data: dbPresupuestos } = await supabase
        .from('presupuestos')
        .select('*, cliente:clientes(*), items:items_presupuesto(*)')
        .order('created_at', { ascending: false });
      const listaPresupuestos = (dbPresupuestos as Presupuesto[]) || [];
      setUltimosPresupuestos(listaPresupuestos.slice(0, 5));

      // 6. Cantidad de filtros y vehículos
      const { count: countFiltros } = await supabase
        .from('Tabla A')
        .select('*', { count: 'exact', head: true })
        .or('eliminado.is.null,eliminado.eq.false');

      const { count: countVehiculos } = await supabase
        .from('Tabla B')
        .select('*', { count: 'exact', head: true })
        .or('eliminado.is.null,eliminado.eq.false');

      // Pagos mapeados
      const pagosPorPedido = new Map<string, number>();
      pagos.forEach((p: any) => {
        pagosPorPedido.set(p.pedido_id, (pagosPorPedido.get(p.pedido_id) || 0) + Number(p.monto || 0));
      });

      // Deuda por cliente
      const deudaPorCliente = new Map<string, number>();
      let montoTotalDeuda = 0;

      pedidos
        .filter((p) => p.estado !== 'cancelado')
        .forEach((p) => {
          const pagado = pagosPorPedido.get(p.id) || 0;
          const deuda = Math.max(0, Number(p.total || 0) - pagado);
          if (deuda > 0) {
            deudaPorCliente.set(p.cliente_id, (deudaPorCliente.get(p.cliente_id) || 0) + deuda);
            montoTotalDeuda += deuda;
          }
        });

      // Facturación del mes actual
      const ahora = new Date();
      const mesActual = ahora.getMonth();
      const anioActual = ahora.getFullYear();

      const facturacionMes = pedidos
        .filter((p) => {
          if (p.estado === 'cancelado') return false;
          const f = new Date(p.created_at);
          return f.getMonth() === mesActual && f.getFullYear() === anioActual;
        })
        .reduce((sum, p) => sum + Number(p.total || 0), 0);

      // Saldo a favor total por cliente
      const saldoPorCliente = new Map<string, number>();
      saldoMovs.forEach((s: any) => {
        saldoPorCliente.set(s.cliente_id, (saldoPorCliente.get(s.cliente_id) || 0) + Number(s.monto || 0));
      });
      const saldoTotal = Array.from(saldoPorCliente.values()).reduce((sum, s) => sum + Math.max(0, s), 0);

      // Pedidos pendientes
      const pendientes = pedidos.filter((p) => p.estado === 'pendiente').length;

      // Top clientes con mayor deuda
      const rankingDeuda: { cliente: Cliente; deuda: number }[] = [];
      deudaPorCliente.forEach((deuda, cId) => {
        const cObj = clientes.find((c) => c.id === cId);
        if (cObj && deuda > 0) {
          rankingDeuda.push({ cliente: cObj, deuda });
        }
      });
      rankingDeuda.sort((a, b) => b.deuda - a.deuda);

      setMetricas({
        pedidosPendientes: pendientes,
        totalPedidos: pedidos.length,
        clientesConDeuda: rankingDeuda.length,
        totalClientes: clientes.length,
        montoTotalDeuda,
        facturacionMes,
        saldoAFavorTotal: saldoTotal,
        totalFiltros: countFiltros || 0,
        totalVehiculos: countVehiculos || 0,
        totalPresupuestos: listaPresupuestos.length,
      });

      setUltimosPedidos(pedidos.slice(0, 5));
      setTopClientesDeuda(rankingDeuda.slice(0, 5));
    } catch (err) {
      console.error('Error al cargar dashboard:', err);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargarDashboard();
  }, [cargarDashboard]);

  const handleDescargarPDF = async (p: Presupuesto) => {
    if (!p.cliente) return;
    try {
      const itemsFactura = (p.items || []).map((it, idx) => ({
        id: String(idx),
        codigo_fhl: it.codigo_fhl,
        cantidad: it.cantidad,
        precioUnitario: it.precio_unitario,
      }));

      await generarPDF({
        cliente: p.cliente,
        items: itemsFactura,
        observaciones: p.observaciones || '',
        numeroPresupuesto: p.numero || undefined,
        validezDias: p.validez_dias,
      });
    } catch (err) {
      console.error(err);
    }
  };

  if (cargando) {
    return (
      <div className="py-20 flex flex-col items-center justify-center gap-3">
        <div className="h-8 w-8 border-3 border-blue-900 border-t-transparent rounded-full animate-spin" />
        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
          Cargando panel de control...
        </p>
      </div>
    );
  }

  const modulosPrincipales = [
    {
      titulo: 'Productos & Catálogo',
      descripcion: 'Gestión de filtros (Tabla A), vehículos (Tabla B), fotos WebP e importador Excel/CSV.',
      badge: `${metricas.totalFiltros} Filtros • ${metricas.totalVehiculos} Vehículos`,
      href: '/admin/productos',
      color: 'from-blue-900 to-indigo-950',
      icono: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
          <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
          <line x1="12" y1="22.08" x2="12" y2="12" />
        </svg>
      ),
      linkText: 'Administrar Catálogo',
    },
    {
      titulo: 'Clientes & Cuentas Corrientes',
      descripcion: 'Fichas individuales, saldos a favor, historial de pagos, deudas y precios especiales.',
      badge: `${metricas.totalClientes} Clientes (${metricas.clientesConDeuda} con deuda)`,
      href: '/admin/clientes',
      color: 'from-slate-800 to-slate-950',
      icono: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 00-3-3.87" />
          <path d="M16 3.13a4 4 0 010 7.75" />
        </svg>
      ),
      linkText: 'Ver Cuentas de Clientes',
    },
    {
      titulo: 'Gestión de Pedidos & Ventas',
      descripcion: 'Control de estados (pendiente/confirmado/entregado), cobranzas, deudas y comprobantes PDF.',
      badge: `${metricas.totalPedidos} Pedidos (${metricas.pedidosPendientes} pendientes)`,
      href: '/admin/pedidos',
      color: 'from-blue-800 to-blue-950',
      icono: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
          <rect x="9" y="3" width="6" height="4" rx="1" />
          <path d="M9 14l2 2 4-4" />
        </svg>
      ),
      linkText: 'Gestionar Pedidos',
    },
    {
      titulo: 'Cargar Nuevo Pedido',
      descripcion: 'Cotizador y creador rápido de pedidos con autocompletado y descarga inmediata de PDF.',
      badge: 'Emisión Rápida',
      href: '/admin/facturador',
      color: 'from-green-700 to-emerald-900',
      icono: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="16" />
          <line x1="8" y1="12" x2="16" y2="12" />
        </svg>
      ),
      linkText: 'Crear Pedido',
    },
    {
      titulo: 'Listas de Precios',
      descripcion: 'Tarifas comerciales directas, importación de Excel (2 columnas), edición por filtro y aumentos por %.',
      badge: 'Tarifas & Excel',
      href: '/admin/listas-precios',
      color: 'from-amber-700 to-amber-900',
      icono: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
          <line x1="7" y1="7" x2="7.01" y2="7" />
        </svg>
      ),
      linkText: 'Ver Listas',
    },
    {
      titulo: 'Auditoría IA de Catálogo',
      descripcion: 'Control de calidad con IA para precios, dimensiones, códigos e importaciones de Excel.',
      badge: 'IA Nemotron Nano',
      href: '/admin/auditoria',
      color: 'from-indigo-900 to-slate-900',
      icono: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
      ),
      linkText: 'Auditar Catálogo',
    },
  ];

  return (
    <div className="space-y-8">
      
      {/* Encabezado Principal */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            FHL Filtros — Panel de Control
          </span>
          <h2 className="text-3xl font-black text-slate-900 tracking-tight">
            Dashboard General
          </h2>
          <p className="text-xs text-slate-500 font-medium mt-1">
            Centro de control unificado: navegá directamente a cualquier módulo de administración.
          </p>
        </div>

        <button
          onClick={cargarDashboard}
          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md text-xs font-bold transition-colors flex items-center gap-1.5 self-start sm:self-auto cursor-pointer"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
            <polyline points="23 4 23 10 17 10" />
            <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" />
          </svg>
          <span>Actualizar</span>
        </button>
      </div>

      {/* KPI STATS BAR */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Facturación del Mes
            </span>
            <div className="p-2 rounded-lg bg-emerald-50 text-emerald-700">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                <line x1="12" y1="1" x2="12" y2="23" />
                <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
              </svg>
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-black font-mono text-slate-900 block">
              ${metricas.facturacionMes.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="text-xs text-slate-400 font-medium mt-0.5 block">
              Mes en curso
            </span>
          </div>
        </div>

        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Deuda por Cobrar
            </span>
            <div className="p-2 rounded-lg bg-red-50 text-red-700">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-black font-mono text-red-600 block">
              ${metricas.montoTotalDeuda.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="text-xs text-slate-400 font-medium mt-0.5 block">
              {metricas.clientesConDeuda} {metricas.clientesConDeuda === 1 ? 'cliente' : 'clientes'} con saldo
            </span>
          </div>
        </div>

        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Saldo a Favor Clientes
            </span>
            <div className="p-2 rounded-lg bg-blue-50 text-blue-900">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-black font-mono text-blue-900 block">
              ${metricas.saldoAFavorTotal.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="text-xs text-slate-400 font-medium mt-0.5 block">
              Crédito a favor acumulado
            </span>
          </div>
        </div>

        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Pedidos Pendientes
            </span>
            <div className="p-2 rounded-lg bg-amber-50 text-amber-700">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-black font-mono text-amber-700 block">
              {metricas.pedidosPendientes}
            </span>
            <span className="text-xs text-slate-400 font-medium mt-0.5 block">
              De {metricas.totalPedidos} pedidos totales
            </span>
          </div>
        </div>
      </div>

      {/* SECCIÓN 1: ACCESOS DIRECTOS A TODAS LAS SECCIONES */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">
            Módulos del Sistema
          </h3>
          <span className="text-xs text-slate-400 font-medium">7 módulos disponibles</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {modulosPrincipales.map((mod) => (
            <Link
              key={mod.href}
              href={mod.href}
              className="bg-white rounded-xl p-6 border border-slate-200 shadow-xs hover:shadow-md hover:border-blue-400 transition-all flex flex-col justify-between group relative overflow-hidden"
            >
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="p-3 rounded-lg bg-blue-50 text-blue-900 group-hover:bg-blue-900 group-hover:text-white transition-colors">
                    {mod.icono}
                  </div>
                  <span className="text-[11px] font-bold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-md border border-slate-200/60">
                    {mod.badge}
                  </span>
                </div>

                <h4 className="font-bold text-base text-slate-900 group-hover:text-blue-900 transition-colors">
                  {mod.titulo}
                </h4>
                <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                  {mod.descripcion}
                </p>
              </div>

              <div className="pt-4 mt-5 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-blue-900">
                <span>{mod.linkText}</span>
                <span className="group-hover:translate-x-1.5 transition-transform font-bold">→</span>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* SECCIÓN 2: TABLAS DE ACTIVIDAD RECIENTE */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Últimos Pedidos (7 columnas) */}
        <div className="lg:col-span-7 bg-white rounded-xl shadow-xs border border-slate-200 overflow-hidden flex flex-col">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
              <span className="w-2 h-2 bg-blue-900 rounded-full" />
              Últimos Pedidos
            </h3>
            <Link
              href="/admin/pedidos"
              className="text-xs font-bold text-blue-900 hover:underline"
            >
              Ver todos ({metricas.totalPedidos}) →
            </Link>
          </div>

          <div className="flex-1 overflow-x-auto">
            {ultimosPedidos.length === 0 ? (
              <p className="p-8 text-center text-xs text-slate-400 italic">
                No hay pedidos registrados aún.
              </p>
            ) : (
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider">
                  <tr>
                    <th scope="col" className="p-3">ID / Fecha</th>
                    <th scope="col" className="p-3">Cliente</th>
                    <th scope="col" className="p-3">Estado</th>
                    <th scope="col" className="p-3 text-right">Total</th>
                    <th scope="col" className="p-3 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {ultimosPedidos.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="p-3">
                        <span className="font-bold text-slate-900 block font-mono">
                          #{p.id.slice(0, 8)}
                        </span>
                        <span className="text-[11px] text-slate-400">
                          {new Date(p.created_at).toLocaleDateString('es-AR')}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className="font-bold text-slate-800 block">
                          {p.cliente?.nombre || '—'}
                        </span>
                      </td>
                      <td className="p-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
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
                      <td className="p-3 text-right font-black font-mono text-slate-900">
                        ${Number(p.total || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-3 text-right">
                        <Link
                          href={`/admin/pedidos/${p.id}`}
                          className="px-2.5 py-1 bg-slate-100 hover:bg-blue-900 hover:text-white rounded font-bold text-[11px] transition-colors"
                        >
                          Ver →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Top Clientes con Mayor Deuda (5 columnas) */}
        <div className="lg:col-span-5 bg-white rounded-xl shadow-xs border border-slate-200 overflow-hidden flex flex-col">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
              <span className="w-2 h-2 bg-red-600 rounded-full" />
              Mayor Deuda Pendiente
            </h3>
            <Link
              href="/admin/clientes"
              className="text-xs font-bold text-red-600 hover:underline"
            >
              Ver clientes ({metricas.totalClientes}) →
            </Link>
          </div>

          <div className="p-5 flex-1 space-y-3">
            {topClientesDeuda.length === 0 ? (
              <p className="text-xs text-slate-400 italic text-center py-6">
                No hay clientes con deudas pendientes actualmente.
              </p>
            ) : (
              topClientesDeuda.map(({ cliente, deuda }) => (
                <Link
                  key={cliente.id}
                  href={`/admin/clientes/${cliente.id}`}
                  className="p-3 bg-slate-50 hover:bg-red-50/40 rounded-md border border-slate-100 hover:border-red-200 transition-all flex items-center justify-between group"
                >
                  <div>
                    <span className="font-bold text-slate-900 text-xs block group-hover:text-red-700 transition-colors">
                      {cliente.nombre}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {cliente.cuit ? `CUIT: ${cliente.cuit}` : 'Sin CUIT'}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="font-black text-red-600 font-mono text-sm block">
                      ${deuda.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                    </span>
                    <span className="text-[10px] text-slate-400">Ver ficha →</span>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>

      </div>

    </div>
  );
}

'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import type { Cliente, ListaPrecio, ResumenFinancieroCliente } from '@/lib/types';
import ModalAjusteSaldo from './components/ModalAjusteSaldo';

export default function ClientesAdminPage() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [resumenes, setResumenes] = useState<Record<string, ResumenFinancieroCliente>>({});
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [verEliminados, setVerEliminados] = useState(false);
  const [filtroEstado, setFiltroEstado] = useState<'todos' | 'con_deuda' | 'con_saldo' | 'al_dia'>('todos');

  // Modal nuevo / editar cliente
  const [modalCliente, setModalCliente] = useState<{ abierto: boolean; cliente?: Cliente | null }>({ abierto: false });

  // Listas de Precios Disponibles
  const [listasPrecios, setListasPrecios] = useState<ListaPrecio[]>([]);
  const [listaPrecioId, setListaPrecioId] = useState<string>('');

  // Modal ajuste saldo
  const [modalSaldo, setModalSaldo] = useState<{
    abierto: boolean;
    cliente: Cliente | null;
    deudaActual: number;
    saldoActual: number;
    saldoNetoActual: number;
  }>({
    abierto: false,
    cliente: null,
    deudaActual: 0,
    saldoActual: 0,
    saldoNetoActual: 0,
  });
  
  // Campos del formulario
  const [nombre, setNombre] = useState('');
  const [cuit, setCuit] = useState('');
  const [email, setEmail] = useState('');
  const [telefono, setTelefono] = useState('');
  const [direccion, setDireccion] = useState('');
  const [ciudad, setCiudad] = useState('');
  const [provincia, setProvincia] = useState('');
  const [condicionIva, setCondicionIva] = useState('Responsable Inscripto');
  const [tipoCliente, setTipoCliente] = useState('Mayorista');
  const [descuentoPredeterminado, setDescuentoPredeterminado] = useState<number>(0);
  const [plazoPago, setPlazoPago] = useState('Contado');
  const [notas, setNotas] = useState('');

  const [guardando, setGuardando] = useState(false);
  const [errorModal, setErrorModal] = useState<string | null>(null);

  const cargarDatos = useCallback(async () => {
    setCargando(true);
    try {
      // 0. Cargar listas de precios activas
      const { data: dbListas } = await supabase
        .from('listas_precios')
        .select('*')
        .eq('activa', true)
        .eq('eliminado', false);
      setListasPrecios((dbListas as ListaPrecio[]) || []);

      // 1. Cargar clientes
      let query = supabase.from('clientes').select('*');
      if (verEliminados) {
        query = query.eq('eliminado', true);
      } else {
        query = query.eq('eliminado', false);
      }
      query = query.order('nombre', { ascending: true });

      const { data: dbClientes } = await query;
      const listaClientes = (dbClientes as Cliente[]) || [];
      setClientes(listaClientes);

      // 2. Cargar pedidos no cancelados para calcular compras y deudas
      const { data: dbPedidos } = await supabase
        .from('pedidos')
        .select('id, cliente_id, total, estado')
        .neq('estado', 'cancelado');

      // 3. Cargar pagos
      const { data: dbPagos } = await supabase.from('pagos').select('pedido_id, cliente_id, monto');

      // 4. Cargar movimientos de saldo
      const { data: dbSaldo } = await supabase.from('movimientos_saldo').select('cliente_id, monto');

      // Calcular mapa de pagos por pedido
      const pagosPorPedido = new Map<string, number>();
      if (dbPagos) {
        dbPagos.forEach((p: any) => {
          pagosPorPedido.set(p.pedido_id, (pagosPorPedido.get(p.pedido_id) || 0) + Number(p.monto || 0));
        });
      }

      // Calcular mapa de saldos por cliente
      const saldoPorCliente = new Map<string, number>();
      if (dbSaldo) {
        dbSaldo.forEach((s: any) => {
          saldoPorCliente.set(s.cliente_id, (saldoPorCliente.get(s.cliente_id) || 0) + Number(s.monto || 0));
        });
      }

      // Construir mapa de resumenes financieros por cliente
      const mapaResumen: Record<string, ResumenFinancieroCliente> = {};

      listaClientes.forEach((c) => {
        let totalComprado = 0;
        let totalDeudaPedidos = 0;
        let pedidosPendientes = 0;

        if (dbPedidos) {
          dbPedidos
            .filter((p: any) => p.cliente_id === c.id)
            .forEach((p: any) => {
              const totalP = Number(p.total || 0);
              const pagadoP = pagosPorPedido.get(p.id) || 0;
              const deudaP = Math.max(0, totalP - pagadoP);

              totalComprado += totalP;
              totalDeudaPedidos += deudaP;
              if (p.estado === 'pendiente') pedidosPendientes++;
            });
        }

        const balanceSaldo = saldoPorCliente.get(c.id) || 0;
        // Saldo neto unificado: balanceSaldo (+) menos deudas de pedidos (-)
        const saldoNeto = balanceSaldo - totalDeudaPedidos;
        const saldoAFavor = saldoNeto > 0 ? saldoNeto : 0;
        const totalDeuda = saldoNeto < 0 ? Math.abs(saldoNeto) : 0;

        mapaResumen[c.id] = {
          totalComprado,
          totalPagado: totalComprado - totalDeudaPedidos,
          totalDeuda,
          totalSaldoAFavor: saldoAFavor,
          saldoNeto,
          pedidosPendientes,
          pedidosImpagos: totalDeuda > 0 ? 1 : 0,
        };
      });

      setResumenes(mapaResumen);
    } catch (err) {
      console.error('Error al cargar datos de clientes:', err);
    } finally {
      setCargando(false);
    }
  }, [verEliminados]);

  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);

  const abrirCrear = () => {
    setNombre('');
    setCuit('');
    setEmail('');
    setTelefono('');
    setDireccion('');
    setCiudad('');
    setProvincia('');
    setCondicionIva('Responsable Inscripto');
    setTipoCliente('Mayorista');
    setDescuentoPredeterminado(0);
    setPlazoPago('Contado');
    setListaPrecioId('');
    setNotas('');
    setErrorModal(null);
    setModalCliente({ abierto: true, cliente: null });
  };

  const abrirEditar = (c: Cliente) => {
    setNombre(c.nombre || '');
    setCuit(c.cuit || '');
    setEmail(c.email || '');
    setTelefono(c.telefono || '');
    setDireccion(c.direccion || '');
    setCiudad(c.ciudad || '');
    setProvincia(c.provincia || '');
    setCondicionIva(c.condicion_iva || 'Responsable Inscripto');
    setTipoCliente(c.tipo_cliente || 'Mayorista');
    setDescuentoPredeterminado(c.descuento_predeterminado || 0);
    setPlazoPago(c.plazo_pago || 'Contado');
    setListaPrecioId(c.lista_precio_id || '');
    setNotas(c.notas || '');
    setErrorModal(null);
    setModalCliente({ abierto: true, cliente: c });
  };

  const guardarCliente = async () => {
    if (!nombre.trim()) {
      setErrorModal('La Razón Social o Nombre es obligatorio');
      return;
    }

    setGuardando(true);
    setErrorModal(null);

    const payload = {
      nombre: nombre.trim(),
      cuit: cuit.trim() || null,
      direccion: direccion.trim() || null,
      ciudad: ciudad.trim() || null,
      provincia: provincia.trim() || null,
      condicion_iva: condicionIva,
      tipo_cliente: tipoCliente,
      descuento_predeterminado: Number(descuentoPredeterminado) || 0,
      plazo_pago: plazoPago,
      lista_precio_id: listaPrecioId || null,
    };

    try {
      if (modalCliente.cliente) {
        const { error: err } = await supabase
          .from('clientes')
          .update(payload)
          .eq('id', modalCliente.cliente.id);
        if (err) throw err;
      } else {
        const { error: err } = await supabase
          .from('clientes')
          .insert({ ...payload, eliminado: false });
        if (err) throw err;
      }

      setModalCliente({ abierto: false });
      await cargarDatos();
    } catch (err: any) {
      console.error(err);
      setErrorModal(err.message || 'Error al guardar cliente');
    } finally {
      setGuardando(false);
    }
  };

  const handleSoftDelete = async (c: Cliente) => {
    if (!confirm(`¿Mover a papelera el cliente "${c.nombre}"?`)) return;
    const { error } = await supabase.from('clientes').update({ eliminado: true }).eq('id', c.id);
    if (!error) cargarDatos();
  };

  const handleRestaurar = async (c: Cliente) => {
    const { error } = await supabase.from('clientes').update({ eliminado: false }).eq('id', c.id);
    if (!error) cargarDatos();
  };

  const handleEliminarPermanente = async (c: Cliente) => {
    if (!confirm(`ATENCIÓN: ¿Eliminar PERMANENTEMENTE de la base de datos al cliente "${c.nombre}"?\n\nEsta acción NO se puede deshacer. Se borrarán también sus precios personalizados, movimientos de saldo y pedidos asociados.`)) return;

    try {
      setGuardando(true);
      // 1. Eliminar precios asignados
      await supabase.from('precios_cliente').delete().eq('cliente_id', c.id);

      // 2. Eliminar movimientos de saldo
      await supabase.from('movimientos_saldo').delete().eq('cliente_id', c.id);

      // 3. Eliminar pagos
      await supabase.from('pagos').delete().eq('cliente_id', c.id);

      // 4. Eliminar items de pedidos y pedidos
      const { data: peds } = await supabase.from('pedidos').select('id').eq('cliente_id', c.id);
      if (peds && peds.length > 0) {
        const pedIds = peds.map((p) => p.id);
        await supabase.from('items_pedido').delete().in('pedido_id', pedIds);
        await supabase.from('pedidos').delete().eq('cliente_id', c.id);
      }

      // 5. Eliminar cliente definitivamente
      const { error } = await supabase.from('clientes').delete().eq('id', c.id);
      if (error) throw error;

      await cargarDatos();
    } catch (err: any) {
      console.error('Error al eliminar cliente permanentemente:', err);
      alert(`Error al eliminar cliente: ${err.message || 'Error desconocido'}`);
    } finally {
      setGuardando(false);
    }
  };

  // Filtrado de clientes
  const clientesFiltrados = clientes.filter((c) => {
    const res = resumenes[c.id] || { totalDeuda: 0, totalSaldoAFavor: 0, saldoNeto: 0 };
    const saldoNeto = res.saldoNeto !== undefined ? res.saldoNeto : (res.totalSaldoAFavor - res.totalDeuda);
    if (filtroEstado === 'con_deuda' && saldoNeto >= 0) return false;
    if (filtroEstado === 'con_saldo' && saldoNeto <= 0) return false;
    if (filtroEstado === 'al_dia' && saldoNeto !== 0) return false;

    if (!busqueda) return true;
    const b = busqueda.toLowerCase().trim();
    return (
      c.nombre.toLowerCase().includes(b) ||
      (c.cuit && c.cuit.includes(b)) ||
      (c.telefono && c.telefono.includes(b)) ||
      (c.email && c.email.toLowerCase().includes(b)) ||
      (c.ciudad && c.ciudad.toLowerCase().includes(b))
    );
  });

  return (
    <div className="space-y-6">
      
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-800 tracking-tight">
            Clientes & Cuentas Corrientes
          </h2>
          <p className="text-xs text-slate-500 font-medium mt-1">
            Gestión integral de clientes: condición fiscal, tarifas, plazos de pago, saldos y deudas.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={abrirCrear}
            className="bg-blue-900 hover:bg-blue-800 text-white px-4 py-2 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span>Nuevo Cliente</span>
          </button>
        </div>
      </div>

      {/* Barra de Filtros & Búsqueda */}
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          
          {/* Filtro por estado financiero */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => setFiltroEstado('todos')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                filtroEstado === 'todos'
                  ? 'bg-blue-900 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Todos ({clientes.length})
            </button>
            <button
              onClick={() => setFiltroEstado('con_deuda')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                filtroEstado === 'con_deuda'
                  ? 'bg-red-600 text-white shadow-sm'
                  : 'bg-red-50 text-red-700 hover:bg-red-100'
              }`}
            >
              Con Deuda
            </button>
            <button
              onClick={() => setFiltroEstado('con_saldo')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                filtroEstado === 'con_saldo'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
              }`}
            >
              Con Saldo a Favor
            </button>
            <button
              onClick={() => setFiltroEstado('al_dia')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                filtroEstado === 'al_dia'
                  ? 'bg-green-700 text-white shadow-sm'
                  : 'bg-green-50 text-green-700 hover:bg-green-100'
              }`}
            >
              Al Día
            </button>
          </div>

          <button
            onClick={() => setVerEliminados(!verEliminados)}
            className={`text-xs font-bold px-3 py-1.5 rounded-lg border transition-all flex items-center gap-1.5 ${
              verEliminados
                ? 'bg-red-50 border-red-200 text-red-700'
                : 'bg-slate-50 border-slate-200 text-slate-500 hover:text-slate-800'
            }`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
            </svg>
            <span>{verEliminados ? 'Viendo Papelera' : 'Ver Eliminados'}</span>
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
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre, CUIT, teléfono, email o localidad..."
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-md text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white transition-all"
          />
        </div>
      </div>

      {/* Grid de Tarjetas de Clientes */}
      {cargando ? (
        <div className="bg-white rounded-lg p-12 text-center text-slate-400 border border-slate-200">
          <div className="flex flex-col items-center gap-2">
            <div className="h-6 w-6 border-2 border-blue-900 border-t-transparent rounded-full animate-spin" />
            <span className="text-xs font-semibold">Cargando base de clientes y estados financieros...</span>
          </div>
        </div>
      ) : clientesFiltrados.length === 0 ? (
        <div className="bg-white rounded-lg p-12 text-center text-slate-400 border border-slate-200">
          <p className="text-sm font-semibold">No se encontraron clientes.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {clientesFiltrados.map((c) => {
            const res = resumenes[c.id] || {
              totalComprado: 0,
              totalPagado: 0,
              totalDeuda: 0,
              totalSaldoAFavor: 0,
              pedidosPendientes: 0,
              pedidosImpagos: 0,
            };

            const tieneDeuda = res.totalDeuda > 0;
            const tieneSaldo = res.totalSaldoAFavor > 0;

            return (
              <div
                key={c.id}
                className="bg-white rounded-lg p-5 border border-slate-200 hover:border-slate-300 hover:shadow-md transition-all flex flex-col justify-between"
              >
                <div>
                  {/* Encabezado de la tarjeta con acciones independientes */}
                  <div className="flex items-start justify-between gap-2 mb-2.5">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap mb-1">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-900 border border-blue-100">
                          {c.tipo_cliente || 'Mayorista'}
                        </span>
                        {c.condicion_iva && (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                            {c.condicion_iva}
                          </span>
                        )}
                        {c.lista_precio_id && (() => {
                          const lp = listasPrecios.find((l) => l.id === c.lista_precio_id);
                          if (!lp) return null;
                          return (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                              {lp.nombre}
                            </span>
                          );
                        })()}
                      </div>

                      <h3 className="font-bold text-base text-slate-900 truncate leading-tight" title={c.nombre}>
                        {c.nombre}
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5 font-mono">
                        {c.cuit ? `CUIT: ${c.cuit}` : 'Sin CUIT registrado'}
                      </p>
                    </div>

                    {/* Botones de acción sin solapamiento */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() =>
                          setModalSaldo({
                            abierto: true,
                            cliente: c,
                            deudaActual: res.totalDeuda,
                            saldoActual: res.totalSaldoAFavor,
                            saldoNetoActual: res.saldoNeto,
                          })
                        }
                        className="text-slate-500 hover:text-emerald-700 p-1.5 rounded-md hover:bg-emerald-50 transition-colors"
                        title="Ajustar deuda o saldo del cliente"
                        aria-label={`Ajustar deuda o saldo de ${c.nombre}`}
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                          <rect x="2" y="4" width="20" height="16" rx="2" />
                          <line x1="12" y1="8" x2="12" y2="16" />
                          <line x1="8" y1="12" x2="16" y2="12" />
                        </svg>
                      </button>

                      <button
                        onClick={() => abrirEditar(c)}
                        className="text-slate-500 hover:text-blue-900 p-1.5 rounded-md hover:bg-slate-100 transition-colors"
                        title="Editar configuración del cliente"
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                      </button>
                      
                      {!verEliminados ? (
                        <button
                          onClick={() => handleSoftDelete(c)}
                          className="text-slate-400 hover:text-red-600 p-1.5 rounded-md hover:bg-slate-100 transition-colors cursor-pointer"
                          title="Mover a papelera"
                          aria-label={`Mover a papelera a ${c.nombre}`}
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                          </svg>
                        </button>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handleRestaurar(c)}
                            className="text-xs bg-green-600 hover:bg-green-700 text-white font-bold px-2 py-1 rounded-md transition-colors cursor-pointer"
                            title="Restaurar cliente"
                            aria-label={`Restaurar a ${c.nombre}`}
                          >
                            Restaurar
                          </button>
                          <button
                            onClick={() => handleEliminarPermanente(c)}
                            className="text-xs bg-red-600 hover:bg-red-700 text-white font-bold px-2 py-1 rounded-md transition-colors cursor-pointer"
                            title="Eliminar de forma permanente de la base de datos"
                            aria-label={`Eliminar permanentemente a ${c.nombre}`}
                          >
                            Eliminar Definitivo
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Datos de contacto y ubicación */}
                  <div className="space-y-1 my-3 text-xs text-slate-600 border-t border-slate-100 pt-2.5">
                    {c.telefono && (
                      <div className="flex items-center gap-2">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-400 shrink-0">
                          <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z" />
                        </svg>
                        <a
                          href={`https://wa.me/${c.telefono.replace(/[^0-9]/g, '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:text-green-700 font-medium hover:underline"
                        >
                          {c.telefono}
                        </a>
                      </div>
                    )}
                    {c.email && (
                      <div className="flex items-center gap-2 truncate">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-400 shrink-0">
                          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                          <polyline points="22,6 12,13 2,6" />
                        </svg>
                        <span className="truncate">{c.email}</span>
                      </div>
                    )}
                    {(c.direccion || c.ciudad || c.provincia) && (
                      <div className="flex items-center gap-2 truncate text-slate-500">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-400 shrink-0">
                          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
                          <circle cx="12" cy="10" r="3" />
                        </svg>
                        <span className="truncate">
                          {[c.direccion, c.ciudad, c.provincia].filter(Boolean).join(', ')}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Saldo Neto Unificado */}
                  <div
                    className={`flex items-center justify-between p-3 rounded-md my-3 border ${
                      res.saldoNeto < 0
                        ? 'bg-red-50/80 border-red-200/80 text-red-950'
                        : res.saldoNeto > 0
                        ? 'bg-emerald-50/80 border-emerald-200/80 text-emerald-950'
                        : 'bg-slate-50 border-slate-200/80 text-slate-700'
                    }`}
                  >
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider block opacity-75">
                        {res.saldoNeto < 0 ? '⚠️ Saldo Deudor' : res.saldoNeto > 0 ? '✓ Saldo a Favor' : 'Cuenta al Día'}
                      </span>
                      <span
                        className={`font-black font-mono text-sm block ${
                          res.saldoNeto < 0
                            ? 'text-red-600'
                            : res.saldoNeto > 0
                            ? 'text-emerald-700'
                            : 'text-slate-700'
                        }`}
                      >
                        {res.saldoNeto < 0
                          ? `-$${Math.abs(res.saldoNeto).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
                          : res.saldoNeto > 0
                          ? `+$${res.saldoNeto.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
                          : '$0,00'}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        setModalSaldo({
                          abierto: true,
                          cliente: c,
                          deudaActual: res.totalDeuda,
                          saldoActual: res.totalSaldoAFavor,
                          saldoNetoActual: res.saldoNeto,
                        })
                      }
                      className={`text-xs font-bold px-2.5 py-1 rounded transition-colors cursor-pointer ${
                        res.saldoNeto < 0
                          ? 'bg-red-100 text-red-800 hover:bg-red-200'
                          : res.saldoNeto > 0
                          ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                          : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                      }`}
                    >
                      Ajustar Saldo
                    </button>
                  </div>
                </div>

                {/* Footer con Links directos */}
                <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                  <Link
                    href={`/admin/facturador?clienteId=${c.id}`}
                    className="text-xs font-bold text-slate-600 hover:text-blue-900 transition-colors"
                  >
                    Presupuestar
                  </Link>

                  <Link
                    href={`/admin/clientes/${c.id}`}
                    className="text-xs font-bold text-blue-900 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-md transition-colors"
                  >
                    Ver Ficha Completa →
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Crear / Editar Cliente con Configuración Completa */}
      {modalCliente.abierto && (
        <div className="fixed inset-0 z-[1000] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-2xl max-w-2xl w-full p-6 animate-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  Gestión de Cuentas
                </span>
                <h3 className="text-lg font-black text-slate-800">
                  {modalCliente.cliente ? 'Editar Configuración del Cliente' : 'Nuevo Cliente Comercial'}
                </h3>
              </div>
              <button
                onClick={() => setModalCliente({ abierto: false })}
                className="text-slate-400 hover:text-slate-700 p-1.5 rounded-md hover:bg-slate-100"
              >
                &times;
              </button>
            </div>

            {errorModal && (
              <div className="mb-4 p-2.5 bg-red-50 border border-red-200 rounded-md text-red-700 text-xs font-semibold">
                {errorModal}
              </div>
            )}

            <div className="space-y-4">
              
              {/* Bloque 1: Identificación */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label htmlFor="cliente-nombre" className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Razón Social / Nombre Comercial *
                  </label>
                  <input
                    id="cliente-nombre"
                    type="text"
                    autoFocus
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    placeholder="Ej: Distribuidora Central S.A."
                    className="w-full border border-slate-300 rounded-md px-3 py-2 text-xs text-slate-900 focus:ring-2 focus:ring-blue-600 focus:outline-none font-semibold"
                  />
                </div>

                <div>
                  <label htmlFor="cliente-cuit" className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                    CUIT / DNI
                  </label>
                  <input
                    id="cliente-cuit"
                    type="text"
                    value={cuit}
                    onChange={(e) => setCuit(e.target.value)}
                    placeholder="Ej: 30-71234567-8"
                    className="w-full border border-slate-300 rounded-md px-3 py-2 text-xs text-slate-900 focus:ring-2 focus:ring-blue-600 focus:outline-none font-mono"
                  />
                </div>

                <div>
                  <label htmlFor="cliente-iva" className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Condición Frente al IVA
                  </label>
                  <select
                    id="cliente-iva"
                    value={condicionIva}
                    onChange={(e) => setCondicionIva(e.target.value)}
                    className="w-full border border-slate-300 rounded-md px-3 py-2 text-xs text-slate-900 bg-white focus:ring-2 focus:ring-blue-600 focus:outline-none"
                  >
                    <option value="Responsable Inscripto">Responsable Inscripto</option>
                    <option value="Monotributo">Monotributo</option>
                    <option value="Exento">Exento</option>
                    <option value="Consumidor Final">Consumidor Final</option>
                  </select>
                </div>
              </div>

              {/* Bloque 2: Tipo de Cliente & Condiciones Comerciales */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-slate-50 rounded-md border border-slate-100">
                <div>
                  <label htmlFor="cliente-tipo" className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Tipo de Cliente
                  </label>
                  <select
                    id="cliente-tipo"
                    value={tipoCliente}
                    onChange={(e) => setTipoCliente(e.target.value)}
                    className="w-full border border-slate-300 rounded-md px-2.5 py-1.5 text-xs text-slate-900 bg-white focus:ring-2 focus:ring-blue-600 focus:outline-none"
                  >
                    <option value="Mayorista">Mayorista</option>
                    <option value="Distribuidor">Distribuidor</option>
                    <option value="Casa de Repuestos">Casa de Repuestos</option>
                    <option value="Taller Mecánico">Taller Mecánico</option>
                    <option value="Minorista">Minorista</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="cliente-descuento" className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Descuento Base (%)
                  </label>
                  <input
                    id="cliente-descuento"
                    type="number"
                    min="0"
                    max="100"
                    step="0.5"
                    value={descuentoPredeterminado}
                    onChange={(e) => setDescuentoPredeterminado(parseFloat(e.target.value) || 0)}
                    placeholder="0"
                    className="w-full border border-slate-300 rounded-md px-2.5 py-1.5 text-xs text-slate-900 bg-white font-mono font-bold focus:ring-2 focus:ring-blue-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label htmlFor="cliente-plazo" className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Plazo de Pago
                  </label>
                  <select
                    id="cliente-plazo"
                    value={plazoPago}
                    onChange={(e) => setPlazoPago(e.target.value)}
                    className="w-full border border-slate-300 rounded-md px-2.5 py-1.5 text-xs text-slate-900 bg-white focus:ring-2 focus:ring-blue-600 focus:outline-none"
                  >
                    <option value="Contado">Contado</option>
                    <option value="15 días">15 días</option>
                    <option value="30 días">30 días</option>
                    <option value="45 días">45 días</option>
                    <option value="60 días">60 días</option>
                    <option value="Cuenta Corriente">Cuenta Corriente</option>
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label htmlFor="cliente-lista-precio" className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Lista de Precios Predeterminada
                  </label>
                  <select
                    id="cliente-lista-precio"
                    value={listaPrecioId}
                    onChange={(e) => setListaPrecioId(e.target.value)}
                    className="w-full border border-slate-300 rounded-md px-2.5 py-1.5 text-xs text-slate-900 bg-white focus:ring-2 focus:ring-blue-600 focus:outline-none"
                  >
                    <option value="">-- Automática / Predeterminada del Sistema --</option>
                    {listasPrecios.map((lp) => (
                      <option key={lp.id} value={lp.id}>
                        {lp.nombre} {lp.es_predeterminada ? '(Predeterminada)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Bloque 3: Contacto */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="cliente-telefono" className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Teléfono / WhatsApp
                  </label>
                  <input
                    id="cliente-telefono"
                    type="text"
                    value={telefono}
                    onChange={(e) => setTelefono(e.target.value)}
                    placeholder="Ej: +54 9 11 4444-5555"
                    className="w-full border border-slate-300 rounded-md px-3 py-2 text-xs text-slate-900 focus:ring-2 focus:ring-blue-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label htmlFor="cliente-email" className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Correo Electrónico
                  </label>
                  <input
                    id="cliente-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Ej: compras@distribuidora.com"
                    className="w-full border border-slate-300 rounded-md px-3 py-2 text-xs text-slate-900 focus:ring-2 focus:ring-blue-600 focus:outline-none"
                  />
                </div>
              </div>

              {/* Bloque 4: Ubicación */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-1">
                  <label htmlFor="cliente-direccion" className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Dirección
                  </label>
                  <input
                    id="cliente-direccion"
                    type="text"
                    value={direccion}
                    onChange={(e) => setDireccion(e.target.value)}
                    placeholder="Ej: Av. Rivadavia 1234"
                    className="w-full border border-slate-300 rounded-md px-3 py-2 text-xs text-slate-900 focus:ring-2 focus:ring-blue-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label htmlFor="cliente-ciudad" className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Ciudad / Localidad
                  </label>
                  <input
                    id="cliente-ciudad"
                    type="text"
                    value={ciudad}
                    onChange={(e) => setCiudad(e.target.value)}
                    placeholder="Ej: Rosario"
                    className="w-full border border-slate-300 rounded-md px-3 py-2 text-xs text-slate-900 focus:ring-2 focus:ring-blue-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label htmlFor="cliente-provincia" className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Provincia
                  </label>
                  <input
                    id="cliente-provincia"
                    type="text"
                    value={provincia}
                    onChange={(e) => setProvincia(e.target.value)}
                    placeholder="Ej: Santa Fe"
                    className="w-full border border-slate-300 rounded-md px-3 py-2 text-xs text-slate-900 focus:ring-2 focus:ring-blue-600 focus:outline-none"
                  />
                </div>
              </div>

              {/* Bloque 5: Observaciones */}
              <div>
                <label htmlFor="cliente-notas" className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                  Notas u Observaciones Internas
                </label>
                <textarea
                  id="cliente-notas"
                  rows={2}
                  value={notas}
                  onChange={(e) => setNotas(e.target.value)}
                  placeholder="Horarios de entrega, expreso habitual, etc..."
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-xs text-slate-900 focus:ring-2 focus:ring-blue-600 focus:outline-none resize-none"
                />
              </div>

            </div>

            <div className="mt-6 pt-3 border-t border-slate-100 flex justify-end gap-2">
              <button
                onClick={() => setModalCliente({ abierto: false })}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={guardarCliente}
                disabled={guardando}
                className="px-5 py-2 text-xs font-bold text-white bg-blue-900 hover:bg-blue-800 rounded-md transition-colors shadow disabled:opacity-50"
              >
                {guardando ? 'Guardando...' : 'Guardar Cliente'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Ajuste de Saldo */}
      {modalSaldo.cliente && (
        <ModalAjusteSaldo
          abierto={modalSaldo.abierto}
          onCerrar={() =>
            setModalSaldo({ abierto: false, cliente: null, deudaActual: 0, saldoActual: 0, saldoNetoActual: 0 })
          }
          cliente={{ id: modalSaldo.cliente.id, nombre: modalSaldo.cliente.nombre }}
          deudaActual={modalSaldo.deudaActual}
          saldoActual={modalSaldo.saldoActual}
          saldoNetoActual={modalSaldo.saldoNetoActual}
          onGuardado={async () => {
            await cargarDatos();
          }}
        />
      )}

    </div>
  );
}

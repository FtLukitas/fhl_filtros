'use client';

import { useState, useEffect, useCallback, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { generarPDF } from '@/lib/generarPDF';
import type { Pedido, Pago, MetodoPago, EstadoPedido, EstadoPagoPedido } from '@/lib/types';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function PedidoDetallePage({ params }: PageProps) {
  const { id: pedidoId } = use(params);
  const router = useRouter();

  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [saldoCliente, setSaldoCliente] = useState<number>(0);
  const [cargando, setCargando] = useState(true);
  const [descargandoPDF, setDescargandoPDF] = useState(false);
  const [guardandoPago, setGuardandoPago] = useState(false);
  const [eliminandoPagoId, setEliminandoPagoId] = useState<string | null>(null);
  const [mensajeOk, setMensajeOk] = useState<string | null>(null);
  const [errorPago, setErrorPago] = useState<string | null>(null);

  // Formulario de pago
  const [montoPago, setMontoPago] = useState('');
  const [metodoPago, setMetodoPago] = useState<MetodoPago>('transferencia');
  const [notaPago, setNotaPago] = useState('');

  const notificarOk = (txt: string) => {
    setMensajeOk(txt);
    setTimeout(() => setMensajeOk(null), 3500);
  };

  const cargarPedido = useCallback(async () => {
    setCargando(true);
    try {
      // 1. Cargar pedido con cliente e ítems
      const { data: dbPedido, error: errPed } = await supabase
        .from('pedidos')
        .select('*, cliente:clientes(*), items:items_pedido(*)')
        .eq('id', pedidoId)
        .single();

      if (errPed || !dbPedido) {
        router.push('/admin/pedidos');
        return;
      }
      setPedido(dbPedido as Pedido);

      // 2. Cargar pagos de este pedido
      const { data: dbPagos } = await supabase
        .from('pagos')
        .select('*')
        .eq('pedido_id', pedidoId)
        .order('fecha', { ascending: false });
      setPagos((dbPagos as Pago[]) || []);

      // 3. Cargar saldo a favor real del cliente
      if (dbPedido.cliente_id) {
        const { data: dbSaldo } = await supabase
          .from('movimientos_saldo')
          .select('monto')
          .eq('cliente_id', dbPedido.cliente_id);

        const totalSaldo = (dbSaldo || []).reduce((acc: number, cur: any) => acc + Number(cur.monto || 0), 0);
        setSaldoCliente(totalSaldo);
      }
    } catch (err) {
      console.error('Error al cargar detalle del pedido:', err);
    } finally {
      setCargando(false);
    }
  }, [pedidoId, router]);

  useEffect(() => {
    cargarPedido();
  }, [cargarPedido]);

  // Cambiar estado del pedido
  const handleCambiarEstado = async (nuevoEstado: EstadoPedido) => {
    if (!confirm(`¿Cambiar estado logístico del pedido a "${nuevoEstado.toUpperCase()}"?`)) return;

    try {
      const { error } = await supabase
        .from('pedidos')
        .update({ estado: nuevoEstado, updated_at: new Date().toISOString() })
        .eq('id', pedidoId);

      if (!error) {
        notificarOk(`Pedido marcado como ${nuevoEstado}`);
        cargarPedido();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Descargar PDF del pedido
  const handleDescargarPDF = async () => {
    if (!pedido || !pedido.cliente) return;
    setDescargandoPDF(true);
    try {
      const itemsFactura = (pedido.items || []).map((it, idx) => ({
        id: String(it.id || idx),
        codigo_fhl: it.codigo_fhl,
        cantidad: it.cantidad,
        precioUnitario: it.precio_unitario,
      }));

      await generarPDF({
        cliente: pedido.cliente,
        items: itemsFactura,
        observaciones: pedido.observaciones || '',
        numeroPresupuesto: `PED-${pedido.id.slice(0, 8).toUpperCase()}`,
        validezDias: 30,
      });
      notificarOk('Comprobante PDF generado');
    } catch (err) {
      console.error('Error al generar PDF del pedido:', err);
    } finally {
      setDescargandoPDF(false);
    }
  };

  // Acciones de Papelera y Borrado Definitivo
  const handleSoftDelete = async () => {
    if (!pedido) return;
    if (!confirm(`¿Mover a papelera el Pedido #${pedido.id.slice(0, 8)}?`)) return;
    const { error } = await supabase.from('pedidos').update({ eliminado: true }).eq('id', pedido.id);
    if (!error) {
      notificarOk('Pedido movido a la papelera');
      await cargarPedido();
    }
  };

  const handleRestaurar = async () => {
    if (!pedido) return;
    const { error } = await supabase.from('pedidos').update({ eliminado: false }).eq('id', pedido.id);
    if (!error) {
      notificarOk('Pedido restaurado con éxito');
      await cargarPedido();
    }
  };

  const handleEliminarPermanente = async () => {
    if (!pedido) return;
    if (!confirm(`ATENCIÓN: ¿Eliminar PERMANENTEMENTE el Pedido #${pedido.id.slice(0, 8)} de la base de datos?\n\nEsta acción NO se puede deshacer. Se borrarán definitivamente el pedido, sus ítems y los pagos asociados.`)) return;

    try {
      setCargando(true);
      // 1. Eliminar movimientos de saldo asociados
      await supabase.from('movimientos_saldo').delete().eq('referencia_pedido_id', pedido.id);
      // 2. Eliminar pagos
      await supabase.from('pagos').delete().eq('pedido_id', pedido.id);
      // 3. Eliminar ítems
      await supabase.from('items_pedido').delete().eq('pedido_id', pedido.id);
      // 4. Eliminar pedido
      const { error } = await supabase.from('pedidos').delete().eq('id', pedido.id);
      if (error) throw error;

      router.push('/admin/pedidos');
    } catch (err: any) {
      console.error(err);
      alert(`Error al eliminar pedido: ${err.message || 'Error desconocido'}`);
      setCargando(false);
    }
  };

  // Cálculos financieros
  const totalPagado = pagos.reduce((sum, p) => sum + Number(p.monto || 0), 0);
  const totalPedido = Number(pedido?.total || 0);
  const deudaRestante = Math.max(0, totalPedido - totalPagado);
  
  const estadoPago: EstadoPagoPedido =
    deudaRestante === 0 && totalPedido > 0
      ? 'saldado'
      : totalPagado > 0
      ? 'parcial'
      : 'impago';

  // Registrar un pago
  const handleRegistrarPago = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pedido) return;

    const montoNum = parseFloat(montoPago);
    if (isNaN(montoNum) || montoNum <= 0) {
      setErrorPago('Ingresá un monto válido mayor a 0');
      return;
    }

    if (metodoPago === 'saldo_a_favor' && saldoCliente < montoNum) {
      setErrorPago(`Saldo a favor insuficiente ($${saldoCliente.toLocaleString('es-AR')}). Ingresá un monto menor o seleccioná otro método.`);
      return;
    }

    setGuardandoPago(true);
    setErrorPago(null);

    try {
      // 1. Insertar el pago
      const { error: errPago } = await supabase.from('pagos').insert({
        pedido_id: pedido.id,
        cliente_id: pedido.cliente_id,
        monto: montoNum,
        metodo: metodoPago,
        nota: notaPago.trim() || (metodoPago === 'saldo_a_favor' ? 'Pago con Saldo a Favor' : null),
        fecha: new Date().toISOString(),
      });

      if (errPago) throw errPago;

      // 2. Si el método es saldo a favor, descontar del libro mayor de saldo
      if (metodoPago === 'saldo_a_favor') {
        await supabase.from('movimientos_saldo').insert({
          cliente_id: pedido.cliente_id,
          monto: -montoNum,
          tipo: 'aplicado',
          referencia_pedido_id: pedido.id,
          nota: `Aplicado al pedido #${pedido.id.slice(0, 8)}`,
          fecha: new Date().toISOString(),
        });
      }
      // 3. Si el pago con otro método supera la deuda, acreditar excedente como saldo a favor
      else if (montoNum > deudaRestante && deudaRestante > 0) {
        const excedente = montoNum - deudaRestante;
        await supabase.from('movimientos_saldo').insert({
          cliente_id: pedido.cliente_id,
          monto: excedente,
          tipo: 'excedente',
          referencia_pedido_id: pedido.id,
          nota: `Excedente de pago en pedido #${pedido.id.slice(0, 8)}`,
          fecha: new Date().toISOString(),
        });
      }

      notificarOk(`Pago de $${montoNum.toLocaleString('es-AR')} registrado con éxito`);
      setMontoPago('');
      setNotaPago('');
      await cargarPedido();
    } catch (err: any) {
      console.error(err);
      setErrorPago(err.message || 'Error al registrar el pago');
    } finally {
      setGuardandoPago(false);
    }
  };

  // Aplicar saldo a favor existente en 1 click
  const handleAplicarSaldo = async () => {
    if (!pedido || saldoCliente <= 0 || deudaRestante <= 0) return;

    const montoAAplicar = Math.min(saldoCliente, deudaRestante);
    if (!confirm(`¿Aplicar $${montoAAplicar.toLocaleString('es-AR')} del saldo a favor de este cliente a la deuda del pedido?`)) {
      return;
    }

    setGuardandoPago(true);
    try {
      // 1. Registrar pago con método "saldo a favor"
      await supabase.from('pagos').insert({
        pedido_id: pedido.id,
        cliente_id: pedido.cliente_id,
        monto: montoAAplicar,
        metodo: 'saldo_a_favor',
        nota: 'Pago aplicado desde Saldo a Favor del cliente',
        fecha: new Date().toISOString(),
      });

      // 2. Descontar del saldo del cliente (movimiento negativo)
      await supabase.from('movimientos_saldo').insert({
        cliente_id: pedido.cliente_id,
        monto: -montoAAplicar,
        tipo: 'aplicado',
        referencia_pedido_id: pedido.id,
        nota: `Aplicado al pedido #${pedido.id.slice(0, 8)}`,
        fecha: new Date().toISOString(),
      });

      notificarOk(`Se aplicaron $${montoAAplicar.toLocaleString('es-AR')} del saldo a favor`);
      await cargarPedido();
    } catch (err) {
      console.error('Error al aplicar saldo:', err);
    } finally {
      setGuardandoPago(false);
    }
  };

  // Saldar deuda total rápida en formulario
  const handleLlenarDeudaTotal = () => {
    if (deudaRestante > 0) {
      setMontoPago(deudaRestante.toString());
    }
  };

  // Eliminar un pago individual del historial
  const handleEliminarPago = async (pago: Pago) => {
    if (!confirm(`¿Estás seguro de anular el pago de $${Number(pago.monto).toLocaleString('es-AR')}? Si utilizó saldo a favor o generó excedente, se revertirá automáticamente.`)) {
      return;
    }

    setEliminandoPagoId(pago.id);
    try {
      // 1. Si era saldo a favor, revertir el débito
      if (pago.metodo === 'saldo_a_favor') {
        await supabase
          .from('movimientos_saldo')
          .delete()
          .eq('referencia_pedido_id', pedidoId)
          .eq('tipo', 'aplicado')
          .eq('monto', -Number(pago.monto));
      }

      // 2. Eliminar el pago
      const { error } = await supabase.from('pagos').delete().eq('id', pago.id);
      if (error) throw error;

      notificarOk('Pago anulado correctamente');
      await cargarPedido();
    } catch (err: any) {
      console.error(err);
      alert(`Error al eliminar pago: ${err.message || 'Error desconocido'}`);
    } finally {
      setEliminandoPagoId(null);
    }
  };

  if (cargando || !pedido) {
    return (
      <div className="py-20 flex flex-col items-center justify-center gap-3">
        <div className="h-8 w-8 border-3 border-blue-900 border-t-transparent rounded-full animate-spin" />
        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
          Cargando detalle del pedido...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      
      {/* Banner de Pedido en Papelera */}
      {pedido.eliminado && (
        <div className="p-4 bg-amber-50 border border-amber-300 rounded-md flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-amber-900">
          <div className="flex items-center gap-2">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-amber-700 shrink-0" aria-hidden="true">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
            </svg>
            <span className="text-xs font-bold">
              Este pedido se encuentra en la papelera. Podés restaurarlo a la lista activa o eliminarlo de forma permanente.
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleRestaurar}
              className="px-3 py-1.5 bg-green-700 hover:bg-green-800 text-white rounded-md text-xs font-bold transition-colors cursor-pointer"
            >
              Restaurar Pedido
            </button>
            <button
              onClick={handleEliminarPermanente}
              className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-md text-xs font-bold transition-colors cursor-pointer"
            >
              Eliminar Definitivo
            </button>
          </div>
        </div>
      )}

      {/* Botón Volver & Encabezado */}
      <div>
        <Link
          href="/admin/pedidos"
          className="text-xs font-bold text-slate-500 hover:text-blue-900 transition-colors inline-flex items-center gap-1.5 mb-2"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          Volver a Pedidos
        </Link>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-2xl font-black text-slate-900 tracking-tight font-mono">
                Pedido #{pedido.id.slice(0, 8)}
              </h2>

              {/* Badge Estado Logístico */}
              <span
                className={`px-2.5 py-0.5 rounded text-[11px] font-black uppercase tracking-wider ${
                  pedido.estado === 'entregado'
                    ? 'bg-green-100 text-green-800 border border-green-200'
                    : pedido.estado === 'confirmado'
                    ? 'bg-blue-100 text-blue-800 border border-blue-200'
                    : pedido.estado === 'cancelado'
                    ? 'bg-slate-100 text-slate-600 border border-slate-200'
                    : 'bg-amber-100 text-amber-800 border border-amber-200'
                }`}
                title="Estado de entrega logística"
              >
                Logística: {pedido.estado}
              </span>

              {/* Badge Estado de Pago */}
              <span
                className={`px-2.5 py-0.5 rounded text-[11px] font-black uppercase tracking-wider ${
                  estadoPago === 'saldado'
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                    : estadoPago === 'parcial'
                    ? 'bg-amber-100 text-amber-900 border border-amber-300'
                    : 'bg-red-100 text-red-800 border border-red-200'
                }`}
                title="Estado financiero del pago"
              >
                Pago: {estadoPago === 'saldado' ? 'Saldado' : estadoPago === 'parcial' ? 'Pago Parcial' : 'Impago'}
              </span>
            </div>

            <div className="flex items-center gap-3 text-xs text-slate-500 mt-1.5 flex-wrap">
              {pedido.cliente && (
                <Link
                  href={`/admin/clientes/${pedido.cliente.id}`}
                  className="font-bold text-blue-900 hover:underline"
                >
                  {pedido.cliente.nombre}
                </Link>
              )}
              <span>• Fecha: {new Date(pedido.created_at).toLocaleDateString('es-AR', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}</span>
            </div>
          </div>

          {/* Acciones del Pedido */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Botón Editar Pedido */}
            {!pedido.eliminado && pedido.estado !== 'cancelado' && (
              <Link
                href={`/admin/facturador?pedidoId=${pedido.id}`}
                className="bg-amber-500 hover:bg-amber-600 active:scale-[0.98] text-white px-3.5 py-2 rounded-md text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
                title="Modificar cliente, filtros o cantidades de este pedido"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
                <span>Editar Pedido</span>
              </Link>
            )}

            {/* Botón Descargar PDF */}
            <button
              onClick={handleDescargarPDF}
              disabled={descargandoPDF}
              className="bg-white border border-slate-300 hover:border-blue-900 hover:text-blue-900 text-slate-700 px-3.5 py-2 rounded-md text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              title="Descargar comprobante / presupuesto PDF del pedido"
              aria-label="Descargar comprobante PDF del pedido"
            >
              {descargandoPDF ? (
                <div className="h-3.5 w-3.5 border-2 border-blue-900 border-t-transparent rounded-full animate-spin" aria-hidden="true" />
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              )}
              <span>Descargar PDF</span>
            </button>

            {pedido.estado === 'pendiente' && (
              <>
                <button
                  onClick={() => handleCambiarEstado('confirmado')}
                  className="bg-blue-900 hover:bg-blue-800 text-white px-4 py-2 rounded-md text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
                >
                  <span>Confirmar Pedido</span>
                </button>
                <button
                  onClick={() => handleCambiarEstado('cancelado')}
                  className="bg-slate-200 hover:bg-red-50 hover:text-red-700 text-slate-700 px-3 py-2 rounded-md text-xs font-bold transition-all cursor-pointer"
                >
                  <span>Cancelar</span>
                </button>
              </>
            )}

            {pedido.estado === 'confirmado' && (
              <>
                <button
                  onClick={() => handleCambiarEstado('entregado')}
                  className="bg-green-700 hover:bg-green-800 text-white px-4 py-2 rounded-md text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <span>Marcar como Entregado</span>
                </button>
                <button
                  onClick={() => handleCambiarEstado('cancelado')}
                  className="bg-slate-200 hover:bg-red-50 hover:text-red-700 text-slate-700 px-3 py-2 rounded-md text-xs font-bold transition-all cursor-pointer"
                >
                  <span>Cancelar</span>
                </button>
              </>
            )}

            {/* Mover a Papelera si está activo */}
            {!pedido.eliminado && (
              <button
                onClick={handleSoftDelete}
                className="bg-slate-100 hover:bg-red-50 hover:text-red-700 text-slate-500 p-2 rounded-md transition-colors cursor-pointer"
                title="Mover pedido a la papelera"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Mensaje flotante de éxito */}
      {mensajeOk && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-md text-green-800 text-xs font-bold animate-in fade-in">
          {mensajeOk}
        </div>
      )}

      {/* Grid Principal (Dos Columnas) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Columna Izquierda: Información del Pedido e Ítems (7 columnas) */}
        <div className="lg:col-span-7 space-y-6">
          
          {/* Card Datos del Cliente */}
          {pedido.cliente && (
            <div className="bg-white rounded-lg p-5 border border-slate-200 shadow-sm space-y-3">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Datos del Cliente
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-slate-400 block font-medium">Razón Social:</span>
                  <span className="font-bold text-slate-800 text-sm">{pedido.cliente.nombre}</span>
                </div>
                <div>
                  <span className="text-slate-400 block font-medium">CUIT / CUIL:</span>
                  <span className="font-mono text-slate-800 font-bold">{pedido.cliente.cuit || 'Sin CUIT'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block font-medium">Condición de IVA:</span>
                  <span className="text-slate-700 font-semibold">{pedido.cliente.condicion_iva || 'No especificada'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block font-medium">Dirección / Contacto:</span>
                  <span className="text-slate-700">{pedido.cliente.direccion || 'Sin dirección'}</span>
                </div>
              </div>
            </div>
          )}

          {/* Card Tabla de Ítems */}
          <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Filtros del Pedido ({pedido.items?.length || 0})
              </h3>
              <span className="text-xs text-slate-500 font-semibold">
                {pedido.items?.reduce((s, it) => s + it.cantidad, 0)} unidades en total
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200 uppercase text-[10px]">
                  <tr>
                    <th className="p-3">Código FHL</th>
                    <th className="p-3 text-center">Cantidad</th>
                    <th className="p-3 text-right">Precio Unitario</th>
                    <th className="p-3 text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pedido.items?.map((it, idx) => {
                    const subtotal = it.cantidad * it.precio_unitario;
                    return (
                      <tr key={it.id || idx} className="hover:bg-slate-50">
                        <td className="p-3 font-bold text-slate-900 font-mono text-sm">
                          {it.codigo_fhl}
                        </td>
                        <td className="p-3 text-center font-bold text-slate-800">
                          {it.cantidad}
                        </td>
                        <td className="p-3 text-right font-mono text-slate-700">
                          ${it.precio_unitario.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="p-3 text-right font-black font-mono text-slate-900">
                          ${subtotal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Total Footer */}
            <div className="bg-slate-50 p-4 border-t border-slate-200 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                Total del Pedido
              </span>
              <span className="text-xl font-black text-slate-900 font-mono">
                ${totalPedido.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          {/* Observaciones */}
          {pedido.observaciones && (
            <div className="bg-white rounded-lg p-4 border border-slate-200 shadow-sm">
              <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                Observaciones
              </h4>
              <p className="text-xs text-slate-700 whitespace-pre-wrap">
                {pedido.observaciones}
              </p>
            </div>
          )}

        </div>

        {/* Columna Derecha: Estado Financiero & Registro de Pagos (5 columnas) */}
        <div className="lg:col-span-5 space-y-6">
          
          {/* Card Resumen de Pagos / Deuda */}
          <div className="bg-white rounded-lg p-5 border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Estado de Cobranza
              </h3>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                  estadoPago === 'saldado'
                    ? 'bg-green-100 text-green-800'
                    : estadoPago === 'parcial'
                    ? 'bg-amber-100 text-amber-900'
                    : 'bg-red-100 text-red-800'
                }`}
              >
                {estadoPago}
              </span>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Monto Total:</span>
                <span className="font-bold text-slate-800 font-mono">
                  ${totalPedido.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Total Abonado:</span>
                <span className="font-bold text-green-700 font-mono">
                  ${totalPagado.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between py-2 items-center">
                <span className="font-bold text-slate-800">Deuda Pendiente:</span>
                <span
                  className={`text-lg font-black font-mono ${
                    deudaRestante > 0 ? 'text-red-600' : 'text-green-700'
                  }`}
                >
                  ${deudaRestante.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            {/* Botón rápido Saldar Deuda */}
            {deudaRestante > 0 && (
              <button
                type="button"
                onClick={handleLlenarDeudaTotal}
                className="w-full py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-bold transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <span>Completar Deuda Total ($ {deudaRestante.toLocaleString('es-AR')}) en Formulario</span>
              </button>
            )}

            {/* Aviso de Saldo a Favor del cliente si tiene */}
            {saldoCliente > 0 && deudaRestante > 0 && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-md flex items-center justify-between gap-2 text-xs">
                <div>
                  <span className="font-bold text-blue-900 block">Saldo a favor disponible</span>
                  <span className="text-[11px] text-blue-700 font-mono font-bold">
                    ${saldoCliente.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <button
                  onClick={handleAplicarSaldo}
                  disabled={guardandoPago}
                  className="px-3 py-1.5 bg-blue-900 hover:bg-blue-800 text-white rounded-lg font-bold text-[11px] shadow-xs cursor-pointer disabled:opacity-50"
                >
                  Aplicar Saldo
                </button>
              </div>
            )}
          </div>

          {/* Formulario Registrar Pago */}
          <div className="bg-white rounded-lg p-5 border border-slate-200 shadow-sm space-y-4">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Registrar Cobranza
            </h3>

            {errorPago && (
              <div className="p-2.5 bg-red-50 border border-red-200 rounded-md text-red-700 text-xs font-semibold">
                {errorPago}
              </div>
            )}

            <form onSubmit={handleRegistrarPago} className="space-y-3">
              <div>
                <label htmlFor="pago-monto" className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Monto a Pagar ($) *
                </label>
                <input
                  id="pago-monto"
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={montoPago}
                  onChange={(e) => setMontoPago(e.target.value)}
                  placeholder={deudaRestante > 0 ? deudaRestante.toString() : '0.00'}
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-xs text-slate-900 font-mono font-bold focus:ring-2 focus:ring-blue-600 focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="pago-metodo" className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Método de Cobro *
                </label>
                <select
                  id="pago-metodo"
                  value={metodoPago}
                  onChange={(e) => setMetodoPago(e.target.value as MetodoPago)}
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-xs text-slate-900 bg-white font-medium focus:ring-2 focus:ring-blue-600 focus:outline-none"
                >
                  <option value="transferencia">Transferencia Bancaria</option>
                  <option value="efectivo">Efectivo</option>
                  <option value="cheque">Cheque</option>
                  <option value="mercadopago">Mercado Pago</option>
                  {saldoCliente > 0 && (
                    <option value="saldo_a_favor">
                      Saldo a Favor del Cliente (Disp: ${saldoCliente.toLocaleString('es-AR')})
                    </option>
                  )}
                </select>
              </div>

              <div>
                <label htmlFor="pago-nota" className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Nota / Referencia de comprobante
                </label>
                <input
                  id="pago-nota"
                  type="text"
                  value={notaPago}
                  onChange={(e) => setNotaPago(e.target.value)}
                  placeholder="Ej: Transferencia Banco Galicia #93821"
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-xs text-slate-900 focus:ring-2 focus:ring-blue-600 focus:outline-none"
                />
              </div>

              {parseFloat(montoPago) > deudaRestante && deudaRestante > 0 && metodoPago !== 'saldo_a_favor' && (
                <p className="text-[11px] text-blue-700 bg-blue-50 p-2 rounded-md font-medium">
                  El monto supera la deuda. Se acreditarán{' '}
                  <strong>${(parseFloat(montoPago) - deudaRestante).toLocaleString('es-AR')}</strong> automáticamente como saldo a favor del cliente.
                </p>
              )}

              <button
                type="submit"
                disabled={guardandoPago || !montoPago}
                className="w-full bg-green-700 hover:bg-green-800 text-white font-bold py-2.5 rounded-md text-xs transition-all shadow-sm disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {guardandoPago ? (
                  <>
                    <div className="h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" aria-hidden="true" />
                    <span>Guardando pago...</span>
                  </>
                ) : (
                  <span>Registrar Cobranza</span>
                )}
              </button>
            </form>
          </div>

          {/* Historial de Pagos de este pedido */}
          <div className="bg-white rounded-lg p-5 border border-slate-200 shadow-sm space-y-3">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Historial de Pagos ({pagos.length})
            </h3>

            {pagos.length === 0 ? (
              <p className="text-xs text-slate-400 italic py-3 text-center">
                Aún no se registraron pagos para este pedido.
              </p>
            ) : (
              <div className="space-y-2">
                {pagos.map((p) => (
                  <div
                    key={p.id}
                    className="p-3 bg-slate-50 rounded-md border border-slate-100 text-xs flex items-center justify-between gap-2"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-green-700 font-mono text-sm">
                          +${Number(p.monto || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                        </span>
                        <span className={`font-bold px-1.5 py-0.5 rounded text-[10px] uppercase ${
                          p.metodo === 'saldo_a_favor'
                            ? 'bg-blue-100 text-blue-900 border border-blue-200'
                            : 'bg-slate-200 text-slate-700'
                        }`}>
                          {p.metodo === 'saldo_a_favor' ? 'Saldo a Favor' : p.metodo === 'mercadopago' ? 'Mercado Pago' : p.metodo}
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-400 block mt-0.5">
                        {new Date(p.fecha).toLocaleDateString('es-AR')} • {p.nota || 'Sin nota'}
                      </span>
                    </div>

                    <button
                      onClick={() => handleEliminarPago(p)}
                      disabled={eliminandoPagoId === p.id}
                      className="text-slate-400 hover:text-red-600 p-1.5 rounded hover:bg-red-50 transition-colors cursor-pointer"
                      title="Anular / Eliminar este pago"
                    >
                      {eliminandoPagoId === p.id ? (
                        <div className="h-3.5 w-3.5 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                        </svg>
                      )}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

      </div>

    </div>
  );
}

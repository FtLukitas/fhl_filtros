'use client';

import { useState, useEffect, useCallback, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { generarPDF } from '@/lib/generarPDF';
import type { Cliente, Pedido, Pago, Presupuesto, MovimientoSaldo, PrecioCliente, ListaPrecio } from '@/lib/types';
import ModalAjusteSaldo from '../components/ModalAjusteSaldo';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function ClienteDetallePage({ params }: PageProps) {
  const { id: clienteId } = use(params);
  const router = useRouter();

  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [listasPrecios, setListasPrecios] = useState<ListaPrecio[]>([]);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [movimientosSaldo, setMovimientosSaldo] = useState<MovimientoSaldo[]>([]);
  const [presupuestos, setPresupuestos] = useState<Presupuesto[]>([]);
  const [preciosCliente, setPreciosCliente] = useState<PrecioCliente[]>([]);
  const [cargando, setCargando] = useState(true);
  const [tabActivo, setTabActivo] = useState<'pedidos' | 'pagos' | 'saldo' | 'presupuestos' | 'precios'>('pedidos');

  // Modal Saldo
  const [modalSaldo, setModalSaldo] = useState(false);

  // Modal Editar Cliente
  const [modalEditar, setModalEditar] = useState(false);
  const [formNombre, setFormNombre] = useState('');
  const [formCuit, setFormCuit] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formTelefono, setFormTelefono] = useState('');
  const [formDireccion, setFormDireccion] = useState('');
  const [formCiudad, setFormCiudad] = useState('');
  const [formProvincia, setFormProvincia] = useState('');
  const [formCondicionIva, setFormCondicionIva] = useState('Responsable Inscripto');
  const [formTipoCliente, setFormTipoCliente] = useState('Mayorista');
  const [formDescuento, setFormDescuento] = useState<number>(0);
  const [formPlazoPago, setFormPlazoPago] = useState('Contado');
  const [formListaPrecioId, setFormListaPrecioId] = useState<string>('');
  const [formNotas, setFormNotas] = useState('');
  const [guardandoCliente, setGuardandoCliente] = useState(false);
  const [errorModal, setErrorModal] = useState<string | null>(null);

  // Estado para nuevo precio
  const [nuevoCodigoFhl, setNuevoCodigoFhl] = useState('');
  const [nuevoPrecio, setNuevoPrecio] = useState('');
  const [guardandoPrecio, setGuardandoPrecio] = useState(false);
  const [mensajeOk, setMensajeOk] = useState<string | null>(null);

  const notificarOk = (txt: string) => {
    setMensajeOk(txt);
    setTimeout(() => setMensajeOk(null), 3000);
  };

  const cargarTodo = useCallback(async () => {
    setCargando(true);
    try {
      // 0. Listas de Precios
      const { data: dbListas } = await supabase
        .from('listas_precios')
        .select('*')
        .eq('activa', true)
        .eq('eliminado', false);
      setListasPrecios((dbListas as ListaPrecio[]) || []);

      // 1. Cliente
      const { data: dbCliente } = await supabase.from('clientes').select('*').eq('id', clienteId).single();
      if (!dbCliente) {
        router.push('/admin/clientes');
        return;
      }
      const cl = dbCliente as Cliente;
      setCliente(cl);
      setFormNombre(cl.nombre || '');
      setFormCuit(cl.cuit || '');
      setFormEmail(cl.email || '');
      setFormTelefono(cl.telefono || '');
      setFormDireccion(cl.direccion || '');
      setFormCiudad(cl.ciudad || '');
      setFormProvincia(cl.provincia || '');
      setFormCondicionIva(cl.condicion_iva || 'Responsable Inscripto');
      setFormTipoCliente(cl.tipo_cliente || 'Mayorista');
      setFormDescuento(cl.descuento_predeterminado || 0);
      setFormPlazoPago(cl.plazo_pago || 'Contado');
      setFormListaPrecioId(cl.lista_precio_id || '');
      setFormNotas(cl.notas || '');

      // 2. Pedidos con ítems
      const { data: dbPedidos } = await supabase
        .from('pedidos')
        .select('*, items:items_pedido(*)')
        .eq('cliente_id', clienteId)
        .order('created_at', { ascending: false });
      setPedidos((dbPedidos as Pedido[]) || []);

      // 3. Pagos
      const { data: dbPagos } = await supabase
        .from('pagos')
        .select('*')
        .eq('cliente_id', clienteId)
        .order('fecha', { ascending: false });
      setPagos((dbPagos as Pago[]) || []);

      // 4. Movimientos de saldo
      const { data: dbSaldo } = await supabase
        .from('movimientos_saldo')
        .select('*')
        .eq('cliente_id', clienteId)
        .order('fecha', { ascending: false });
      setMovimientosSaldo((dbSaldo as MovimientoSaldo[]) || []);

      // 5. Presupuestos
      const { data: dbPresupuestos } = await supabase
        .from('presupuestos')
        .select('*, items:items_presupuesto(*)')
        .eq('cliente_id', clienteId)
        .order('created_at', { ascending: false });
      setPresupuestos((dbPresupuestos as Presupuesto[]) || []);

      // 6. Precios cliente
      const { data: dbPrecios } = await supabase
        .from('precios_cliente')
        .select('*')
        .eq('cliente_id', clienteId)
        .order('codigo_fhl', { ascending: true });
      setPreciosCliente((dbPrecios as PrecioCliente[]) || []);
    } catch (err) {
      console.error(err);
    } finally {
      setCargando(false);
    }
  }, [clienteId, router]);

  useEffect(() => {
    cargarTodo();
  }, [cargarTodo]);

  // Cálculos financieros
  const totalComprado = pedidos
    .filter((p) => p.estado !== 'cancelado')
    .reduce((sum, p) => sum + Number(p.total || 0), 0);

  const pagosPorPedido = new Map<string, number>();
  pagos.forEach((p) => {
    pagosPorPedido.set(p.pedido_id, (pagosPorPedido.get(p.pedido_id) || 0) + Number(p.monto || 0));
  });

  const deudaTotal = pedidos
    .filter((p) => p.estado !== 'cancelado')
    .reduce((sum, p) => {
      const pagado = pagosPorPedido.get(p.id) || 0;
      return sum + Math.max(0, Number(p.total || 0) - pagado);
    }, 0);

  const saldoAFavor = Math.max(
    0,
    movimientosSaldo.reduce((sum, m) => sum + Number(m.monto || 0), 0)
  );

  // Eliminar un movimiento de saldo individual
  const handleEliminarMovimientoSaldo = async (movId: string) => {
    if (!confirm('¿Estás seguro de eliminar este registro de saldo? Esta acción recalculará automáticamente el saldo a favor del cliente.')) {
      return;
    }
    try {
      const { error: err } = await supabase
        .from('movimientos_saldo')
        .delete()
        .eq('id', movId);
      if (err) throw err;
      notificarOk('Movimiento de saldo eliminado con éxito');
      await cargarTodo();
    } catch (err: any) {
      console.error(err);
      alert('Error al eliminar movimiento: ' + (err.message || 'Error desconocido'));
    }
  };

  // Guardar edición del cliente
  const handleGuardarCliente = async () => {
    if (!formNombre.trim()) {
      setErrorModal('El nombre o razón social es obligatorio');
      return;
    }

    setGuardandoCliente(true);
    setErrorModal(null);

    const payload = {
      nombre: formNombre.trim(),
      cuit: formCuit.trim() || null,
      email: formEmail.trim() || null,
      telefono: formTelefono.trim() || null,
      direccion: formDireccion.trim() || null,
      ciudad: formCiudad.trim() || null,
      provincia: formProvincia.trim() || null,
      condicion_iva: formCondicionIva,
      tipo_cliente: formTipoCliente,
      descuento_predeterminado: Number(formDescuento) || 0,
      plazo_pago: formPlazoPago,
      lista_precio_id: formListaPrecioId || null,
      notas: formNotas.trim() || null,
    };

    try {
      const { error: err } = await supabase
        .from('clientes')
        .update(payload)
        .eq('id', clienteId);

      if (err) throw err;

      notificarOk('Datos del cliente actualizados con éxito');
      setModalEditar(false);
      await cargarTodo();
    } catch (err: any) {
      console.error(err);
      setErrorModal(err.message || 'Error al actualizar cliente');
    } finally {
      setGuardandoCliente(false);
    }
  };

  // Guardar precio personalizado
  const handleGuardarPrecio = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nuevoCodigoFhl.trim() || !nuevoPrecio) return;

    setGuardandoPrecio(true);
    const codigoUpper = nuevoCodigoFhl.trim().toUpperCase();
    const precioNum = parseFloat(nuevoPrecio);

    try {
      const { error } = await supabase.from('precios_cliente').upsert(
        {
          cliente_id: clienteId,
          codigo_fhl: codigoUpper,
          precio: precioNum,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'cliente_id,codigo_fhl' }
      );

      if (!error) {
        notificarOk(`Precio para ${codigoUpper} guardado`);
        setNuevoCodigoFhl('');
        setNuevoPrecio('');
        cargarTodo();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setGuardandoPrecio(false);
    }
  };

  // Eliminar precio personalizado
  const handleEliminarPrecio = async (id: number, codigo: string) => {
    if (!confirm(`¿Eliminar precio especial de ${codigo}?`)) return;
    const { error } = await supabase.from('precios_cliente').delete().eq('id', id);
    if (!error) {
      notificarOk(`Precio para ${codigo} eliminado`);
      cargarTodo();
    }
  };

  // Papelera y Eliminación Permanente de Cliente
  const handleSoftDelete = async () => {
    if (!cliente) return;
    if (!confirm(`¿Mover a papelera el cliente "${cliente.nombre}"?`)) return;
    const { error } = await supabase.from('clientes').update({ eliminado: true }).eq('id', cliente.id);
    if (!error) {
      notificarOk('Cliente movido a la papelera');
      await cargarTodo();
    }
  };

  const handleRestaurar = async () => {
    if (!cliente) return;
    const { error } = await supabase.from('clientes').update({ eliminado: false }).eq('id', cliente.id);
    if (!error) {
      notificarOk('Cliente restaurado con éxito');
      await cargarTodo();
    }
  };

  const handleEliminarPermanente = async () => {
    if (!cliente) return;
    if (!confirm(`ATENCIÓN: ¿Eliminar PERMANENTEMENTE de la base de datos al cliente "${cliente.nombre}"?\n\nEsta acción NO se puede deshacer. Se borrarán definitivamente sus precios asignados, movimientos de saldo y pedidos asociados.`)) return;

    try {
      setCargando(true);
      await supabase.from('precios_cliente').delete().eq('cliente_id', cliente.id);
      await supabase.from('movimientos_saldo').delete().eq('cliente_id', cliente.id);
      await supabase.from('pagos').delete().eq('cliente_id', cliente.id);

      const { data: peds } = await supabase.from('pedidos').select('id').eq('cliente_id', cliente.id);
      if (peds && peds.length > 0) {
        const pedIds = peds.map((p) => p.id);
        await supabase.from('items_pedido').delete().in('pedido_id', pedIds);
        await supabase.from('pedidos').delete().eq('cliente_id', cliente.id);
      }

      const { error } = await supabase.from('clientes').delete().eq('id', cliente.id);
      if (error) throw error;

      router.push('/admin/clientes');
    } catch (err: any) {
      console.error('Error al eliminar cliente permanentemente:', err);
      alert(`Error al eliminar cliente: ${err.message || 'Error desconocido'}`);
      setCargando(false);
    }
  };

  // Descargar PDF de presupuesto
  const handleDescargarPDF = (pr: Presupuesto) => {
    if (!cliente) return;
    const itemsFormateados = (pr.items || []).map((it) => ({
      id: it.id.toString(),
      codigo_fhl: it.codigo_fhl,
      cantidad: it.cantidad,
      precioUnitario: Number(it.precio_unitario || 0),
    }));

    generarPDF({
      cliente,
      items: itemsFormateados,
      observaciones: pr.observaciones || '',
      numeroPresupuesto: pr.numero || '',
      validezDias: pr.validez_dias || 30,
    });
  };

  // Convertir presupuesto a pedido
  const handleConvertirPresupuesto = async (pr: Presupuesto) => {
    if (!confirm(`¿Convertir presupuesto #${pr.numero || pr.id.slice(0, 8)} en un pedido formal?`)) return;

    try {
      // 1. Crear Pedido
      const { data: nuevoPedido, error: errPed } = await supabase
        .from('pedidos')
        .insert({
          cliente_id: clienteId,
          presupuesto_id: pr.id,
          estado: 'pendiente',
          total: pr.total,
          observaciones: pr.observaciones,
        })
        .select()
        .single();

      if (errPed || !nuevoPedido) throw errPed;

      // 2. Insertar ítems
      if (pr.items && pr.items.length > 0) {
        const itemsAInsertar = pr.items.map((it) => ({
          pedido_id: nuevoPedido.id,
          codigo_fhl: it.codigo_fhl,
          cantidad: it.cantidad,
          precio_unitario: it.precio_unitario,
        }));
        await supabase.from('items_pedido').insert(itemsAInsertar);
      }

      // 3. Marcar presupuesto como convertido
      await supabase.from('presupuestos').update({ estado: 'convertido', pedido_id: nuevoPedido.id }).eq('id', pr.id);

      notificarOk('Presupuesto convertido a pedido con éxito');
      router.push(`/admin/pedidos/${nuevoPedido.id}`);
    } catch (err: any) {
      console.error(err);
      alert('Error al convertir presupuesto: ' + err.message);
    }
  };

  if (cargando && !cliente) {
    return (
      <div className="py-20 flex flex-col items-center justify-center gap-3">
        <div className="h-8 w-8 border-3 border-blue-900 border-t-transparent rounded-full animate-spin" />
        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
          Cargando ficha del cliente...
        </p>
      </div>
    );
  }

  if (!cliente) return null;

  return (
    <div className="space-y-6">
      
      {/* Banner de Cliente en Papelera */}
      {cliente.eliminado && (
        <div className="p-4 bg-amber-50 border border-amber-300 rounded-md flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-amber-900">
          <div className="flex items-center gap-2">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-amber-700 shrink-0" aria-hidden="true">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
            </svg>
            <span className="text-xs font-bold">
              Este cliente se encuentra en la papelera. Podés restaurarlo a la lista activa o eliminarlo de forma permanente.
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleRestaurar}
              className="px-3 py-1.5 bg-green-700 hover:bg-green-800 text-white rounded-md text-xs font-bold transition-colors cursor-pointer"
            >
              Restaurar Cliente
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
          href="/admin/clientes"
          className="text-xs font-bold text-slate-500 hover:text-blue-900 transition-colors inline-flex items-center gap-1.5 mb-2"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          Volver a Clientes
        </Link>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-900 border border-blue-100">
                {cliente.tipo_cliente || 'Mayorista'}
              </span>
              {cliente.condicion_iva && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                  {cliente.condicion_iva}
                </span>
              )}
              {cliente.plazo_pago && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-100">
                  Plazo: {cliente.plazo_pago}
                </span>
              )}
              {cliente.lista_precio_id && (() => {
                const lp = listasPrecios.find((l) => l.id === cliente.lista_precio_id);
                if (!lp) return null;
                return (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                    {lp.nombre} ({lp.porcentaje === 0 ? 'Base' : `${lp.porcentaje}%`})
                  </span>
                );
              })()}
            </div>

            <h2 className="text-2xl font-black text-slate-900 tracking-tight">
              {cliente.nombre}
            </h2>
            <div className="flex items-center gap-3 text-xs text-slate-500 mt-1 flex-wrap">
              {cliente.cuit && <span className="font-mono font-semibold">CUIT: {cliente.cuit}</span>}
              {cliente.descuento_predeterminado ? (
                <span className="font-bold text-green-700 bg-green-50 px-2 py-0.5 rounded">
                  {cliente.descuento_predeterminado}% Descuento Base
                </span>
              ) : null}
              <span>• Cliente desde: {new Date(cliente.created_at).toLocaleDateString('es-AR')}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setModalSaldo(true)}
              className="bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 px-3.5 py-2 rounded-md text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <rect x="2" y="4" width="20" height="16" rx="2" />
                <line x1="12" y1="8" x2="12" y2="16" />
                <line x1="8" y1="12" x2="16" y2="12" />
              </svg>
              <span>Ajustar Saldo</span>
            </button>

            <button
              onClick={() => setModalEditar(true)}
              className="bg-slate-100 hover:bg-slate-200 text-slate-800 px-3.5 py-2 rounded-md text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
              <span>Editar Datos</span>
            </button>

            <Link
              href={`/admin/facturador?clienteId=${cliente.id}`}
              className="bg-blue-900 hover:bg-blue-800 text-white px-4 py-2 rounded-md text-xs font-bold transition-all shadow-sm flex items-center gap-1.5"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>Cargar Pedido</span>
            </Link>

            {/* Mover a papelera si está activo */}
            {!cliente.eliminado && (
              <button
                onClick={handleSoftDelete}
                className="text-slate-400 hover:text-red-600 p-2 rounded-md hover:bg-red-50 border border-slate-200 transition-colors cursor-pointer"
                title="Mover cliente a papelera"
                aria-label="Mover cliente a papelera"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>

      {mensajeOk && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-md text-green-800 text-xs font-bold flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span>{mensajeOk}</span>
        </div>
      )}

      {/* Bloque de Contacto, Ubicación y Observaciones */}
      <div className="bg-white rounded-lg p-4 border border-slate-200 shadow-sm grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
        <div>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
            Contacto Directo
          </span>
          <div className="space-y-1">
            {cliente.telefono ? (
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-700">WhatsApp/Tel:</span>
                <a
                  href={`https://wa.me/${cliente.telefono.replace(/[^0-9]/g, '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-bold text-green-700 hover:underline"
                >
                  {cliente.telefono}
                </a>
              </div>
            ) : (
              <span className="text-slate-400">Sin teléfono registrado</span>
            )}
            {cliente.email ? (
              <div className="flex items-center gap-2 truncate">
                <span className="font-semibold text-slate-700">Email:</span>
                <a href={`mailto:${cliente.email}`} className="text-blue-900 hover:underline truncate">
                  {cliente.email}
                </a>
              </div>
            ) : (
              <span className="text-slate-400 block">Sin email registrado</span>
            )}
          </div>
        </div>

        <div>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
            Domicilio Comercial
          </span>
          <p className="text-slate-700 font-medium leading-relaxed">
            {[cliente.direccion, cliente.ciudad, cliente.provincia].filter(Boolean).join(', ') || 'Sin dirección registrada'}
          </p>
        </div>

        <div>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
            Notas u Observaciones
          </span>
          <p className="text-slate-600 italic leading-relaxed whitespace-pre-wrap">
            {cliente.notas || 'Sin observaciones registradas.'}
          </p>
        </div>
      </div>

      {/* Tarjetas de Resumen Financiero */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Total Comprado */}
        <div className="bg-white rounded-lg p-4 border border-slate-200 shadow-sm">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
            Total Comprado (Histórico)
          </span>
          <span className="text-xl font-black text-slate-900 font-mono">
            ${totalComprado.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
          </span>
          <span className="text-[11px] text-slate-400 block mt-1">
            {pedidos.filter((p) => p.estado !== 'cancelado').length} pedidos completados o en curso
          </span>
        </div>

        {/* Deuda Actual */}
        <div className="bg-white rounded-lg p-4 border border-slate-200 shadow-sm">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
            Deuda Actual
          </span>
          <span
            className={`text-xl font-black font-mono ${
              deudaTotal > 0 ? 'text-red-600' : 'text-slate-800'
            }`}
          >
            ${deudaTotal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
          </span>
          <span className="text-[11px] text-slate-400 block mt-1">
            {deudaTotal > 0 ? 'Pagos pendientes' : 'Al día sin deuda'}
          </span>
        </div>

        {/* Saldo a Favor */}
        <div className="bg-white rounded-lg p-4 border border-slate-200 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Saldo a Favor
              </span>
              <button
                type="button"
                onClick={() => setModalSaldo(true)}
                className="text-[11px] font-bold text-blue-900 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-2 py-0.5 rounded transition-colors cursor-pointer flex items-center gap-1"
                title="Editar o ajustar saldo a favor"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                  <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
                <span>Editar</span>
              </button>
            </div>
            <span
              className={`text-xl font-black font-mono block ${
                saldoAFavor > 0 ? 'text-blue-600' : 'text-slate-800'
              }`}
            >
              ${saldoAFavor.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
            </span>
          </div>
          <span className="text-[11px] text-slate-400 block mt-1">
            {saldoAFavor > 0 ? 'Crédito aplicable a pedidos' : 'Sin saldo acumulado'}
          </span>
        </div>

        {/* Total Pedidos */}
        <div className="bg-white rounded-lg p-4 border border-slate-200 shadow-sm">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
            Actividad Comercial
          </span>
          <span className="text-xl font-black text-slate-900">
            {pedidos.length} {pedidos.length === 1 ? 'Pedido' : 'Pedidos'}
          </span>
          <span className="text-[11px] text-slate-400 block mt-1">
            {preciosCliente.length} precios personalizados
          </span>
        </div>

      </div>

      {/* Selector de Pestañas */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex border-b border-slate-200 overflow-x-auto bg-slate-50/50" role="tablist" aria-label="Secciones del perfil del cliente">
          <button
            role="tab"
            aria-selected={tabActivo === 'pedidos'}
            aria-controls="tab-content-pedidos"
            id="tab-pedidos"
            onClick={() => setTabActivo('pedidos')}
            className={`px-4 py-3 text-xs font-bold transition-all border-b-2 whitespace-nowrap cursor-pointer ${
              tabActivo === 'pedidos'
                ? 'border-blue-900 text-blue-900 bg-white'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Historial de Pedidos ({pedidos.length})
          </button>
          <button
            role="tab"
            aria-selected={tabActivo === 'pagos'}
            aria-controls="tab-content-pagos"
            id="tab-pagos"
            onClick={() => setTabActivo('pagos')}
            className={`px-4 py-3 text-xs font-bold transition-all border-b-2 whitespace-nowrap cursor-pointer ${
              tabActivo === 'pagos'
                ? 'border-blue-900 text-blue-900 bg-white'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Pagos Realizados ({pagos.length})
          </button>
          <button
            role="tab"
            aria-selected={tabActivo === 'saldo'}
            aria-controls="tab-content-saldo"
            id="tab-saldo"
            onClick={() => setTabActivo('saldo')}
            className={`px-4 py-3 text-xs font-bold transition-all border-b-2 whitespace-nowrap cursor-pointer ${
              tabActivo === 'saldo'
                ? 'border-blue-900 text-blue-900 bg-white'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Movimientos de Saldo ({movimientosSaldo.length})
          </button>
          <button
            role="tab"
            aria-selected={tabActivo === 'precios'}
            aria-controls="tab-content-precios"
            id="tab-precios"
            onClick={() => setTabActivo('precios')}
            className={`px-4 py-3 text-xs font-bold transition-all border-b-2 whitespace-nowrap cursor-pointer ${
              tabActivo === 'precios'
                ? 'border-blue-900 text-blue-900 bg-white'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Lista de Precios ({preciosCliente.length})
          </button>
        </div>

        <div className="p-5">
          
          {/* TAB 1: PEDIDOS */}
          {tabActivo === 'pedidos' && (
            <div>
              {pedidos.length === 0 ? (
                <p className="text-xs text-slate-400 italic text-center py-8">
                  Este cliente no tiene pedidos registrados todavía.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider">
                      <tr>
                        <th className="p-3">ID / Fecha</th>
                        <th className="p-3">Estado</th>
                        <th className="p-3">Ítems</th>
                        <th className="p-3 text-right">Total</th>
                        <th className="p-3 text-right">Pagado</th>
                        <th className="p-3 text-right">Deuda</th>
                        <th className="p-3 text-right">Acción</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {pedidos.map((p) => {
                        const pagado = pagosPorPedido.get(p.id) || 0;
                        const deuda = Math.max(0, Number(p.total || 0) - pagado);

                        return (
                          <tr key={p.id} className="hover:bg-slate-50/60 transition-colors">
                            <td className="p-3">
                              <span className="font-bold text-slate-900 font-mono block">
                                #{p.id.slice(0, 8)}
                              </span>
                              <span className="text-[11px] text-slate-400">
                                {new Date(p.created_at).toLocaleDateString('es-AR')}
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
                            <td className="p-3 text-slate-600">
                              {p.items?.length || 0} filtros
                            </td>
                            <td className="p-3 text-right font-black text-slate-900 font-mono">
                              ${Number(p.total || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                            </td>
                            <td className="p-3 text-right font-mono font-bold text-green-700">
                              ${pagado.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                            </td>
                            <td className="p-3 text-right font-mono font-bold">
                              <span className={deuda > 0 ? 'text-red-600 font-black' : 'text-slate-400'}>
                                ${deuda.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                              </span>
                            </td>
                            <td className="p-3 text-right">
                              <Link
                                href={`/admin/pedidos/${p.id}`}
                                className="px-3 py-1 bg-blue-900 hover:bg-blue-800 text-white rounded font-bold text-[11px] inline-block"
                              >
                                Ver Detalle →
                              </Link>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: PAGOS */}
          {tabActivo === 'pagos' && (
            <div>
              {pagos.length === 0 ? (
                <p className="text-xs text-slate-400 italic text-center py-8">
                  No hay pagos registrados para este cliente.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider">
                      <tr>
                        <th className="p-3">Fecha</th>
                        <th className="p-3">Pedido Vinculado</th>
                        <th className="p-3">Método</th>
                        <th className="p-3">Detalle / Referencia</th>
                        <th className="p-3 text-right">Monto</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {pagos.map((p) => (
                        <tr key={p.id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="p-3 text-slate-600 font-medium">
                            {new Date(p.fecha).toLocaleDateString('es-AR', {
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </td>
                          <td className="p-3">
                            <Link
                              href={`/admin/pedidos/${p.pedido_id}`}
                              className="font-bold text-blue-900 font-mono hover:underline"
                            >
                              #{p.pedido_id.slice(0, 8)}
                            </Link>
                          </td>
                          <td className="p-3">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-100 text-slate-700">
                              {p.metodo}
                            </span>
                          </td>
                          <td className="p-3 text-slate-600 italic">
                            {p.nota || '—'}
                          </td>
                          <td className="p-3 text-right font-black font-mono text-green-700 text-sm">
                            +${Number(p.monto).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: SALDO A FAVOR */}
          {tabActivo === 'saldo' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2 flex-wrap bg-slate-50 p-3 rounded-lg border border-slate-200/80">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Estado de Saldo
                  </span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-bold text-slate-700">Saldo Disponible:</span>
                    <span className="text-lg font-black font-mono text-blue-900">
                      ${saldoAFavor.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setModalSaldo(true)}
                  className="px-3.5 py-2 bg-blue-900 hover:bg-blue-800 text-white rounded-md text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  <span>Cargar / Ajustar Saldo</span>
                </button>
              </div>

              {movimientosSaldo.length === 0 ? (
                <div className="p-8 text-center bg-white border border-slate-200 rounded-lg">
                  <p className="text-xs text-slate-400 italic mb-3">
                    Este cliente no registra movimientos de crédito a favor.
                  </p>
                  <button
                    type="button"
                    onClick={() => setModalSaldo(true)}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-md transition-colors cursor-pointer"
                  >
                    + Registrar primer saldo
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto border border-slate-200 rounded-lg">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider">
                      <tr>
                        <th className="p-3">Fecha</th>
                        <th className="p-3">Tipo</th>
                        <th className="p-3">Pedido Vinculado</th>
                        <th className="p-3">Descripción</th>
                        <th className="p-3 text-right">Monto</th>
                        <th className="p-3 text-right">Acción</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {movimientosSaldo.map((m) => (
                        <tr key={m.id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="p-3 text-slate-600">
                            {new Date(m.fecha).toLocaleDateString('es-AR', {
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </td>
                          <td className="p-3">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                m.tipo === 'excedente'
                                  ? 'bg-blue-100 text-blue-800'
                                  : m.tipo === 'ajuste_manual'
                                  ? 'bg-purple-100 text-purple-800'
                                  : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {m.tipo === 'excedente'
                                ? 'Excedente (Crédito)'
                                : m.tipo === 'ajuste_manual'
                                ? 'Ajuste Manual'
                                : 'Saldo Aplicado'}
                            </span>
                          </td>
                          <td className="p-3">
                            {(m.pedido_id || m.referencia_pedido_id) ? (
                              <Link
                                href={`/admin/pedidos/${m.pedido_id || m.referencia_pedido_id}`}
                                className="font-bold text-blue-900 font-mono hover:underline"
                              >
                                #{(m.pedido_id || m.referencia_pedido_id)?.slice(0, 8)}
                              </Link>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="p-3 text-slate-600 italic">
                            {m.descripcion || m.nota || '—'}
                          </td>
                          <td
                            className={`p-3 text-right font-black font-mono text-sm ${
                              Number(m.monto) >= 0 ? 'text-blue-900' : 'text-slate-600'
                            }`}
                          >
                            {Number(m.monto) >= 0 ? '+' : ''}
                            ${Number(m.monto).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="p-3 text-right">
                            <button
                              type="button"
                              onClick={() => handleEliminarMovimientoSaldo(m.id)}
                              className="text-slate-400 hover:text-red-600 p-1.5 rounded hover:bg-slate-100 transition-colors cursor-pointer"
                              title="Eliminar este movimiento de saldo"
                              aria-label="Eliminar movimiento de saldo"
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                              </svg>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: PRECIOS PERSONALIZADOS */}
          {tabActivo === 'precios' && (
            <div className="space-y-6">
              {/* Formulario nuevo precio */}
              <form onSubmit={handleGuardarPrecio} className="bg-slate-50 p-4 rounded-md border border-slate-200 flex flex-col sm:flex-row items-end gap-3">
                <div className="flex-1">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                    Código FHL
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej: FHL-001"
                    value={nuevoCodigoFhl}
                    onChange={(e) => setNuevoCodigoFhl(e.target.value)}
                    className="w-full border border-slate-300 rounded px-3 py-1.5 text-xs text-slate-900 bg-white font-bold"
                  />
                </div>

                <div className="w-40">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                    Precio Especial ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    placeholder="Ej: 15400"
                    value={nuevoPrecio}
                    onChange={(e) => setNuevoPrecio(e.target.value)}
                    className="w-full border border-slate-300 rounded px-3 py-1.5 text-xs text-slate-900 bg-white font-mono font-bold"
                  />
                </div>

                <button
                  type="submit"
                  disabled={guardandoPrecio}
                  className="bg-blue-900 hover:bg-blue-800 text-white px-4 py-2 rounded font-bold text-xs transition-colors disabled:opacity-50"
                >
                  {guardandoPrecio ? 'Guardando...' : 'Asignar Precio'}
                </button>
              </form>

              {/* Lista de precios */}
              {preciosCliente.length === 0 ? (
                <p className="text-xs text-slate-400 italic text-center py-6">
                  No hay precios especiales asignados para este cliente. Se utilizará el precio base de cada producto.
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {preciosCliente.map((pc) => (
                    <div
                      key={pc.id}
                      className="p-3 bg-white rounded-md border border-slate-200 flex items-center justify-between shadow-xs"
                    >
                      <div>
                        <span className="font-bold text-blue-900 text-xs block">{pc.codigo_fhl}</span>
                        <span className="text-[10px] text-slate-400">
                          Actualizado: {new Date(pc.updated_at).toLocaleDateString('es-AR')}
                        </span>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="font-black text-slate-900 font-mono text-sm">
                          ${Number(pc.precio).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                        </span>
                        <button
                          onClick={() => handleEliminarPrecio(pc.id, pc.codigo_fhl)}
                          className="text-slate-400 hover:text-red-600 p-1"
                          title="Eliminar precio especial"
                        >
                          &times;
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>
      </div>

      {/* Modal Editar Cliente */}
      {modalEditar && (
        <div className="fixed inset-0 z-[1000] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-2xl max-w-2xl w-full p-6 animate-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  Ficha de Cliente
                </span>
                <h3 className="text-lg font-black text-slate-800">
                  Editar Configuración de {cliente.nombre}
                </h3>
              </div>
              <button
                onClick={() => setModalEditar(false)}
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
                  <label htmlFor="edit-cliente-nombre" className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Razón Social / Nombre Comercial *
                  </label>
                  <input
                    id="edit-cliente-nombre"
                    type="text"
                    value={formNombre}
                    onChange={(e) => setFormNombre(e.target.value)}
                    placeholder="Ej: Distribuidora Central S.A."
                    className="w-full border border-slate-300 rounded-md px-3 py-2 text-xs text-slate-900 focus:ring-2 focus:ring-blue-600 focus:outline-none font-semibold"
                  />
                </div>

                <div>
                  <label htmlFor="edit-cliente-cuit" className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                    CUIT / DNI
                  </label>
                  <input
                    id="edit-cliente-cuit"
                    type="text"
                    value={formCuit}
                    onChange={(e) => setFormCuit(e.target.value)}
                    placeholder="Ej: 30-71234567-8"
                    className="w-full border border-slate-300 rounded-md px-3 py-2 text-xs text-slate-900 focus:ring-2 focus:ring-blue-600 focus:outline-none font-mono"
                  />
                </div>

                <div>
                  <label htmlFor="edit-cliente-iva" className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Condición Frente al IVA
                  </label>
                  <select
                    id="edit-cliente-iva"
                    value={formCondicionIva}
                    onChange={(e) => setFormCondicionIva(e.target.value)}
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
                  <label htmlFor="edit-cliente-tipo" className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Tipo de Cliente
                  </label>
                  <select
                    id="edit-cliente-tipo"
                    value={formTipoCliente}
                    onChange={(e) => setFormTipoCliente(e.target.value)}
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
                  <label htmlFor="edit-cliente-descuento" className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Descuento Base (%)
                  </label>
                  <input
                    id="edit-cliente-descuento"
                    type="number"
                    min="0"
                    max="100"
                    step="0.5"
                    value={formDescuento}
                    onChange={(e) => setFormDescuento(parseFloat(e.target.value) || 0)}
                    placeholder="0"
                    className="w-full border border-slate-300 rounded-md px-2.5 py-1.5 text-xs text-slate-900 bg-white font-mono font-bold focus:ring-2 focus:ring-blue-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label htmlFor="edit-cliente-plazo" className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Plazo de Pago
                  </label>
                  <select
                    id="edit-cliente-plazo"
                    value={formPlazoPago}
                    onChange={(e) => setFormPlazoPago(e.target.value)}
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
                  <label htmlFor="edit-cliente-lista-precio" className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Lista de Precios Predeterminada
                  </label>
                  <select
                    id="edit-cliente-lista-precio"
                    value={formListaPrecioId}
                    onChange={(e) => setFormListaPrecioId(e.target.value)}
                    className="w-full border border-slate-300 rounded-md px-2.5 py-1.5 text-xs text-slate-900 bg-white focus:ring-2 focus:ring-blue-600 focus:outline-none"
                  >
                    <option value="">-- Automática / Predeterminada del Sistema --</option>
                    {listasPrecios.map((lp) => (
                      <option key={lp.id} value={lp.id}>
                        {lp.nombre} {lp.tipo_ajuste === 'costeo' ? `(Costeo: ${lp.canal_costeo || 'Fábrica'})` : lp.tipo_ajuste === 'excel' ? '(Planilla Excel)' : lp.porcentaje !== 0 ? `(${lp.porcentaje > 0 ? `+${lp.porcentaje}%` : `${lp.porcentaje}%`})` : '(Base)'} {lp.es_predeterminada ? '(Predeterminada)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Bloque 3: Contacto */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="edit-cliente-telefono" className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Teléfono / WhatsApp
                  </label>
                  <input
                    id="edit-cliente-telefono"
                    type="text"
                    value={formTelefono}
                    onChange={(e) => setFormTelefono(e.target.value)}
                    placeholder="Ej: +54 9 11 4444-5555"
                    className="w-full border border-slate-300 rounded-md px-3 py-2 text-xs text-slate-900 focus:ring-2 focus:ring-blue-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label htmlFor="edit-cliente-email" className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Correo Electrónico
                  </label>
                  <input
                    id="edit-cliente-email"
                    type="email"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    placeholder="Ej: compras@distribuidora.com"
                    className="w-full border border-slate-300 rounded-md px-3 py-2 text-xs text-slate-900 focus:ring-2 focus:ring-blue-600 focus:outline-none"
                  />
                </div>
              </div>

              {/* Bloque 4: Ubicación */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-1">
                  <label htmlFor="edit-cliente-direccion" className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Dirección
                  </label>
                  <input
                    id="edit-cliente-direccion"
                    type="text"
                    value={formDireccion}
                    onChange={(e) => setFormDireccion(e.target.value)}
                    placeholder="Ej: Av. Rivadavia 1234"
                    className="w-full border border-slate-300 rounded-md px-3 py-2 text-xs text-slate-900 focus:ring-2 focus:ring-blue-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label htmlFor="edit-cliente-ciudad" className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Ciudad / Localidad
                  </label>
                  <input
                    id="edit-cliente-ciudad"
                    type="text"
                    value={formCiudad}
                    onChange={(e) => setFormCiudad(e.target.value)}
                    placeholder="Ej: Rosario"
                    className="w-full border border-slate-300 rounded-md px-3 py-2 text-xs text-slate-900 focus:ring-2 focus:ring-blue-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label htmlFor="edit-cliente-provincia" className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Provincia
                  </label>
                  <input
                    id="edit-cliente-provincia"
                    type="text"
                    value={formProvincia}
                    onChange={(e) => setFormProvincia(e.target.value)}
                    placeholder="Ej: Santa Fe"
                    className="w-full border border-slate-300 rounded-md px-3 py-2 text-xs text-slate-900 focus:ring-2 focus:ring-blue-600 focus:outline-none"
                  />
                </div>
              </div>

              {/* Bloque 5: Observaciones */}
              <div>
                <label htmlFor="edit-cliente-notas" className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                  Notas u Observaciones Internas
                </label>
                <textarea
                  id="edit-cliente-notas"
                  rows={2}
                  value={formNotas}
                  onChange={(e) => setFormNotas(e.target.value)}
                  placeholder="Horarios de entrega, expreso habitual, etc..."
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-xs text-slate-900 focus:ring-2 focus:ring-blue-600 focus:outline-none resize-none"
                />
              </div>

            </div>

            <div className="mt-6 pt-3 border-t border-slate-100 flex justify-end gap-2">
              <button
                onClick={() => setModalEditar(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleGuardarCliente}
                disabled={guardandoCliente}
                className="px-5 py-2 text-xs font-bold text-white bg-blue-900 hover:bg-blue-800 rounded-md transition-colors shadow disabled:opacity-50"
              >
                {guardandoCliente ? 'Guardando...' : 'Guardar Cambios'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Ajuste de Saldo */}
      {cliente && (
        <ModalAjusteSaldo
          abierto={modalSaldo}
          onCerrar={() => setModalSaldo(false)}
          cliente={{ id: cliente.id, nombre: cliente.nombre }}
          saldoActual={saldoAFavor}
          onGuardado={async () => {
            notificarOk('Saldo a favor actualizado con éxito');
            await cargarTodo();
          }}
        />
      )}

    </div>
  );
}

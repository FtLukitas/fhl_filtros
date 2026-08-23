'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../../../lib/supabase';
import type { Cliente, ListaPrecio } from '../../../../lib/types';

interface SelectorClienteProps {
  clienteSeleccionado: Cliente | null;
  onSeleccionar: (cliente: Cliente | null) => void;
}

type Vista = 'selector' | 'formulario' | 'eliminados';

interface FormData {
  nombre: string;
  cuit: string;
  direccion: string;
  telefono: string;
  email: string;
  listaPrecioId: string;
}

const formVacio: FormData = {
  nombre: '',
  cuit: '',
  direccion: '',
  telefono: '',
  email: '',
  listaPrecioId: '',
};

export default function SelectorCliente({ clienteSeleccionado, onSeleccionar }: SelectorClienteProps) {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [clientesEliminados, setClientesEliminados] = useState<Cliente[]>([]);
  const [listasPrecios, setListasPrecios] = useState<ListaPrecio[]>([]);
  const [cargando, setCargando] = useState(true);
  const [vista, setVista] = useState<Vista>('selector');
  const [formData, setFormData] = useState<FormData>(formVacio);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmarEliminar, setConfirmarEliminar] = useState(false);
  const [saldoNetoCliente, setSaldoNetoCliente] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Cargar saldo neto del cliente seleccionado
  useEffect(() => {
    if (!clienteSeleccionado) {
      setSaldoNetoCliente(null);
      return;
    }

    async function cargarSaldo() {
      if (!clienteSeleccionado) return;
      try {
        const [resPed, resPag, resMov] = await Promise.all([
          supabase.from('pedidos').select('id, total').eq('cliente_id', clienteSeleccionado.id).neq('estado', 'cancelado'),
          supabase.from('pagos').select('pedido_id, monto').eq('cliente_id', clienteSeleccionado.id),
          supabase.from('movimientos_saldo').select('monto').eq('cliente_id', clienteSeleccionado.id),
        ]);

        const pagosPorPedido = new Map<string, number>();
        (resPag.data || []).forEach((p: any) => {
          pagosPorPedido.set(p.pedido_id, (pagosPorPedido.get(p.pedido_id) || 0) + Number(p.monto || 0));
        });

        const deudaPed = (resPed.data || []).reduce((sum: number, p: any) => {
          const pagado = pagosPorPedido.get(p.id) || 0;
          return sum + Math.max(0, Number(p.total || 0) - pagado);
        }, 0);

        const balMov = (resMov.data || []).reduce((sum: number, m: any) => sum + Number(m.monto || 0), 0);
        setSaldoNetoCliente(balMov - deudaPed);
      } catch (e) {
        console.error('Error al cargar saldo del cliente:', e);
      }
    }

    cargarSaldo();
  }, [clienteSeleccionado]);

  // Cargar clientes activos y listas de precios
  const cargarDatos = async () => {
    setCargando(true);
    try {
      const [resCli, resListas] = await Promise.all([
        supabase.from('clientes').select('*').eq('eliminado', false).order('nombre'),
        supabase.from('listas_precios').select('*').eq('activa', true).eq('eliminado', false).order('nombre'),
      ]);

      if (resCli.data) setClientes(resCli.data as Cliente[]);
      if (resListas.data) setListasPrecios(resListas.data as ListaPrecio[]);
    } catch (err) {
      console.error('Error al cargar datos:', err);
    } finally {
      setCargando(false);
    }
  };

  // Cargar clientes eliminados
  const cargarEliminados = async () => {
    const { data } = await supabase
      .from('clientes')
      .select('*')
      .eq('eliminado', true)
      .order('nombre');
    setClientesEliminados((data as Cliente[]) || []);
  };

  useEffect(() => {
    cargarDatos();
  }, []);

  // Focus en input al abrir formulario
  useEffect(() => {
    if (vista === 'formulario' && inputRef.current) {
      inputRef.current.focus();
    }
  }, [vista]);

  const abrirNuevo = () => {
    setFormData(formVacio);
    setEditandoId(null);
    setVista('formulario');
    setError(null);
  };

  const abrirEditar = () => {
    if (!clienteSeleccionado) return;
    setFormData({
      nombre: clienteSeleccionado.nombre,
      cuit: clienteSeleccionado.cuit || '',
      direccion: clienteSeleccionado.direccion || '',
      telefono: '',
      email: '',
      listaPrecioId: clienteSeleccionado.lista_precio_id || '',
    });
    setEditandoId(clienteSeleccionado.id);
    setVista('formulario');
    setError(null);
  };

  const abrirEliminados = async () => {
    await cargarEliminados();
    setVista('eliminados');
    setError(null);
  };

  const cancelar = () => {
    setVista('selector');
    setFormData(formVacio);
    setEditandoId(null);
    setError(null);
  };

  const guardar = async () => {
    if (!formData.nombre.trim()) {
      setError('El nombre o razón social es obligatorio');
      return;
    }

    setGuardando(true);
    setError(null);

    // Combinar datos de contacto en direccion para conservarlos de forma limpia
    let direccionCompleta = formData.direccion.trim();
    const contactos: string[] = [];
    if (formData.telefono.trim()) contactos.push(`Tel: ${formData.telefono.trim()}`);
    if (formData.email.trim()) contactos.push(`Email: ${formData.email.trim()}`);
    
    if (contactos.length > 0) {
      direccionCompleta = direccionCompleta
        ? `${direccionCompleta} (${contactos.join(' - ')})`
        : contactos.join(' - ');
    }

    const payload = {
      nombre: formData.nombre.trim(),
      cuit: formData.cuit.trim() || null,
      direccion: direccionCompleta || null,
      lista_precio_id: formData.listaPrecioId || null,
    };

    try {
      if (editandoId) {
        const { error: err } = await supabase
          .from('clientes')
          .update(payload)
          .eq('id', editandoId);

        if (err) throw err;

        if (clienteSeleccionado?.id === editandoId) {
          onSeleccionar({
            ...clienteSeleccionado,
            nombre: payload.nombre,
            cuit: payload.cuit,
            direccion: payload.direccion,
            lista_precio_id: payload.lista_precio_id,
          });
        }
      } else {
        const { data, error: err } = await supabase
          .from('clientes')
          .insert({
            ...payload,
            eliminado: false,
          })
          .select()
          .single();

        if (err) throw err;
        onSeleccionar(data as Cliente);
      }

      await cargarDatos();
      setVista('selector');
      setFormData(formVacio);
      setEditandoId(null);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Error al guardar cliente. Intentá de nuevo.');
    } finally {
      setGuardando(false);
    }
  };

  const eliminar = async () => {
    if (!clienteSeleccionado) return;

    setGuardando(true);
    try {
      const { error: err } = await supabase
        .from('clientes')
        .update({ eliminado: true })
        .eq('id', clienteSeleccionado.id);

      if (err) throw err;

      onSeleccionar(null);
      await cargarDatos();
      setConfirmarEliminar(false);
    } catch (err) {
      console.error(err);
      setError('Error al eliminar cliente');
    } finally {
      setGuardando(false);
    }
  };

  const inputClase =
    'w-full border border-slate-300 rounded px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600';

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 space-y-4">
      {/* Encabezado */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">
          Cliente
        </h3>
        {vista === 'selector' && (
          <button
            onClick={abrirEliminados}
            className="text-[11px] text-slate-400 hover:text-slate-600 transition-colors"
          >
            Ver eliminados
          </button>
        )}
      </div>

      {/* Mensaje de error */}
      {error && (
        <div className="p-2.5 bg-red-50 border border-red-200 rounded text-red-700 text-xs font-semibold">
          {error}
        </div>
      )}

      {/* ===== VISTA SELECTOR ===== */}
      {vista === 'selector' && (
        <div>
          <div className="flex gap-2">
            <select
              value={clienteSeleccionado?.id || ''}
              onChange={(e) => {
                const id = e.target.value;
                if (!id) {
                  onSeleccionar(null);
                } else {
                  const c = clientes.find((item) => item.id === id);
                  onSeleccionar(c || null);
                }
              }}
              aria-label="Seleccionar cliente registrado"
              className="flex-1 border border-slate-300 rounded px-3 py-2 text-xs text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600 font-medium"
              disabled={cargando}
            >
              <option value="">
                {cargando ? 'Cargando clientes...' : '— Seleccionar cliente —'}
              </option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}{c.cuit ? ` (${c.cuit})` : ''}
                </option>
              ))}
            </select>
            <button
              onClick={abrirNuevo}
              className="bg-blue-900 hover:bg-blue-800 text-white px-3 py-2 rounded text-xs font-bold transition-colors flex items-center gap-1 shrink-0 cursor-pointer shadow-xs"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>Nuevo</span>
            </button>
          </div>

          {/* Info del cliente seleccionado + acciones */}
          {clienteSeleccionado && (
            <div className="mt-3 bg-slate-50 border border-slate-200 rounded p-3 text-xs">
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="font-bold text-slate-900 text-sm">{clienteSeleccionado.nombre}</p>
                    {clienteSeleccionado.lista_precio_id && (() => {
                      const lp = listasPrecios.find((l) => l.id === clienteSeleccionado.lista_precio_id);
                      if (!lp) return null;
                      return (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                          {lp.nombre}
                        </span>
                      );
                    })()}
                  </div>

                  {clienteSeleccionado.cuit && (
                    <p className="text-slate-500 font-mono">CUIT: {clienteSeleccionado.cuit}</p>
                  )}
                  {clienteSeleccionado.direccion && (
                    <p className="text-slate-600">{clienteSeleccionado.direccion}</p>
                  )}

                  {/* Badge de Saldo Neto */}
                  {saldoNetoCliente !== null && (
                    <div className="pt-1.5 flex items-center gap-1.5 flex-wrap">
                      <span
                        className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded ${
                          saldoNetoCliente < 0
                            ? 'bg-red-100 text-red-700'
                            : saldoNetoCliente > 0
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {saldoNetoCliente < 0
                          ? `⚠️ Saldo Deudor: -$${Math.abs(saldoNetoCliente).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
                          : saldoNetoCliente > 0
                          ? `✓ Saldo a Favor: +$${saldoNetoCliente.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
                          : 'Cuenta al día ($0,00)'}
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={abrirEditar}
                    className="text-blue-600 hover:text-blue-800 p-1.5 rounded hover:bg-blue-50 transition-colors cursor-pointer"
                    title="Editar cliente"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                  </button>
                  {!confirmarEliminar ? (
                    <button
                      onClick={() => setConfirmarEliminar(true)}
                      className="text-red-500 hover:text-red-700 p-1.5 rounded hover:bg-red-50 transition-colors cursor-pointer"
                      title="Eliminar cliente"
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                      </svg>
                    </button>
                  ) : (
                    <div className="flex items-center gap-1 ml-1">
                      <button
                        onClick={eliminar}
                        disabled={guardando}
                        className="text-xs bg-red-600 hover:bg-red-700 text-white px-2 py-1 rounded font-bold transition-colors disabled:opacity-50 cursor-pointer"
                      >
                        {guardando ? '...' : 'Confirmar'}
                      </button>
                      <button
                        onClick={() => setConfirmarEliminar(false)}
                        className="text-xs text-slate-600 hover:text-slate-800 px-2 py-1 rounded transition-colors cursor-pointer"
                      >
                        No
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===== VISTA FORMULARIO (Crear / Editar) ===== */}
      {vista === 'formulario' && (
        <div className="space-y-3">
          <p className="text-xs font-bold text-slate-800 uppercase tracking-wider">
            {editandoId ? 'Editar Cliente' : 'Nuevo Cliente'}
          </p>

          <div className="space-y-3">
            <div>
              <label htmlFor="facturador-cliente-nombre" className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                Nombre / Razón Social *
              </label>
              <input
                id="facturador-cliente-nombre"
                ref={inputRef}
                type="text"
                value={formData.nombre}
                onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                placeholder="Ej: Distribuidora Automotriz Norte S.A."
                className={inputClase}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="facturador-cliente-cuit" className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                  CUIT / CUIL
                </label>
                <input
                  id="facturador-cliente-cuit"
                  type="text"
                  value={formData.cuit}
                  onChange={(e) => setFormData({ ...formData, cuit: e.target.value })}
                  placeholder="Ej: 30-12345678-9"
                  className={inputClase}
                />
              </div>

              <div>
                <label htmlFor="facturador-cliente-lista" className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Lista de Precios Predeterminada
                </label>
                <select
                  id="facturador-cliente-lista"
                  value={formData.listaPrecioId}
                  onChange={(e) => setFormData({ ...formData, listaPrecioId: e.target.value })}
                  className={`${inputClase} bg-white`}
                >
                  <option value="">-- Predeterminada General --</option>
                  {listasPrecios.map((lp) => (
                    <option key={lp.id} value={lp.id}>
                      {lp.nombre} {lp.es_predeterminada ? '(Global)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="facturador-cliente-dir" className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                Dirección / Contacto
              </label>
              <input
                id="facturador-cliente-dir"
                type="text"
                value={formData.direccion}
                onChange={(e) => setFormData({ ...formData, direccion: e.target.value })}
                placeholder="Ej: Av. Rivadavia 1234, CABA"
                className={inputClase}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="facturador-cliente-tel" className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Teléfono / WhatsApp
                </label>
                <input
                  id="facturador-cliente-tel"
                  type="text"
                  value={formData.telefono}
                  onChange={(e) => setFormData({ ...formData, telefono: e.target.value })}
                  placeholder="Ej: 11 2345-6789"
                  className={inputClase}
                />
              </div>
              <div>
                <label htmlFor="facturador-cliente-email" className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Email
                </label>
                <input
                  id="facturador-cliente-email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="Ej: contacto@empresa.com"
                  className={inputClase}
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={cancelar}
              className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={guardar}
              disabled={guardando}
              className="px-4 py-1.5 text-xs font-bold text-white bg-blue-900 hover:bg-blue-800 rounded transition-colors disabled:opacity-50 cursor-pointer shadow-xs"
            >
              {guardando ? 'Guardando...' : (editandoId ? 'Guardar Cambios' : 'Crear Cliente')}
            </button>
          </div>
        </div>
      )}

      {/* ===== VISTA ELIMINADOS ===== */}
      {vista === 'eliminados' && (
        <div className="space-y-3">
          <p className="text-xs font-bold text-slate-800 uppercase tracking-wider">
            Clientes en Papelera
          </p>
          {clientesEliminados.length === 0 ? (
            <p className="text-xs text-slate-400 py-3 text-center italic">
              No hay clientes en la papelera.
            </p>
          ) : (
            <div className="space-y-2 max-h-56 overflow-y-auto">
              {clientesEliminados.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded px-3 py-2 text-xs"
                >
                  <div>
                    <span className="font-bold text-slate-700">{c.nombre}</span>
                    {c.cuit && <span className="text-slate-400 ml-2 font-mono">({c.cuit})</span>}
                  </div>
                  <button
                    onClick={async () => {
                      await supabase.from('clientes').update({ eliminado: false }).eq('id', c.id);
                      await cargarDatos();
                      await cargarEliminados();
                    }}
                    className="text-xs text-green-700 hover:text-green-800 font-bold cursor-pointer"
                  >
                    Restaurar
                  </button>
                </div>
              ))}
            </div>
          )}
          <button
            onClick={() => setVista('selector')}
            className="w-full py-1.5 text-xs text-slate-600 bg-slate-100 hover:bg-slate-200 rounded font-semibold transition-colors cursor-pointer"
          >
            Volver al Selector
          </button>
        </div>
      )}
    </div>
  );
}

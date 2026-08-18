'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../../../lib/supabase';
import type { Cliente } from '../../../../lib/types';

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
}

const formVacio: FormData = { nombre: '', cuit: '', direccion: '', telefono: '', email: '' };

export default function SelectorCliente({ clienteSeleccionado, onSeleccionar }: SelectorClienteProps) {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [clientesEliminados, setClientesEliminados] = useState<Cliente[]>([]);
  const [cargando, setCargando] = useState(true);
  const [vista, setVista] = useState<Vista>('selector');
  const [formData, setFormData] = useState<FormData>(formVacio);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmarEliminar, setConfirmarEliminar] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Cargar clientes activos
  const cargarClientes = async () => {
    setCargando(true);
    const { data, error: err } = await supabase
      .from('clientes')
      .select('*')
      .eq('eliminado', false)
      .order('nombre');
    if (err) {
      setError('Error al cargar clientes');
      console.error(err);
    } else {
      setClientes(data as Cliente[]);
    }
    setCargando(false);
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
    cargarClientes();
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
      telefono: clienteSeleccionado.telefono || '',
      email: clienteSeleccionado.email || '',
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

  const guardar = async () => {
    if (!formData.nombre.trim()) {
      setError('El nombre es obligatorio');
      return;
    }

    setGuardando(true);
    setError(null);

    try {
      if (editandoId) {
        const { error: err } = await supabase
          .from('clientes')
          .update({
            nombre: formData.nombre.trim(),
            cuit: formData.cuit.trim() || null,
            direccion: formData.direccion.trim() || null,
            telefono: formData.telefono.trim() || null,
            email: formData.email.trim() || null,
          })
          .eq('id', editandoId);

        if (err) throw err;

        if (clienteSeleccionado?.id === editandoId) {
          onSeleccionar({
            ...clienteSeleccionado,
            nombre: formData.nombre.trim(),
            cuit: formData.cuit.trim() || null,
            direccion: formData.direccion.trim() || null,
            telefono: formData.telefono.trim() || null,
            email: formData.email.trim() || null,
          });
        }
      } else {
        const { data, error: err } = await supabase
          .from('clientes')
          .insert({
            nombre: formData.nombre.trim(),
            cuit: formData.cuit.trim() || null,
            direccion: formData.direccion.trim() || null,
            telefono: formData.telefono.trim() || null,
            email: formData.email.trim() || null,
          })
          .select()
          .single();

        if (err) throw err;
        onSeleccionar(data as Cliente);
      }

      await cargarClientes();
      setVista('selector');
      setFormData(formVacio);
      setEditandoId(null);
    } catch (err) {
      console.error(err);
      setError('Error al guardar. Intentá de nuevo.');
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
      await cargarClientes();
      setConfirmarEliminar(false);
    } catch (err) {
      console.error(err);
      setError('Error al eliminar');
    } finally {
      setGuardando(false);
    }
  };

  const restaurar = async (id: string) => {
    setGuardando(true);
    try {
      const { error: err } = await supabase
        .from('clientes')
        .update({ eliminado: false })
        .eq('id', id);

      if (err) throw err;

      await cargarEliminados();
      await cargarClientes();
    } catch (err) {
      console.error(err);
      setError('Error al restaurar');
    } finally {
      setGuardando(false);
    }
  };

  const cancelar = () => {
    setVista('selector');
    setFormData(formVacio);
    setEditandoId(null);
    setError(null);
    setConfirmarEliminar(false);
  };

  // Estilo base de inputs — texto oscuro, sin redondeos excesivos
  const inputClase = "w-full border border-slate-300 rounded px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500";

  return (
    <div className="bg-white rounded shadow-sm border border-slate-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-bold text-slate-500 uppercase tracking-widest">
          Cliente
        </h2>
        {vista === 'selector' && (
          <button
            onClick={abrirEliminados}
            className="text-xs text-slate-400 hover:text-slate-600 transition-colors underline"
          >
            Ver eliminados
          </button>
        )}
      </div>

      {error && (
        <div className="mb-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
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
                const c = clientes.find((c) => c.id === e.target.value) || null;
                onSeleccionar(c);
                setConfirmarEliminar(false);
              }}
              aria-label="Seleccionar cliente registrado"
              className="flex-1 border border-slate-300 rounded px-3 py-2.5 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              disabled={cargando}
            >
              <option value="">
                {cargando ? 'Cargando...' : '— Seleccionar cliente —'}
              </option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}{c.cuit ? ` (${c.cuit})` : ''}
                </option>
              ))}
            </select>
            <button
              onClick={abrirNuevo}
              className="bg-blue-900 hover:bg-blue-800 text-white px-4 py-2.5 rounded text-sm font-semibold transition-colors flex items-center gap-1.5 whitespace-nowrap"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Nuevo
            </button>
          </div>

          {/* Info del cliente seleccionado + acciones */}
          {clienteSeleccionado && (
            <div className="mt-3 bg-slate-50 border border-slate-200 rounded p-3">
              <div className="flex items-start justify-between">
                <div className="text-sm">
                  <p className="font-semibold text-slate-900">{clienteSeleccionado.nombre}</p>
                  {clienteSeleccionado.cuit && (
                    <p className="text-slate-600 mt-0.5">CUIT: {clienteSeleccionado.cuit}</p>
                  )}
                  {clienteSeleccionado.direccion && (
                    <p className="text-slate-600 mt-0.5">{clienteSeleccionado.direccion}</p>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={abrirEditar}
                    className="text-blue-600 hover:text-blue-800 p-1.5 rounded hover:bg-blue-50 transition-colors"
                    title="Editar cliente"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                  </button>
                  {!confirmarEliminar ? (
                    <button
                      onClick={() => setConfirmarEliminar(true)}
                      className="text-red-500 hover:text-red-700 p-1.5 rounded hover:bg-red-50 transition-colors"
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
                        className="text-xs bg-red-600 hover:bg-red-700 text-white px-2.5 py-1 rounded font-semibold transition-colors disabled:opacity-50"
                      >
                        {guardando ? '...' : 'Confirmar'}
                      </button>
                      <button
                        onClick={() => setConfirmarEliminar(false)}
                        className="text-xs text-slate-600 hover:text-slate-800 px-2 py-1 rounded transition-colors"
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
        <div>
          <p className="text-sm font-semibold text-slate-800 mb-3">
            {editandoId ? 'Editar cliente' : 'Nuevo cliente'}
          </p>
          <div className="space-y-3">
            <div>
              <label htmlFor="facturador-cliente-nombre" className="block text-xs font-semibold text-slate-600 mb-1">
                Nombre / Razón Social *
              </label>
              <input
                id="facturador-cliente-nombre"
                ref={inputRef}
                type="text"
                value={formData.nombre}
                onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                placeholder="Ej: Distribuidora Norte S.A."
                className={inputClase}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="facturador-cliente-cuit" className="block text-xs font-semibold text-slate-600 mb-1">
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
                <label htmlFor="facturador-cliente-dir" className="block text-xs font-semibold text-slate-600 mb-1">
                  Dirección
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
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="facturador-cliente-tel" className="block text-xs font-semibold text-slate-600 mb-1">
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
                <label htmlFor="facturador-cliente-email" className="block text-xs font-semibold text-slate-600 mb-1">
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
          <div className="flex justify-end gap-2 mt-4">
            <button
              onClick={cancelar}
              className="px-4 py-2 text-sm text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={guardar}
              disabled={guardando}
              className="px-4 py-2 text-sm font-semibold text-white bg-blue-900 hover:bg-blue-800 rounded transition-colors disabled:opacity-50"
            >
              {guardando ? 'Guardando...' : (editandoId ? 'Guardar Cambios' : 'Crear Cliente')}
            </button>
          </div>
        </div>
      )}

      {/* ===== VISTA ELIMINADOS ===== */}
      {vista === 'eliminados' && (
        <div>
          <p className="text-sm font-semibold text-slate-800 mb-3">
            Clientes eliminados
          </p>
          {clientesEliminados.length === 0 ? (
            <p className="text-sm text-slate-500 py-4 text-center">
              No hay clientes eliminados.
            </p>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {clientesEliminados.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded px-3 py-2"
                >
                  <div className="text-sm">
                    <span className="font-medium text-slate-700">{c.nombre}</span>
                    {c.cuit && <span className="text-slate-500 ml-2">({c.cuit})</span>}
                  </div>
                  <button
                    onClick={() => restaurar(c.id)}
                    disabled={guardando}
                    className="text-xs bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded font-semibold transition-colors disabled:opacity-50"
                  >
                    Restaurar
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex justify-end mt-4">
            <button
              onClick={cancelar}
              className="px-4 py-2 text-sm text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded transition-colors"
            >
              Volver
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

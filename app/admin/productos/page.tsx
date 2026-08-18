'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { Filtro, Vehiculo } from '@/lib/types';
import ImagenUploader from './components/ImagenUploader';
import ImportadorExcel from './components/ImportadorExcel';

type TabActivo = 'filtros' | 'vehiculos';

const parseImagenes = (val: string | string[] | null): string[] => {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') {
    try {
      const parsed = JSON.parse(val);
      if (Array.isArray(parsed)) return parsed;
      return [val];
    } catch {
      return [val];
    }
  }
  return [];
};

export default function ProductosAdminPage() {
  const [tab, setTab] = useState<TabActivo>('filtros');
  const [busqueda, setBusqueda] = useState('');
  const [filtroVisibilidad, setFiltroVisibilidad] = useState<'todas' | 'visibles' | 'ocultas'>('todas');
  const [verEliminados, setVerEliminados] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mensajeOk, setMensajeOk] = useState<string | null>(null);

  // Datos
  const [filtros, setFiltros] = useState<Filtro[]>([]);
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);

  // Paginación
  const [pagina, setPagina] = useState(1);
  const porPagina = 50;

  // Estado de edición inline
  const [editandoFiltroId, setEditandoFiltroId] = useState<number | 'nuevo' | null>(null);
  const [filtroForm, setFiltroForm] = useState<Partial<Filtro>>({});

  const [editandoVehiculoId, setEditandoVehiculoId] = useState<number | 'nuevo' | null>(null);
  const [vehiculoForm, setVehiculoForm] = useState<Partial<Vehiculo>>({});

  // Modales
  const [uploaderFiltro, setUploaderFiltro] = useState<{ id: number; codigo: string; imagenes: string[] } | null>(null);
  const [modalImportar, setModalImportar] = useState<'filtros' | 'vehiculos' | null>(null);

  const notificarOk = (texto: string) => {
    setMensajeOk(texto);
    setTimeout(() => setMensajeOk(null), 3000);
  };

  // Cargar Filtros
  const cargarFiltros = useCallback(async () => {
    setCargando(true);
    let query = supabase.from('Tabla A').select('*');

    if (verEliminados) {
      query = query.eq('eliminado', true);
    } else {
      query = query.or('eliminado.is.null,eliminado.eq.false');
    }

    query = query.order('codigo_fhl', { ascending: true });

    const { data, error: err } = await query;
    if (err) {
      setError('Error al cargar filtros');
      console.error(err);
    } else {
      setFiltros((data as Filtro[]) || []);
    }
    setCargando(false);
  }, [verEliminados]);

  // Cargar Vehículos
  const cargarVehiculos = useCallback(async () => {
    setCargando(true);
    let query = supabase.from('Tabla B').select('*');

    if (verEliminados) {
      query = query.eq('eliminado', true);
    } else {
      query = query.or('eliminado.is.null,eliminado.eq.false');
    }

    query = query.order('marca', { ascending: true }).order('modelo', { ascending: true });

    const { data, error: err } = await query;
    if (err) {
      setError('Error al cargar vehículos');
      console.error(err);
    } else {
      setVehiculos((data as Vehiculo[]) || []);
    }
    setCargando(false);
  }, [verEliminados]);

  useEffect(() => {
    if (tab === 'filtros') {
      cargarFiltros();
    } else {
      cargarVehiculos();
    }
    setPagina(1);
    setEditandoFiltroId(null);
    setEditandoVehiculoId(null);
  }, [tab, verEliminados, cargarFiltros, cargarVehiculos]);

  // Guardar Filtro (Crear o Actualizar)
  const guardarFiltro = async () => {
    if (!filtroForm.codigo_fhl?.trim()) {
      setError('El código FHL es obligatorio');
      return;
    }

    setGuardando(true);
    setError(null);

    const codigo = filtroForm.codigo_fhl.trim().toUpperCase();
    const equiv = filtroForm.equivalencias?.trim() || null;
    const desc = filtroForm.descripcion_aplicacion?.trim() || null;
    const dim = filtroForm.dimensiones?.trim() || null;
    const precio = parseFloat(String(filtroForm.precio || 0)) || 0;
    const activo = filtroForm.activo !== false;
    const buscadorUnificado = `${codigo} ${equiv || ''} ${desc || ''}`.replace(/[- ]/g, '').toLowerCase();

    try {
      if (editandoFiltroId === 'nuevo') {
        const { error: err } = await supabase.from('Tabla A').insert({
          codigo_fhl: codigo,
          equivalencias: equiv,
          dimensiones: dim,
          descripcion_aplicacion: desc,
          buscador_unificado: buscadorUnificado,
          imagen_url: filtroForm.imagen_url || null,
          precio,
          activo,
          eliminado: false,
        });
        if (err) throw err;
        notificarOk(`Filtro ${codigo} creado correctamente`);
      } else {
        const { error: err } = await supabase
          .from('Tabla A')
          .update({
            codigo_fhl: codigo,
            equivalencias: equiv,
            dimensiones: dim,
            descripcion_aplicacion: desc,
            buscador_unificado: buscadorUnificado,
            precio,
            activo,
          })
          .eq('id', editandoFiltroId);
        if (err) throw err;
        notificarOk(`Filtro ${codigo} actualizado correctamente`);
      }

      setEditandoFiltroId(null);
      setFiltroForm({});
      await cargarFiltros();
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Error al guardar filtro');
    } finally {
      setGuardando(false);
    }
  };

  // Toggle rápido de visibilidad en catálogo público
  const handleToggleActivo = async (f: Filtro) => {
    const nuevoEstado = f.activo === false ? true : false;
    const { error: err } = await supabase
      .from('Tabla A')
      .update({ activo: nuevoEstado })
      .eq('id', f.id);

    if (!err) {
      notificarOk(`Filtro ${f.codigo_fhl} ahora está ${nuevoEstado ? 'visible en el catálogo' : 'oculto en el catálogo'}`);
      setFiltros((prev) =>
        prev.map((item) => (item.id === f.id ? { ...item, activo: nuevoEstado } : item))
      );
    }
  };

  // Guardar Vehículo (Crear o Actualizar)
  const guardarVehiculo = async () => {
    if (!vehiculoForm.marca?.trim() || !vehiculoForm.modelo?.trim() || !vehiculoForm.filtro_asociado?.trim()) {
      setError('Marca, modelo y filtro asociado son obligatorios');
      return;
    }

    setGuardando(true);
    setError(null);

    const payload = {
      marca: vehiculoForm.marca.trim().toUpperCase(),
      modelo: vehiculoForm.modelo.trim().toUpperCase(),
      version: vehiculoForm.version?.trim() || null,
      año: vehiculoForm.año?.trim() || null,
      filtro_asociado: vehiculoForm.filtro_asociado.trim().toUpperCase(),
      eliminado: false,
    };

    try {
      if (editandoVehiculoId === 'nuevo') {
        const { error: err } = await supabase.from('Tabla B').insert(payload);
        if (err) throw err;
        notificarOk('Vehículo creado correctamente');
      } else {
        const { error: err } = await supabase
          .from('Tabla B')
          .update(payload)
          .eq('id', editandoVehiculoId);
        if (err) throw err;
        notificarOk('Vehículo actualizado correctamente');
      }

      setEditandoVehiculoId(null);
      setVehiculoForm({});
      await cargarVehiculos();
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Error al guardar vehículo');
    } finally {
      setGuardando(false);
    }
  };

  // Soft delete / Restaurar / Purgar
  const handleSoftDelete = async (id: number, tabla: 'Tabla A' | 'Tabla B', nombre: string) => {
    if (!confirm(`¿Mover "${nombre}" a la papelera?`)) return;
    const { error: err } = await supabase.from(tabla).update({ eliminado: true }).eq('id', id);
    if (!err) {
      notificarOk(`"${nombre}" movido a papelera`);
      if (tabla === 'Tabla A') cargarFiltros();
      else cargarVehiculos();
    }
  };

  const handleRestaurar = async (id: number, tabla: 'Tabla A' | 'Tabla B') => {
    const { error: err } = await supabase.from(tabla).update({ eliminado: false }).eq('id', id);
    if (!err) {
      notificarOk('Elemento restaurado correctamente');
      if (tabla === 'Tabla A') cargarFiltros();
      else cargarVehiculos();
    }
  };

  const handlePurgarDefinitivo = async (id: number, tabla: 'Tabla A' | 'Tabla B', nombre: string) => {
    if (!confirm(`¿Eliminar DEFINITIVAMENTE "${nombre}"? Esta acción no se puede deshacer.`)) return;
    const { error: err } = await supabase.from(tabla).delete().eq('id', id);
    if (!err) {
      notificarOk(`"${nombre}" eliminado definitivamente`);
      if (tabla === 'Tabla A') cargarFiltros();
      else cargarVehiculos();
    }
  };

  // Guardar imágenes desde el ImagenUploader
  const handleGuardarImagenes = async (nuevas: string[]) => {
    if (!uploaderFiltro) return;
    const { error: err } = await supabase
      .from('Tabla A')
      .update({ imagen_url: JSON.stringify(nuevas) })
      .eq('id', uploaderFiltro.id);

    if (!err) {
      notificarOk(`Imágenes de ${uploaderFiltro.codigo} actualizadas`);
      cargarFiltros();
    }
  };

  // Filtrar lista
  const filtrosFiltrados = filtros.filter((f) => {
    if (filtroVisibilidad === 'visibles' && f.activo === false) return false;
    if (filtroVisibilidad === 'ocultas' && f.activo !== false) return false;

    if (!busqueda) return true;
    const b = busqueda.toLowerCase().trim();
    return (
      f.codigo_fhl.toLowerCase().includes(b) ||
      (f.equivalencias && f.equivalencias.toLowerCase().includes(b)) ||
      (f.descripcion_aplicacion && f.descripcion_aplicacion.toLowerCase().includes(b)) ||
      (f.dimensiones && f.dimensiones.toLowerCase().includes(b))
    );
  });

  const vehiculosFiltrados = vehiculos.filter((v) => {
    if (!busqueda) return true;
    const b = busqueda.toLowerCase().trim();
    return (
      v.marca.toLowerCase().includes(b) ||
      v.modelo.toLowerCase().includes(b) ||
      (v.version && v.version.toLowerCase().includes(b)) ||
      v.filtro_asociado.toLowerCase().includes(b)
    );
  });

  // Paginado
  const totalItems = tab === 'filtros' ? filtrosFiltrados.length : vehiculosFiltrados.length;
  const totalPaginas = Math.ceil(totalItems / porPagina) || 1;
  const itemsFiltroPaginados = filtrosFiltrados.slice((pagina - 1) * porPagina, pagina * porPagina);
  const itemsVehiculoPaginados = vehiculosFiltrados.slice((pagina - 1) * porPagina, pagina * porPagina);

  return (
    <div className="space-y-6">
      
      {/* Encabezado y Selector de Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-800 tracking-tight">
            Gestión de Productos & Catálogo
          </h2>
          <p className="text-xs text-slate-500 font-medium mt-1">
            Administrá filtros de habitáculo (precios de facturación, visibilidad en web) y vehículos asociados.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setModalImportar(tab)}
            className="bg-slate-800 hover:bg-slate-700 text-white px-3.5 py-2 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <span>Importar Excel / CSV</span>
          </button>

          {tab === 'filtros' ? (
            <button
              onClick={() => {
                setEditandoFiltroId('nuevo');
                setFiltroForm({
                  codigo_fhl: '',
                  equivalencias: '',
                  dimensiones: '',
                  descripcion_aplicacion: '',
                  precio: 0,
                  activo: true,
                });
              }}
              className="bg-blue-900 hover:bg-blue-800 text-white px-4 py-2 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>Nuevo Filtro</span>
            </button>
          ) : (
            <button
              onClick={() => {
                setEditandoVehiculoId('nuevo');
                setVehiculoForm({ marca: '', modelo: '', version: '', año: '', filtro_asociado: '' });
              }}
              className="bg-blue-900 hover:bg-blue-800 text-white px-4 py-2 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>Nuevo Vehículo</span>
            </button>
          )}
        </div>
      </div>

      {/* Alertas */}
      {mensajeOk && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-md text-green-800 text-xs font-bold flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span>{mensajeOk}</span>
        </div>
      )}

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-xs font-semibold flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-800 font-bold">&times;</button>
        </div>
      )}

      {/* Tabs & Barra de Filtros */}
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          
          {/* Tabs */}
          <div className="flex items-center gap-2" role="tablist" aria-label="Módulos de catálogo">
            <button
              role="tab"
              aria-selected={tab === 'filtros'}
              onClick={() => setTab('filtros')}
              className={`px-4 py-2 rounded-md text-xs font-bold transition-all cursor-pointer ${
                tab === 'filtros'
                  ? 'bg-blue-900 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Filtros FHL (Tabla A) ({filtros.length})
            </button>
            <button
              role="tab"
              aria-selected={tab === 'vehiculos'}
              onClick={() => setTab('vehiculos')}
              className={`px-4 py-2 rounded-md text-xs font-bold transition-all cursor-pointer ${
                tab === 'vehiculos'
                  ? 'bg-blue-900 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Vehículos (Tabla B) ({vehiculos.length})
            </button>
          </div>

          <div className="flex items-center gap-2">
            {tab === 'filtros' && (
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-md text-xs" role="group" aria-label="Filtrar por visibilidad en web">
                <button
                  onClick={() => setFiltroVisibilidad('todas')}
                  aria-pressed={filtroVisibilidad === 'todas'}
                  className={`px-2.5 py-1 rounded-md font-bold transition-all cursor-pointer ${
                    filtroVisibilidad === 'todas' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Todos
                </button>
                <button
                  onClick={() => setFiltroVisibilidad('visibles')}
                  aria-pressed={filtroVisibilidad === 'visibles'}
                  className={`px-2.5 py-1 rounded-md font-bold transition-all cursor-pointer ${
                    filtroVisibilidad === 'visibles' ? 'bg-white text-green-700 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Visibles en Web
                </button>
                <button
                  onClick={() => setFiltroVisibilidad('ocultas')}
                  aria-pressed={filtroVisibilidad === 'ocultas'}
                  className={`px-2.5 py-1 rounded-md font-bold transition-all cursor-pointer ${
                    filtroVisibilidad === 'ocultas' ? 'bg-white text-amber-700 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Ocultos
                </button>
              </div>
            )}

            {/* Toggle Papelera */}
            <button
              onClick={() => setVerEliminados(!verEliminados)}
              className={`text-xs font-bold px-3 py-1.5 rounded-md border transition-all flex items-center gap-1.5 cursor-pointer ${
                verEliminados
                  ? 'bg-red-50 border-red-200 text-red-700'
                  : 'bg-slate-50 border-slate-200 text-slate-500 hover:text-slate-800'
              }`}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
              </svg>
              <span>{verEliminados ? 'Viendo Papelera' : 'Ver Papelera'}</span>
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
            onChange={(e) => {
              setBusqueda(e.target.value);
              setPagina(1);
            }}
            placeholder={
              tab === 'filtros'
                ? 'Buscar por código FHL, equivalencias, medidas o aplicación...'
                : 'Buscar por marca, modelo, versión o código de filtro asociado...'
            }
            aria-label="Buscar en el catálogo de productos"
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-md text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white transition-all"
          />
        </div>
      </div>

      {/* TABLA DE FILTROS (TABLA A) */}
      {tab === 'filtros' && (
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider">
                <tr>
                  <th scope="col" className="p-3.5 w-28">Código FHL</th>
                  <th scope="col" className="p-3.5 w-48">Equivalencias OEM</th>
                  <th scope="col" className="p-3.5 w-28">Dimensiones</th>
                  <th scope="col" className="p-3.5">Aplicación</th>
                  <th scope="col" className="p-3.5 w-28 text-right">Precio Base ($)</th>
                  <th scope="col" className="p-3.5 w-28 text-center">En Catálogo</th>
                  <th scope="col" className="p-3.5 w-20 text-center">Fotos</th>
                  <th scope="col" className="p-3.5 w-28 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {/* Fila nuevo filtro */}
                {editandoFiltroId === 'nuevo' && (
                  <tr className="bg-blue-50/60 animate-in fade-in duration-150">
                    <td className="p-2">
                      <input
                        type="text"
                        autoFocus
                        placeholder="Ej: FHL-001"
                        value={filtroForm.codigo_fhl || ''}
                        onChange={(e) => setFiltroForm({ ...filtroForm, codigo_fhl: e.target.value })}
                        className="w-full border border-blue-300 rounded px-2 py-1 font-bold text-blue-900 bg-white"
                      />
                    </td>
                    <td className="p-2">
                      <input
                        type="text"
                        placeholder="Equivalencias..."
                        value={filtroForm.equivalencias || ''}
                        onChange={(e) => setFiltroForm({ ...filtroForm, equivalencias: e.target.value })}
                        className="w-full border border-slate-300 rounded px-2 py-1 bg-white"
                      />
                    </td>
                    <td className="p-2">
                      <input
                        type="text"
                        placeholder="Largo: 200..."
                        value={filtroForm.dimensiones || ''}
                        onChange={(e) => setFiltroForm({ ...filtroForm, dimensiones: e.target.value })}
                        className="w-full border border-slate-300 rounded px-2 py-1 bg-white"
                      />
                    </td>
                    <td className="p-2">
                      <input
                        type="text"
                        placeholder="Aplicación..."
                        value={filtroForm.descripcion_aplicacion || ''}
                        onChange={(e) => setFiltroForm({ ...filtroForm, descripcion_aplicacion: e.target.value })}
                        className="w-full border border-slate-300 rounded px-2 py-1 bg-white"
                      />
                    </td>
                    <td className="p-2">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={filtroForm.precio ?? ''}
                        onChange={(e) => setFiltroForm({ ...filtroForm, precio: parseFloat(e.target.value) || 0 })}
                        className="w-full border border-slate-300 rounded px-2 py-1 bg-white font-mono font-bold text-right text-slate-900"
                      />
                    </td>
                    <td className="p-2 text-center">
                      <select
                        value={filtroForm.activo !== false ? 'si' : 'no'}
                        onChange={(e) => setFiltroForm({ ...filtroForm, activo: e.target.value === 'si' })}
                        className="border border-slate-300 rounded px-2 py-1 bg-white text-[11px] font-bold text-slate-800"
                      >
                        <option value="si">Visible</option>
                        <option value="no">Oculto</option>
                      </select>
                    </td>
                    <td className="p-2 text-center text-slate-400 italic text-[11px]">
                      —
                    </td>
                    <td className="p-2 text-right space-x-1">
                      <button
                        onClick={guardarFiltro}
                        disabled={guardando}
                        className="px-2.5 py-1 bg-green-600 hover:bg-green-700 text-white rounded font-bold text-[11px]"
                      >
                        {guardando ? '...' : 'Crear'}
                      </button>
                      <button
                        onClick={() => {
                          setEditandoFiltroId(null);
                          setFiltroForm({});
                        }}
                        className="px-2.5 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded font-bold text-[11px]"
                      >
                        Cancelar
                      </button>
                    </td>
                  </tr>
                )}

                {cargando ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-slate-400">
                      <div className="flex items-center justify-center gap-2">
                        <div className="h-4 w-4 border-2 border-blue-900 border-t-transparent rounded-full animate-spin" />
                        <span>Cargando catálogo de filtros...</span>
                      </div>
                    </td>
                  </tr>
                ) : itemsFiltroPaginados.length === 0 && editandoFiltroId !== 'nuevo' ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-slate-400">
                      No se encontraron filtros.
                    </td>
                  </tr>
                ) : (
                  itemsFiltroPaginados.map((f) => {
                    const esEditando = editandoFiltroId === f.id;
                    const fotos = parseImagenes(f.imagen_url);
                    const esVisible = f.activo !== false;

                    if (esEditando) {
                      return (
                        <tr key={f.id} className="bg-amber-50/60">
                          <td className="p-2">
                            <input
                              type="text"
                              value={filtroForm.codigo_fhl || ''}
                              onChange={(e) => setFiltroForm({ ...filtroForm, codigo_fhl: e.target.value })}
                              className="w-full border border-blue-300 rounded px-2 py-1 font-bold text-blue-900 bg-white"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="text"
                              value={filtroForm.equivalencias || ''}
                              onChange={(e) => setFiltroForm({ ...filtroForm, equivalencias: e.target.value })}
                              className="w-full border border-slate-300 rounded px-2 py-1 bg-white"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="text"
                              value={filtroForm.dimensiones || ''}
                              onChange={(e) => setFiltroForm({ ...filtroForm, dimensiones: e.target.value })}
                              className="w-full border border-slate-300 rounded px-2 py-1 bg-white"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="text"
                              value={filtroForm.descripcion_aplicacion || ''}
                              onChange={(e) => setFiltroForm({ ...filtroForm, descripcion_aplicacion: e.target.value })}
                              className="w-full border border-slate-300 rounded px-2 py-1 bg-white"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={filtroForm.precio ?? ''}
                              onChange={(e) => setFiltroForm({ ...filtroForm, precio: parseFloat(e.target.value) || 0 })}
                              className="w-full border border-slate-300 rounded px-2 py-1 bg-white font-mono font-bold text-right text-slate-900"
                            />
                          </td>
                          <td className="p-2 text-center">
                            <select
                              value={filtroForm.activo !== false ? 'si' : 'no'}
                              onChange={(e) => setFiltroForm({ ...filtroForm, activo: e.target.value === 'si' })}
                              className="border border-slate-300 rounded px-2 py-1 bg-white text-[11px] font-bold text-slate-800"
                            >
                              <option value="si">Visible</option>
                              <option value="no">Oculto</option>
                            </select>
                          </td>
                          <td className="p-2 text-center">
                            <button
                              onClick={() => setUploaderFiltro({ id: f.id, codigo: f.codigo_fhl, imagenes: fotos })}
                              className="text-[11px] bg-blue-50 text-blue-800 font-bold px-2 py-1 rounded border border-blue-200"
                            >
                              Fotos ({fotos.length})
                            </button>
                          </td>
                          <td className="p-2 text-right space-x-1">
                            <button
                              onClick={guardarFiltro}
                              disabled={guardando}
                              className="px-2.5 py-1 bg-blue-900 hover:bg-blue-800 text-white rounded font-bold text-[11px]"
                            >
                              {guardando ? '...' : 'Guardar'}
                            </button>
                            <button
                              onClick={() => {
                                setEditandoFiltroId(null);
                                setFiltroForm({});
                              }}
                              className="px-2.5 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded font-bold text-[11px]"
                            >
                              Cancelar
                            </button>
                          </td>
                        </tr>
                      );
                    }

                    return (
                      <tr key={f.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="p-3.5 font-bold text-blue-900">
                          {f.codigo_fhl}
                        </td>
                        <td className="p-3.5 text-slate-600 truncate max-w-xs" title={f.equivalencias || ''}>
                          {f.equivalencias || '—'}
                        </td>
                        <td className="p-3.5 text-slate-600 font-mono text-[11px]">
                          {f.dimensiones || '—'}
                        </td>
                        <td className="p-3.5 text-slate-600 truncate max-w-xs" title={f.descripcion_aplicacion || ''}>
                          {f.descripcion_aplicacion || '—'}
                        </td>
                        <td className="p-3.5 text-right font-mono font-bold text-slate-800">
                          {Number(f.precio || 0) > 0 ? (
                            `$${Number(f.precio).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
                          ) : (
                            <span className="text-slate-400 font-normal">Sin precio</span>
                          )}
                        </td>
                        <td className="p-3.5 text-center">
                          <button
                            onClick={() => handleToggleActivo(f)}
                            className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase transition-all ${
                              esVisible
                                ? 'bg-green-100 text-green-800 hover:bg-green-200'
                                : 'bg-slate-150 text-slate-500 hover:bg-slate-200'
                            }`}
                            title="Hacé click para cambiar la visibilidad en el catálogo web público"
                          >
                            {esVisible ? 'Visible' : 'Oculto'}
                          </button>
                        </td>
                        <td className="p-3.5 text-center">
                          <button
                            onClick={() => setUploaderFiltro({ id: f.id, codigo: f.codigo_fhl, imagenes: fotos })}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-slate-100 hover:bg-blue-100 text-slate-700 hover:text-blue-900 transition-colors border border-slate-200"
                            title="Gestionar fotos de este filtro"
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                              <circle cx="8.5" cy="8.5" r="1.5" />
                              <polyline points="21 15 16 10 5 21" />
                            </svg>
                            <span>{fotos.length}</span>
                          </button>
                        </td>
                        <td className="p-3.5 text-right space-x-1.5">
                          {!verEliminados ? (
                            <>
                              <button
                                onClick={() => {
                                  setEditandoFiltroId(f.id);
                                  setFiltroForm({
                                    codigo_fhl: f.codigo_fhl,
                                    equivalencias: f.equivalencias,
                                    dimensiones: f.dimensiones,
                                    descripcion_aplicacion: f.descripcion_aplicacion,
                                    precio: f.precio || 0,
                                    activo: f.activo !== false,
                                  });
                                }}
                                className="text-blue-600 hover:text-blue-800 p-1 rounded hover:bg-blue-50"
                                title="Editar filtro"
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                                  <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                                </svg>
                              </button>
                              <button
                                onClick={() => handleSoftDelete(f.id, 'Tabla A', f.codigo_fhl)}
                                className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50"
                                title="Mover a papelera"
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <polyline points="3 6 5 6 21 6" />
                                  <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                                </svg>
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => handleRestaurar(f.id, 'Tabla A')}
                                className="text-xs bg-green-600 hover:bg-green-700 text-white font-bold px-2 py-0.5 rounded"
                              >
                                Restaurar
                              </button>
                              <button
                                onClick={() => handlePurgarDefinitivo(f.id, 'Tabla A', f.codigo_fhl)}
                                className="text-xs bg-red-600 hover:bg-red-700 text-white font-bold px-2 py-0.5 rounded"
                              >
                                Purgar
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Paginador */}
          {totalPaginas > 1 && (
            <div className="p-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span>
                Mostrando {(pagina - 1) * porPagina + 1} a {Math.min(pagina * porPagina, totalItems)} de {totalItems} filtros
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPagina((p) => Math.max(1, p - 1))}
                  disabled={pagina === 1}
                  className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 rounded disabled:opacity-40 font-bold"
                >
                  Anterior
                </button>
                <span className="px-2 font-semibold">
                  {pagina} / {totalPaginas}
                </span>
                <button
                  onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
                  disabled={pagina === totalPaginas}
                  className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 rounded disabled:opacity-40 font-bold"
                >
                  Siguiente
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TABLA DE VEHÍCULOS (TABLA B) */}
      {tab === 'vehiculos' && (
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider">
                <tr>
                  <th className="p-3.5 w-40">Marca</th>
                  <th className="p-3.5 w-48">Modelo</th>
                  <th className="p-3.5">Versión / Motor</th>
                  <th className="p-3.5 w-28">Año</th>
                  <th className="p-3.5 w-40">Filtro Asociado</th>
                  <th className="p-3.5 w-32 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {/* Fila nuevo vehículo */}
                {editandoVehiculoId === 'nuevo' && (
                  <tr className="bg-blue-50/60 animate-in fade-in duration-150">
                    <td className="p-2.5">
                      <input
                        type="text"
                        autoFocus
                        placeholder="Ej: FORD"
                        value={vehiculoForm.marca || ''}
                        onChange={(e) => setVehiculoForm({ ...vehiculoForm, marca: e.target.value })}
                        className="w-full border border-blue-300 rounded px-2 py-1 font-bold text-slate-900 bg-white"
                      />
                    </td>
                    <td className="p-2.5">
                      <input
                        type="text"
                        placeholder="Ej: FOCUS"
                        value={vehiculoForm.modelo || ''}
                        onChange={(e) => setVehiculoForm({ ...vehiculoForm, modelo: e.target.value })}
                        className="w-full border border-blue-300 rounded px-2 py-1 bg-white"
                      />
                    </td>
                    <td className="p-2.5">
                      <input
                        type="text"
                        placeholder="Ej: 2.0 16V"
                        value={vehiculoForm.version || ''}
                        onChange={(e) => setVehiculoForm({ ...vehiculoForm, version: e.target.value })}
                        className="w-full border border-slate-300 rounded px-2 py-1 bg-white"
                      />
                    </td>
                    <td className="p-2.5">
                      <input
                        type="text"
                        placeholder="Ej: 2012 ->"
                        value={vehiculoForm.año || ''}
                        onChange={(e) => setVehiculoForm({ ...vehiculoForm, año: e.target.value })}
                        className="w-full border border-slate-300 rounded px-2 py-1 bg-white"
                      />
                    </td>
                    <td className="p-2.5">
                      <input
                        type="text"
                        placeholder="Ej: FHL-001"
                        value={vehiculoForm.filtro_asociado || ''}
                        onChange={(e) => setVehiculoForm({ ...vehiculoForm, filtro_asociado: e.target.value })}
                        className="w-full border border-blue-300 rounded px-2 py-1 font-bold text-blue-900 bg-white"
                      />
                    </td>
                    <td className="p-2.5 text-right space-x-1">
                      <button
                        onClick={guardarVehiculo}
                        disabled={guardando}
                        className="px-2.5 py-1 bg-green-600 hover:bg-green-700 text-white rounded font-bold text-[11px]"
                      >
                        {guardando ? '...' : 'Crear'}
                      </button>
                      <button
                        onClick={() => {
                          setEditandoVehiculoId(null);
                          setVehiculoForm({});
                        }}
                        className="px-2.5 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded font-bold text-[11px]"
                      >
                        Cancelar
                      </button>
                    </td>
                  </tr>
                )}

                {cargando ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-400">
                      <div className="flex items-center justify-center gap-2">
                        <div className="h-4 w-4 border-2 border-blue-900 border-t-transparent rounded-full animate-spin" />
                        <span>Cargando tabla de vehículos...</span>
                      </div>
                    </td>
                  </tr>
                ) : itemsVehiculoPaginados.length === 0 && editandoVehiculoId !== 'nuevo' ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-400">
                      No se encontraron vehículos.
                    </td>
                  </tr>
                ) : (
                  itemsVehiculoPaginados.map((v) => {
                    const idVal = v.id || 0;
                    const esEditando = editandoVehiculoId === idVal;

                    if (esEditando) {
                      return (
                        <tr key={idVal} className="bg-amber-50/60">
                          <td className="p-2.5">
                            <input
                              type="text"
                              value={vehiculoForm.marca || ''}
                              onChange={(e) => setVehiculoForm({ ...vehiculoForm, marca: e.target.value })}
                              className="w-full border border-blue-300 rounded px-2 py-1 font-bold bg-white"
                            />
                          </td>
                          <td className="p-2.5">
                            <input
                              type="text"
                              value={vehiculoForm.modelo || ''}
                              onChange={(e) => setVehiculoForm({ ...vehiculoForm, modelo: e.target.value })}
                              className="w-full border border-slate-300 rounded px-2 py-1 bg-white"
                            />
                          </td>
                          <td className="p-2.5">
                            <input
                              type="text"
                              value={vehiculoForm.version || ''}
                              onChange={(e) => setVehiculoForm({ ...vehiculoForm, version: e.target.value })}
                              className="w-full border border-slate-300 rounded px-2 py-1 bg-white"
                            />
                          </td>
                          <td className="p-2.5">
                            <input
                              type="text"
                              value={vehiculoForm.año || ''}
                              onChange={(e) => setVehiculoForm({ ...vehiculoForm, año: e.target.value })}
                              className="w-full border border-slate-300 rounded px-2 py-1 bg-white"
                            />
                          </td>
                          <td className="p-2.5">
                            <input
                              type="text"
                              value={vehiculoForm.filtro_asociado || ''}
                              onChange={(e) => setVehiculoForm({ ...vehiculoForm, filtro_asociado: e.target.value })}
                              className="w-full border border-blue-300 rounded px-2 py-1 font-bold text-blue-900 bg-white"
                            />
                          </td>
                          <td className="p-2.5 text-right space-x-1">
                            <button
                              onClick={guardarVehiculo}
                              disabled={guardando}
                              className="px-2.5 py-1 bg-blue-900 hover:bg-blue-800 text-white rounded font-bold text-[11px]"
                            >
                              {guardando ? '...' : 'Guardar'}
                            </button>
                            <button
                              onClick={() => {
                                setEditandoVehiculoId(null);
                                setVehiculoForm({});
                              }}
                              className="px-2.5 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded font-bold text-[11px]"
                            >
                              Cancelar
                            </button>
                          </td>
                        </tr>
                      );
                    }

                    return (
                      <tr key={idVal} className="hover:bg-slate-50/70 transition-colors">
                        <td className="p-3.5 font-bold text-slate-800">
                          {v.marca}
                        </td>
                        <td className="p-3.5 font-medium text-slate-800">
                          {v.modelo}
                        </td>
                        <td className="p-3.5 text-slate-600">
                          {v.version || '—'}
                        </td>
                        <td className="p-3.5 text-slate-500 font-mono text-[11px]">
                          {v.año || '—'}
                        </td>
                        <td className="p-3.5 font-bold text-blue-900">
                          {v.filtro_asociado}
                        </td>
                        <td className="p-3.5 text-right space-x-1.5">
                          {!verEliminados ? (
                            <>
                              <button
                                onClick={() => {
                                  setEditandoVehiculoId(idVal);
                                  setVehiculoForm({
                                    marca: v.marca,
                                    modelo: v.modelo,
                                    version: v.version,
                                    año: v.año,
                                    filtro_asociado: v.filtro_asociado,
                                  });
                                }}
                                className="text-blue-600 hover:text-blue-800 p-1 rounded hover:bg-blue-50"
                                title="Editar vehículo"
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                                  <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                                </svg>
                              </button>
                              <button
                                onClick={() => handleSoftDelete(idVal, 'Tabla B', `${v.marca} ${v.modelo}`)}
                                className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50"
                                title="Mover a papelera"
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <polyline points="3 6 5 6 21 6" />
                                  <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                                </svg>
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => handleRestaurar(idVal, 'Tabla B')}
                                className="text-xs bg-green-600 hover:bg-green-700 text-white font-bold px-2 py-0.5 rounded"
                              >
                                Restaurar
                              </button>
                              <button
                                onClick={() => handlePurgarDefinitivo(idVal, 'Tabla B', `${v.marca} ${v.modelo}`)}
                                className="text-xs bg-red-600 hover:bg-red-700 text-white font-bold px-2 py-0.5 rounded"
                              >
                                Purgar
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Paginador */}
          {totalPaginas > 1 && (
            <div className="p-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span>
                Mostrando {(pagina - 1) * porPagina + 1} a {Math.min(pagina * porPagina, totalItems)} de {totalItems} vehículos
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPagina((p) => Math.max(1, p - 1))}
                  disabled={pagina === 1}
                  className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 rounded disabled:opacity-40 font-bold"
                >
                  Anterior
                </button>
                <span className="px-2 font-semibold">
                  {pagina} / {totalPaginas}
                </span>
                <button
                  onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
                  disabled={pagina === totalPaginas}
                  className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 rounded disabled:opacity-40 font-bold"
                >
                  Siguiente
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal de Carga de Imágenes */}
      {uploaderFiltro && (
        <ImagenUploader
          codigoFhl={uploaderFiltro.codigo}
          imagenes={uploaderFiltro.imagenes}
          onGuardar={handleGuardarImagenes}
          onCerrar={() => setUploaderFiltro(null)}
        />
      )}

      {/* Modal de Importación Excel/CSV */}
      {modalImportar && (
        <ImportadorExcel
          tipo={modalImportar}
          onFinalizado={() => {
            if (modalImportar === 'filtros') cargarFiltros();
            else cargarVehiculos();
          }}
          onCerrar={() => setModalImportar(null)}
        />
      )}

    </div>
  );
}

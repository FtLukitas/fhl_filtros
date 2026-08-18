'use client';

import { useState, useEffect, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '@/lib/supabase';
import type { ListaPrecio, ItemListaPrecio, Filtro } from '@/lib/types';

interface ModalVerPreciosListaProps {
  lista: ListaPrecio;
  abierto: boolean;
  onCerrar: () => void;
  onActualizado: () => void;
}

export default function ModalVerPreciosLista({
  lista,
  abierto,
  onCerrar,
  onActualizado,
}: ModalVerPreciosListaProps) {
  const [items, setItems] = useState<ItemListaPrecio[]>([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  
  // Agregar precio manual
  const [nuevoCodigo, setNuevoCodigo] = useState('');
  const [nuevoPrecio, setNuevoPrecio] = useState('');
  const [guardandoNuevo, setGuardandoNuevo] = useState(false);

  // Edición inline
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [precioEditado, setPrecioEditado] = useState<string>('');
  const [guardandoEdit, setGuardandoEdit] = useState(false);

  // Ajuste masivo por porcentaje
  const [mostrarAjusteMasivo, setMostrarAjusteMasivo] = useState(false);
  const [porcentajeAjuste, setPorcentajeAjuste] = useState<number>(10);
  const [tipoRedondeo, setTipoRedondeo] = useState<'ninguno' | 'entero' | 'decena' | 'centena'>('entero');
  const [aplicandoAjuste, setAplicandoAjuste] = useState(false);

  // Carga masiva desde catálogo base
  const [poblandoCatalogo, setPoblandoCatalogo] = useState(false);

  const cargarItems = useCallback(async () => {
    setCargando(true);
    try {
      const { data, error } = await supabase
        .from('items_lista_precio')
        .select('*')
        .eq('lista_id', lista.id)
        .order('codigo_fhl', { ascending: true });

      if (!error && data) {
        setItems(data as ItemListaPrecio[]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setCargando(false);
    }
  }, [lista.id]);

  useEffect(() => {
    if (abierto) {
      cargarItems();
    }
  }, [abierto, cargarItems]);

  if (!abierto) return null;

  const aplicarRedondeo = (val: number, tipo: 'ninguno' | 'entero' | 'decena' | 'centena'): number => {
    if (tipo === 'centena') return Math.round(val / 100) * 100;
    if (tipo === 'decena') return Math.round(val / 10) * 10;
    if (tipo === 'entero') return Math.round(val);
    return Math.round(val * 100) / 100;
  };

  const handleAgregarPrecio = async (e: React.FormEvent) => {
    e.preventDefault();
    const cod = nuevoCodigo.trim().toUpperCase();
    const val = parseFloat(nuevoPrecio);
    if (!cod || isNaN(val) || val <= 0) return;

    setGuardandoNuevo(true);
    try {
      const { error } = await supabase
        .from('items_lista_precio')
        .upsert(
          {
            lista_id: lista.id,
            codigo_fhl: cod,
            precio: val,
          },
          { onConflict: 'lista_id,codigo_fhl' }
        );

      if (!error) {
        setNuevoCodigo('');
        setNuevoPrecio('');
        await cargarItems();
        onActualizado();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setGuardandoNuevo(false);
    }
  };

  const handleGuardarEdicion = async (item: ItemListaPrecio) => {
    const val = parseFloat(precioEditado);
    if (isNaN(val) || val <= 0) return;

    setGuardandoEdit(true);
    try {
      const { error } = await supabase
        .from('items_lista_precio')
        .update({ precio: val })
        .eq('id', item.id);

      if (!error) {
        setEditandoId(null);
        await cargarItems();
        onActualizado();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setGuardandoEdit(false);
    }
  };

  const handleEliminarPrecio = async (id: number, codigo: string) => {
    if (!confirm(`¿Quitar el precio de ${codigo} de esta lista?`)) return;

    try {
      const { error } = await supabase
        .from('items_lista_precio')
        .delete()
        .eq('id', id);

      if (!error) {
        await cargarItems();
        onActualizado();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleAjusteMasivo = async () => {
    if (items.length === 0) return;
    const factor = 1 + porcentajeAjuste / 100;
    const signo = porcentajeAjuste >= 0 ? `+${porcentajeAjuste}%` : `${porcentajeAjuste}%`;
    
    if (!confirm(`¿Aplicar un ajuste de ${signo} a los ${items.length} productos de "${lista.nombre}"?`)) {
      return;
    }

    setAplicandoAjuste(true);
    try {
      for (const it of items) {
        const nuevoPrecioCalculado = aplicarRedondeo(it.precio * factor, tipoRedondeo);
        await supabase
          .from('items_lista_precio')
          .update({ precio: nuevoPrecioCalculado })
          .eq('id', it.id);
      }

      setMostrarAjusteMasivo(false);
      await cargarItems();
      onActualizado();
    } catch (err) {
      console.error('Error en ajuste masivo:', err);
    } finally {
      setAplicandoAjuste(false);
    }
  };

  const handlePoblarDesdeCatalogo = async () => {
    if (!confirm(`¿Importar todos los filtros activos del Catálogo Base a "${lista.nombre}"?`)) {
      return;
    }

    setPoblandoCatalogo(true);
    try {
      const { data: filtros, error } = await supabase
        .from('Tabla A')
        .select('codigo_fhl, precio')
        .eq('eliminado', false);

      if (!error && filtros) {
        const payload = filtros.map((f) => ({
          lista_id: lista.id,
          codigo_fhl: f.codigo_fhl,
          precio: Number(f.precio || 0),
        }));

        await supabase
          .from('items_lista_precio')
          .upsert(payload, { onConflict: 'lista_id,codigo_fhl' });

        await cargarItems();
        onActualizado();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setPoblandoCatalogo(false);
    }
  };

  const handleExportarExcel = () => {
    const rows = items.map((it) => ({
      'Filtro': it.codigo_fhl,
      'Precio': it.precio,
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, lista.nombre.slice(0, 30));
    XLSX.writeFile(wb, `lista_${lista.nombre.toLowerCase().replace(/[^a-z0-9]/g, '_')}.xlsx`);
  };

  const itemsFiltrados = items.filter((it) =>
    !busqueda || it.codigo_fhl.toLowerCase().includes(busqueda.toLowerCase().trim())
  );

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-precios-title"
        className="bg-white rounded-xl shadow-2xl max-w-4xl w-full p-6 animate-in zoom-in-95 duration-150 border border-slate-200 my-8 flex flex-col max-h-[88vh]"
      >
        {/* Encabezado */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-blue-900 uppercase tracking-widest bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                Lista de Precios
              </span>
              <span className="text-xs font-black text-slate-800">{lista.nombre}</span>
            </div>
            <h2 id="modal-precios-title" className="text-base sm:text-lg font-black text-slate-900 mt-1">
              Catálogo de Precios ({items.length.toLocaleString('es-AR')} filtros registrados)
            </h2>
          </div>

          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            <button
              type="button"
              onClick={() => setMostrarAjusteMasivo(!mostrarAjusteMasivo)}
              disabled={items.length === 0}
              className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 font-bold text-xs rounded-md transition-colors border border-amber-200 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="19" x2="12" y2="5" />
                <polyline points="5 12 12 5 19 12" />
              </svg>
              <span>Ajuste Masivo %</span>
            </button>

            <button
              type="button"
              onClick={handleExportarExcel}
              disabled={items.length === 0}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-md transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              <span>Exportar Excel</span>
            </button>

            <button
              type="button"
              onClick={onCerrar}
              className="text-slate-400 hover:text-slate-600 p-1.5 rounded-md hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {/* Panel Desplegable: Ajuste Masivo por % */}
        {mostrarAjusteMasivo && (
          <div className="bg-amber-50/80 border border-amber-200 p-4 rounded-lg mb-4 animate-in slide-in-from-top-2 duration-150 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-amber-900 uppercase tracking-wider flex items-center gap-1.5">
                <span>⚡</span> Ajuste Masivo de Precios para "{lista.nombre}"
              </h3>
              <button
                type="button"
                onClick={() => setMostrarAjusteMasivo(false)}
                className="text-amber-700 hover:text-amber-900 text-xs font-bold"
              >
                Cerrar
              </button>
            </div>
            <p className="text-xs text-amber-800">
              Incrementá o reducí en lote todos los precios de esta lista (ej: +10% por inflación o -5% por promoción).
            </p>
            <div className="flex items-end gap-3 flex-wrap sm:flex-nowrap">
              <div>
                <label className="block text-[10px] font-bold text-amber-900 uppercase mb-1">
                  Porcentaje (%)
                </label>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    step="0.5"
                    value={porcentajeAjuste}
                    onChange={(e) => setPorcentajeAjuste(parseFloat(e.target.value) || 0)}
                    className="w-24 border border-amber-300 rounded px-2.5 py-1.5 text-xs text-slate-900 bg-white font-bold"
                  />
                  <span className="text-xs font-bold text-amber-900">%</span>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-amber-900 uppercase mb-1">
                  Redondeo
                </label>
                <select
                  value={tipoRedondeo}
                  onChange={(e: any) => setTipoRedondeo(e.target.value)}
                  className="border border-amber-300 rounded px-2.5 py-1.5 text-xs text-slate-900 bg-white font-bold"
                >
                  <option value="ninguno">Sin redondeo (exacto)</option>
                  <option value="entero">Al entero ($1)</option>
                  <option value="decena">A la decena ($10)</option>
                  <option value="centena">A la centena ($100)</option>
                </select>
              </div>

              <button
                type="button"
                disabled={aplicandoAjuste}
                onClick={handleAjusteMasivo}
                className="px-4 py-1.5 bg-amber-700 hover:bg-amber-800 text-white rounded text-xs font-bold transition-colors shadow-xs disabled:opacity-50 cursor-pointer h-[32px]"
              >
                {aplicandoAjuste ? 'Aplicando ajuste...' : `Aplicar ${porcentajeAjuste >= 0 ? `+${porcentajeAjuste}%` : `${porcentajeAjuste}%`} a todos`}
              </button>
            </div>
          </div>
        )}

        {/* Formulario rápido para agregar o modificar un precio */}
        <form onSubmit={handleAgregarPrecio} className="bg-slate-50 p-3 rounded-lg border border-slate-200/80 mb-4 flex items-end gap-2 flex-wrap sm:flex-nowrap">
          <div className="flex-1 min-w-[140px]">
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              Código FHL
            </label>
            <input
              type="text"
              required
              placeholder="Ej: FHL-001"
              value={nuevoCodigo}
              onChange={(e) => setNuevoCodigo(e.target.value)}
              className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-xs text-slate-900 bg-white font-bold"
            />
          </div>

          <div className="flex-1 min-w-[120px]">
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              Precio Asignado ($)
            </label>
            <input
              type="number"
              required
              step="0.01"
              placeholder="0.00"
              value={nuevoPrecio}
              onChange={(e) => setNuevoPrecio(e.target.value)}
              className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-xs text-slate-900 bg-white font-mono font-bold"
            />
          </div>

          <button
            type="submit"
            disabled={guardandoNuevo}
            className="px-4 py-1.5 bg-blue-900 hover:bg-blue-800 text-white rounded text-xs font-bold transition-colors shadow-xs disabled:opacity-50 cursor-pointer whitespace-nowrap h-[32px]"
          >
            {guardandoNuevo ? 'Guardando...' : '+ Asignar Precio'}
          </button>
        </form>

        {/* Buscador y Estado */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <input
            type="text"
            placeholder="Buscar filtro por código..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-md w-full max-w-xs font-bold focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-900"
          />
          
          <div className="flex items-center gap-3">
            {items.length === 0 && !cargando && (
              <button
                type="button"
                disabled={poblandoCatalogo}
                onClick={handlePoblarDesdeCatalogo}
                className="text-xs font-bold text-blue-900 hover:underline cursor-pointer"
              >
                {poblandoCatalogo ? 'Importando...' : '📥 Traer todos los filtros del catálogo'}
              </button>
            )}
            <span className="text-xs text-slate-500 font-medium">
              {itemsFiltrados.length} filtro(s) listados
            </span>
          </div>
        </div>

        {/* Lista / Tabla de Precios */}
        <div className="flex-1 overflow-y-auto border border-slate-200 rounded-lg min-h-[220px]">
          {cargando ? (
            <div className="p-8 text-center text-xs text-slate-400">
              Cargando catálogo de precios...
            </div>
          ) : itemsFiltrados.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400 italic">
              {items.length === 0
                ? 'Esta lista aún no tiene precios cargados. Podés importar un Excel (2 columnas), traer todos los filtros del catálogo o agregar códigos a mano arriba.'
                : 'No se encontraron filtros con ese código en esta lista.'}
            </div>
          ) : (
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold sticky top-0 uppercase tracking-wider">
                <tr>
                  <th className="p-2.5">Filtro / Código FHL</th>
                  <th className="p-2.5 text-right">Precio en esta Lista</th>
                  <th className="p-2.5 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {itemsFiltrados.map((it) => (
                  <tr key={it.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="p-2.5 font-bold font-mono text-slate-900">{it.codigo_fhl}</td>
                    <td className="p-2.5 text-right">
                      {editandoId === it.id ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <span className="text-slate-400 font-mono">$</span>
                          <input
                            type="number"
                            step="0.01"
                            value={precioEditado}
                            onChange={(e) => setPrecioEditado(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleGuardarEdicion(it);
                              if (e.key === 'Escape') setEditandoId(null);
                            }}
                            className="w-28 px-2 py-1 border border-blue-600 rounded text-xs font-mono font-bold text-slate-900 bg-white"
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={() => handleGuardarEdicion(it)}
                            disabled={guardandoEdit}
                            className="px-2 py-1 bg-blue-900 text-white rounded font-bold text-[11px] cursor-pointer"
                          >
                            Guardar
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditandoId(null)}
                            className="px-2 py-1 bg-slate-200 text-slate-700 rounded font-bold text-[11px] cursor-pointer"
                          >
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <span
                          onClick={() => {
                            setEditandoId(it.id);
                            setPrecioEditado(String(it.precio));
                          }}
                          className="font-black font-mono text-sm text-blue-900 hover:text-blue-700 cursor-pointer hover:underline"
                          title="Hacé click para editar este precio"
                        >
                          ${Number(it.precio).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                        </span>
                      )}
                    </td>
                    <td className="p-2.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {editandoId !== it.id && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditandoId(it.id);
                              setPrecioEditado(String(it.precio));
                            }}
                            className="p-1 text-slate-400 hover:text-blue-900 rounded hover:bg-slate-100 transition-colors cursor-pointer"
                            title="Editar precio"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleEliminarPrecio(it.id, it.codigo_fhl)}
                          className="p-1 text-slate-400 hover:text-red-600 rounded hover:bg-slate-100 transition-colors cursor-pointer"
                          title="Eliminar de la lista"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="pt-4 border-t border-slate-100 flex justify-between items-center">
          <p className="text-[11px] text-slate-400">
            Hacé click en cualquier precio para modificarlo directamente.
          </p>
          <button
            type="button"
            onClick={onCerrar}
            className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs rounded-md transition-colors cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

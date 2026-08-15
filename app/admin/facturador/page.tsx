'use client';

import { useState, useCallback, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { generarPDF, obtenerPDFBlobUrl } from '../../../lib/generarPDF';
import type { Cliente, PrecioCliente, Filtro } from '../../../lib/types';
import SelectorCliente from './components/SelectorCliente';
import BuscadorFiltroAutocompletar from './components/BuscadorFiltroAutocompletar';
import TablaItems, { type ItemFactura } from './components/TablaItems';

export default function FacturadorPage() {
  // --- Estado principal ---
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [preciosCliente, setPreciosCliente] = useState<Map<string, number>>(new Map());
  const [items, setItems] = useState<ItemFactura[]>([]);
  const [observaciones, setObservaciones] = useState('');
  const [numeroPresupuesto, setNumeroPresupuesto] = useState('');
  const [validezDias, setValidezDias] = useState<number>(30);
  const [generando, setGenerando] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);

  // --- Vista previa ---
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [cargandoPreview, setCargandoPreview] = useState(false);
  const [mostrarPreview, setMostrarPreview] = useState(false);
  const [esMobile, setEsMobile] = useState(false);

  useEffect(() => {
    setEsMobile(/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent));
  }, []);

  // Limpiar URL de blob al desmontar/cambiar para evitar fugas de memoria
  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  // Limpiar previsualización si no hay cliente o ítems
  useEffect(() => {
    if (!cliente || items.length === 0) {
      setMostrarPreview(false);
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    }
  }, [cliente, items]);

  // Generar/Actualizar la previsualización del PDF
  const actualizarPrevisualizacion = useCallback(async () => {
    if (!cliente || items.length === 0) return;
    setCargandoPreview(true);
    try {
      const url = await obtenerPDFBlobUrl({
        cliente,
        items,
        observaciones,
        numeroPresupuesto,
        validezDias,
      });
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
      setMostrarPreview(true);
    } catch (err) {
      console.error('Error al generar vista previa:', err);
    } finally {
      setCargandoPreview(false);
    }
  }, [cliente, items, observaciones, numeroPresupuesto, validezDias]);

  // Actualizar previsualización automáticamente si ya está visible y cambian los datos (sin loop infinito)
  useEffect(() => {
    if (mostrarPreview && cliente && items.length > 0) {
      const timer = setTimeout(() => {
        actualizarPrevisualizacion();
      }, 500); // 500ms debounce
      return () => clearTimeout(timer);
    }
  }, [items, cliente, observaciones, numeroPresupuesto, validezDias, mostrarPreview, actualizarPrevisualizacion]);

  // Cargar precios del cliente seleccionado
  const cargarPrecios = async (clienteId: string) => {
    const { data } = await supabase
      .from('precios_cliente')
      .select('*')
      .eq('cliente_id', clienteId);

    const mapa = new Map<string, number>();
    if (data) {
      (data as PrecioCliente[]).forEach((p) => {
        mapa.set(p.codigo_fhl, p.precio);
      });
    }
    setPreciosCliente(mapa);
  };

  // Seleccionar cliente
  const handleSeleccionarCliente = useCallback(async (c: Cliente | null) => {
    setCliente(c);
    if (c) {
      await cargarPrecios(c.id);
    } else {
      setPreciosCliente(new Map());
    }
  }, []);

  // Agregar filtro a la tabla
  const handleAgregarFiltro = useCallback((filtro: Filtro | { codigo_fhl: string }) => {
    const codigo = filtro.codigo_fhl.trim();
    if (!codigo) return;

    // Evitar duplicados
    const existe = items.find((i) => i.codigo_fhl.toUpperCase() === codigo.toUpperCase());
    if (existe) {
      setMensaje({ tipo: 'error', texto: `${codigo} ya está en la lista.` });
      setTimeout(() => setMensaje(null), 2500);
      return;
    }

    // Buscar precio si existe para este código
    let precioDesdeDB = preciosCliente.get(codigo);
    if (precioDesdeDB === undefined) {
      for (const [k, v] of preciosCliente.entries()) {
        if (k.toUpperCase() === codigo.toUpperCase()) {
          precioDesdeDB = v;
          break;
        }
      }
    }

    const nuevoItem: ItemFactura = {
      id: `${codigo}-${Date.now()}`,
      codigo_fhl: codigo,
      cantidad: 1,
      precioUnitario: precioDesdeDB ?? 0,
    };

    setItems((prev) => [...prev, nuevoItem]);
  }, [items, preciosCliente]);

  // Actualizar un campo de un ítem
  const handleActualizarItem = useCallback((id: string, campo: 'cantidad' | 'precioUnitario', valor: number) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [campo]: valor } : item))
    );
  }, []);

  // Eliminar ítem
  const handleEliminarItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  // Generar PDF
  const handleGenerarPDF = async () => {
    if (!cliente) {
      setMensaje({ tipo: 'error', texto: 'Seleccioná un cliente primero.' });
      setTimeout(() => setMensaje(null), 3000);
      return;
    }
    if (items.length === 0) {
      setMensaje({ tipo: 'error', texto: 'Agregá al menos un filtro.' });
      setTimeout(() => setMensaje(null), 3000);
      return;
    }
    const sinPrecio = items.filter((i) => i.precioUnitario <= 0);
    if (sinPrecio.length > 0) {
      setMensaje({
        tipo: 'error',
        texto: `Hay ${sinPrecio.length} ítem(s) sin precio. Completá todos los precios antes de generar.`,
      });
      setTimeout(() => setMensaje(null), 4000);
      return;
    }

    setGenerando(true);
    setMensaje(null);
    try {
      await generarPDF({ cliente, items, observaciones, numeroPresupuesto, validezDias });
      setMensaje({ tipo: 'ok', texto: 'PDF generado y descargado correctamente.' });
      setTimeout(() => setMensaje(null), 4000);
    } catch (err) {
      console.error(err);
      setMensaje({ tipo: 'error', texto: 'Error al generar el PDF. Intentá de nuevo.' });
      setTimeout(() => setMensaje(null), 4000);
    } finally {
      setGenerando(false);
    }
  };

  // Limpiar todo
  const handleLimpiar = () => {
    setCliente(null);
    setPreciosCliente(new Map());
    setItems([]);
    setObservaciones('');
    setNumeroPresupuesto('');
    setValidezDias(30);
    setMensaje(null);
    setMostrarPreview(false);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
  };

  const total = items.reduce((sum, i) => sum + i.cantidad * i.precioUnitario, 0);

  return (
    <div className="space-y-6">
      {/* Título de página */}
      <div>
        <h2 className="text-2xl font-black text-slate-800 tracking-tight">
          Generar Presupuesto
        </h2>
        <p className="text-sm text-slate-500 mt-1">
          Seleccioná un cliente, agregá filtros y generá el PDF.
        </p>
      </div>

      {/* Mensaje flotante */}
      {mensaje && (
        <div
          className={`px-4 py-3 rounded-md text-sm font-medium border transition-all ${mensaje.tipo === 'ok'
            ? 'bg-green-50 text-green-700 border-green-200'
            : 'bg-red-50 text-red-700 border-red-200'
            }`}
        >
          {mensaje.texto}
        </div>
      )}

      {/* Grid de Dos Columnas */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Formulario (Columna izquierda) */}
        <div className="lg:col-span-7 space-y-6">
          {/* SECCIÓN 1: Cliente */}
          <SelectorCliente
            clienteSeleccionado={cliente}
            onSeleccionar={handleSeleccionarCliente}
          />

          {/* SECCIÓN 2: Agregar filtros */}
          <div className="bg-white rounded shadow-sm border border-slate-200 p-5">
            <h2 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-4">
              Agregar Filtros
            </h2>
            <BuscadorFiltroAutocompletar onSeleccionar={handleAgregarFiltro} />
            {!cliente && (
              <p className="text-xs text-amber-600 mt-2">
                Seleccioná un cliente primero para autocompletar precios.
              </p>
            )}
          </div>

          {/* SECCIÓN 3: Tabla de ítems */}
          <TablaItems
            items={items}
            onActualizarItem={handleActualizarItem}
            onEliminarItem={handleEliminarItem}
          />

          {/* SECCIÓN 4: Observaciones y Detalles del Presupuesto */}
          {items.length > 0 && (
            <div className="bg-white rounded shadow-sm border border-slate-200 p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">
                    Número de Presupuesto (Opcional)
                  </label>
                  <input
                    type="text"
                    value={numeroPresupuesto}
                    onChange={(e) => setNumeroPresupuesto(e.target.value)}
                    placeholder="Ej: 0001-000023"
                    className="w-full border border-slate-300 rounded px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">
                    Validez (días)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={validezDias}
                    onChange={(e) => setValidezDias(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full border border-slate-300 rounded px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
              <div>
                <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">
                  Observaciones
                </h2>
                <textarea
                  value={observaciones}
                  onChange={(e) => setObservaciones(e.target.value)}
                  placeholder="Notas adicionales para incluir en el presupuesto (opcional)..."
                  rows={3}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
          )}

          {/* SECCIÓN 5: Acciones */}
          {items.length > 0 && (
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white rounded shadow-sm border border-slate-200 p-5">
              <div className="text-sm text-slate-500">
                <span className="font-semibold text-slate-700">{items.length}</span> ítem(s) •{' '}
                <span className="font-bold text-blue-900 text-lg">
                  ${total.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleLimpiar}
                  className="px-5 py-2.5 text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded transition-colors"
                >
                  Limpiar
                </button>
                <button
                  onClick={handleGenerarPDF}
                  disabled={generando}
                  className="px-6 py-2.5 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {generando ? (
                    <>
                      <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Generando...
                    </>
                  ) : (
                    <>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <line x1="16" y1="13" x2="8" y2="13" />
                        <line x1="16" y1="17" x2="8" y2="17" />
                        <polyline points="10 9 9 9 8 9" />
                      </svg>
                      Generar PDF
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Previsualización (Columna derecha) */}
        <div className="lg:col-span-5 lg:sticky lg:top-6 space-y-4">
          <div className="bg-white rounded shadow-sm border border-slate-200 p-5 flex flex-col min-h-[450px]">
            <h2 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-4">
              Vista Previa
            </h2>

            {!cliente || items.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-6 bg-slate-50 border border-dashed border-slate-200 rounded">
                <svg className="text-slate-300 mb-3" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
                <p className="text-xs font-semibold text-slate-500">
                  Completá los datos del presupuesto para habilitar la vista previa.
                </p>
              </div>
            ) : (
              <div className="flex-1 flex flex-col space-y-4">
                <button
                  onClick={actualizarPrevisualizacion}
                  disabled={cargandoPreview || generando}
                  className="w-full bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold py-2.5 px-4 rounded transition-colors flex items-center justify-center gap-1.5"
                >
                  {cargandoPreview ? (
                    <>
                      <div className="h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Cargando Vista Previa...
                    </>
                  ) : (
                    <>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 11-.57-8.38l5.67-5.67" />
                      </svg>
                      {previewUrl ? 'Actualizar Vista Previa' : 'Ver Vista Previa'}
                    </>
                  )}
                </button>

                {previewUrl ? (
                  esMobile ? (
                    <div className="flex-grow flex flex-col items-center justify-center text-center p-6 bg-slate-50 border border-slate-200 rounded h-[350px] space-y-4">
                      <div className="text-blue-900 bg-blue-50 p-4 rounded-full">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                          <polyline points="14 2 14 8 20 8" />
                          <line x1="16" y1="13" x2="8" y2="13" />
                          <line x1="16" y1="17" x2="8" y2="17" />
                          <polyline points="10 9 9 9 8 9" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-800">Presupuesto Generado</p>
                        <p className="text-xs text-slate-500 mt-1 max-w-[280px] mx-auto">
                          En dispositivos móviles podés abrir el documento en pantalla completa para previsualizarlo o guardarlo.
                        </p>
                      </div>
                      <div className="flex flex-col w-full gap-2 pt-2">
                        <a
                          href={previewUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-full bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold py-2.5 px-4 rounded transition-colors text-center flex items-center justify-center gap-1.5"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2 2V8a2 2 0 012-2h6" />
                            <polyline points="15 3 21 3 21 9" />
                            <line x1="10" y1="14" x2="21" y2="3" />
                          </svg>
                          Abrir Vista Previa
                        </a>
                        <button
                          onClick={handleGenerarPDF}
                          className="w-full bg-red-600 hover:bg-red-700 text-white text-xs font-bold py-2.5 px-4 rounded transition-colors flex items-center justify-center gap-1.5"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                            <polyline points="7 10 12 15 17 10" />
                            <line x1="12" y1="15" x2="12" y2="3" />
                          </svg>
                          Descargar PDF
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex-grow border border-slate-200 rounded overflow-hidden h-[500px]">
                      <iframe
                        src={`${previewUrl}#toolbar=0&navpanes=0`}
                        className="w-full h-full"
                        title="Vista previa del presupuesto"
                      />
                    </div>
                  )
                ) : (
                  <div className="flex-grow flex flex-col items-center justify-center text-center p-6 bg-slate-50 border border-dashed border-slate-200 rounded h-[500px]">
                    <p className="text-xs text-slate-500">
                      Hacé click en <strong>Ver Vista Previa</strong> para generar una copia interactiva del documento.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

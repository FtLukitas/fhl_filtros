'use client';

import { useState } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '@/lib/supabase';
import type { ListaPrecio } from '@/lib/types';

interface ImportadorExcelListaPrecioProps {
  lista: ListaPrecio;
  abierto: boolean;
  onCerrar: () => void;
  onFinalizado: () => void;
}

interface ItemPreviewExcel {
  codigo_fhl: string;
  precio: number;
  valido: boolean;
  errorMsg?: string;
}

export default function ImportadorExcelListaPrecio({
  lista,
  abierto,
  onCerrar,
  onFinalizado,
}: ImportadorExcelListaPrecioProps) {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [procesando, setProcesando] = useState(false);
  const [itemsPreview, setItemsPreview] = useState<ItemPreviewExcel[]>([]);
  const [modoCarga, setModoCarga] = useState<'reemplazar' | 'merge'>('reemplazar');
  const [guardando, setGuardando] = useState(false);
  const [progreso, setProgreso] = useState<number>(0);
  const [filtroBusqueda, setFiltroBusqueda] = useState('');
  const [mensajeError, setMensajeError] = useState<string | null>(null);

  if (!abierto) return null;

  const normalizarClave = (str: string) => {
    return str
      .toLowerCase()
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '');
  };

  const limpiarPrecio = (val: any): number => {
    if (val === undefined || val === null) return 0;
    if (typeof val === 'number') return isNaN(val) ? 0 : val;

    let str = String(val).trim().replace(/[$ \s]/g, '');
    if (!str) return 0;

    // Si tiene comas y puntos (ej: 1.250,50 o 1,250.50)
    if (str.includes('.') && str.includes(',')) {
      if (str.lastIndexOf(',') > str.lastIndexOf('.')) {
        // Formato latino: 1.250,50
        str = str.replace(/\./g, '').replace(',', '.');
      } else {
        // Formato anglosajón: 1,250.50
        str = str.replace(/,/g, '');
      }
    } else if (str.includes(',')) {
      str = str.replace(',', '.');
    }

    const num = parseFloat(str);
    return isNaN(num) ? 0 : num;
  };

  const procesarArchivoExcel = async (file: File) => {
    setProcesando(true);
    setMensajeError(null);
    setItemsPreview([]);

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[firstSheetName];

      const filasJson: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

      if (filasJson.length === 0) {
        setMensajeError('El archivo Excel está vacío o no contiene filas con datos.');
        setProcesando(false);
        return;
      }

      // Detectar nombres de columnas de código y precio
      const primeraFila = filasJson[0];
      const keys = Object.keys(primeraFila);

      let keyCodigo = keys.find((k) => {
        const norm = normalizarClave(k);
        return (
          norm.includes('codigofhl') ||
          norm.includes('codfhl') ||
          norm === 'codigo' ||
          norm === 'cod' ||
          norm === 'filtro' ||
          norm === 'articulo' ||
          norm === 'producto' ||
          norm === 'item'
        );
      });

      let keyPrecio = keys.find((k) => {
        const norm = normalizarClave(k);
        return (
          norm.includes('precio') ||
          norm.includes('valor') ||
          norm.includes('importe') ||
          norm.includes('tarifa') ||
          norm.includes('monto') ||
          norm.includes('mayorista') ||
          norm.includes('costo')
        );
      });

      // Si no encontró por nombre, intentar usar las primeras dos columnas
      if (!keyCodigo && keys.length > 0) keyCodigo = keys[0];
      if (!keyPrecio && keys.length > 1) keyPrecio = keys[1];

      if (!keyCodigo || !keyPrecio) {
        setMensajeError('No se pudieron detectar las columnas de Código y Precio en el Excel.');
        setProcesando(false);
        return;
      }

      const listaParsed: ItemPreviewExcel[] = [];
      const codigosVistos = new Set<string>();

      for (const row of filasJson) {
        const rawCod = String(row[keyCodigo] || '').trim();
        if (!rawCod) continue;

        const codUpper = rawCod.toUpperCase();
        const rawPrecio = row[keyPrecio];
        const precioNum = limpiarPrecio(rawPrecio);

        if (codigosVistos.has(codUpper)) {
          // Ya existe en este mismo archivo
          continue;
        }
        codigosVistos.add(codUpper);

        if (precioNum <= 0) {
          listaParsed.push({
            codigo_fhl: codUpper,
            precio: 0,
            valido: false,
            errorMsg: 'Precio inválido o en $0',
          });
        } else {
          listaParsed.push({
            codigo_fhl: codUpper,
            precio: precioNum,
            valido: true,
          });
        }
      }

      if (listaParsed.length === 0) {
        setMensajeError('No se encontraron registros válidos de filtros y precios en la planilla.');
      } else {
        setItemsPreview(listaParsed);
      }
    } catch (err: any) {
      console.error(err);
      setMensajeError(`Error al leer el archivo Excel: ${err.message || 'Formato no soportado'}`);
    } finally {
      setProcesando(false);
    }
  };

  const handleDescargarPlantilla = async () => {
    try {
      // Obtener todos los filtros de Tabla A para que la plantilla esté precargada
      const { data: filtros } = await supabase
        .from('Tabla A')
        .select('codigo_fhl, descripcion_aplicacion, precio')
        .eq('eliminado', false)
        .order('codigo_fhl', { ascending: true });

      const rows = (filtros || []).map((f) => ({
        'CODIGO FHL': f.codigo_fhl || '',
        'DESCRIPCION': f.descripcion_aplicacion || '',
        'PRECIO BASE CATALOGO': f.precio || 0,
        'PRECIO LISTA': f.precio ? Math.round(f.precio * (1 + Number(lista.porcentaje || 0) / 100)) : 0,
      }));

      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Lista de Precios');
      XLSX.writeFile(wb, `plantilla_precios_${lista.nombre.toLowerCase().replace(/[^a-z0-9]/g, '_')}.xlsx`);
    } catch (err) {
      console.error('Error al generar plantilla:', err);
    }
  };

  const handleGuardarEnBaseDeDatos = async () => {
    const validos = itemsPreview.filter((i) => i.valido && i.precio > 0);
    if (validos.length === 0) {
      setMensajeError('No hay ítems válidos para importar.');
      return;
    }

    setGuardando(true);
    setProgreso(0);
    setMensajeError(null);

    try {
      // 1. Si el modo es reemplazar, borrar items previos de esta lista
      if (modoCarga === 'reemplazar') {
        const { error: errDel } = await supabase
          .from('items_lista_precio')
          .delete()
          .eq('lista_id', lista.id);

        if (errDel) throw errDel;
      }

      // 2. Insertar en lotes de 200 ítems
      const batchSize = 200;
      const totalLotes = Math.ceil(validos.length / batchSize);

      for (let i = 0; i < totalLotes; i++) {
        const lote = validos.slice(i * batchSize, (i + 1) * batchSize).map((item) => ({
          lista_id: lista.id,
          codigo_fhl: item.codigo_fhl,
          precio: item.precio,
        }));

        const { error: errUpsert } = await supabase
          .from('items_lista_precio')
          .upsert(lote, { onConflict: 'lista_id,codigo_fhl' });

        if (errUpsert) throw errUpsert;

        setProgreso(Math.round(((i + 1) / totalLotes) * 100));
      }

      // 3. Actualizar tipo_ajuste de la lista a 'excel' si correspondiera
      await supabase
        .from('listas_precios')
        .update({ tipo_ajuste: 'excel' })
        .eq('id', lista.id);

      onFinalizado();
      onCerrar();
    } catch (err: any) {
      console.error('Error al guardar precios en Supabase:', err);
      setMensajeError(err.message || 'Error al guardar precios en la base de datos.');
    } finally {
      setGuardando(false);
    }
  };

  const itemsFiltrados = itemsPreview.filter((it) =>
    !filtroBusqueda || it.codigo_fhl.toLowerCase().includes(filtroBusqueda.toLowerCase().trim())
  );

  const totalValidos = itemsPreview.filter((i) => i.valido).length;
  const totalInvalidos = itemsPreview.length - totalValidos;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-excel-title"
        className="bg-white rounded-lg shadow-2xl max-w-2xl w-full p-6 animate-in zoom-in-95 duration-150 border border-slate-200 my-8"
      >
        {/* Encabezado */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-blue-900 uppercase tracking-widest bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                Excel a Lista de Precios
              </span>
              <span className="text-xs font-bold text-slate-800">
                {lista.nombre}
              </span>
            </div>
            <h2 id="modal-excel-title" className="text-base font-black text-slate-900 mt-1">
              Cargar Planilla de Precios por Producto
            </h2>
          </div>

          <button
            type="button"
            onClick={onCerrar}
            disabled={guardando}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-md hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Zona de Drop / Selección de Archivo */}
        {itemsPreview.length === 0 ? (
          <div className="space-y-4">
            <div className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center hover:border-blue-800 transition-colors bg-slate-50/50">
              <input
                type="file"
                id="input-excel-lista"
                accept=".xlsx,.xls,.csv"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    setArchivo(f);
                    procesarArchivoExcel(f);
                  }
                }}
                className="hidden"
              />
              <label
                htmlFor="input-excel-lista"
                className="cursor-pointer flex flex-col items-center justify-center space-y-2"
              >
                <div className="p-3 bg-blue-50 text-blue-900 rounded-full">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                </div>
                <span className="text-sm font-bold text-slate-800">
                  {procesando ? 'Leyendo planilla...' : 'Hacé clic para subir tu Excel o arrastralo aquí'}
                </span>
                <span className="text-xs text-slate-500">
                  Formatos compatibles: .xlsx, .xls o .csv con columnas de Código FHL y Precio
                </span>
              </label>
            </div>

            <div className="flex items-center justify-between p-3.5 bg-blue-50/60 rounded-lg border border-blue-100 text-xs">
              <div className="space-y-0.5">
                <span className="font-bold text-blue-900 block">
                  ¿Querés una plantilla con todos tus filtros ya listados?
                </span>
                <span className="text-slate-600">
                  Descargá la plantilla en Excel con los códigos actuales de tu catálogo para ponerles precio.
                </span>
              </div>
              <button
                type="button"
                onClick={handleDescargarPlantilla}
                className="px-3 py-1.5 bg-white hover:bg-slate-50 border border-blue-200 text-blue-900 font-bold rounded-md transition-colors shadow-2xs whitespace-nowrap cursor-pointer"
              >
                Descargar Plantilla
              </button>
            </div>

            {mensajeError && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-800 text-xs font-bold rounded-md">
                {mensajeError}
              </div>
            )}
          </div>
        ) : (
          /* Previsualización de Datos */
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Total Filas
                </span>
                <span className="text-lg font-black font-mono text-slate-800">
                  {itemsPreview.length.toLocaleString('es-AR')}
                </span>
              </div>

              <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                <span className="text-[10px] font-bold text-green-700 uppercase tracking-wider block">
                  Precios Válidos
                </span>
                <span className="text-lg font-black font-mono text-green-900">
                  {totalValidos.toLocaleString('es-AR')}
                </span>
              </div>

              <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
                <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider block">
                  Omitidos / Error
                </span>
                <span className="text-lg font-black font-mono text-amber-900">
                  {totalInvalidos.toLocaleString('es-AR')}
                </span>
              </div>
            </div>

            {/* Opciones de carga */}
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-2">
              <span className="text-xs font-bold text-slate-700 block">Modo de actualización:</span>
              <div className="flex items-center gap-4 flex-wrap">
                <label className="flex items-center gap-1.5 text-xs text-slate-800 font-semibold cursor-pointer">
                  <input
                    type="radio"
                    name="modoCarga"
                    checked={modoCarga === 'reemplazar'}
                    onChange={() => setModoCarga('reemplazar')}
                    className="text-blue-900 focus:ring-blue-900"
                  />
                  <span>Reemplazar lista completa con este Excel</span>
                </label>

                <label className="flex items-center gap-1.5 text-xs text-slate-800 font-semibold cursor-pointer">
                  <input
                    type="radio"
                    name="modoCarga"
                    checked={modoCarga === 'merge'}
                    onChange={() => setModoCarga('merge')}
                    className="text-blue-900 focus:ring-blue-900"
                  />
                  <span>Actualizar/Agregar solo los códigos del Excel</span>
                </label>
              </div>
            </div>

            {/* Buscador en preview */}
            <div className="flex items-center justify-between gap-2">
              <input
                type="text"
                placeholder="Buscar código en el Excel..."
                value={filtroBusqueda}
                onChange={(e) => setFiltroBusqueda(e.target.value)}
                className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-md w-full max-w-xs font-bold focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-900"
              />
              <span className="text-xs text-slate-500 font-medium">
                Mostrando {itemsFiltrados.length} de {itemsPreview.length}
              </span>
            </div>

            {/* Tabla de Preview */}
            <div className="max-h-60 overflow-y-auto border border-slate-200 rounded-lg">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold sticky top-0 uppercase tracking-wider">
                  <tr>
                    <th className="p-2.5">Código FHL</th>
                    <th className="p-2.5 text-right">Precio en Excel</th>
                    <th className="p-2.5 text-center">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {itemsFiltrados.slice(0, 50).map((it, idx) => (
                    <tr key={`${it.codigo_fhl}-${idx}`} className="hover:bg-slate-50">
                      <td className="p-2.5 font-bold font-mono text-slate-800">{it.codigo_fhl}</td>
                      <td className="p-2.5 text-right font-black font-mono text-blue-900">
                        ${it.precio.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-2.5 text-center">
                        {it.valido ? (
                          <span className="text-[10px] font-bold text-green-700 bg-green-50 px-2 py-0.5 rounded">
                            Válido
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold text-red-700 bg-red-50 px-2 py-0.5 rounded" title={it.errorMsg}>
                            {it.errorMsg || 'Inválido'}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {itemsFiltrados.length > 50 && (
              <p className="text-[11px] text-slate-400 text-center italic">
                ... y {(itemsFiltrados.length - 50).toLocaleString('es-AR')} productos más.
              </p>
            )}

            {/* Barra de progreso si está guardando */}
            {guardando && (
              <div className="space-y-1">
                <div className="flex justify-between text-xs font-bold text-slate-600">
                  <span>Guardando precios en la base de datos...</span>
                  <span>{progreso}%</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-blue-900 h-full transition-all duration-200"
                    style={{ width: `${progreso}%` }}
                  />
                </div>
              </div>
            )}

            {mensajeError && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-800 text-xs font-bold rounded-md">
                {mensajeError}
              </div>
            )}

            {/* Botones de acción */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setItemsPreview([])}
                disabled={guardando}
                className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-md transition-colors cursor-pointer"
              >
                Elegir otro archivo
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onCerrar}
                  disabled={guardando}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-md transition-colors cursor-pointer"
                >
                  Cancelar
                </button>

                <button
                  type="button"
                  onClick={handleGuardarEnBaseDeDatos}
                  disabled={guardando || totalValidos === 0}
                  className="px-5 py-2 bg-blue-900 hover:bg-blue-800 text-white font-bold text-xs rounded-md transition-colors shadow-xs disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                >
                  {guardando ? (
                    <>
                      <div className="h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Guardando {totalValidos} precios...</span>
                    </>
                  ) : (
                    <span>Confirmar e Importar {totalValidos} Precios</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

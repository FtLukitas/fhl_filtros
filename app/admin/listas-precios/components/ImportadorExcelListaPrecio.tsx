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

interface ItemPrecio {
  codigo_fhl: string;
  precio: number;
  codigoOriginal?: string;
  fueMapeado?: boolean;
  nota?: string;
  valido: boolean;
  precioActual?: number | null;
  existeEnCatalogo?: boolean;
  diferenciaPorcentaje?: number | null;
}

interface DiagnosticoAuditoria {
  scoreSalud: number;
  dictamen: string;
  resumen: string;
  modeloUsado?: string;
}

export default function ImportadorExcelListaPrecio({
  lista,
  abierto,
  onCerrar,
  onFinalizado,
}: ImportadorExcelListaPrecioProps) {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [arrastrando, setArrastrando] = useState(false);
  const [procesando, setProcesando] = useState(false);
  const [auditandoIA, setAuditandoIA] = useState(false);

  // Multi-hoja
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [hojas, setHojas] = useState<string[]>([]);
  const [hojaSeleccionada, setHojaSeleccionada] = useState<string>('');

  // Lista de items cargados
  const [items, setItems] = useState<ItemPrecio[]>([]);
  const [diagnosticoIA, setDiagnosticoIA] = useState<DiagnosticoAuditoria | null>(null);

  // Opciones de importación y vista
  const [modoCarga, setModoCarga] = useState<'reemplazar' | 'merge'>('reemplazar');
  const [filtroEstado, setFiltroEstado] = useState<'todos' | 'cambios' | 'nuevos' | 'invalidos'>('todos');
  const [mostrarTodas, setMostrarTodas] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [progreso, setProgreso] = useState<number>(0);
  const [filtroBusqueda, setFiltroBusqueda] = useState('');
  const [mensajeError, setMensajeError] = useState<string | null>(null);

  // Edición inline de precio
  const [editandoIdx, setEditandoIdx] = useState<number | null>(null);
  const [precioEditadoInput, setPrecioEditadoInput] = useState<string>('');

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

    if (str.includes('.') && str.includes(',')) {
      if (str.lastIndexOf(',') > str.lastIndexOf('.')) {
        str = str.replace(/\./g, '').replace(',', '.');
      } else {
        str = str.replace(/,/g, '');
      }
    } else if (str.includes(',')) {
      str = str.replace(',', '.');
    }

    const num = parseFloat(str);
    return isNaN(num) ? 0 : num;
  };

  // Procesa una hoja específica del workbook
  const procesarHoja = async (wb: XLSX.WorkBook, sheetName: string) => {
    const sheet = wb.Sheets[sheetName];
    if (!sheet) {
      setMensajeError(`No se encontró la hoja "${sheetName}" en el archivo.`);
      return;
    }

    const filasJson: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    if (filasJson.length === 0) {
      setMensajeError(`La hoja "${sheetName}" está vacía o no contiene filas con datos.`);
      setItems([]);
      return;
    }

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

    if (!keyCodigo && keys.length > 0) keyCodigo = keys[0];
    if (!keyPrecio && keys.length > 1) keyPrecio = keys[1];

    if (!keyCodigo || !keyPrecio) {
      setMensajeError(`No se pudieron detectar las columnas de Código y Precio en la hoja "${sheetName}".`);
      setItems([]);
      return;
    }

    // Consultar precios actuales de esta lista y catálogo existente en paralelo
    const [resPreciosLista, resCatalogo] = await Promise.all([
      supabase
        .from('items_lista_precio')
        .select('codigo_fhl, precio')
        .eq('lista_id', lista.id),
      supabase
        .from('Tabla A')
        .select('codigo_fhl, precio')
        .or('eliminado.is.null,eliminado.eq.false'),
    ]);

    const mapaPreciosActuales = new Map<string, number>();
    (resPreciosLista.data || []).forEach((item) => {
      mapaPreciosActuales.set(item.codigo_fhl.trim().toUpperCase(), Number(item.precio));
    });

    const setCatalogo = new Set<string>();
    (resCatalogo.data || []).forEach((f) => {
      setCatalogo.add(f.codigo_fhl.trim().toUpperCase());
    });

    const listaParsed: ItemPrecio[] = [];
    const codigosVistos = new Set<string>();

    for (const row of filasJson) {
      const rawCod = String(row[keyCodigo] || '').trim();
      if (!rawCod) continue;

      const codUpper = rawCod.toUpperCase();
      const rawPrecio = row[keyPrecio];
      const precioNum = limpiarPrecio(rawPrecio);

      if (codigosVistos.has(codUpper)) continue;
      codigosVistos.add(codUpper);

      const precioActual = mapaPreciosActuales.has(codUpper)
        ? mapaPreciosActuales.get(codUpper)!
        : null;
      const existeEnCatalogo = setCatalogo.has(codUpper);
      const diferenciaPorcentaje =
        precioActual !== null && precioActual > 0
          ? ((precioNum - precioActual) / precioActual) * 100
          : null;

      listaParsed.push({
        codigo_fhl: codUpper,
        precio: precioNum,
        codigoOriginal: rawCod,
        valido: precioNum > 0,
        nota: precioNum <= 0 ? 'Precio en $0 o inválido' : undefined,
        precioActual,
        existeEnCatalogo,
        diferenciaPorcentaje,
      });
    }

    if (listaParsed.length === 0) {
      setMensajeError('No se encontraron filas con códigos y precios válidos en esta hoja.');
      setItems([]);
    } else {
      setItems(listaParsed);
      setMensajeError(null);
    }
  };

  // 1. Procesar archivo Excel
  const procesarArchivoExcel = async (file: File) => {
    setArchivo(file);
    setProcesando(true);
    setMensajeError(null);
    setDiagnosticoIA(null);

    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });
      setWorkbook(wb);
      setHojas(wb.SheetNames);
      const primerHoja = wb.SheetNames[0] || '';
      setHojaSeleccionada(primerHoja);

      await procesarHoja(wb, primerHoja);
    } catch (err: any) {
      console.error(err);
      setMensajeError(`Error al leer archivo: ${err.message || 'Formato no soportado'}`);
    } finally {
      setProcesando(false);
    }
  };

  // Cambio de hoja en archivo multi-hoja
  const handleCambiarHoja = async (nuevaHoja: string) => {
    if (!workbook) return;
    setHojaSeleccionada(nuevaHoja);
    setProcesando(true);
    try {
      await procesarHoja(workbook, nuevaHoja);
    } finally {
      setProcesando(false);
    }
  };

  // Edición inline de precio en la previsualización
  const handleIniciarEdicion = (idx: number, precioActual: number) => {
    setEditandoIdx(idx);
    setPrecioEditadoInput(String(precioActual));
  };

  const handleConfirmarEdicion = (idx: number) => {
    const val = parseFloat(precioEditadoInput);
    if (isNaN(val) || val < 0) {
      setEditandoIdx(null);
      return;
    }

    setItems((prev) => {
      const copia = [...prev];
      const item = { ...copia[idx] };
      item.precio = val;
      item.valido = val > 0;
      item.nota = val <= 0 ? 'Precio en $0 o inválido' : undefined;

      if (item.precioActual !== null && item.precioActual !== undefined && item.precioActual > 0) {
        item.diferenciaPorcentaje = ((val - item.precioActual) / item.precioActual) * 100;
      } else {
        item.diferenciaPorcentaje = null;
      }

      copia[idx] = item;
      return copia;
    });
    setEditandoIdx(null);
  };

  // Quitar fila del preview
  const handleEliminarFila = (idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  // 3. Ejecutar Auditoría y Normalización con IA (Opcional)
  const ejecutarAuditoriaIA = async () => {
    if (items.length === 0) return;
    setAuditandoIA(true);
    setMensajeError(null);

    try {
      const { data: dbFiltros } = await supabase
        .from('Tabla A')
        .select('codigo_fhl, equivalencias, precio')
        .eq('eliminado', false);

      const res = await fetch('/api/admin/auditoria-excel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo: 'normalizar_precios',
          filas: items.map((it) => ({ codigo: it.codigoOriginal || it.codigo_fhl, precio: it.precio })),
          catalogoReferencia: dbFiltros || [],
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success && data.auditoria) {
          const itemsNorm: ItemPrecio[] = (data.auditoria.items || []).map((it: any) => {
            const numPrecio = Number(it.precio || 0);
            const originalItem = items.find((orig) => orig.codigo_fhl === it.codigo_fhl);
            const precioActual = originalItem?.precioActual ?? null;
            const diff =
              precioActual !== null && precioActual > 0
                ? ((numPrecio - precioActual) / precioActual) * 100
                : null;

            return {
              codigo_fhl: it.codigo_fhl,
              precio: numPrecio,
              codigoOriginal: it.codigoOriginal,
              fueMapeado: it.fueMapeado ?? false,
              nota: it.nota,
              valido: numPrecio > 0,
              precioActual,
              existeEnCatalogo: originalItem?.existeEnCatalogo ?? true,
              diferenciaPorcentaje: diff,
            };
          });

          setItems(itemsNorm);
          setDiagnosticoIA({
            scoreSalud: data.auditoria.scoreSalud ?? 95,
            dictamen: data.auditoria.dictamen ?? 'Aprobado',
            resumen: data.auditoria.resumen ?? 'Planilla normalizada con éxito por IA.',
            modeloUsado: data.modeloUsado,
          });
        } else {
          throw new Error('Respuesta inválida del auditor IA.');
        }
      } else {
        throw new Error('Error de conexión con el motor de IA.');
      }
    } catch (err: any) {
      console.warn('Fallo en auditoría IA:', err);
      setMensajeError('No se pudo completar la auditoría con IA. Podés importar directamente.');
    } finally {
      setAuditandoIA(false);
    }
  };

  // 4. Descargar Excel Limpio
  const handleDescargarExcelLimpio = () => {
    try {
      const rows = items
        .filter((it) => it.valido)
        .map((it) => ({
          'Filtro': it.codigo_fhl,
          'Precio': it.precio,
          'Precio Anterior': it.precioActual ?? 0,
          'Variacion %': it.diferenciaPorcentaje ? `${it.diferenciaPorcentaje.toFixed(1)}%` : '0%',
        }));

      const ws = XLSX.utils.json_to_sheet(rows);
      ws['!cols'] = [{ wch: 18 }, { wch: 16 }, { wch: 16 }, { wch: 14 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Lista_Precios');
      XLSX.writeFile(wb, `lista_${lista.nombre.toLowerCase().replace(/[^a-z0-9]/g, '_')}.xlsx`);
    } catch (err) {
      console.error('Error al generar Excel:', err);
    }
  };

  // 5. Descargar Plantilla en Blanco
  const handleDescargarPlantilla = async () => {
    try {
      const { data: filtros } = await supabase
        .from('Tabla A')
        .select('codigo_fhl, precio')
        .eq('eliminado', false)
        .order('codigo_fhl', { ascending: true });

      const rows = (filtros || []).map((f) => ({
        'Filtro': f.codigo_fhl || '',
        'Precio': f.precio ? Number(f.precio) : 0,
      }));

      const ws = XLSX.utils.json_to_sheet(rows);
      ws['!cols'] = [{ wch: 18 }, { wch: 16 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Plantilla');
      XLSX.writeFile(wb, `plantilla_${lista.nombre.toLowerCase().replace(/[^a-z0-9]/g, '_')}.xlsx`);
    } catch (err) {
      console.error('Error al generar plantilla:', err);
    }
  };

  // 6. Guardar en Base de Datos (con sincronización rápida por lotes)
  const handleGuardarEnBaseDeDatos = async () => {
    const validos = items.filter((i) => i.valido && i.precio > 0);
    if (validos.length === 0) {
      setMensajeError('No hay ítems válidos para importar.');
      return;
    }

    setGuardando(true);
    setProgreso(0);
    setMensajeError(null);

    try {
      // 1. Consultar códigos existentes en Tabla A para garantizar 0 huérfanos
      const { data: dbFiltros } = await supabase
        .from('Tabla A')
        .select('codigo_fhl')
        .or('eliminado.is.null,eliminado.eq.false');

      const setExistentesA = new Set((dbFiltros || []).map((f) => f.codigo_fhl.trim().toUpperCase()));

      // Insertar en Tabla A aquellos códigos válidos que no existan aún
      const faltantesA = [];
      const codigosFaltantesVistos = new Set<string>();
      for (const item of validos) {
        const cod = item.codigo_fhl.trim().toUpperCase();
        if (!setExistentesA.has(cod) && !codigosFaltantesVistos.has(cod)) {
          codigosFaltantesVistos.add(cod);
          faltantesA.push({
            codigo_fhl: cod,
            precio: item.precio,
            activo: false,
            eliminado: false,
          });
        }
      }

      if (faltantesA.length > 0) {
        const { error: errInsertA } = await supabase.from('Tabla A').insert(faltantesA);
        if (errInsertA) console.warn('Aviso al dar de alta filtros en Tabla A:', errInsertA.message);
      }

      // 2. Guardar en items_lista_precio
      if (modoCarga === 'reemplazar') {
        const { error: errDel } = await supabase
          .from('items_lista_precio')
          .delete()
          .eq('lista_id', lista.id);

        if (errDel) throw errDel;
      }

      const batchSize = 200;
      const totalLotes = Math.ceil(validos.length / batchSize);

      for (let i = 0; i < totalLotes; i++) {
        const lote = validos.slice(i * batchSize, (i + 1) * batchSize).map((item) => ({
          lista_id: lista.id,
          codigo_fhl: item.codigo_fhl.trim().toUpperCase(),
          precio: item.precio,
        }));

        const { error: errUpsert } = await supabase
          .from('items_lista_precio')
          .upsert(lote, { onConflict: 'lista_id,codigo_fhl' });

        if (errUpsert) throw errUpsert;

        setProgreso(Math.round(((i + 1) / totalLotes) * 70));
      }

      // 3. Si lista es Mayorista Base, sincronizar Tabla A.precio en lotes de 25 en paralelo
      if (lista.nombre.toLowerCase().trim().includes('mayorista base')) {
        const batchSizeA = 25;
        for (let i = 0; i < validos.length; i += batchSizeA) {
          const chunk = validos.slice(i, i + batchSizeA);
          await Promise.all(
            chunk.map((item) =>
              supabase
                .from('Tabla A')
                .update({ precio: item.precio })
                .eq('codigo_fhl', item.codigo_fhl.trim().toUpperCase())
            )
          );
          setProgreso(70 + Math.round(((i + chunk.length) / validos.length) * 30));
        }
      } else {
        setProgreso(100);
      }

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

  // Filtrado de items
  const itemsFiltrados = items.filter((it) => {
    // Filtro por texto
    if (filtroBusqueda) {
      const q = filtroBusqueda.toLowerCase().trim();
      const matchCod = it.codigo_fhl.toLowerCase().includes(q);
      const matchOrig = it.codigoOriginal && it.codigoOriginal.toLowerCase().includes(q);
      if (!matchCod && !matchOrig) return false;
    }

    // Filtro rápido de estado
    if (filtroEstado === 'cambios') {
      return (
        it.precioActual !== null &&
        it.precioActual !== undefined &&
        Math.abs(it.precio - it.precioActual) > 0.01
      );
    }
    if (filtroEstado === 'nuevos') {
      return it.precioActual === null || it.precioActual === undefined || !it.existeEnCatalogo;
    }
    if (filtroEstado === 'invalidos') {
      return !it.valido || it.precio <= 0;
    }

    return true;
  });

  const limiteMostrar = mostrarTodas ? itemsFiltrados.length : 150;
  const itemsMostrados = itemsFiltrados.slice(0, limiteMostrar);

  const totalValidos = items.filter((i) => i.valido).length;
  const totalInvalidos = items.filter((i) => !i.valido || i.precio <= 0).length;
  const totalConCambios = items.filter(
    (i) =>
      i.precioActual !== null &&
      i.precioActual !== undefined &&
      Math.abs(i.precio - i.precioActual) > 0.01
  ).length;
  const totalNuevos = items.filter(
    (i) => i.precioActual === null || i.precioActual === undefined || !i.existeEnCatalogo
  ).length;
  const totalMapeados = items.filter((i) => i.fueMapeado).length;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-excel-title"
        className="bg-white rounded-xl shadow-2xl max-w-4xl w-full p-6 animate-in zoom-in-95 duration-150 border border-slate-200 my-8 flex flex-col max-h-[90vh]"
      >
        {/* Encabezado */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-blue-900 uppercase tracking-widest bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                Lista de Precios
              </span>
              <span className="text-xs font-bold text-slate-800">
                {lista.nombre}
              </span>
            </div>
            <h2 id="modal-excel-title" className="text-base font-black text-slate-900 mt-1">
              Importar Precios desde Excel / CSV
            </h2>
          </div>

          <button
            type="button"
            onClick={onCerrar}
            disabled={guardando || auditandoIA}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-md hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* CONTENIDO PRINCIPAL */}
        <div className="flex-1 overflow-y-auto space-y-4 pr-1">

          {/* Si aún no se cargó nada: Mostrar zona de carga con Drag & Drop real */}
          {items.length === 0 ? (
            <div className="space-y-4">
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setArrastrando(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setArrastrando(false);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setArrastrando(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f) procesarArchivoExcel(f);
                }}
                className={`border-2 border-dashed rounded-xl p-8 text-center transition-all ${
                  arrastrando
                    ? 'border-blue-600 bg-blue-50/80 scale-[1.01]'
                    : 'border-slate-300 hover:border-blue-800 bg-slate-50/50'
                }`}
              >
                <input
                  type="file"
                  id="input-excel-lista"
                  accept=".xlsx,.xls,.csv"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) procesarArchivoExcel(f);
                  }}
                  className="hidden"
                />
                <label htmlFor="input-excel-lista" className="cursor-pointer flex flex-col items-center justify-center space-y-3">
                  <div className={`p-4 rounded-full transition-colors ${arrastrando ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-900'}`}>
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                  </div>
                  <span className="text-sm font-bold text-slate-800">
                    {procesando
                      ? 'Leyendo planilla...'
                      : arrastrando
                      ? 'Soltá tu archivo aquí'
                      : 'Hacé clic para seleccionar tu archivo Excel (.xlsx / .csv) o arrastralo aquí'}
                  </span>
                  <span className="text-xs text-slate-500">
                    Detecta automáticamente columnas de código (FHL o equivalencias) y precios.
                  </span>
                </label>
              </div>

              {/* Descargar Plantilla */}
              <div className="flex items-center justify-between p-3.5 bg-blue-50/60 rounded-lg border border-blue-100 text-xs">
                <div className="space-y-0.5">
                  <span className="font-bold text-blue-900 block">
                    ¿Querés una plantilla en blanco con todos tus códigos FHL?
                  </span>
                  <span className="text-slate-600">
                    Descargá un Excel con el catálogo actual para colocar los precios a mano.
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
            </div>
          ) : (
            /* Si ya se cargaron items: Mostrar Previsualización completa y acciones */
            <div className="space-y-4">
              {/* Barra Multi-Hoja (si el archivo tiene > 1 hoja) */}
              {hojas.length > 1 && (
                <div className="bg-blue-50/70 border border-blue-200 rounded-lg p-3 flex items-center justify-between gap-3 text-xs flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-blue-900">📑 Este archivo tiene {hojas.length} pestañas:</span>
                    <span className="text-slate-600">Seleccioná la hoja que contiene la lista de precios:</span>
                  </div>
                  <select
                    value={hojaSeleccionada}
                    onChange={(e) => handleCambiarHoja(e.target.value)}
                    disabled={procesando}
                    className="border border-blue-300 rounded px-2.5 py-1 text-xs font-bold text-blue-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-900 cursor-pointer"
                  >
                    {hojas.map((h) => (
                      <option key={h} value={h}>
                        Hoja: {h}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Badges de Resumen + Botón Opcional IA */}
              <div className="flex items-center justify-between gap-3 flex-wrap bg-slate-50 p-3 rounded-xl border border-slate-200">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs font-bold bg-slate-200 text-slate-800 px-2.5 py-1 rounded-md">
                    Total: {items.length}
                  </span>
                  <span className="text-xs font-bold bg-green-100 text-green-800 px-2.5 py-1 rounded-md">
                    ✓ {totalValidos} válidos
                  </span>
                  {totalConCambios > 0 && (
                    <span className="text-xs font-bold bg-amber-100 text-amber-900 px-2.5 py-1 rounded-md">
                      ⚡ {totalConCambios} cambian de precio
                    </span>
                  )}
                  {totalNuevos > 0 && (
                    <span className="text-xs font-bold bg-purple-100 text-purple-900 px-2.5 py-1 rounded-md">
                      + {totalNuevos} nuevos en lista
                    </span>
                  )}
                  {totalInvalidos > 0 && (
                    <span className="text-xs font-bold bg-red-100 text-red-800 px-2.5 py-1 rounded-md">
                      ⚠️ {totalInvalidos} en $0
                    </span>
                  )}
                  {totalMapeados > 0 && (
                    <span className="text-xs font-bold bg-blue-100 text-blue-900 px-2.5 py-1 rounded-md">
                      ✨ {totalMapeados} mapeados
                    </span>
                  )}
                </div>

                {/* Botón OPCIONAL de Auditoría IA */}
                <button
                  type="button"
                  onClick={ejecutarAuditoriaIA}
                  disabled={auditandoIA}
                  className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border border-indigo-200 rounded-lg text-xs font-bold transition-all shadow-2xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  title="Cruza equivalencias de Mann, Wega, Fram y limpia precios con GLM 5.2"
                >
                  {auditandoIA ? (
                    <>
                      <div className="h-3.5 w-3.5 border-2 border-indigo-900 border-t-transparent rounded-full animate-spin" />
                      <span>Auditando con GLM 5.2...</span>
                    </>
                  ) : (
                    <>
                      <span>✨ Auditar y Normalizar con IA</span>
                    </>
                  )}
                </button>
              </div>

              {/* Diagnóstico IA si se ejecutó */}
              {diagnosticoIA && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl space-y-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-black text-emerald-950">
                      Diagnóstico IA: {diagnosticoIA.dictamen} ({diagnosticoIA.scoreSalud}% de salud)
                    </span>
                    <span className="text-[10px] text-emerald-800 font-bold">
                      Motor: {diagnosticoIA.modeloUsado?.includes('glm') ? 'Z.ai GLM 5.2' : 'Nemotron Super 120B'}
                    </span>
                  </div>
                  <p className="text-slate-700 font-medium">
                    {diagnosticoIA.resumen}
                  </p>
                </div>
              )}

              {/* Opciones de carga */}
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1.5">
                <span className="text-xs font-bold text-slate-700 block">Modo de actualización:</span>
                <div className="flex items-center gap-4 flex-wrap text-xs font-semibold text-slate-800">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="modoCarga"
                      checked={modoCarga === 'reemplazar'}
                      onChange={() => setModoCarga('reemplazar')}
                      className="text-blue-900 focus:ring-blue-900"
                    />
                    <span>Reemplazar lista completa ({totalValidos} ítems)</span>
                  </label>

                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="modoCarga"
                      checked={modoCarga === 'merge'}
                      onChange={() => setModoCarga('merge')}
                      className="text-blue-900 focus:ring-blue-900"
                    />
                    <span>Actualizar/Agregar solo estos códigos</span>
                  </label>
                </div>
              </div>

              {/* Filtros Rápidos y Buscador */}
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setFiltroEstado('todos')}
                    className={`px-2.5 py-1 rounded text-xs font-bold transition-colors cursor-pointer ${
                      filtroEstado === 'todos'
                        ? 'bg-blue-900 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    Todos ({items.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setFiltroEstado('cambios')}
                    className={`px-2.5 py-1 rounded text-xs font-bold transition-colors cursor-pointer ${
                      filtroEstado === 'cambios'
                        ? 'bg-amber-600 text-white'
                        : 'bg-amber-50 text-amber-900 hover:bg-amber-100'
                    }`}
                  >
                    Con Cambios ({totalConCambios})
                  </button>
                  <button
                    type="button"
                    onClick={() => setFiltroEstado('nuevos')}
                    className={`px-2.5 py-1 rounded text-xs font-bold transition-colors cursor-pointer ${
                      filtroEstado === 'nuevos'
                        ? 'bg-purple-700 text-white'
                        : 'bg-purple-50 text-purple-900 hover:bg-purple-100'
                    }`}
                  >
                    Nuevos ({totalNuevos})
                  </button>
                  <button
                    type="button"
                    onClick={() => setFiltroEstado('invalidos')}
                    className={`px-2.5 py-1 rounded text-xs font-bold transition-colors cursor-pointer ${
                      filtroEstado === 'invalidos'
                        ? 'bg-red-700 text-white'
                        : 'bg-red-50 text-red-900 hover:bg-red-100'
                    }`}
                  >
                    $0 / Inválidos ({totalInvalidos})
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Buscar código en la lista..."
                    value={filtroBusqueda}
                    onChange={(e) => setFiltroBusqueda(e.target.value)}
                    className="px-3 py-1 text-xs bg-white border border-slate-300 rounded-md w-48 font-bold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-900"
                  />
                  <span className="text-[11px] text-slate-500 font-medium">
                    {itemsFiltrados.length} fila(s)
                  </span>
                </div>
              </div>

              {/* Tabla de Preview con Edición Inline y Exclusión */}
              <div className="max-h-72 overflow-y-auto border border-slate-200 rounded-lg">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold sticky top-0 uppercase tracking-wider">
                    <tr>
                      <th className="p-2.5">Código FHL</th>
                      <th className="p-2.5">Origen / Catálogo</th>
                      <th className="p-2.5 text-right">Precio Actual</th>
                      <th className="p-2.5 text-right">Nuevo Precio (Excel)</th>
                      <th className="p-2.5 text-center">Variación</th>
                      <th className="p-2.5 text-center">Estado</th>
                      <th className="p-2.5 text-center w-12">Quitar</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {itemsMostrados.map((it, idx) => (
                      <tr key={`${it.codigo_fhl}-${idx}`} className="hover:bg-slate-50 transition-colors">
                        <td className="p-2 font-bold font-mono text-slate-900">
                          {it.codigo_fhl}
                        </td>
                        <td className="p-2 text-slate-500">
                          {it.fueMapeado ? (
                            <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded">
                              ✨ Mapeado: {it.codigoOriginal}
                            </span>
                          ) : it.existeEnCatalogo ? (
                            <span className="text-[11px] text-slate-500">En catálogo</span>
                          ) : (
                            <span className="text-[10px] font-bold text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded">
                              + Se creará en Catálogo
                            </span>
                          )}
                        </td>
                        <td className="p-2 text-right font-mono text-slate-500 font-medium">
                          {it.precioActual !== null && it.precioActual !== undefined
                            ? `$${it.precioActual.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
                            : <span className="text-slate-400 italic">Sin precio</span>}
                        </td>
                        <td className="p-2 text-right">
                          {editandoIdx === idx ? (
                            <div className="flex items-center justify-end gap-1">
                              <span className="text-slate-400 font-mono">$</span>
                              <input
                                type="number"
                                step="0.01"
                                autoFocus
                                value={precioEditadoInput}
                                onChange={(e) => setPrecioEditadoInput(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleConfirmarEdicion(idx);
                                  if (e.key === 'Escape') setEditandoIdx(null);
                                }}
                                onBlur={() => handleConfirmarEdicion(idx)}
                                className="w-24 px-1.5 py-0.5 border border-blue-600 rounded text-xs font-mono font-bold text-slate-900 bg-white"
                              />
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleIniciarEdicion(idx, it.precio)}
                              className="font-black font-mono text-blue-900 hover:text-blue-700 hover:underline cursor-pointer"
                              title="Hacé clic para editar este precio"
                            >
                              ${it.precio.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                            </button>
                          )}
                        </td>
                        <td className="p-2 text-center font-mono font-bold">
                          {it.diferenciaPorcentaje !== null && it.diferenciaPorcentaje !== undefined ? (
                            it.diferenciaPorcentaje > 0 ? (
                              <span className="text-[10px] text-green-700 bg-green-50 px-1.5 py-0.5 rounded">
                                +{it.diferenciaPorcentaje.toFixed(1)}%
                              </span>
                            ) : it.diferenciaPorcentaje < 0 ? (
                              <span className="text-[10px] text-red-700 bg-red-50 px-1.5 py-0.5 rounded">
                                {it.diferenciaPorcentaje.toFixed(1)}%
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-400">0%</span>
                            )
                          ) : (
                            <span className="text-[10px] text-slate-400">—</span>
                          )}
                        </td>
                        <td className="p-2 text-center">
                          {it.valido ? (
                            <span className="text-[10px] font-bold text-green-700 bg-green-50 px-1.5 py-0.5 rounded">
                              Válido
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold text-red-700 bg-red-50 px-1.5 py-0.5 rounded">
                              {it.nota || 'Precio $0'}
                            </span>
                          )}
                        </td>
                        <td className="p-2 text-center">
                          <button
                            type="button"
                            onClick={() => handleEliminarFila(idx)}
                            className="text-slate-400 hover:text-red-600 p-1 rounded hover:bg-slate-100 transition-colors cursor-pointer"
                            title="Quitar este filtro de la importación"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                              <line x1="18" y1="6" x2="6" y2="18" />
                              <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Botón para ver todas si son más de 150 */}
              {itemsFiltrados.length > 150 && !mostrarTodas && (
                <div className="text-center pt-1">
                  <button
                    type="button"
                    onClick={() => setMostrarTodas(true)}
                    className="text-xs font-bold text-blue-900 hover:underline cursor-pointer bg-blue-50 px-3 py-1 rounded-md border border-blue-200"
                  >
                    Ver todas las {itemsFiltrados.length} filas completas
                  </button>
                </div>
              )}

              {/* Progreso al Guardar */}
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
            </div>
          )}

          {/* Mensaje de error general */}
          {mensajeError && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-800 text-xs font-bold rounded-md">
              {mensajeError}
            </div>
          )}
        </div>

        {/* PIE DE ACCIONES */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-100 mt-4 flex-wrap gap-2">
          {items.length > 0 ? (
            <>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setItems([]);
                    setArchivo(null);
                    setWorkbook(null);
                    setHojas([]);
                    setHojaSeleccionada('');
                    setDiagnosticoIA(null);
                  }}
                  disabled={guardando}
                  className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-md transition-colors cursor-pointer"
                >
                  ← Cambiar Archivo
                </button>

                <button
                  type="button"
                  onClick={handleDescargarExcelLimpio}
                  disabled={guardando || totalValidos === 0}
                  className="px-3.5 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-800 font-bold text-xs rounded-md transition-colors cursor-pointer flex items-center gap-1.5 shadow-2xs"
                  title="Descargar esta lista en formato Excel (.xlsx)"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  <span>Descargar Excel Limpio (.xlsx)</span>
                </button>
              </div>

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
            </>
          ) : (
            <div className="flex items-center justify-end w-full">
              <button
                type="button"
                onClick={onCerrar}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-md transition-colors cursor-pointer"
              >
                Cancelar
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

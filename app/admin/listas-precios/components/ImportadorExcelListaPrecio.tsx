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
  const [metodoEntrada, setMetodoEntrada] = useState<'archivo' | 'texto'>('archivo');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [textoPegado, setTextoPegado] = useState('');
  const [procesando, setProcesando] = useState(false);
  const [auditandoIA, setAuditandoIA] = useState(false);

  // Lista de items cargados
  const [items, setItems] = useState<ItemPrecio[]>([]);
  const [diagnosticoIA, setDiagnosticoIA] = useState<DiagnosticoAuditoria | null>(null);

  // Opciones de importación
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

  // 1. Procesar archivo Excel
  const procesarArchivoExcel = async (file: File) => {
    setArchivo(file);
    setProcesando(true);
    setMensajeError(null);
    setDiagnosticoIA(null);

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
        setMensajeError('No se pudieron detectar las columnas de Código y Precio en el Excel.');
        setProcesando(false);
        return;
      }

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

        listaParsed.push({
          codigo_fhl: codUpper,
          precio: precioNum,
          codigoOriginal: rawCod,
          valido: precioNum > 0,
          nota: precioNum <= 0 ? 'Precio en $0 o inválido' : undefined,
        });
      }

      if (listaParsed.length === 0) {
        setMensajeError('No se encontraron filas con códigos y precios válidos.');
      } else {
        setItems(listaParsed);
      }
    } catch (err: any) {
      console.error(err);
      setMensajeError(`Error al leer archivo: ${err.message || 'Formato no soportado'}`);
    } finally {
      setProcesando(false);
    }
  };

  // 2. Procesar texto pegado
  const procesarTextoPegado = () => {
    if (!textoPegado.trim()) {
      setMensajeError('Por favor pegá una lista de precios o texto con códigos.');
      return;
    }

    setProcesando(true);
    setMensajeError(null);
    setDiagnosticoIA(null);

    try {
      const lineas = textoPegado.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      const listaParsed: ItemPrecio[] = [];
      const codigosVistos = new Set<string>();

      for (const linea of lineas) {
        const tokens = linea.split(/[\t:;,|=]+/).map((t) => t.trim()).filter(Boolean);
        if (tokens.length >= 2) {
          const rawCod = tokens[0];
          const rawPrecio = tokens[tokens.length - 1];
          const precioNum = limpiarPrecio(rawPrecio);
          const codUpper = rawCod.toUpperCase();

          if (!codigosVistos.has(codUpper)) {
            codigosVistos.add(codUpper);
            listaParsed.push({
              codigo_fhl: codUpper,
              precio: precioNum,
              codigoOriginal: rawCod,
              valido: precioNum > 0,
              nota: precioNum <= 0 ? 'Precio en $0 o inválido' : undefined,
            });
          }
        } else {
          const match = linea.match(/([a-zA-Z0-9\-_ ]+?)[\s$]+(\d+[\d.,]*)/);
          if (match) {
            const rawCod = match[1].trim();
            const precioNum = limpiarPrecio(match[2]);
            const codUpper = rawCod.toUpperCase();
            if (!codigosVistos.has(codUpper)) {
              codigosVistos.add(codUpper);
              listaParsed.push({
                codigo_fhl: codUpper,
                precio: precioNum,
                codigoOriginal: rawCod,
                valido: precioNum > 0,
                nota: precioNum <= 0 ? 'Precio en $0' : undefined,
              });
            }
          }
        }
      }

      if (listaParsed.length === 0) {
        setMensajeError('No pudimos extraer códigos y precios del texto. Asegurate de incluir código y precio por línea.');
      } else {
        setItems(listaParsed);
      }
    } catch (err: any) {
      setMensajeError('Error al procesar el texto: ' + err.message);
    } finally {
      setProcesando(false);
    }
  };

  // 3. Ejecutar Auditoría y Normalización con IA (Opcional - GLM 5.2 con 10 reintentos)
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
          const itemsNorm: ItemPrecio[] = (data.auditoria.items || []).map((it: any) => ({
            codigo_fhl: it.codigo_fhl,
            precio: Number(it.precio || 0),
            codigoOriginal: it.codigoOriginal,
            fueMapeado: it.fueMapeado ?? false,
            nota: it.nota,
            valido: Number(it.precio || 0) > 0,
          }));

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
        }));

      const ws = XLSX.utils.json_to_sheet(rows);
      ws['!cols'] = [{ wch: 18 }, { wch: 16 }];
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

  // 6. Guardar en Base de Datos
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
          codigo_fhl: item.codigo_fhl,
          precio: item.precio,
        }));

        const { error: errUpsert } = await supabase
          .from('items_lista_precio')
          .upsert(lote, { onConflict: 'lista_id,codigo_fhl' });

        if (errUpsert) throw errUpsert;

        setProgreso(Math.round(((i + 1) / totalLotes) * 100));
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

  const itemsMostrados = items.filter((it) =>
    !filtroBusqueda ||
    it.codigo_fhl.toLowerCase().includes(filtroBusqueda.toLowerCase().trim()) ||
    (it.codigoOriginal && it.codigoOriginal.toLowerCase().includes(filtroBusqueda.toLowerCase().trim()))
  );

  const totalValidos = items.filter((i) => i.valido).length;
  const totalInvalidos = items.length - totalValidos;
  const totalMapeados = items.filter((i) => i.fueMapeado).length;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-excel-title"
        className="bg-white rounded-xl shadow-2xl max-w-3xl w-full p-6 animate-in zoom-in-95 duration-150 border border-slate-200 my-8 flex flex-col max-h-[90vh]"
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
              Cargar Precios por Excel o Texto
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

          {/* Si aún no se cargó nada: Mostrar zona de carga */}
          {items.length === 0 ? (
            <div className="space-y-4">
              <div className="flex border-b border-slate-200 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setMetodoEntrada('archivo')}
                  className={`px-4 py-2 border-b-2 transition-colors cursor-pointer ${
                    metodoEntrada === 'archivo'
                      ? 'border-blue-900 text-blue-900 bg-blue-50/50'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  📁 Subir Archivo Excel (.xlsx / .csv)
                </button>
                <button
                  type="button"
                  onClick={() => setMetodoEntrada('texto')}
                  className={`px-4 py-2 border-b-2 transition-colors cursor-pointer ${
                    metodoEntrada === 'texto'
                      ? 'border-blue-900 text-blue-900 bg-blue-50/50'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  💬 Pegar Texto / WhatsApp
                </button>
              </div>

              {metodoEntrada === 'archivo' ? (
                <div className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center hover:border-blue-800 transition-colors bg-slate-50/50">
                  <input
                    type="file"
                    id="input-excel-lista"
                    accept=".xlsx,.xls,.csv"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) {
                        procesarArchivoExcel(f);
                      }
                    }}
                    className="hidden"
                  />
                  <label htmlFor="input-excel-lista" className="cursor-pointer flex flex-col items-center justify-center space-y-3">
                    <div className="p-4 bg-blue-50 text-blue-900 rounded-full">
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="17 8 12 3 7 8" />
                        <line x1="12" y1="3" x2="12" y2="15" />
                      </svg>
                    </div>
                    <span className="text-sm font-bold text-slate-800">
                      {procesando ? 'Leyendo planilla...' : 'Hacé clic para seleccionar tu Excel o arrastralo aquí'}
                    </span>
                    <span className="text-xs text-slate-500">
                      Cualquier archivo con columnas de código y precio.
                    </span>
                  </label>
                </div>
              ) : (
                <div className="space-y-3">
                  <label className="text-xs font-bold text-slate-700 block">
                    Pegá acá la lista copiada de WhatsApp o correo electrónico:
                  </label>
                  <textarea
                    rows={6}
                    value={textoPegado}
                    onChange={(e) => setTextoPegado(e.target.value)}
                    placeholder={"Ejemplo:\nFHL-101: $2.500\nFHL-251\t4.100\n103 - 2067\nCU 22 032: 3200"}
                    className="w-full font-mono text-xs p-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-900 bg-slate-50 focus:bg-white"
                  />
                  <button
                    type="button"
                    onClick={procesarTextoPegado}
                    disabled={procesando || !textoPegado.trim()}
                    className="w-full py-2.5 bg-blue-900 hover:bg-blue-800 text-white font-bold text-xs rounded-lg transition-colors cursor-pointer shadow-xs disabled:opacity-50"
                  >
                    {procesando ? 'Procesando texto...' : 'Analizar Texto y Mostrar Previsualización'}
                  </button>
                </div>
              )}

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
              {/* Badges de Resumen + Botón Opcional IA */}
              <div className="flex items-center justify-between gap-3 flex-wrap bg-slate-50 p-3 rounded-xl border border-slate-200">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold bg-slate-200 text-slate-800 px-2.5 py-1 rounded-md">
                    Total: {items.length} filas
                  </span>
                  <span className="text-xs font-bold bg-green-100 text-green-800 px-2.5 py-1 rounded-md">
                    ✓ {totalValidos} válidos
                  </span>
                  {totalInvalidos > 0 && (
                    <span className="text-xs font-bold bg-red-100 text-red-800 px-2.5 py-1 rounded-md">
                      ⚠️ {totalInvalidos} en $0
                    </span>
                  )}
                  {totalMapeados > 0 && (
                    <span className="text-xs font-bold bg-blue-100 text-blue-900 px-2.5 py-1 rounded-md">
                      ✨ {totalMapeados} mapeados por IA
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
                      <span>✨ Auditar y Normalizar con IA (Opcional)</span>
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

              {/* Buscador */}
              <div className="flex items-center justify-between gap-2">
                <input
                  type="text"
                  placeholder="Buscar código en la lista..."
                  value={filtroBusqueda}
                  onChange={(e) => setFiltroBusqueda(e.target.value)}
                  className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-md w-full max-w-xs font-bold focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-900"
                />
                <span className="text-xs text-slate-500 font-medium">
                  Mostrando {itemsMostrados.length} filas
                </span>
              </div>

              {/* Tabla de Preview */}
              <div className="max-h-60 overflow-y-auto border border-slate-200 rounded-lg">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold sticky top-0 uppercase tracking-wider">
                    <tr>
                      <th className="p-2.5">Código FHL</th>
                      <th className="p-2.5">Origen / Mapeo</th>
                      <th className="p-2.5 text-right">Precio</th>
                      <th className="p-2.5 text-center">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {itemsMostrados.slice(0, 50).map((it, idx) => (
                      <tr key={`${it.codigo_fhl}-${idx}`} className="hover:bg-slate-50">
                        <td className="p-2.5 font-bold font-mono text-slate-900">{it.codigo_fhl}</td>
                        <td className="p-2.5 text-slate-500">
                          {it.fueMapeado ? (
                            <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded">
                              ✨ Mapeado de: {it.codigoOriginal}
                            </span>
                          ) : (
                            <span className="text-[11px] text-slate-400">Directo</span>
                          )}
                        </td>
                        <td className="p-2.5 text-right font-black font-mono text-blue-900">
                          ${it.precio.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="p-2.5 text-center">
                          {it.valido ? (
                            <span className="text-[10px] font-bold text-green-700 bg-green-50 px-2 py-0.5 rounded">
                              Válido
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold text-red-700 bg-red-50 px-2 py-0.5 rounded">
                              {it.nota || 'Precio $0'}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {itemsMostrados.length > 50 && (
                <p className="text-[11px] text-slate-400 text-center italic">
                  ... y {(itemsMostrados.length - 50).toLocaleString('es-AR')} productos más.
                </p>
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

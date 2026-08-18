'use client';

import { useState } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '@/lib/supabase';
import type { Filtro, Vehiculo } from '@/lib/types';

interface ImportadorExcelProps {
  tipo: 'filtros' | 'vehiculos';
  onFinalizado: () => void;
  onCerrar: () => void;
}

interface FilaPreviewFiltro {
  tipoAccion: 'nuevo' | 'actualizar' | 'sin_cambios' | 'error';
  errorMsg?: string;
  codigo_fhl: string;
  equivalencias: string | null;
  dimensiones: string | null;
  descripcion_aplicacion: string | null;
  precio?: number;
  activo?: boolean;
}

interface FilaPreviewVehiculo {
  tipoAccion: 'nuevo' | 'actualizar' | 'sin_cambios' | 'error';
  errorMsg?: string;
  marca: string;
  modelo: string;
  version: string | null;
  año: string | null;
  filtro_asociado: string;
}

interface AlertaAuditoria {
  index: number;
  codigo: string;
  tipo: 'precio' | 'dimensiones' | 'codigo' | 'vehiculo' | 'inconsistencia';
  severidad: 'baja' | 'media' | 'alta';
  mensaje: string;
  sugerencia: string;
}

interface ResultadoAuditoriaIA {
  scoreSalud: number;
  dictamen: 'Aprobado' | 'Advertencias' | 'Riesgoso';
  resumen: string;
  totalFilas: number;
  totalAlertas: number;
  filasConAlerta: AlertaAuditoria[];
  recomendaciones: string[];
}

export default function ImportadorExcel({ tipo, onFinalizado, onCerrar }: ImportadorExcelProps) {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [procesando, setProcesando] = useState(false);
  const [importando, setImportando] = useState(false);
  const [auditandoIA, setAuditandoIA] = useState(false);
  const [auditoriaIA, setAuditoriaIA] = useState<ResultadoAuditoriaIA | null>(null);
  const [filasFiltros, setFilasFiltros] = useState<FilaPreviewFiltro[]>([]);
  const [filasVehiculos, setFilasVehiculos] = useState<FilaPreviewVehiculo[]>([]);
  const [resultadoFinal, setResultadoFinal] = useState<string | null>(null);
  const [errorGlobal, setErrorGlobal] = useState<string | null>(null);

  const normalizarClave = (str: string) => {
    return str
      .toLowerCase()
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '');
  };

  const procesarArchivo = async (file: File) => {
    setArchivo(file);
    setProcesando(true);
    setErrorGlobal(null);
    setResultadoFinal(null);

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const firstSheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[firstSheetName];
      const rawRows: Record<string, any>[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

      if (rawRows.length === 0) {
        setErrorGlobal('El archivo seleccionado está vacío.');
        setProcesando(false);
        return;
      }

      if (tipo === 'filtros') {
        // Obtener filtros existentes de la DB para comparar
        const { data: dbFiltros } = await supabase.from('Tabla A').select('codigo_fhl, equivalencias, dimensiones, descripcion_aplicacion, precio, activo');
        const dbMap = new Map<string, Filtro>();
        if (dbFiltros) {
          dbFiltros.forEach((f: any) => dbMap.set(f.codigo_fhl.trim().toUpperCase(), f));
        }

        const preview: FilaPreviewFiltro[] = [];

        rawRows.forEach((row) => {
          let codigo = '';
          let equiv: string | null = null;
          let dim: string | null = null;
          let desc: string | null = null;
          let precioVal: number = 0;
          let activoVal: boolean = true;

          Object.keys(row).forEach((col) => {
            const keyNorm = normalizarClave(col);
            const rawVal = row[col];
            const val = String(rawVal ?? '').trim();

            if (keyNorm.includes('codigo') || keyNorm === 'fhl' || keyNorm === 'filtro') {
              codigo = val;
            } else if (keyNorm.includes('equiv') || keyNorm.includes('cruzad') || keyNorm.includes('oem')) {
              equiv = val || null;
            } else if (keyNorm.includes('dimen') || keyNorm.includes('medida')) {
              dim = val || null;
            } else if (keyNorm.includes('desc') || keyNorm.includes('aplica') || keyNorm.includes('detalle')) {
              desc = val || null;
            } else if (keyNorm.includes('precio') || keyNorm.includes('costo') || keyNorm.includes('valor') || keyNorm.includes('importe')) {
              const parsed = typeof rawVal === 'number' ? rawVal : parseFloat(val.replace(/[^0-9.,]/g, '').replace(',', '.'));
              if (!isNaN(parsed) && parsed >= 0) precioVal = parsed;
            } else if (keyNorm.includes('activo') || keyNorm.includes('visible') || keyNorm.includes('mostrar') || keyNorm.includes('habilitado')) {
              const lower = val.toLowerCase();
              if (lower === 'no' || lower === 'false' || lower === '0' || lower === 'oculto' || lower === 'inactivo') {
                activoVal = false;
              } else {
                activoVal = true;
              }
            }
          });

          if (!codigo) {
            preview.push({
              tipoAccion: 'error',
              errorMsg: 'Código FHL vacío',
              codigo_fhl: '—',
              equivalencias: equiv,
              dimensiones: dim,
              descripcion_aplicacion: desc,
              precio: precioVal,
              activo: activoVal,
            });
            return;
          }

          const codigoUpper = codigo.toUpperCase();
          const existente = dbMap.get(codigoUpper);

          if (!existente) {
            preview.push({
              tipoAccion: 'nuevo',
              codigo_fhl: codigoUpper,
              equivalencias: equiv,
              dimensiones: dim,
              descripcion_aplicacion: desc,
              precio: precioVal,
              activo: activoVal,
            });
          } else {
            const cambio =
              (equiv ?? '') !== (existente.equivalencias ?? '') ||
              (dim ?? '') !== (existente.dimensiones ?? '') ||
              (desc ?? '') !== (existente.descripcion_aplicacion ?? '') ||
              precioVal !== Number(existente.precio || 0) ||
              activoVal !== (existente.activo !== false);

            preview.push({
              tipoAccion: cambio ? 'actualizar' : 'sin_cambios',
              codigo_fhl: codigoUpper,
              equivalencias: equiv,
              dimensiones: dim,
              descripcion_aplicacion: desc,
              precio: precioVal,
              activo: activoVal,
            });
          }
        });

        setFilasFiltros(preview);
        ejecutarAuditoriaIA(preview);
      } else {
        // Vehículos (Tabla B)
        const { data: dbVehiculos } = await supabase.from('Tabla B').select('*');
        const preview: FilaPreviewVehiculo[] = [];

        rawRows.forEach((row) => {
          let marca = '';
          let modelo = '';
          let version: string | null = null;
          let anio: string | null = null;
          let filtro = '';

          Object.keys(row).forEach((col) => {
            const keyNorm = normalizarClave(col);
            const val = String(row[col] ?? '').trim();

            if (keyNorm.includes('marca')) {
              marca = val;
            } else if (keyNorm.includes('modelo')) {
              modelo = val;
            } else if (keyNorm.includes('ver') || keyNorm.includes('motor')) {
              version = val || null;
            } else if (keyNorm.includes('ano') || keyNorm.includes('anio') || keyNorm.includes('year')) {
              anio = val || null;
            } else if (keyNorm.includes('filtro') || keyNorm.includes('codigo') || keyNorm.includes('fhl')) {
              filtro = val;
            }
          });

          if (!marca || !modelo || !filtro) {
            preview.push({
              tipoAccion: 'error',
              errorMsg: 'Faltan campos requeridos (marca, modelo o filtro)',
              marca: marca || '—',
              modelo: modelo || '—',
              version,
              año: anio,
              filtro_asociado: filtro || '—',
            });
            return;
          }

          const existe = dbVehiculos?.some(
            (v: any) =>
              v.marca?.toUpperCase() === marca.toUpperCase() &&
              v.modelo?.toUpperCase() === modelo.toUpperCase() &&
              (v.version ?? '') === (version ?? '') &&
              (v.filtro_asociado ?? '').toUpperCase() === filtro.toUpperCase()
          );

          preview.push({
            tipoAccion: existe ? 'sin_cambios' : 'nuevo',
            marca: marca.toUpperCase(),
            modelo: modelo.toUpperCase(),
            version,
            año: anio,
            filtro_asociado: filtro.toUpperCase(),
          });
        });

        setFilasVehiculos(preview);
        ejecutarAuditoriaIA(preview);
      }
    } catch (err: any) {
      console.error(err);
      setErrorGlobal(err.message || 'Error al procesar el archivo');
    } finally {
      setProcesando(false);
    }
  };

  const ejecutarAuditoriaIA = async (filasParaAuditar: any[]) => {
    if (!filasParaAuditar || filasParaAuditar.length === 0) return;
    setAuditandoIA(true);
    try {
      const res = await fetch('/api/admin/auditoria-excel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo, filas: filasParaAuditar }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.auditoria) {
          setAuditoriaIA(data.auditoria);
        }
      }
    } catch (e) {
      console.error('Error en auditoría IA:', e);
    } finally {
      setAuditandoIA(false);
    }
  };

  const ejecutarImportacion = async () => {
    setImportando(true);
    setErrorGlobal(null);

    try {
      if (tipo === 'filtros') {
        const filasValidas = filasFiltros.filter((f) => f.tipoAccion === 'nuevo' || f.tipoAccion === 'actualizar');

        let insertados = 0;
        let actualizados = 0;

        for (const fila of filasValidas) {
          const payload = {
            codigo_fhl: fila.codigo_fhl,
            equivalencias: fila.equivalencias || null,
            dimensiones: fila.dimensiones || null,
            descripcion_aplicacion: fila.descripcion_aplicacion || null,
            precio: fila.precio ?? 0,
            activo: fila.activo !== false,
            eliminado: false,
          };

          const { error } = await supabase
            .from('Tabla A')
            .upsert(payload, { onConflict: 'codigo_fhl' });

          if (error) {
            console.error('Error al insertar fila:', fila.codigo_fhl, error);
            throw new Error(`Error en código ${fila.codigo_fhl}: ${error.message}`);
          } else {
            if (fila.tipoAccion === 'nuevo') insertados++;
            else actualizados++;
          }
        }

        setResultadoFinal(`Importación finalizada con éxito: ${insertados} filtros creados, ${actualizados} actualizados.`);
      } else {
        // Vehículos
        const filasValidas = filasVehiculos.filter((f) => f.tipoAccion === 'nuevo');
        let insertados = 0;

        for (const fila of filasValidas) {
          const payload = {
            marca: fila.marca,
            modelo: fila.modelo,
            version: fila.version,
            año: fila.año,
            filtro_asociado: fila.filtro_asociado,
            eliminado: false,
          };

          const { error } = await supabase.from('Tabla B').insert(payload);
          if (!error) insertados++;
        }

        setResultadoFinal(`Importación finalizada con éxito: ${insertados} vehículos registrados.`);
      }

      onFinalizado();
    } catch (err: any) {
      console.error(err);
      setErrorGlobal(err.message || 'Error durante la importación');
    } finally {
      setImportando(false);
    }
  };

  const totalNuevos = tipo === 'filtros'
    ? filasFiltros.filter((f) => f.tipoAccion === 'nuevo').length
    : filasVehiculos.filter((f) => f.tipoAccion === 'nuevo').length;

  const totalActualizar = tipo === 'filtros'
    ? filasFiltros.filter((f) => f.tipoAccion === 'actualizar').length
    : 0;

  const totalSinCambios = tipo === 'filtros'
    ? filasFiltros.filter((f) => f.tipoAccion === 'sin_cambios').length
    : filasVehiculos.filter((f) => f.tipoAccion === 'sin_cambios').length;

  const totalErrores = tipo === 'filtros'
    ? filasFiltros.filter((f) => f.tipoAccion === 'error').length
    : filasVehiculos.filter((f) => f.tipoAccion === 'error').length;

  const tieneFilasParaImportar = totalNuevos > 0 || totalActualizar > 0;

  const alertasPorIndice = new Map<number, AlertaAuditoria>();
  if (auditoriaIA?.filasConAlerta) {
    auditoriaIA.filasConAlerta.forEach((a) => {
      alertasPorIndice.set(a.index - 1, a);
    });
  }

  const descargarPlantilla = () => {
    if (tipo === 'filtros') {
      const dataEjemplo = [
        {
          codigo_fhl: 'FHL-001',
          equivalencias: 'AKX-1014, CF-8890, CU-4442',
          dimensiones: 'Largo: 215 mm, Ancho: 195 mm, Alto: 25 mm',
          descripcion_aplicacion: 'CHEVROLET Onix 1.4 8v 2013 → 2019 / Prisma 1.4 2013 →',
          precio: 4500,
          activo: 'SI',
        },
        {
          codigo_fhl: 'FHL-002',
          equivalencias: 'AKX-3548, 1312766080, MH 206',
          dimensiones: 'Largo: 435 mm, Ancho: 143 mm, Alto: 18 mm',
          descripcion_aplicacion: 'FIAT Ducato 2.8 JTD 2004 → 2006 / PEUGEOT Boxer 2.8 Hdi 2004 →',
          precio: 5200,
          activo: 'SI',
        },
        {
          codigo_fhl: 'FHL-003',
          equivalencias: 'AKX-1440, MP 144, CF-9800',
          dimensiones: 'Largo: 198 mm, Ancho: 216 mm, Alto: 30 mm',
          descripcion_aplicacion: 'VOLKSWAGEN Gol Trend 1.6 2008 → / Fox 1.6 2004 → / Suran 1.6 2006 →',
          precio: 3800,
          activo: 'NO',
        },
      ];

      const ws = XLSX.utils.json_to_sheet(dataEjemplo);
      ws['!cols'] = [
        { wch: 15 },
        { wch: 35 },
        { wch: 42 },
        { wch: 60 },
        { wch: 12 },
        { wch: 10 },
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Filtros_FHL');
      XLSX.writeFile(wb, 'plantilla_importacion_filtros_fhl.xlsx');
    } else {
      const dataEjemplo = [
        {
          marca: 'CHEVROLET',
          modelo: 'ONIX',
          version: '1.4 8v LT / LTZ',
          año: '2013 → 2019',
          filtro_asociado: 'FHL-001',
        },
        {
          marca: 'FIAT',
          modelo: 'DUCATO',
          version: '2.8 JTD 127cv',
          año: '2004 → 2006',
          filtro_asociado: 'FHL-002',
        },
        {
          marca: 'VOLKSWAGEN',
          modelo: 'GOL TREND',
          version: '1.6 8v MSI',
          año: '2008 →',
          filtro_asociado: 'FHL-003',
        },
      ];

      const ws = XLSX.utils.json_to_sheet(dataEjemplo);
      ws['!cols'] = [
        { wch: 18 },
        { wch: 18 },
        { wch: 25 },
        { wch: 18 },
        { wch: 18 },
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Vehiculos_FHL');
      XLSX.writeFile(wb, 'plantilla_importacion_vehiculos_fhl.xlsx');
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-2xl max-w-5xl w-full p-6 max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-150">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              Carga Masiva
            </span>
            <h3 className="text-xl font-black text-slate-800">
              Importar {tipo === 'filtros' ? 'Filtros (Tabla A)' : 'Vehículos (Tabla B)'} desde Excel / CSV
            </h3>
          </div>
          <button
            onClick={onCerrar}
            aria-label="Cerrar ventana de importación"
            className="text-slate-400 hover:text-slate-700 p-1.5 rounded-md hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {errorGlobal && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-xs font-semibold">
            {errorGlobal}
          </div>
        )}

        {resultadoFinal && (
          <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-md text-green-800 text-sm font-bold flex items-center gap-2">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span>{resultadoFinal}</span>
          </div>
        )}

        {/* Selector de Archivo y Descarga de Plantilla */}
        {!archivo && (
          <div className="space-y-4 my-2">
            {/* Banner de descarga de plantilla */}
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2 font-bold text-blue-900">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  <span>¿No sabés qué formato usar?</span>
                </div>
                <p className="text-slate-600">
                  Descargá el archivo Excel modelo con los nombres de columnas y ejemplos listos para completar.
                </p>
              </div>

              <button
                type="button"
                onClick={descargarPlantilla}
                className="px-4 py-2 bg-blue-900 hover:bg-blue-800 text-white font-bold rounded-md transition-all shadow-xs flex items-center gap-1.5 shrink-0 cursor-pointer text-xs"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                <span>Descargar Plantilla Excel</span>
              </button>
            </div>

            {/* Dropzone */}
            <div>
              <label className="border-2 border-dashed border-slate-300 hover:border-blue-500 bg-slate-50 hover:bg-blue-50/30 rounded-lg p-8 flex flex-col items-center justify-center cursor-pointer transition-all">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-blue-900 mb-3" aria-hidden="true">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="12" y1="18" x2="12" y2="12" />
                  <line x1="9" y1="15" x2="15" y2="15" />
                </svg>
                <span className="text-base font-bold text-slate-800">
                  Seleccioná tu archivo .xlsx, .xls o .csv
                </span>
                <span className="text-xs text-slate-400 mt-1">
                  {tipo === 'filtros'
                    ? 'Columnas admitidas: codigo_fhl, equivalencias, dimensiones, descripcion_aplicacion, precio, activo.'
                    : 'Columnas admitidas: marca, modelo, version, año, filtro_asociado.'}
                </span>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      procesarArchivo(e.target.files[0]);
                    }
                  }}
                  className="hidden"
                />
              </label>
            </div>

            {/* Cuadro explicativo de columnas */}
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1.5">
              <span className="font-bold text-slate-700 block">
                {tipo === 'filtros' ? 'Detalle de columnas para Filtros (Tabla A):' : 'Detalle de columnas para Vehículos (Tabla B):'}
              </span>
              {tipo === 'filtros' ? (
                <ul className="text-slate-600 space-y-1 list-disc list-inside">
                  <li><strong className="text-slate-800 font-mono">codigo_fhl</strong> (Obligatorio): Código del filtro. Si ya existe en el sistema, actualizará sus datos automáticamente; si no existe, lo creará.</li>
                  <li><strong className="text-slate-800 font-mono">equivalencias</strong>: Códigos cruzados de otras marcas separados por comas.</li>
                  <li><strong className="text-slate-800 font-mono">dimensiones</strong>: Medidas del filtro (Largo, Ancho, Alto).</li>
                  <li><strong className="text-slate-800 font-mono">descripcion_aplicacion</strong>: Texto con los modelos y años compatibles.</li>
                  <li><strong className="text-slate-800 font-mono">precio</strong>: Precio base para el facturador/pedidos (ej: 4500).</li>
                  <li><strong className="text-slate-800 font-mono">activo</strong>: &quot;SI&quot; para visible en catálogo público, &quot;NO&quot; para oculto.</li>
                  <li><em>Nota: La columna del buscador unificado se autocompleta e indexa automáticamente en la base de datos.</em></li>
                </ul>
              ) : (
                <ul className="text-slate-600 space-y-1 list-disc list-inside">
                  <li><strong className="text-slate-800 font-mono">marca</strong> (Obligatorio): Marca del vehículo (ej: CHEVROLET, FORD).</li>
                  <li><strong className="text-slate-800 font-mono">modelo</strong> (Obligatorio): Modelo del vehículo (ej: ONIX, FIESTA).</li>
                  <li><strong className="text-slate-800 font-mono">version</strong>: Motorización o versión (ej: 1.4 8v LT).</li>
                  <li><strong className="text-slate-800 font-mono">año</strong>: Rango de años de compatibilidad (ej: 2013 → 2019).</li>
                  <li><strong className="text-slate-800 font-mono">filtro_asociado</strong> (Obligatorio): Código FHL del filtro que le corresponde (ej: FHL-001).</li>
                </ul>
              )}
            </div>
          </div>
        )}

        {procesando && (
          <div className="py-12 flex flex-col items-center justify-center gap-3">
            <div className="h-8 w-8 border-3 border-blue-900 border-t-transparent rounded-full animate-spin" />
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Analizando archivo y comparando con la base de datos...
            </p>
          </div>
        )}

        {/* Previsualización */}
        {archivo && !procesando && !resultadoFinal && (
          <div className="flex-1 overflow-hidden flex flex-col">
            
            {/* Panel de Diagnóstico IA */}
            {auditandoIA && (
              <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-between animate-pulse text-xs text-blue-900 font-semibold">
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 border-2 border-blue-900 border-t-transparent rounded-full animate-spin" />
                  <span>Auditor IA analizando coherencia de precios, dimensiones y códigos...</span>
                </div>
              </div>
            )}

            {auditoriaIA && !auditandoIA && (
              <div
                className={`mb-3 p-3.5 rounded-lg border text-xs transition-all ${
                  auditoriaIA.dictamen === 'Aprobado'
                    ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
                    : auditoriaIA.dictamen === 'Advertencias'
                    ? 'bg-amber-50/70 border-amber-200 text-amber-950'
                    : 'bg-red-50/70 border-red-200 text-red-950'
                }`}
              >
                <div className="flex items-center justify-between gap-3 mb-1.5">
                  <div className="flex items-center gap-2 font-bold">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    </svg>
                    <span>Diagnóstico del Auditor IA</span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                        auditoriaIA.dictamen === 'Aprobado'
                          ? 'bg-emerald-200 text-emerald-900'
                          : auditoriaIA.dictamen === 'Advertencias'
                          ? 'bg-amber-200 text-amber-900'
                          : 'bg-red-200 text-red-900'
                      }`}
                    >
                      {auditoriaIA.dictamen} ({auditoriaIA.scoreSalud}/100)
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => ejecutarAuditoriaIA(tipo === 'filtros' ? filasFiltros : filasVehiculos)}
                    className="text-[11px] underline hover:opacity-75 font-semibold cursor-pointer"
                  >
                    Re-auditar con IA
                  </button>
                </div>

                <p className="text-slate-700 leading-relaxed mb-2 font-medium">{auditoriaIA.resumen}</p>

                {auditoriaIA.recomendaciones && auditoriaIA.recomendaciones.length > 0 && (
                  <div className="pt-2 border-t border-slate-200/60 space-y-1">
                    <span className="font-bold text-[11px] text-slate-800">Recomendaciones de Calidad:</span>
                    <ul className="list-disc list-inside text-[11px] text-slate-600 space-y-0.5">
                      {auditoriaIA.recomendaciones.map((rec, i) => (
                        <li key={i}>{rec}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Badges de resumen */}
            <div className="flex items-center gap-3 mb-3 flex-wrap">
              <span className="text-xs bg-green-50 text-green-700 border border-green-200 px-2.5 py-1 rounded-lg font-bold">
                {totalNuevos} Nuevos
              </span>
              {tipo === 'filtros' && (
                <span className="text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-1 rounded-lg font-bold">
                  {totalActualizar} A Actualizar
                </span>
              )}
              <span className="text-xs bg-slate-100 text-slate-600 border border-slate-200 px-2.5 py-1 rounded-lg font-bold">
                {totalSinCambios} Sin Cambios
              </span>
              {totalErrores > 0 && (
                <span className="text-xs bg-red-50 text-red-700 border border-red-200 px-2.5 py-1 rounded-lg font-bold">
                  {totalErrores} Errores
                </span>
              )}
            </div>

            {/* Tabla con scroll */}
            <div className="flex-1 overflow-y-auto border border-slate-200 rounded-md max-h-72">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 sticky top-0 border-b border-slate-200">
                  <tr>
                    <th className="p-2.5 font-bold text-slate-600">Estado</th>
                    {tipo === 'filtros' ? (
                      <>
                        <th className="p-2.5 font-bold text-slate-600">Código FHL</th>
                        <th className="p-2.5 font-bold text-slate-600">Equivalencias</th>
                        <th className="p-2.5 font-bold text-slate-600">Dimensiones</th>
                        <th className="p-2.5 font-bold text-slate-600">Aplicación</th>
                        <th className="p-2.5 font-bold text-slate-600 text-right">Precio ($)</th>
                        <th className="p-2.5 font-bold text-slate-600 text-center">Visibilidad</th>
                      </>
                    ) : (
                      <>
                        <th className="p-2.5 font-bold text-slate-600">Marca</th>
                        <th className="p-2.5 font-bold text-slate-600">Modelo</th>
                        <th className="p-2.5 font-bold text-slate-600">Versión</th>
                        <th className="p-2.5 font-bold text-slate-600">Año</th>
                        <th className="p-2.5 font-bold text-slate-600">Filtro Asociado</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {tipo === 'filtros'
                    ? filasFiltros.map((f, idx) => {
                      const alertaFila = alertasPorIndice.get(idx);
                      return (
                        <tr
                          key={idx}
                          className={
                            alertaFila
                              ? alertaFila.severidad === 'alta'
                                ? 'bg-red-50/70 border-l-4 border-l-red-500'
                                : 'bg-amber-50/70 border-l-4 border-l-amber-500'
                              : f.tipoAccion === 'nuevo'
                              ? 'bg-green-50/40'
                              : f.tipoAccion === 'actualizar'
                              ? 'bg-amber-50/40'
                              : f.tipoAccion === 'error'
                              ? 'bg-red-50/40'
                              : ''
                          }
                        >
                          <td className="p-2.5 font-bold align-top">
                            {f.tipoAccion === 'nuevo' && <span className="text-green-700">Nuevo</span>}
                            {f.tipoAccion === 'actualizar' && <span className="text-amber-700">Actualizar</span>}
                            {f.tipoAccion === 'sin_cambios' && <span className="text-slate-400">Sin cambios</span>}
                            {f.tipoAccion === 'error' && <span className="text-red-600">{f.errorMsg}</span>}
                            
                            {alertaFila && (
                              <div className="mt-1 px-1.5 py-0.5 bg-red-100 text-red-800 text-[10px] font-semibold rounded border border-red-200 flex items-center gap-1">
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                                  <circle cx="12" cy="12" r="10" />
                                  <line x1="12" y1="8" x2="12" y2="12" />
                                  <line x1="12" y1="16" x2="12.01" y2="16" />
                                </svg>
                                <span>Alerta IA: {alertaFila.mensaje}</span>
                              </div>
                            )}
                          </td>
                          <td className="p-2.5 font-bold text-blue-900 align-top">{f.codigo_fhl}</td>
                          <td className="p-2.5 text-slate-600 truncate max-w-xs align-top">{f.equivalencias || '—'}</td>
                          <td className="p-2.5 text-slate-600 align-top">{f.dimensiones || '—'}</td>
                          <td className="p-2.5 text-slate-600 truncate max-w-xs align-top">{f.descripcion_aplicacion || '—'}</td>
                          <td className="p-2.5 text-right font-mono font-bold text-slate-800 align-top">
                            {f.precio !== undefined && f.precio > 0 ? `$${f.precio.toFixed(2)}` : '0.00'}
                          </td>
                          <td className="p-2.5 text-center font-bold align-top">
                            <span className={f.activo !== false ? 'text-green-700' : 'text-slate-400'}>
                              {f.activo !== false ? 'Visible' : 'Oculto'}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                    : filasVehiculos.map((v, idx) => {
                      const alertaFila = alertasPorIndice.get(idx);
                      return (
                        <tr
                          key={idx}
                          className={
                            alertaFila
                              ? 'bg-amber-50/70 border-l-4 border-l-amber-500'
                              : v.tipoAccion === 'nuevo'
                              ? 'bg-green-50/40'
                              : v.tipoAccion === 'error'
                              ? 'bg-red-50/40'
                              : ''
                          }
                        >
                          <td className="p-2.5 font-bold align-top">
                            {v.tipoAccion === 'nuevo' && <span className="text-green-700">Nuevo</span>}
                            {v.tipoAccion === 'sin_cambios' && <span className="text-slate-400">Sin cambios</span>}
                            {v.tipoAccion === 'error' && <span className="text-red-600">{v.errorMsg}</span>}

                            {alertaFila && (
                              <div className="mt-1 px-1.5 py-0.5 bg-amber-100 text-amber-800 text-[10px] font-semibold rounded border border-amber-200 flex items-center gap-1">
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                                  <circle cx="12" cy="12" r="10" />
                                  <line x1="12" y1="8" x2="12" y2="12" />
                                  <line x1="12" y1="16" x2="12.01" y2="16" />
                                </svg>
                                <span>Alerta IA: {alertaFila.mensaje}</span>
                              </div>
                            )}
                          </td>
                          <td className="p-2.5 font-bold text-slate-800 align-top">{v.marca}</td>
                          <td className="p-2.5 text-slate-800 align-top">{v.modelo}</td>
                          <td className="p-2.5 text-slate-600 align-top">{v.version || '—'}</td>
                          <td className="p-2.5 text-slate-600 align-top">{v.año || '—'}</td>
                          <td className="p-2.5 font-bold text-blue-900 align-top">{v.filtro_asociado}</td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Footer actions */}
        <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
          {archivo && !resultadoFinal ? (
            <button
              onClick={() => {
                setArchivo(null);
                setFilasFiltros([]);
                setFilasVehiculos([]);
              }}
              className="text-xs text-slate-500 hover:text-slate-800 font-semibold"
            >
              Cambiar archivo
            </button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2">
            <button
              onClick={onCerrar}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors"
            >
              {resultadoFinal ? 'Cerrar' : 'Cancelar'}
            </button>

            {!resultadoFinal && tieneFilasParaImportar && (
              <button
                onClick={ejecutarImportacion}
                disabled={importando}
                className="px-5 py-2 text-xs font-bold text-white bg-blue-900 hover:bg-blue-800 rounded-md transition-colors shadow flex items-center gap-1.5 disabled:opacity-50"
              >
                {importando ? (
                  <>
                    <div className="h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Importando...</span>
                  </>
                ) : (
                  <span>Confirmar e Importar</span>
                )}
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}

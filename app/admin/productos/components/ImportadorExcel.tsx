'use client';

import { useState } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '@/lib/supabase';
import type { Filtro, Vehiculo, ListaPrecio } from '@/lib/types';

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
  preciosListas?: Record<string, number>; // lista_id -> precio
}

interface FilaPreviewVehiculo {
  tipoAccion: 'nuevo' | 'actualizar' | 'sin_cambios' | 'error';
  id?: number;
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
  const [arrastrando, setArrastrando] = useState(false);
  const [procesando, setProcesando] = useState(false);
  const [importando, setImportando] = useState(false);
  const [progreso, setProgreso] = useState<number>(0);
  const [auditandoIA, setAuditandoIA] = useState(false);
  const [auditoriaIA, setAuditoriaIA] = useState<ResultadoAuditoriaIA | null>(null);

  // Listas de precios activas (para importación de filtros)
  const [listasActivas, setListasActivas] = useState<ListaPrecio[]>([]);

  // Filas en previsualización
  const [filasFiltros, setFilasFiltros] = useState<FilaPreviewFiltro[]>([]);
  const [filasVehiculos, setFilasVehiculos] = useState<FilaPreviewVehiculo[]>([]);

  // Filtros de previsualización
  const [filtroEstadoPreview, setFiltroEstadoPreview] = useState<'todos' | 'nuevos' | 'actualizar' | 'sin_cambios' | 'error'>('todos');
  const [busquedaPreview, setBusquedaPreview] = useState('');
  const [mostrarTodas, setMostrarTodas] = useState(false);

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

  const procesarArchivo = async (file: File) => {
    setArchivo(file);
    setProcesando(true);
    setErrorGlobal(null);
    setResultadoFinal(null);
    setAuditoriaIA(null);

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[firstSheetName];
      const rawRows: Record<string, any>[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

      if (rawRows.length === 0) {
        setErrorGlobal('El archivo seleccionado está vacío o no contiene filas legibles.');
        setProcesando(false);
        return;
      }

      if (tipo === 'filtros') {
        // Cargar en paralelo: filtros en Tabla A, listas de precios activas, e items de precios actuales
        const [dbFiltrosRes, listasRes, itemsPreciosRes] = await Promise.all([
          supabase
            .from('Tabla A')
            .select('codigo_fhl, equivalencias, dimensiones, descripcion_aplicacion, precio, activo'),
          supabase
            .from('listas_precios')
            .select('*')
            .eq('eliminado', false)
            .order('created_at', { ascending: true }),
          supabase
            .from('items_lista_precio')
            .select('lista_id, codigo_fhl, precio')
            .range(0, 9999),
        ]);

        const dbMap = new Map<string, any>();
        if (dbFiltrosRes.data) {
          dbFiltrosRes.data.forEach((f: any) => dbMap.set(f.codigo_fhl.trim().toUpperCase(), f));
        }

        const listas = (listasRes.data || []) as ListaPrecio[];
        setListasActivas(listas);

        // Mapa de precios actuales por [codigoUpper_listaId]
        const mapaPreciosActuales = new Map<string, number>();
        (itemsPreciosRes.data || []).forEach((it: any) => {
          mapaPreciosActuales.set(`${it.codigo_fhl.trim().toUpperCase()}_${it.lista_id}`, Number(it.precio));
        });

        // Identificar listas por normalización de nombre
        const listasNormalizadas = listas.map((l) => ({
          ...l,
          claveNorm: normalizarClave(l.nombre),
        }));

        const preview: FilaPreviewFiltro[] = [];

        rawRows.forEach((row) => {
          let codigo = '';
          let equiv: string | null = null;
          let dim: string | null = null;
          let desc: string | null = null;
          let precioVal: number = 0;
          let activoVal: boolean = true;
          const preciosListasFila: Record<string, number> = {};
          let detectoColumnaLista = false;

          Object.keys(row).forEach((col) => {
            const keyNorm = normalizarClave(col);
            const rawVal = row[col];
            const val = String(rawVal ?? '').trim();

            // Verificar si la columna corresponde a alguna de las listas de precios activas
            const listaMatch = listasNormalizadas.find(
              (l) => l.claveNorm === keyNorm || (keyNorm.includes(l.claveNorm) && l.claveNorm.length > 3)
            );

            if (listaMatch) {
              const p = limpiarPrecio(rawVal);
              preciosListasFila[listaMatch.id] = p;
              detectoColumnaLista = true;
              return;
            }

            if (keyNorm.includes('codigo') || keyNorm === 'fhl' || keyNorm === 'filtro') {
              codigo = val;
            } else if (keyNorm.includes('equiv') || keyNorm.includes('cruzad') || keyNorm.includes('oem')) {
              equiv = val || null;
            } else if (keyNorm.includes('dimen') || keyNorm.includes('medida')) {
              dim = val || null;
            } else if (keyNorm.includes('desc') || keyNorm.includes('aplica') || keyNorm.includes('detalle')) {
              desc = val || null;
            } else if (
              keyNorm === 'precio' ||
              keyNorm === 'costo' ||
              keyNorm === 'valor' ||
              keyNorm === 'importe' ||
              keyNorm.includes('preciobase')
            ) {
              precioVal = limpiarPrecio(rawVal);
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
              preciosListas: preciosListasFila,
            });
            return;
          }

          const codigoUpper = codigo.toUpperCase();
          const existente = dbMap.get(codigoUpper);

          // Si el Excel no trajo columnas específicas por lista pero trajo 'precio', asignarlo a Mayorista Base
          const listaMayoristaBase = listas.find((l) => l.nombre.toLowerCase().includes('mayorista base'));
          if (listaMayoristaBase && preciosListasFila[listaMayoristaBase.id] !== undefined) {
            precioVal = preciosListasFila[listaMayoristaBase.id];
          } else if (listaMayoristaBase && !detectoColumnaLista && precioVal > 0) {
            preciosListasFila[listaMayoristaBase.id] = precioVal;
          }

          if (!existente) {
            preview.push({
              tipoAccion: 'nuevo',
              codigo_fhl: codigoUpper,
              equivalencias: equiv,
              dimensiones: dim,
              descripcion_aplicacion: desc,
              precio: precioVal,
              activo: activoVal,
              preciosListas: preciosListasFila,
            });
          } else {
            let cambio =
              (equiv ?? '') !== (existente.equivalencias ?? '') ||
              (dim ?? '') !== (existente.dimensiones ?? '') ||
              (desc ?? '') !== (existente.descripcion_aplicacion ?? '') ||
              (precioVal > 0 && Math.abs(precioVal - Number(existente.precio || 0)) > 0.01) ||
              activoVal !== (existente.activo !== false);

            // Verificar también si cambió algún precio de listas activas
            for (const lista of listas) {
              const nuevoP = preciosListasFila[lista.id];
              if (nuevoP !== undefined) {
                const actualP = mapaPreciosActuales.get(`${codigoUpper}_${lista.id}`) ?? 0;
                if (Math.abs(nuevoP - actualP) > 0.01) {
                  cambio = true;
                  break;
                }
              }
            }

            preview.push({
              tipoAccion: cambio ? 'actualizar' : 'sin_cambios',
              codigo_fhl: codigoUpper,
              equivalencias: equiv,
              dimensiones: dim,
              descripcion_aplicacion: desc,
              precio: precioVal > 0 ? precioVal : Number(existente.precio || 0),
              activo: activoVal,
              preciosListas: preciosListasFila,
            });
          }
        });

        setFilasFiltros(preview);
      } else {
        // Vehículos (Tabla B)
        const [dbVehiculosRes, dbFiltrosRes] = await Promise.all([
          supabase.from('Tabla B').select('*').eq('eliminado', false),
          supabase.from('Tabla A').select('codigo_fhl').or('eliminado.is.null,eliminado.eq.false'),
        ]);

        const dbVehiculos = dbVehiculosRes.data || [];
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

          const marcaUpper = marca.toUpperCase();
          const modeloUpper = modelo.toUpperCase();
          const filtroUpper = filtro.toUpperCase();

          // Buscar coincidencia exacta por (marca, modelo, versión, filtro)
          const existente = dbVehiculos.find(
            (v: any) =>
              v.marca?.toUpperCase() === marcaUpper &&
              v.modelo?.toUpperCase() === modeloUpper &&
              (v.version ?? '') === (version ?? '') &&
              (v.filtro_asociado ?? '').toUpperCase() === filtroUpper
          );

          if (!existente) {
            preview.push({
              tipoAccion: 'nuevo',
              marca: marcaUpper,
              modelo: modeloUpper,
              version,
              año: anio,
              filtro_asociado: filtroUpper,
            });
          } else {
            // Si el vehículo existe pero cambió el año, actualizar
            const anioCambio = (existente.año ?? '') !== (anio ?? '');
            preview.push({
              tipoAccion: anioCambio ? 'actualizar' : 'sin_cambios',
              id: existente.id,
              marca: marcaUpper,
              modelo: modeloUpper,
              version,
              año: anio,
              filtro_asociado: filtroUpper,
            });
          }
        });

        setFilasVehiculos(preview);
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
    setProgreso(0);
    setErrorGlobal(null);

    try {
      if (tipo === 'filtros') {
        const filasValidas = filasFiltros.filter((f) => f.tipoAccion !== 'error');
        if (filasValidas.length === 0) {
          setErrorGlobal('No hay filas válidas para importar.');
          setImportando(false);
          return;
        }

        // Obtener listas activas si no estaban en memoria
        let listas = listasActivas;
        if (listas.length === 0) {
          const { data: dbListas } = await supabase
            .from('listas_precios')
            .select('*')
            .eq('eliminado', false);
          listas = (dbListas || []) as ListaPrecio[];
          setListasActivas(listas);
        }

        let insertados = 0;
        let actualizados = 0;

        // 1. Upsert en Tabla A en lotes de 50
        const batchSize = 50;
        const totalLotes = Math.ceil(filasValidas.length / batchSize);

        for (let i = 0; i < totalLotes; i++) {
          const chunk = filasValidas.slice(i * batchSize, (i + 1) * batchSize);
          const payloadTablaA = chunk.map((f) => ({
            codigo_fhl: f.codigo_fhl,
            equivalencias: f.equivalencias || null,
            dimensiones: f.dimensiones || null,
            descripcion_aplicacion: f.descripcion_aplicacion || null,
            precio: f.precio ?? 0,
            activo: f.activo !== false,
            eliminado: false,
          }));

          const { error: errA } = await supabase
            .from('Tabla A')
            .upsert(payloadTablaA, { onConflict: 'codigo_fhl' });

          if (errA) throw new Error(`Error al guardar en Catálogo: ${errA.message}`);

          chunk.forEach((f) => {
            if (f.tipoAccion === 'nuevo') insertados++;
            else actualizados++;
          });

          setProgreso(Math.round(((i + 1) / totalLotes) * 50));
        }

        // 2. Sincronizar automáticamente items_lista_precio para todas las listas activas
        if (listas.length > 0) {
          const payloadItemsPrecios: { lista_id: string; codigo_fhl: string; precio: number }[] = [];

          for (const fila of filasValidas) {
            for (const lista of listas) {
              let precioParaEstaLista = 0;

              if (fila.preciosListas && fila.preciosListas[lista.id] !== undefined) {
                precioParaEstaLista = fila.preciosListas[lista.id];
              } else if (fila.tipoAccion === 'nuevo') {
                // Para filtros nuevos sin columna específica por lista, inicializar con fila.precio para 0 huérfanos
                precioParaEstaLista = fila.precio ?? 0;
              } else if (lista.nombre.toLowerCase().includes('mayorista base') && fila.precio !== undefined) {
                precioParaEstaLista = fila.precio;
              } else {
                continue; // Si ya existe y no vino precio para esta lista, mantener el que ya tenía
              }

              payloadItemsPrecios.push({
                lista_id: lista.id,
                codigo_fhl: fila.codigo_fhl,
                precio: precioParaEstaLista,
              });
            }
          }

          if (payloadItemsPrecios.length > 0) {
            const batchSizeItems = 150;
            const totalLotesItems = Math.ceil(payloadItemsPrecios.length / batchSizeItems);

            for (let i = 0; i < totalLotesItems; i++) {
              const chunk = payloadItemsPrecios.slice(i * batchSizeItems, (i + 1) * batchSizeItems);
              const { error: errItems } = await supabase
                .from('items_lista_precio')
                .upsert(chunk, { onConflict: 'lista_id,codigo_fhl' });

              if (errItems) console.warn('Aviso al actualizar items_lista_precio:', errItems.message);

              setProgreso(50 + Math.round(((i + 1) / totalLotesItems) * 50));
            }
          } else {
            setProgreso(100);
          }
        } else {
          setProgreso(100);
        }

        setResultadoFinal(
          `Importación finalizada con éxito: ${insertados} filtros nuevos y ${actualizados} actualizados, con precios sincronizados en las ${listas.length} listas.`
        );
      } else {
        // Vehículos (Tabla B)
        const filasValidas = filasVehiculos.filter((f) => f.tipoAccion !== 'error');
        if (filasValidas.length === 0) {
          setErrorGlobal('No hay filas válidas para importar.');
          setImportando(false);
          return;
        }

        // Consultar catálogo en Tabla A para garantizar 0 huérfanos
        const { data: dbFiltros } = await supabase
          .from('Tabla A')
          .select('codigo_fhl')
          .or('eliminado.is.null,eliminado.eq.false');

        const setCatalogoA = new Set((dbFiltros || []).map((f: any) => f.codigo_fhl.trim().toUpperCase()));
        const filtrosFaltantesCrear = new Set<string>();

        for (const fila of filasValidas) {
          const cod = fila.filtro_asociado.trim().toUpperCase();
          if (cod && !setCatalogoA.has(cod)) {
            filtrosFaltantesCrear.add(cod);
          }
        }

        // Crear filtros faltantes en Tabla A con activo: false
        if (filtrosFaltantesCrear.size > 0) {
          const faltantes = Array.from(filtrosFaltantesCrear).map((cod) => ({
            codigo_fhl: cod,
            activo: false,
            eliminado: false,
            precio: 0,
          }));
          const { error: errFaltantes } = await supabase.from('Tabla A').insert(faltantes);
          if (errFaltantes) console.warn('Aviso al auto-crear filtros asociados en Tabla A:', errFaltantes.message);
        }

        let insertados = 0;
        let actualizados = 0;

        const filasNuevas = filasValidas.filter((f) => f.tipoAccion === 'nuevo');
        const filasActualizar = filasValidas.filter((f) => f.tipoAccion === 'actualizar');

        // Insertar nuevos en lote
        if (filasNuevas.length > 0) {
          const batchSize = 100;
          for (let i = 0; i < filasNuevas.length; i += batchSize) {
            const chunk = filasNuevas.slice(i, i + batchSize).map((f) => ({
              marca: f.marca,
              modelo: f.modelo,
              version: f.version,
              año: f.año,
              filtro_asociado: f.filtro_asociado,
              eliminado: false,
            }));
            const { error: errIns } = await supabase.from('Tabla B').insert(chunk);
            if (!errIns) insertados += chunk.length;
            setProgreso(Math.round(((i + chunk.length) / filasValidas.length) * 80));
          }
        }

        // Actualizar vehículos existentes cuyo año cambió
        for (const f of filasActualizar) {
          if (f.id) {
            const { error: errUpd } = await supabase
              .from('Tabla B')
              .update({ año: f.año })
              .eq('id', f.id);
            if (!errUpd) actualizados++;
          }
        }

        setProgreso(100);
        setResultadoFinal(
          `Importación finalizada con éxito: ${insertados} vehículos registrados y ${actualizados} actualizados.`
        );
      }

      onFinalizado();
    } catch (err: any) {
      console.error(err);
      setErrorGlobal(err.message || 'Error durante la importación');
    } finally {
      setImportando(false);
    }
  };

  // Descarga de Plantilla Multi-Lista
  const descargarPlantilla = async () => {
    try {
      if (tipo === 'filtros') {
        const [filtrosRes, listasRes, itemsPreciosRes] = await Promise.all([
          supabase
            .from('Tabla A')
            .select('codigo_fhl, equivalencias, dimensiones, descripcion_aplicacion, precio, activo')
            .eq('eliminado', false)
            .order('codigo_fhl', { ascending: true }),
          supabase
            .from('listas_precios')
            .select('*')
            .eq('eliminado', false)
            .order('created_at', { ascending: true }),
          supabase
            .from('items_lista_precio')
            .select('lista_id, codigo_fhl, precio')
            .range(0, 9999),
        ]);

        const listas = (listasRes.data || []) as ListaPrecio[];
        const filtros = filtrosRes.data || [];

        const mapaPrecios = new Map<string, number>();
        (itemsPreciosRes.data || []).forEach((it: any) => {
          mapaPrecios.set(`${it.codigo_fhl.trim().toUpperCase()}_${it.lista_id}`, Number(it.precio));
        });

        const rows =
          filtros.length > 0
            ? filtros.map((f: any) => {
                const filaExcel: Record<string, any> = {
                  codigo_fhl: f.codigo_fhl || '',
                  equivalencias: f.equivalencias || '',
                  dimensiones: f.dimensiones || '',
                  descripcion_aplicacion: f.descripcion_aplicacion || '',
                  activo: f.activo !== false ? 'SI' : 'NO',
                };

                listas.forEach((l) => {
                  const p = mapaPrecios.get(`${f.codigo_fhl.trim().toUpperCase()}_${l.id}`);
                  filaExcel[l.nombre] = p !== undefined ? p : Number(f.precio || 0);
                });

                return filaExcel;
              })
            : [
                (() => {
                  const demo: Record<string, any> = {
                    codigo_fhl: 'FHL-001',
                    equivalencias: 'AKX-1014, CF-8890, CU-4442',
                    dimensiones: 'Largo: 215 mm, Ancho: 195 mm, Alto: 25 mm',
                    descripcion_aplicacion: 'CHEVROLET Onix 1.4 8v 2013 → 2019 / Prisma 1.4 2013 →',
                    activo: 'SI',
                  };
                  listas.forEach((l) => {
                    demo[l.nombre] = 4500;
                  });
                  return demo;
                })(),
              ];

        const ws = XLSX.utils.json_to_sheet(rows);
        const colWidths = [
          { wch: 15 },
          { wch: 35 },
          { wch: 42 },
          { wch: 60 },
          { wch: 10 },
          ...listas.map(() => ({ wch: 16 })),
        ];
        ws['!cols'] = colWidths;

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Catalogo_FHL');
        XLSX.writeFile(wb, 'catalogo_filtros_con_listas_precios.xlsx');
      } else {
        const { data: vehiculos } = await supabase
          .from('Tabla B')
          .select('*')
          .eq('eliminado', false)
          .order('marca', { ascending: true })
          .order('modelo', { ascending: true });

        const rows =
          vehiculos && vehiculos.length > 0
            ? vehiculos.map((v: any) => ({
                marca: v.marca || '',
                modelo: v.modelo || '',
                version: v.version || '',
                año: v.año || '',
                filtro_asociado: v.filtro_asociado || '',
              }))
            : [
                {
                  marca: 'CHEVROLET',
                  modelo: 'ONIX',
                  version: '1.4 8v LT / LTZ',
                  año: '2013 → 2019',
                  filtro_asociado: 'FHL-001',
                },
              ];

        const ws = XLSX.utils.json_to_sheet(rows);
        ws['!cols'] = [
          { wch: 18 },
          { wch: 18 },
          { wch: 25 },
          { wch: 18 },
          { wch: 18 },
        ];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Vehiculos_FHL');
        XLSX.writeFile(wb, 'catalogo_vehiculos_tabla_b.xlsx');
      }
    } catch (e) {
      console.error('Error al descargar plantilla:', e);
    }
  };

  // Contadores de estado
  const totalNuevos =
    tipo === 'filtros'
      ? filasFiltros.filter((f) => f.tipoAccion === 'nuevo').length
      : filasVehiculos.filter((f) => f.tipoAccion === 'nuevo').length;

  const totalActualizar =
    tipo === 'filtros'
      ? filasFiltros.filter((f) => f.tipoAccion === 'actualizar').length
      : filasVehiculos.filter((f) => f.tipoAccion === 'actualizar').length;

  const totalSinCambios =
    tipo === 'filtros'
      ? filasFiltros.filter((f) => f.tipoAccion === 'sin_cambios').length
      : filasVehiculos.filter((f) => f.tipoAccion === 'sin_cambios').length;

  const totalErrores =
    tipo === 'filtros'
      ? filasFiltros.filter((f) => f.tipoAccion === 'error').length
      : filasVehiculos.filter((f) => f.tipoAccion === 'error').length;

  const totalValidos =
    tipo === 'filtros'
      ? filasFiltros.filter((f) => f.tipoAccion !== 'error').length
      : filasVehiculos.filter((f) => f.tipoAccion !== 'error').length;

  const tieneFilasParaImportar = totalValidos > 0;

  // Filtrado reactivo en la previsualización
  const filasFiltrosVisibles = filasFiltros.filter((f) => {
    if (filtroEstadoPreview !== 'todos' && f.tipoAccion !== filtroEstadoPreview) return false;
    if (busquedaPreview) {
      const q = busquedaPreview.toLowerCase().trim();
      const matchCod = f.codigo_fhl.toLowerCase().includes(q);
      const matchEquiv = f.equivalencias && f.equivalencias.toLowerCase().includes(q);
      const matchDesc = f.descripcion_aplicacion && f.descripcion_aplicacion.toLowerCase().includes(q);
      if (!matchCod && !matchEquiv && !matchDesc) return false;
    }
    return true;
  });

  const filasVehiculosVisibles = filasVehiculos.filter((v) => {
    if (filtroEstadoPreview !== 'todos' && v.tipoAccion !== filtroEstadoPreview) return false;
    if (busquedaPreview) {
      const q = busquedaPreview.toLowerCase().trim();
      const matchMarca = v.marca.toLowerCase().includes(q);
      const matchModelo = v.modelo.toLowerCase().includes(q);
      const matchFiltro = v.filtro_asociado.toLowerCase().includes(q);
      if (!matchMarca && !matchModelo && !matchFiltro) return false;
    }
    return true;
  });

  const limiteMostrar = mostrarTodas ? 99999 : 150;
  const listaFiltrosRender = filasFiltrosVisibles.slice(0, limiteMostrar);
  const listaVehiculosRender = filasVehiculosVisibles.slice(0, limiteMostrar);

  const alertasPorIndice = new Map<number, AlertaAuditoria>();
  if (auditoriaIA?.filasConAlerta) {
    auditoriaIA.filasConAlerta.forEach((a) => {
      alertasPorIndice.set(a.index - 1, a);
    });
  }

  return (
    <div className="fixed inset-0 z-[1000] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-5xl w-full p-6 max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-150 border border-slate-200">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              Carga Masiva con Sincronización Inteligente
            </span>
            <h3 className="text-xl font-black text-slate-800">
              Importar {tipo === 'filtros' ? 'Filtros (Tabla A) y Precios de Listas' : 'Vehículos (Tabla B)'} desde Excel / CSV
            </h3>
          </div>
          <button
            onClick={onCerrar}
            disabled={importando}
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

        {/* Selector de Archivo y Descarga de Plantilla con Drag & Drop real */}
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
                  <span>¿Querés la plantilla completa con los datos actuales?</span>
                </div>
                <p className="text-slate-600">
                  {tipo === 'filtros'
                    ? 'Descargá un Excel con todos los filtros y las columnas de cada lista de precios para editar o cargar tarifas en lote.'
                    : 'Descargá un Excel modelo con marcas, modelos y filtros asociados.'}
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

            {/* Dropzone con Drag & Drop real */}
            <div>
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
                  if (f) procesarArchivo(f);
                }}
                className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center transition-all ${
                  arrastrando
                    ? 'border-blue-600 bg-blue-50/80 scale-[1.01]'
                    : 'border-slate-300 hover:border-blue-500 bg-slate-50 hover:bg-blue-50/30'
                }`}
              >
                <input
                  type="file"
                  id="input-archivo-excel-general"
                  accept=".xlsx,.xls,.csv"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      procesarArchivo(e.target.files[0]);
                    }
                  }}
                  className="hidden"
                />
                <label
                  htmlFor="input-archivo-excel-general"
                  className="cursor-pointer flex flex-col items-center justify-center w-full"
                >
                  <div className={`p-4 rounded-full mb-3 transition-colors ${arrastrando ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-900'}`}>
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                      <line x1="12" y1="18" x2="12" y2="12" />
                      <line x1="9" y1="15" x2="15" y2="15" />
                    </svg>
                  </div>
                  <span className="text-base font-bold text-slate-800">
                    {arrastrando
                      ? 'Soltá tu archivo aquí'
                      : 'Hacé clic para seleccionar tu archivo .xlsx, .xls o .csv o arrastralo aquí'}
                  </span>
                  <span className="text-xs text-slate-500 mt-1 text-center">
                    {tipo === 'filtros'
                      ? 'Admite: codigo_fhl, equivalencias, dimensiones, descripcion_aplicacion, activo, y columnas de listas de precios (ej. Mayorista 1, Comercio).'
                      : 'Admite: marca, modelo, version, año, filtro_asociado.'}
                  </span>
                </label>
              </div>
            </div>

            {/* Cuadro explicativo de columnas */}
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1.5">
              <span className="font-bold text-slate-700 block">
                {tipo === 'filtros' ? 'Detalle de columnas para Filtros (Tabla A) y Listas:' : 'Detalle de columnas para Vehículos (Tabla B):'}
              </span>
              {tipo === 'filtros' ? (
                <ul className="text-slate-600 space-y-1 list-disc list-inside">
                  <li><strong className="text-slate-800 font-mono">codigo_fhl</strong> (Obligatorio): Código del filtro. Si ya existe, actualiza; si no, lo crea.</li>
                  <li><strong className="text-slate-800 font-mono">equivalencias</strong>: Códigos cruzados de otras marcas separados por comas.</li>
                  <li><strong className="text-slate-800 font-mono">dimensiones</strong>: Medidas del filtro (Largo, Ancho, Alto).</li>
                  <li><strong className="text-slate-800 font-mono">descripcion_aplicacion</strong>: Texto con los modelos y años compatibles.</li>
                  <li><strong className="text-slate-800 font-mono">activo</strong>: &quot;SI&quot; para visible en catálogo web, &quot;NO&quot; para oculto.</li>
                  <li><strong className="text-slate-800 font-mono">Columnas de Listas de Precios</strong>: Podés incluir columnas con los nombres de tus listas (ej: &quot;Mayorista Base&quot;, &quot;Mayorista 1&quot;, etc.) para sincronizar las tarifas en el mismo paso.</li>
                </ul>
              ) : (
                <ul className="text-slate-600 space-y-1 list-disc list-inside">
                  <li><strong className="text-slate-800 font-mono">marca</strong> (Obligatorio): Marca del vehículo (ej: CHEVROLET, FORD).</li>
                  <li><strong className="text-slate-800 font-mono">modelo</strong> (Obligatorio): Modelo del vehículo (ej: ONIX, FIESTA).</li>
                  <li><strong className="text-slate-800 font-mono">version</strong>: Motorización o versión (ej: 1.4 8v LT).</li>
                  <li><strong className="text-slate-800 font-mono">año</strong>: Rango de años de compatibilidad. Si el vehículo ya existía con otro año, se actualiza automáticamente.</li>
                  <li><strong className="text-slate-800 font-mono">filtro_asociado</strong> (Obligatorio): Código FHL. Si no existe aún en el catálogo, se dará de alta automáticamente para evitar inconsistencias.</li>
                </ul>
              )}
            </div>
          </div>
        )}

        {procesando && (
          <div className="py-12 flex flex-col items-center justify-center gap-3">
            <div className="h-8 w-8 border-[3px] border-blue-900 border-t-transparent rounded-full animate-spin" />
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

            {/* Badges de filtro rápido y Buscador */}
            <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => setFiltroEstadoPreview('todos')}
                  className={`px-2.5 py-1 rounded text-xs font-bold transition-colors cursor-pointer ${
                    filtroEstadoPreview === 'todos'
                      ? 'bg-slate-800 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  Todos ({tipo === 'filtros' ? filasFiltros.length : filasVehiculos.length})
                </button>
                <button
                  type="button"
                  onClick={() => setFiltroEstadoPreview('nuevos')}
                  className={`px-2.5 py-1 rounded text-xs font-bold transition-colors cursor-pointer ${
                    filtroEstadoPreview === 'nuevos'
                      ? 'bg-green-700 text-white'
                      : 'bg-green-50 text-green-800 hover:bg-green-100'
                  }`}
                >
                  {totalNuevos} Nuevos
                </button>
                <button
                  type="button"
                  onClick={() => setFiltroEstadoPreview('actualizar')}
                  className={`px-2.5 py-1 rounded text-xs font-bold transition-colors cursor-pointer ${
                    filtroEstadoPreview === 'actualizar'
                      ? 'bg-amber-600 text-white'
                      : 'bg-amber-50 text-amber-900 hover:bg-amber-100'
                  }`}
                >
                  {totalActualizar} A Actualizar
                </button>
                <button
                  type="button"
                  onClick={() => setFiltroEstadoPreview('sin_cambios')}
                  className={`px-2.5 py-1 rounded text-xs font-bold transition-colors cursor-pointer ${
                    filtroEstadoPreview === 'sin_cambios'
                      ? 'bg-slate-500 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {totalSinCambios} Sin Cambios
                </button>
                {totalErrores > 0 && (
                  <button
                    type="button"
                    onClick={() => setFiltroEstadoPreview('error')}
                    className={`px-2.5 py-1 rounded text-xs font-bold transition-colors cursor-pointer ${
                      filtroEstadoPreview === 'error'
                        ? 'bg-red-700 text-white'
                        : 'bg-red-50 text-red-700 hover:bg-red-100'
                    }`}
                  >
                    {totalErrores} Errores
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Buscar en la previsualización..."
                  value={busquedaPreview}
                  onChange={(e) => setBusquedaPreview(e.target.value)}
                  className="px-3 py-1 text-xs bg-white border border-slate-300 rounded-md w-52 font-bold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-900"
                />

                {!auditoriaIA && (
                  <button
                    type="button"
                    onClick={() => ejecutarAuditoriaIA(tipo === 'filtros' ? filasFiltros : filasVehiculos)}
                    disabled={auditandoIA}
                    className="px-3 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border border-indigo-200 rounded-md text-xs font-bold transition-all shadow-2xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap"
                  >
                    {auditandoIA ? (
                      <>
                        <div className="h-3.5 w-3.5 border-2 border-indigo-900 border-t-transparent rounded-full animate-spin" />
                        <span>Auditando...</span>
                      </>
                    ) : (
                      <>
                        <span>✨ Auditar con IA</span>
                      </>
                    )}
                  </button>
                )}
              </div>
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
                        {listasActivas.map((l) => (
                          <th key={l.id} className="p-2.5 font-bold text-blue-900 text-right whitespace-nowrap">
                            {l.nombre}
                          </th>
                        ))}
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
                    ? listaFiltrosRender.map((f, idx) => {
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
                          {listasActivas.map((l) => {
                            const p = f.preciosListas?.[l.id];
                            return (
                              <td key={l.id} className="p-2.5 text-right font-mono font-bold text-blue-900 align-top">
                                {p !== undefined && p > 0 ? `$${p.toFixed(2)}` : <span className="text-slate-300 font-normal">—</span>}
                              </td>
                            );
                          })}
                          <td className="p-2.5 text-center font-bold align-top">
                            <span className={f.activo !== false ? 'text-green-700' : 'text-slate-400'}>
                              {f.activo !== false ? 'Visible' : 'Oculto'}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                    : listaVehiculosRender.map((v, idx) => {
                      const alertaFila = alertasPorIndice.get(idx);
                      return (
                        <tr
                          key={idx}
                          className={
                            alertaFila
                              ? 'bg-amber-50/70 border-l-4 border-l-amber-500'
                              : v.tipoAccion === 'nuevo'
                              ? 'bg-green-50/40'
                              : v.tipoAccion === 'actualizar'
                              ? 'bg-amber-50/40'
                              : v.tipoAccion === 'error'
                              ? 'bg-red-50/40'
                              : ''
                          }
                        >
                          <td className="p-2.5 font-bold align-top">
                            {v.tipoAccion === 'nuevo' && <span className="text-green-700">Nuevo</span>}
                            {v.tipoAccion === 'actualizar' && <span className="text-amber-700">Actualizar Año</span>}
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
                          <td className="p-2.5 text-slate-600 align-top font-bold">{v.año || '—'}</td>
                          <td className="p-2.5 font-bold text-blue-900 align-top">{v.filtro_asociado}</td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>

            {/* Botón para ver más de 150 filas si aplica */}
            {((tipo === 'filtros' && filasFiltrosVisibles.length > 150) ||
              (tipo === 'vehiculos' && filasVehiculosVisibles.length > 150)) &&
              !mostrarTodas && (
                <div className="text-center pt-2">
                  <button
                    type="button"
                    onClick={() => setMostrarTodas(true)}
                    className="text-xs font-bold text-blue-900 bg-blue-50 hover:bg-blue-100 px-3 py-1 rounded border border-blue-200 cursor-pointer"
                  >
                    Ver todas las {tipo === 'filtros' ? filasFiltrosVisibles.length : filasVehiculosVisibles.length} filas
                  </button>
                </div>
              )}

            {/* Barra de Progreso durante la importación */}
            {importando && (
              <div className="space-y-1 mt-3">
                <div className="flex justify-between text-xs font-bold text-slate-600">
                  <span>Guardando y sincronizando con la base de datos...</span>
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

        {/* Footer actions */}
        <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
          {archivo && !resultadoFinal ? (
            <button
              onClick={() => {
                setArchivo(null);
                setFilasFiltros([]);
                setFilasVehiculos([]);
                setAuditoriaIA(null);
              }}
              disabled={importando}
              className="text-xs text-slate-500 hover:text-slate-800 font-semibold cursor-pointer"
            >
              ← Cambiar archivo
            </button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2">
            <button
              onClick={onCerrar}
              disabled={importando}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors cursor-pointer"
            >
              {resultadoFinal ? 'Cerrar' : 'Cancelar'}
            </button>

            {!resultadoFinal && tieneFilasParaImportar && (
              <button
                onClick={ejecutarImportacion}
                disabled={importando}
                className="px-5 py-2 text-xs font-bold text-white bg-blue-900 hover:bg-blue-800 rounded-md transition-colors shadow flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
              >
                {importando ? (
                  <>
                    <div className="h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Guardando... ({progreso}%)</span>
                  </>
                ) : (
                  <span>Confirmar e Importar ({totalValidos})</span>
                )}
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}

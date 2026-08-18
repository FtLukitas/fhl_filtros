'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import type { Filtro, Vehiculo } from '@/lib/types';
import ImportadorExcel from '../productos/components/ImportadorExcel';
import MarkdownRenderer from '@/app/components/MarkdownRenderer';

interface DiagnosticoIA {
  scoreSalud: number;
  dictamen: 'Aprobado' | 'Advertencias' | 'Riesgoso';
  resumen: string;
  totalFilas: number;
  totalAlertas: number;
  filasConAlerta: {
    index: number;
    codigo: string;
    tipo: string;
    severidad: string;
    mensaje: string;
    sugerencia: string;
  }[];
  recomendaciones: string[];
}

interface MensajeChat {
  id: string;
  rol: 'user' | 'assistant';
  texto: string;
  timestamp: Date;
}

export default function PaginaAuditoria() {
  const [cargandoDatos, setCargandoDatos] = useState(true);
  const [auditandoIA, setAuditandoIA] = useState(false);
  const [filtros, setFiltros] = useState<Filtro[]>([]);
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);
  const [diagnostico, setDiagnostico] = useState<DiagnosticoIA | null>(null);
  const [modalImportar, setModalImportar] = useState<'filtros' | 'vehiculos' | null>(null);
  const [mostrarTablaDetalle, setMostrarTablaDetalle] = useState(false);

  // Chat con la IA
  const [mensajes, setMensajes] = useState<MensajeChat[]>([]);
  const [inputMensaje, setInputMensaje] = useState('');
  const [enviandoMensaje, setEnviandoMensaje] = useState(false);
  const [temperatura, setTemperatura] = useState<number>(0.0); // 0.0: Máxima precisión determinística
  const chatBottomRef = useRef<HTMLDivElement>(null);

  const cargarYAuditar = async () => {
    setCargandoDatos(true);
    try {
      const [resFiltros, resVehiculos] = await Promise.all([
        supabase.from('Tabla A').select('*').or('eliminado.is.null,eliminado.eq.false'),
        supabase.from('Tabla B').select('*').or('eliminado.is.null,eliminado.eq.false'),
      ]);

      const dataFiltros = (resFiltros.data as Filtro[]) || [];
      const dataVehiculos = (resVehiculos.data as Vehiculo[]) || [];

      setFiltros(dataFiltros);
      setVehiculos(dataVehiculos);

      // Iniciar mensaje de bienvenida del chat
      setMensajes([
        {
          id: 'msg-bienvenida',
          rol: 'assistant',
          texto: `¡Hola! Soy tu **Auditor Técnico y de Calidad de FHL Filtros**.\n\nTengo acceso directo e indexado a tus **${dataFiltros.length} filtros de habitáculo** y **${dataVehiculos.length} aplicaciones de vehículos** en la base de datos.\n\nPodés pedirme auditorías específicas, tablas comparativas por marca o modelo, detección de filtros sin medidas o análisis de precios.`,
          timestamp: new Date(),
        },
      ]);

      // Ejecutar auditoría IA con la base de datos actual
      if (dataFiltros.length > 0) {
        setAuditandoIA(true);
        const res = await fetch('/api/admin/auditoria-excel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tipo: 'filtros', filas: dataFiltros }),
        });

        if (res.ok) {
          const json = await res.json();
          if (json.success && json.auditoria) {
            setDiagnostico(json.auditoria);
          }
        }
      }
    } catch (err) {
      console.error('Error al cargar datos para auditoría:', err);
    } finally {
      setCargandoDatos(false);
      setAuditandoIA(false);
    }
  };

  useEffect(() => {
    cargarYAuditar();
  }, []);

  // Auto-scroll del chat al agregar mensajes
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mensajes, enviandoMensaje]);

  // Métricas calculadas
  const sinPrecio = filtros.filter((f) => !f.precio || f.precio <= 0);
  const precioAtipico = filtros.filter((f) => Number(f.precio || 0) > 100000);
  const sinDimensiones = filtros.filter((f) => !f.dimensiones || f.dimensiones.trim() === '');
  const ocultosWeb = filtros.filter((f) => f.activo === false);

  const codigosFiltros = new Set(filtros.map((f) => (f.codigo_fhl || '').trim().toUpperCase()));
  const vehiculosHuerfanos = vehiculos.filter(
    (v) => v.filtro_asociado && !codigosFiltros.has(v.filtro_asociado.trim().toUpperCase())
  );

  const enviarMensajeChat = async (texto: string) => {
    const textoAEnviar = texto.trim();
    if (!textoAEnviar || enviandoMensaje) return;

    const mensajeUsuario: MensajeChat = {
      id: `usr-${Date.now()}`,
      rol: 'user',
      texto: textoAEnviar,
      timestamp: new Date(),
    };

    const nuevosMensajes = [...mensajes, mensajeUsuario];
    setMensajes(nuevosMensajes);
    setInputMensaje('');
    setEnviandoMensaje(true);

    try {
      // 1. Construir mapa de conteo de aplicaciones de vehículos por filtro
      const conteoVehiculosPorFiltro = new Map<string, number>();
      const vehiculosPorMarca = new Map<string, { total: number; modelos: Set<string>; filtros: Set<string> }>();

      vehiculos.forEach((v) => {
        const codFiltro = (v.filtro_asociado || '').trim().toUpperCase();
        if (codFiltro) {
          conteoVehiculosPorFiltro.set(codFiltro, (conteoVehiculosPorFiltro.get(codFiltro) || 0) + 1);
        }

        const marca = (v.marca || '').trim().toUpperCase();
        if (marca) {
          if (!vehiculosPorMarca.has(marca)) {
            vehiculosPorMarca.set(marca, { total: 0, modelos: new Set(), filtros: new Set() });
          }
          const info = vehiculosPorMarca.get(marca)!;
          info.total += 1;
          if (v.modelo) info.modelos.add(v.modelo.trim());
          if (codFiltro) info.filtros.add(codFiltro);
        }
      });

      // Resumen estructurado y de alta resolución del catálogo completo (100% de los datos)
      const contextoCatalogo = {
        metricasGenerales: {
          totalFiltrosEnCatalogo: filtros.length,
          totalAplicacionesVehiculos: vehiculos.length,
          marcasDeVehiculosRegistradas: vehiculosPorMarca.size,
          filtrosOcultosEnWeb: ocultosWeb.length,
          filtrosSinPrecio: sinPrecio.length,
          filtrosPrecioAtipicoMayorA100k: precioAtipico.length,
          filtrosSinMedidas: sinDimensiones.length,
          vehiculosHuerfanosSinFiltroValido: vehiculosHuerfanos.length,
        },
        diagnosticoCritico: {
          codigosSinPrecio: sinPrecio.map((f) => f.codigo_fhl),
          codigosPrecioAtipico: precioAtipico.map((f) => ({ codigo: f.codigo_fhl, precio: f.precio })),
          codigosSinMedidas: sinDimensiones.map((f) => f.codigo_fhl),
          vehiculosHuerfanos: vehiculosHuerfanos.map((v) => `${v.marca} ${v.modelo} (asociado a: ${v.filtro_asociado})`),
        },
        resumenVehiculosPorMarca: Array.from(vehiculosPorMarca.entries()).map(([marca, data]) => ({
          marca,
          totalAplicaciones: data.total,
          modelosPrincipales: Array.from(data.modelos).slice(0, 10),
          filtrosFHLUtilizados: Array.from(data.filtros).slice(0, 10),
        })),
        catalogoCompletoFiltros: filtros.map((f) => ({
          codigo_fhl: f.codigo_fhl,
          precio: f.precio || 0,
          dimensiones: f.dimensiones || 'Sin medidas',
          equivalencias: f.equivalencias || 'Sin equivalencias',
          aplicacion: f.descripcion_aplicacion || 'Sin descripción',
          total_vehiculos_asociados: conteoVehiculosPorFiltro.get(f.codigo_fhl.toUpperCase()) || 0,
          activo_en_web: f.activo !== false,
        })),
      };

      // Formatear historial reciente para OpenRouter
      const historialOpenRouter = nuevosMensajes.slice(-8).map((m) => ({
        role: m.rol === 'user' ? ('user' as const) : ('assistant' as const),
        content: m.texto,
      }));

      const systemPrompt = `Sos el Auditor Técnico Principal y Experto en Catálogo Automotriz de la fábrica "FHL Filtros" (Argentina).
Tenés acceso al 100% de los datos reales del catálogo (${filtros.length} filtros y ${vehiculos.length} vehículos).

DIRECTIVAS DE MÁXIMA PRECISIÓN Y EXACTITUD (Temperatura configurada: ${temperatura}):
1. CERO ALUCINACIONES: Toda respuesta debe basarse ESTRICTAMENTE en los datos reales del catálogo adjunto.
2. CONOCIMIENTO DE DOMINIO AUTOMOTRIZ:
   - Filtros de habitáculo / cabina (polen y carbón activado).
   - Equivalencias cruzadas habituales: Wega (AKX/AKX-C), Fram (CF), Mann Filter (CU/CUK), Mahle (LA/LAK), Bosch (0986...), Tecfil (ACP).
   - Formato estándar de medidas en milímetros (Largo x Ancho x Alto).
3. GENERACIÓN DE TABLAS MARKDOWN: Siempre que te soliciten listados, precios, comparaciones o marcas, formatealo en TABLAS MARKDOWN completas (| Código | Dimensiones | Precio | ... |).
4. SINTAXIS Y FORMATO: Usá Markdown enriquecido: negritas **...**, listas ordenadas o viñetas, código \`...\` y secciones con encabezados ###.
5. Respuestas en español neutro rioplatense, sumamente analíticas, claras, ejecutivas y precisas.`;

      // Llamar al endpoint del servidor que custodia la clave OPENROUTER_API_KEY de forma 100% segura
      const res = await fetch('/api/admin/auditoria-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemPrompt,
          contextoCatalogo,
          historial: historialOpenRouter,
          temperatura,
        }),
      });

      let textoRespuesta = '';

      if (res.ok) {
        const json = await res.json();
        textoRespuesta = json.respuesta || 'No se pudo obtener respuesta del motor de IA.';
      } else {
        textoRespuesta = 'Hubo una demora de conexión con el proveedor de IA. Por favor volvé a enviar tu consulta.';
      }

      setMensajes((prev) => [
        ...prev,
        {
          id: `ast-${Date.now()}`,
          rol: 'assistant',
          texto: textoRespuesta,
          timestamp: new Date(),
        },
      ]);
    } catch (err: any) {
      setMensajes((prev) => [
        ...prev,
        {
          id: `ast-err-${Date.now()}`,
          rol: 'assistant',
          texto: `Ocurrió un error al procesar el mensaje: ${err.message}`,
          timestamp: new Date(),
        },
      ]);
    } finally {
      setEnviandoMensaje(false);
    }
  };

  const sugerenciasRapidas = [
    '¿Qué filtros tienen precios mayores a $50.000?',
    'Armame una tabla de filtros sin medidas',
    '¿Hay vehículos huérfanos o con años futuros?',
    'Dame un resumen ejecutivo de calidad',
    '¿Cuáles son los 5 filtros con más aplicaciones de autos?',
  ];

  return (
    <div className="flex flex-col gap-5">
      
      {/* Barra Superior Despejada */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-5 rounded-lg shadow-xs border border-slate-200/80">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-blue-900 uppercase tracking-wider bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
              Control de Calidad IA
            </span>
            <span className="text-[11px] text-slate-500 font-mono font-bold">Nemotron Nano Engine (~400ms)</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            Auditoría Inteligente de Catálogo y Cargas
          </h1>
          <p className="text-xs text-slate-500 font-medium">
            Inspección continua de precios, medidas, compatibilidades y asistente interactivo con soporte Markdown.
          </p>
        </div>

        {/* Acciones y Métricas Resumidas */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setModalImportar('filtros')}
            className="px-3.5 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold text-xs rounded-md border border-slate-200 transition-colors shadow-2xs flex items-center gap-1.5 cursor-pointer"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <span>Importar Excel</span>
          </button>

          <button
            onClick={cargarYAuditar}
            disabled={auditandoIA || cargandoDatos}
            className="px-4 py-2 bg-blue-900 hover:bg-blue-800 text-white font-bold text-xs rounded-md transition-colors shadow-2xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            {auditandoIA ? (
              <>
                <div className="h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Re-analizando...</span>
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <polyline points="23 4 23 10 17 10" />
                  <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" />
                </svg>
                <span>Re-analizar Catálogo</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Franja de Indicadores Rápidos sin bordes pesados */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white px-4 py-3 rounded-lg border border-slate-200/80 shadow-2xs">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Filtros Activos</span>
          <div className="flex items-baseline gap-1.5 mt-0.5">
            <span className="text-lg font-black text-slate-800">{filtros.length}</span>
            <span className="text-[10px] text-slate-400 font-medium">({ocultosWeb.length} ocultos)</span>
          </div>
        </div>

        <div className="bg-white px-4 py-3 rounded-lg border border-slate-200/80 shadow-2xs">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Vehículos</span>
          <div className="flex items-baseline gap-1.5 mt-0.5">
            <span className="text-lg font-black text-slate-800">{vehiculos.length}</span>
            <span className="text-[10px] text-slate-400 font-medium">modelos</span>
          </div>
        </div>

        <div className={`px-4 py-3 rounded-lg border shadow-2xs ${sinPrecio.length > 0 ? 'bg-red-50/70 border-red-200' : 'bg-white border-slate-200/80'}`}>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Sin Precio ($0)</span>
          <span className={`text-lg font-black mt-0.5 block ${sinPrecio.length > 0 ? 'text-red-700' : 'text-slate-800'}`}>
            {sinPrecio.length}
          </span>
        </div>

        <div className={`px-4 py-3 rounded-lg border shadow-2xs ${precioAtipico.length > 0 ? 'bg-amber-50/70 border-amber-200' : 'bg-white border-slate-200/80'}`}>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Precios &gt; $100k</span>
          <span className={`text-lg font-black mt-0.5 block ${precioAtipico.length > 0 ? 'text-amber-700' : 'text-slate-800'}`}>
            {precioAtipico.length}
          </span>
        </div>

        <div className={`px-4 py-3 rounded-lg border shadow-2xs ${sinDimensiones.length > 0 ? 'bg-amber-50/70 border-amber-200' : 'bg-white border-slate-200/80'}`}>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Sin Medidas</span>
          <span className={`text-lg font-black mt-0.5 block ${sinDimensiones.length > 0 ? 'text-amber-700' : 'text-slate-800'}`}>
            {sinDimensiones.length}
          </span>
        </div>

        <div className={`px-4 py-3 rounded-lg border shadow-2xs ${vehiculosHuerfanos.length > 0 ? 'bg-red-50/70 border-red-200' : 'bg-white border-slate-200/80'}`}>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Huérfanos</span>
          <span className={`text-lg font-black mt-0.5 block ${vehiculosHuerfanos.length > 0 ? 'text-red-700' : 'text-slate-800'}`}>
            {vehiculosHuerfanos.length}
          </span>
        </div>
      </div>

      {/* SECCIÓN PRINCIPAL: CHAT EXPANSIVO (HERO WORKSPACE) */}
      <div className="bg-white rounded-lg shadow-sm border border-slate-200/90 flex flex-col flex-1 overflow-hidden min-h-[580px]">
        
        {/* Barra Superior del Chat */}
        <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-md bg-blue-600 flex items-center justify-center text-white shrink-0 shadow-xs">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-white tracking-wide">
                  Chat Auditor IA de Catálogo
                </h2>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-500/20 text-emerald-300 rounded-full text-[10px] font-bold">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Conectado
                </span>
                {diagnostico && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                    Salud: {diagnostico.scoreSalud}% ({diagnostico.dictamen})
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400">
                Preguntá en lenguaje natural. Soporta tablas, listas y análisis comparativos en Markdown.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* Selector de Precisión / Temperatura */}
            <div className="flex items-center gap-1 bg-slate-800 p-1 rounded-md border border-slate-700 text-xs">
              <span className="text-[10px] text-slate-400 font-bold px-1.5 uppercase tracking-wider">
                Precisión:
              </span>
              <button
                type="button"
                onClick={() => setTemperatura(0.0)}
                className={`px-2 py-0.5 rounded text-[11px] font-bold transition-all cursor-pointer ${
                  temperatura === 0.0
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Temperatura 0.0: Máxima exactitud matemática y fáctica sin inventar datos"
              >
                0.0 (Ultra Fino)
              </button>
              <button
                type="button"
                onClick={() => setTemperatura(0.2)}
                className={`px-2 py-0.5 rounded text-[11px] font-bold transition-all cursor-pointer ${
                  temperatura === 0.2
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Temperatura 0.2: Equilibrado con redacción fluida"
              >
                0.2 (Normal)
              </button>
              <button
                type="button"
                onClick={() => setTemperatura(0.5)}
                className={`px-2 py-0.5 rounded text-[11px] font-bold transition-all cursor-pointer ${
                  temperatura === 0.5
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Temperatura 0.5: Respuestas más abiertas y creativas"
              >
                0.5 (Creativo)
              </button>
            </div>

            <button
              onClick={() => {
                setMensajes([
                  {
                    id: `msg-${Date.now()}`,
                    rol: 'assistant',
                    texto: 'Conversación reiniciada. ¿En qué te puedo ayudar sobre el catálogo?',
                    timestamp: new Date(),
                  },
                ]);
              }}
              className="text-xs text-slate-400 hover:text-white px-3 py-1.5 rounded hover:bg-slate-800 transition-colors cursor-pointer font-semibold"
            >
              Limpiar Chat
            </button>
          </div>
        </div>

        {/* Área de Mensajes Despejada y de Ancho Completo */}
        <div className="p-4 sm:p-6 space-y-4 flex-1 overflow-y-auto bg-slate-50/40 min-h-[380px] max-h-[600px]">
          {mensajes.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-3 ${msg.rol === 'user' ? 'justify-end' : 'justify-start w-full'}`}
            >
              {/* Avatar IA */}
              {msg.rol === 'assistant' && (
                <div className="w-8 h-8 rounded-full bg-blue-900 text-white flex items-center justify-center shrink-0 shadow-xs mt-1">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  </svg>
                </div>
              )}

              {/* Burbuja de Mensaje — Expansiva para tablas y Markdown */}
              <div
                className={`rounded-lg p-4 sm:p-5 shadow-2xs text-xs ${
                  msg.rol === 'user'
                    ? 'bg-blue-900 text-white font-medium rounded-tr-none max-w-xl self-end'
                    : 'bg-white text-slate-800 border border-slate-200/90 rounded-tl-none w-full max-w-full'
                }`}
              >
                {msg.rol === 'assistant' ? (
                  <MarkdownRenderer content={msg.texto} />
                ) : (
                  <p className="whitespace-pre-line leading-relaxed">{msg.texto}</p>
                )}

                <span
                  className={`text-[9px] block text-right mt-2 font-mono ${
                    msg.rol === 'user' ? 'text-blue-200' : 'text-slate-400'
                  }`}
                >
                  {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>

              {/* Avatar Usuario */}
              {msg.rol === 'user' && (
                <div className="w-8 h-8 rounded-full bg-slate-800 text-white flex items-center justify-center shrink-0 shadow-xs mt-1 font-bold text-xs">
                  AD
                </div>
              )}
            </div>
          ))}

          {/* Spinner de escribiendo */}
          {enviandoMensaje && (
            <div className="flex gap-3 justify-start items-center w-full">
              <div className="w-8 h-8 rounded-full bg-blue-900 text-white flex items-center justify-center shrink-0 shadow-xs">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
              </div>
              <div className="bg-white border border-slate-200 rounded-lg rounded-tl-none p-3.5 shadow-xs flex items-center gap-2">
                <span className="w-2 h-2 bg-blue-900 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-blue-900 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-blue-900 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                <span className="text-xs text-slate-500 font-semibold ml-2">Consultando catálogo en tiempo real...</span>
              </div>
            </div>
          )}

          <div ref={chatBottomRef} />
        </div>

        {/* Sugerencias Rápidas — Envueltas limpiamente sin scrollbar feo */}
        <div className="px-4 py-2.5 bg-white border-t border-slate-200/80 flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider shrink-0 mr-1">
            Sugerencias:
          </span>
          {sugerenciasRapidas.map((sug, i) => (
            <button
              key={i}
              type="button"
              onClick={() => enviarMensajeChat(sug)}
              disabled={enviandoMensaje}
              className="px-3 py-1 bg-slate-100 hover:bg-blue-50 hover:text-blue-900 text-slate-700 rounded-md text-[11px] font-medium transition-colors cursor-pointer disabled:opacity-50 border border-slate-200/60"
            >
              {sug}
            </button>
          ))}
        </div>

        {/* Barra de Entrada de Mensaje */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            enviarMensajeChat(inputMensaje);
          }}
          className="p-3 bg-slate-100 border-t border-slate-200/80 flex gap-2"
        >
          <input
            type="text"
            value={inputMensaje}
            onChange={(e) => setInputMensaje(e.target.value)}
            placeholder="Escribí tu consulta sobre filtros, precios o vehículos (ej: Armame una tabla con los filtros de Fiat)..."
            disabled={enviandoMensaje}
            className="flex-1 px-4 py-3 bg-white border border-slate-300 rounded-md text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-900 font-medium disabled:opacity-50 shadow-2xs"
          />
          <button
            type="submit"
            disabled={enviandoMensaje || !inputMensaje.trim()}
            className="px-6 py-3 bg-blue-900 hover:bg-blue-800 text-white font-bold text-xs rounded-md transition-colors shadow-xs disabled:opacity-50 cursor-pointer flex items-center gap-2 shrink-0"
          >
            {enviandoMensaje ? (
              <>
                <div className="h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Enviando...</span>
              </>
            ) : (
              <>
                <span>Enviar</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </>
            )}
          </button>
        </form>

      </div>

      {/* Botón Plegable para Ver la Tabla de Filtros Observados */}
      <div className="bg-white rounded-lg border border-slate-200/80 p-4 shadow-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2 h-4 bg-blue-900 rounded-full" aria-hidden="true" />
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Detalle de Filtros Observados ({sinPrecio.length + precioAtipico.length + sinDimensiones.length})
            </h3>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/admin/productos"
              className="text-xs font-bold text-blue-900 hover:underline flex items-center gap-1"
            >
              <span>Ir a Catálogo de Productos</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </Link>

            <button
              onClick={() => setMostrarTablaDetalle(!mostrarTablaDetalle)}
              className="text-xs text-slate-600 hover:text-slate-900 px-3 py-1 bg-slate-100 rounded-md font-bold transition-colors cursor-pointer"
            >
              {mostrarTablaDetalle ? 'Ocultar Detalle' : 'Desplegar Detalle'}
            </button>
          </div>
        </div>

        {mostrarTablaDetalle && (
          <div className="mt-4 border border-slate-200 rounded-md overflow-hidden animate-in fade-in-50 duration-150">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                <tr>
                  <th className="p-3">Código FHL</th>
                  <th className="p-3">Observación Detectada</th>
                  <th className="p-3">Precio Base</th>
                  <th className="p-3">Dimensiones</th>
                  <th className="p-3">Estado Web</th>
                  <th className="p-3 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sinPrecio.concat(precioAtipico).concat(sinDimensiones).slice(0, 30).map((f, idx) => {
                  const esSinPrecio = !f.precio || f.precio <= 0;
                  const esPrecioAlto = Number(f.precio || 0) > 100000;
                  const esSinDim = !f.dimensiones || f.dimensiones.trim() === '';

                  return (
                    <tr key={idx} className="hover:bg-slate-50 transition-colors">
                      <td className="p-3 font-bold text-blue-900 font-mono">{f.codigo_fhl}</td>
                      <td className="p-3">
                        {esSinPrecio && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-800 rounded font-semibold text-[10px] mr-1">
                            Precio $0
                          </span>
                        )}
                        {esPrecioAlto && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-800 rounded font-semibold text-[10px] mr-1">
                            Precio &gt; $100k
                          </span>
                        )}
                        {esSinDim && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 text-slate-700 rounded font-semibold text-[10px]">
                            Sin medidas
                          </span>
                        )}
                      </td>
                      <td className="p-3 font-mono font-bold text-slate-800">
                        {f.precio ? `$${Number(f.precio).toLocaleString('es-AR')}` : '$0.00'}
                      </td>
                      <td className="p-3 text-slate-600">{f.dimensiones || '—'}</td>
                      <td className="p-3 font-semibold">
                        <span className={f.activo !== false ? 'text-green-700' : 'text-slate-400'}>
                          {f.activo !== false ? 'Visible' : 'Oculto'}
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        <Link
                          href="/admin/productos"
                          className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[11px] font-bold transition-colors"
                        >
                          Editar
                        </Link>
                      </td>
                    </tr>
                  );
                })}

                {sinPrecio.length === 0 && precioAtipico.length === 0 && sinDimensiones.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-500 font-semibold text-xs">
                      No se detectaron filtros con anomalías en la base de datos actual.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal de Importador Excel */}
      {modalImportar && (
        <ImportadorExcel
          tipo={modalImportar}
          onFinalizado={() => {
            setModalImportar(null);
            cargarYAuditar();
          }}
          onCerrar={() => setModalImportar(null)}
        />
      )}
    </div>
  );
}

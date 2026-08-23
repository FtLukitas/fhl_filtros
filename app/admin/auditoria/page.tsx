'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import type { Filtro, Vehiculo, ListaPrecio } from '@/lib/types';
import ImportadorExcel from '@/app/admin/productos/components/ImportadorExcel';
import MarkdownViewer from './components/MarkdownViewer';

interface MensajeChat {
  id: string;
  rol: 'user' | 'assistant';
  texto: string;
  timestamp: Date;
}

interface AlertaDetalle {
  index: number;
  codigo: string;
  tipo: 'precio' | 'dimensiones' | 'codigo' | 'vehiculo' | 'inconsistencia';
  severidad: 'baja' | 'media' | 'alta';
  mensaje: string;
  sugerencia: string;
}

interface DiagnosticoAuditoria {
  scoreSalud: number;
  dictamen: 'Aprobado' | 'Advertencias' | 'Riesgoso';
  resumen: string;
  totalFilas: number;
  totalAlertas: number;
  filasConAlerta: AlertaDetalle[];
  recomendaciones: string[];
}

export default function AuditoriaAdminPage() {
  const [cargandoDatos, setCargandoDatos] = useState(true);
  const [auditandoIA, setAuditandoIA] = useState(false);

  // Tablas en memoria
  const [filtros, setFiltros] = useState<Filtro[]>([]);
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);
  const [clientes, setClientes] = useState<any[]>([]);
  const [pedidos, setPedidos] = useState<any[]>([]);
  const [itemsPedido, setItemsPedido] = useState<any[]>([]);
  const [listasPrecios, setListasPrecios] = useState<ListaPrecio[]>([]);
  const [itemsListaPrecio, setItemsListaPrecio] = useState<any[]>([]);
  const [presupuestos, setPresupuestos] = useState<any[]>([]);
  const [pagos, setPagos] = useState<any[]>([]);
  const [movimientosSaldo, setMovimientosSaldo] = useState<any[]>([]);

  const [diagnostico, setDiagnostico] = useState<DiagnosticoAuditoria | null>(null);
  const [modalImportar, setModalImportar] = useState<'filtros' | 'vehiculos' | null>(null);
  const [mostrarTablaDetalle, setMostrarTablaDetalle] = useState(false);

  // Chat con la IA
  const [mensajes, setMensajes] = useState<MensajeChat[]>([]);
  const [inputMensaje, setInputMensaje] = useState('');
  const [enviandoMensaje, setEnviandoMensaje] = useState(false);
  const [temperatura, setTemperatura] = useState<number>(0.0);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  const cargarYAuditar = async () => {
    setCargandoDatos(true);
    try {
      const [
        resFiltros,
        resVehiculos,
        resClientes,
        resPedidos,
        resItemsPedido,
        resListas,
        resItemsListas,
        resPresupuestos,
        resPagos,
        resMovimientosSaldo,
      ] = await Promise.all([
        supabase.from('Tabla A').select('*').or('eliminado.is.null,eliminado.eq.false'),
        supabase.from('Tabla B').select('*').or('eliminado.is.null,eliminado.eq.false'),
        supabase.from('clientes').select('*').eq('eliminado', false),
        supabase.from('pedidos').select('*').order('created_at', { ascending: false }),
        supabase.from('items_pedido').select('*'),
        supabase.from('listas_precios').select('*'),
        supabase.from('items_lista_precio').select('*'),
        supabase.from('presupuestos').select('*'),
        supabase.from('pagos').select('*'),
        supabase.from('movimientos_saldo').select('*'),
      ]);

      const dataFiltros = (resFiltros.data as Filtro[]) || [];
      const dataVehiculos = (resVehiculos.data as Vehiculo[]) || [];
      const dataClientes = resClientes.data || [];
      const dataPedidos = resPedidos.data || [];
      const dataItemsPedido = resItemsPedido.data || [];
      const dataListas = (resListas.data as ListaPrecio[]) || [];
      const dataItemsListas = resItemsListas.data || [];
      const dataPresupuestos = resPresupuestos.data || [];
      const dataPagos = resPagos.data || [];
      const dataMovimientos = resMovimientosSaldo.data || [];

      setFiltros(dataFiltros);
      setVehiculos(dataVehiculos);
      setClientes(dataClientes);
      setPedidos(dataPedidos);
      setItemsPedido(dataItemsPedido);
      setListasPrecios(dataListas);
      setItemsListaPrecio(dataItemsListas);
      setPresupuestos(dataPresupuestos);
      setPagos(dataPagos);
      setMovimientosSaldo(dataMovimientos);

      // Calcular mapa de pagos por pedido
      const pagosMap = new Map<string, number>();
      dataPagos.forEach((p: any) => {
        if (p.pedido_id) {
          pagosMap.set(p.pedido_id, (pagosMap.get(p.pedido_id) || 0) + Number(p.monto || 0));
        }
      });

      // Calcular deuda por pedidos impagos agrupados por cliente
      const deudaPedidosMap = new Map<string, number>();
      dataPedidos.forEach((p: any) => {
        if (p.eliminado || p.estado === 'cancelado') return;
        const total = Number(p.total || 0);
        const abonado = pagosMap.get(p.id) || 0;
        const pendiente = Math.max(0, total - abonado);
        if (p.cliente_id && pendiente > 0) {
          deudaPedidosMap.set(p.cliente_id, (deudaPedidosMap.get(p.cliente_id) || 0) + pendiente);
        }
      });

      // Calcular saldo en cuenta corriente por cliente (movimientos_saldo con signo)
      const balanceMovimientosMap = new Map<string, number>();
      dataMovimientos.forEach((m: any) => {
        if (m.cliente_id) {
          balanceMovimientosMap.set(
            m.cliente_id,
            (balanceMovimientosMap.get(m.cliente_id) || 0) + Number(m.monto || 0)
          );
        }
      });

      // Calcular saldo neto de cada cliente
      let deudaTotalCalculada = 0;
      dataClientes.forEach((c: any) => {
        const deudaPed = deudaPedidosMap.get(c.id) || 0;
        const balanceMov = balanceMovimientosMap.get(c.id) || 0;
        const saldoNeto = balanceMov - deudaPed; // (+) a favor, (-) deuda
        if (saldoNeto < 0) deudaTotalCalculada += Math.abs(saldoNeto);
      });

      // Iniciar mensaje de bienvenida del chat
      setMensajes([
        {
          id: 'msg-bienvenida',
          rol: 'assistant',
          texto: `¡Hola! Soy tu **Auditor Integral de FHL Filtros**.\n\nTengo acceso en tiempo real a **todas las tablas de la empresa**:\n* 📦 **${dataFiltros.length} Filtros de Habitáculo** (Tabla A)\n* 🚗 **${dataVehiculos.length} Aplicaciones de Vehículos** (Tabla B)\n* 👥 **${dataClientes.length} Clientes** (Deuda total consolidada a cobrar: **$${deudaTotalCalculada.toLocaleString('es-AR', { minimumFractionDigits: 2 })}**)\n* 🧾 **${dataPedidos.length} Pedidos de Facturación** (${dataItemsPedido.length} ítems despachados)\n* 🏷️ **${dataListas.length} Listas de Precios** (${dataItemsListas.length} precios por producto)\n* 📄 **${dataPresupuestos.length} Presupuestos** cotizados\n\nPodés pedirme auditorías de precios, extractos de deuda por cliente, rankings de los filtros más vendidos, o comparativas de compatibilidad.`,
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

  // Mapa de pagos para cálculos de KPI
  const pagosMapGlobal = new Map<string, number>();
  pagos.forEach((p) => {
    if (p.pedido_id) {
      pagosMapGlobal.set(p.pedido_id, (pagosMapGlobal.get(p.pedido_id) || 0) + Number(p.monto || 0));
    }
  });

  const deudaPedidosMapGlobal = new Map<string, number>();
  pedidos.forEach((p) => {
    if (p.eliminado || p.estado === 'cancelado') return;
    const total = Number(p.total || 0);
    const abonado = pagosMapGlobal.get(p.id) || 0;
    const pendiente = Math.max(0, total - abonado);
    if (p.cliente_id && pendiente > 0) {
      deudaPedidosMapGlobal.set(p.cliente_id, (deudaPedidosMapGlobal.get(p.cliente_id) || 0) + pendiente);
    }
  });

  const balanceMovimientosMapGlobal = new Map<string, number>();
  movimientosSaldo.forEach((m) => {
    if (m.cliente_id) {
      balanceMovimientosMapGlobal.set(
        m.cliente_id,
        (balanceMovimientosMapGlobal.get(m.cliente_id) || 0) + Number(m.monto || 0)
      );
    }
  });

  let deudaTotalClientes = 0;
  clientes.forEach((c) => {
    const deuda = deudaPedidosMapGlobal.get(c.id) || 0;
    const balanceMov = balanceMovimientosMapGlobal.get(c.id) || 0;
    const saldoNeto = balanceMov - deuda;
    if (saldoNeto < 0) deudaTotalClientes += Math.abs(saldoNeto);
  });

  const facturacionTotalPedidos = pedidos
    .filter((p) => !p.eliminado && p.estado !== 'cancelado')
    .reduce((acc, p) => acc + Number(p.total || 0), 0);

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
      // 1. Mapa de vehículos por filtro
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

      // 2. Ranking de filtros más vendidos
      const ventasPorFiltro = new Map<string, { cantidad: number; totalFacturado: number }>();
      itemsPedido.forEach((it) => {
        const cod = (it.codigo_fhl || '').trim().toUpperCase();
        if (cod) {
          const actual = ventasPorFiltro.get(cod) || { cantidad: 0, totalFacturado: 0 };
          ventasPorFiltro.set(cod, {
            cantidad: actual.cantidad + (it.cantidad || 0),
            totalFacturado: actual.totalFacturado + (Number(it.subtotal) || (Number(it.precio_unitario || 0) * (it.cantidad || 0))),
          });
        }
      });

      const rankingMasVendidos = Array.from(ventasPorFiltro.entries())
        .map(([codigo_fhl, data]) => ({ codigo_fhl, ...data }))
        .sort((a, b) => b.cantidad - a.cantidad);

      // 3. Mapa de clientes con saldo neto exacto (incluye deuda de pedidos y saldo en cuenta corriente)
      const mapaListas = new Map<string, string>();
      listasPrecios.forEach((l) => mapaListas.set(String(l.id), l.nombre));

      const clientesResumen = clientes.map((c) => {
        const deudaPedidos = deudaPedidosMapGlobal.get(c.id) || 0;
        const balanceMov = balanceMovimientosMapGlobal.get(c.id) || 0;
        const saldoNeto = balanceMov - deudaPedidos;
        const totalDeudaReal = saldoNeto < 0 ? Math.abs(saldoNeto) : 0;
        const totalSaldoAFavor = saldoNeto > 0 ? saldoNeto : 0;

        return {
          id: c.id,
          nombre: c.nombre,
          deuda_pedidos_facturados: deudaPedidos,
          ajustes_saldo_cuenta_corriente: balanceMov,
          deuda_total_real_a_cobrar: totalDeudaReal,
          saldo_a_favor_disponible: totalSaldoAFavor,
          resumen_cuenta: totalDeudaReal > 0
            ? `Deudor: Debe $${totalDeudaReal.toLocaleString('es-AR')} (Pedidos: $${deudaPedidos.toLocaleString('es-AR')}${balanceMov < 0 ? ` + Ajuste Deudor Cta Cte: $${Math.abs(balanceMov).toLocaleString('es-AR')}` : balanceMov > 0 ? ` - Saldo a Favor: $${balanceMov.toLocaleString('es-AR')}` : ''})`
            : totalSaldoAFavor > 0
            ? `A Favor: Tiene $${totalSaldoAFavor.toLocaleString('es-AR')} a favor disponible`
            : 'Al Día ($0,00)',
          lista_precio_asignada: mapaListas.get(String(c.lista_precio_id)) || 'Lista Base (Por Defecto)',
          direccion: c.direccion || '—',
          condicion_iva: c.condicion_iva || 'Consumidor Final',
          tipo_cliente: c.tipo_cliente || 'Mayorista',
        };
      }).sort((a, b) => b.deuda_total_real_a_cobrar - a.deuda_total_real_a_cobrar);

      // 4. Mapa de pedidos
      const mapaClientes = new Map<string, string>();
      clientes.forEach((c) => mapaClientes.set(String(c.id), c.nombre));

      const pedidosResumen = pedidos.map((p) => ({
        id: p.id,
        cliente: mapaClientes.get(String(p.cliente_id)) || 'Cliente Desconocido',
        total: Number(p.total || 0),
        estado: p.estado || 'pendiente',
        pagado: p.pagado ? 'SÍ' : 'NO / PENDIENTE',
        fecha: p.created_at ? new Date(p.created_at).toLocaleDateString('es-AR') : '—',
      }));

      // CONTEXTO INTEGRAL DE TODAS LAS TABLAS DE FHL
      const contextoCatalogo = {
        resumenEmpresa: {
          totalFiltros: filtros.length,
          totalVehiculos: vehiculos.length,
          totalClientes: clientes.length,
          deudaTotalClientesNeta: deudaTotalClientes,
          totalPedidos: pedidos.length,
          facturacionTotal: facturacionTotalPedidos,
          totalListasPrecios: listasPrecios.length,
        },
        clientes: clientesResumen,
        pedidosRecientes: pedidosResumen.slice(0, 50),
        rankingFiltrosMasVendidos: rankingMasVendidos.slice(0, 30),
        listasPrecios: listasPrecios.map((l) => ({
          id: l.id,
          nombre: l.nombre,
          tipo_ajuste: l.tipo_ajuste,
          porcentaje: l.porcentaje,
          activa: l.activa,
        })),
        presupuestos: presupuestos.slice(0, 20),
        diagnosticoCriticoCatalogo: {
          codigosSinPrecio: sinPrecio.map((f) => f.codigo_fhl),
          codigosPrecioAtipico: precioAtipico.map((f) => ({ codigo: f.codigo_fhl, precio: f.precio })),
          codigosSinMedidas: sinDimensiones.map((f) => f.codigo_fhl),
          vehiculosHuerfanos: vehiculosHuerfanos.map((v) => `${v.marca} ${v.modelo} (asociado a: ${v.filtro_asociado})`),
        },
        resumenVehiculosPorMarca: Array.from(vehiculosPorMarca.entries()).map(([marca, data]) => ({
          marca,
          totalAplicaciones: data.total,
          modelosPrincipales: Array.from(data.modelos).slice(0, 15),
          filtrosFHLUtilizados: Array.from(data.filtros).slice(0, 15),
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

      const historialOpenRouter = nuevosMensajes.slice(-8).map((m) => ({
        role: m.rol === 'user' ? ('user' as const) : ('assistant' as const),
        content: m.texto,
      }));

      const systemPrompt = `Sos el Auditor Integral, Analista de Negocio y Experto Técnico de "FHL Filtros" (fábrica de filtros de habitáculo de Argentina).
Tenés acceso al 100% de las tablas y bases de datos reales de la empresa:
- Catálogo de Filtros (Tabla A: ${filtros.length} filtros con medidas, equivalencias y precios base).
- Aplicaciones Vehiculares (Tabla B: ${vehiculos.length} compatibilidades por marca, modelo y año).
- Clientes y Cuentas Corrientes (${clientes.length} clientes con saldos deudores de cuenta corriente).
- Pedidos y Facturación (${pedidos.length} pedidos históricos y detalle de despachos).
- Listas de Precios (${listasPrecios.length} listas comerciales y precios diferenciales).
- Presupuestos y Cotizaciones.

REGLAS FINANCIERAS Y DE SALDOS DE CUENTA CORRIENTE:
1. DEUDA NETA REAL (LO QUE DEBEN): Es la Deuda Bruta de Pedidos MENOS el Saldo a Favor del cliente.
   - Cuando te pregunten sobre deudas de clientes, mostrá siempre:
     * Deuda Bruta de Pedidos
     * Saldo a Favor Descontado
     * Deuda Neta Final a Pagar (lo que realmente deben)
2. DIRECTIVAS DE MÁXIMA PRECISIÓN Y EXACTITUD (Temperatura: ${temperatura}):
   - CERO ALUCINACIONES: Toda respuesta debe basarse ESTRICTAMENTE en los datos reales suministrados.
   - GENERACIÓN DE TABLAS MARKDOWN: Siempre formateá listados, deudas, estados de cuenta o comparaciones en TABLAS MARKDOWN completas (| Cliente | Deuda Pedidos | Saldo a Favor | Deuda Neta a Pagar |).
   - Idioma: Español rioplatense profesional, claro, analítico y preciso.`;

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
    '¿Cuáles son los clientes con mayor saldo deudor?',
    '¿Qué filtros son los más vendidos en los pedidos?',
    'Armame una tabla de filtros sin medidas o sin equivalencias',
    '¿Cuáles son los 5 filtros con más aplicaciones de autos?',
    'Dame un resumen ejecutivo integral del negocio',
  ];

  return (
    <div className="flex flex-col gap-5">
      {/* Barra Superior */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-5 rounded-lg shadow-xs border border-slate-200/80">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-blue-900 uppercase tracking-wider bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
              Auditor Integral IA
            </span>
            <span className="text-[11px] text-slate-500 font-mono font-bold">GLM 5.2 / Nemotron Engine • Acceso Total DB</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            Auditoría Inteligente de la Empresa
          </h1>
          <p className="text-xs text-slate-500 font-medium">
            Inspección continua de catálogo (Tabla A y B), clientes, cuentas corrientes, pedidos, listas de precios y presupuestos.
          </p>
        </div>

        {/* Acciones */}
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
                <span>Re-analizar Todo</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Franja de Indicadores Rápidos de Todas las Tablas */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white px-4 py-3 rounded-lg border border-slate-200/80 shadow-2xs">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Filtros Activos</span>
          <div className="flex items-baseline gap-1.5 mt-0.5">
            <span className="text-lg font-black text-slate-800">{filtros.length}</span>
            <span className="text-[10px] text-slate-400 font-medium">({ocultosWeb.length} ocultos)</span>
          </div>
        </div>

        <div className="bg-white px-4 py-3 rounded-lg border border-slate-200/80 shadow-2xs">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Vehículos (Tabla B)</span>
          <div className="flex items-baseline gap-1.5 mt-0.5">
            <span className="text-lg font-black text-slate-800">{vehiculos.length}</span>
            <span className="text-[10px] text-slate-400 font-medium">modelos</span>
          </div>
        </div>

        <div className="bg-white px-4 py-3 rounded-lg border border-slate-200/80 shadow-2xs">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Clientes Registrados</span>
          <div className="flex items-baseline gap-1.5 mt-0.5">
            <span className="text-lg font-black text-slate-800">{clientes.length}</span>
            <span className="text-[10px] text-slate-400 font-medium">cuentas</span>
          </div>
        </div>

        <div className={`px-4 py-3 rounded-lg border shadow-2xs ${deudaTotalClientes > 0 ? 'bg-amber-50/70 border-amber-200' : 'bg-white border-slate-200/80'}`}>
          <span className="text-[10px] font-bold text-amber-800 uppercase tracking-wider block">Deuda Total Clientes</span>
          <span className="text-base font-black font-mono text-amber-900 mt-0.5 block truncate">
            ${deudaTotalClientes.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
          </span>
        </div>

        <div className="bg-white px-4 py-3 rounded-lg border border-slate-200/80 shadow-2xs">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Facturación Pedidos</span>
          <span className="text-base font-black font-mono text-emerald-800 mt-0.5 block truncate">
            ${facturacionTotalPedidos.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
          </span>
        </div>

        <div className="bg-white px-4 py-3 rounded-lg border border-slate-200/80 shadow-2xs">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Listas de Precios</span>
          <div className="flex items-baseline gap-1.5 mt-0.5">
            <span className="text-lg font-black text-slate-800">{listasPrecios.length}</span>
            <span className="text-[10px] text-slate-400 font-medium">activas</span>
          </div>
        </div>
      </div>

      {/* Tarjeta de Diagnóstico IA */}
      {diagnostico && (
        <div className="bg-white rounded-lg border border-slate-200/80 p-5 shadow-2xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div className="flex items-center gap-3">
              <div
                className={`h-12 w-12 rounded-xl flex items-center justify-center font-black text-lg ${
                  diagnostico.dictamen === 'Aprobado'
                    ? 'bg-emerald-100 text-emerald-800'
                    : diagnostico.dictamen === 'Advertencias'
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-red-100 text-red-800'
                }`}
              >
                {diagnostico.scoreSalud}%
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                    Score de Salud Técnica
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${
                      diagnostico.dictamen === 'Aprobado'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : diagnostico.dictamen === 'Advertencias'
                        ? 'bg-amber-50 text-amber-700 border border-amber-200'
                        : 'bg-red-50 text-red-700 border border-red-200'
                    }`}
                  >
                    {diagnostico.dictamen}
                  </span>
                </div>
                <h3 className="text-base font-black text-slate-800 mt-0.5">
                  Diagnóstico Automático del Catálogo
                </h3>
              </div>
            </div>

            {diagnostico.filasConAlerta.length > 0 && (
              <button
                type="button"
                onClick={() => setMostrarTablaDetalle(!mostrarTablaDetalle)}
                className="text-xs font-bold text-blue-900 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-md border border-blue-200 transition-colors cursor-pointer"
              >
                {mostrarTablaDetalle ? 'Ocultar Detalle' : `Ver ${diagnostico.filasConAlerta.length} Anomalías`}
              </button>
            )}
          </div>

          <p className="text-xs text-slate-700 leading-relaxed font-medium">
            {diagnostico.resumen}
          </p>

          {/* Tabla de anomalías si se expande */}
          {mostrarTablaDetalle && diagnostico.filasConAlerta.length > 0 && (
            <div className="max-h-60 overflow-y-auto border border-slate-200 rounded-lg">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold sticky top-0 uppercase tracking-wider">
                  <tr>
                    <th className="p-2.5">Código</th>
                    <th className="p-2.5">Severidad</th>
                    <th className="p-2.5">Anomalía</th>
                    <th className="p-2.5">Sugerencia</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {diagnostico.filasConAlerta.map((a, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="p-2.5 font-bold font-mono text-slate-900">{a.codigo}</td>
                      <td className="p-2.5">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                            a.severidad === 'alta'
                              ? 'bg-red-100 text-red-800'
                              : a.severidad === 'media'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {a.severidad.toUpperCase()}
                        </span>
                      </td>
                      <td className="p-2.5 text-slate-700 font-medium">{a.mensaje}</td>
                      <td className="p-2.5 text-slate-500">{a.sugerencia}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* SECCIÓN DEL CHAT INTERACTIVO CON IA */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs flex flex-col h-[580px] overflow-hidden">
        {/* Encabezado del chat */}
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-full bg-blue-900 text-white flex items-center justify-center font-black text-xs shadow-xs">
              IA
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <span>Auditor Integral FHL</span>
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" title="Conectado y listo" />
              </h3>
              <span className="text-[10px] text-slate-400 font-mono">
                Indexado a 9 tablas: Filtros, Vehículos, Clientes, Pedidos, Precios y Presupuestos
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setMensajes([
                  {
                    id: `msg-reset-${Date.now()}`,
                    rol: 'assistant',
                    texto: 'Conversación reiniciada. ¿Qué datos del catálogo, pedidos o clientes querés consultar?',
                    timestamp: new Date(),
                  },
                ]);
              }}
              className="text-[11px] text-slate-500 hover:text-slate-800 font-bold px-2.5 py-1 rounded hover:bg-slate-200/60 transition-colors cursor-pointer"
            >
              Limpiar Chat
            </button>
          </div>
        </div>

        {/* Mensajes del chat */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {mensajes.map((m) => (
            <div
              key={m.id}
              className={`flex gap-3 ${m.rol === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {m.rol === 'assistant' && (
                <div className="h-7 w-7 rounded-full bg-blue-900 text-white flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">
                  FHL
                </div>
              )}

              <div
                className={`max-w-2xl rounded-xl p-3.5 text-xs ${
                  m.rol === 'user'
                    ? 'bg-blue-900 text-white font-medium rounded-tr-none'
                    : 'bg-slate-50 border border-slate-200/80 text-slate-800 rounded-tl-none shadow-2xs'
                }`}
              >
                {m.rol === 'user' ? (
                  <p className="whitespace-pre-wrap">{m.texto}</p>
                ) : (
                  <MarkdownViewer content={m.texto} />
                )}
                <span
                  className={`text-[9px] block mt-1.5 ${
                    m.rol === 'user' ? 'text-blue-200 text-right' : 'text-slate-400 text-left'
                  }`}
                >
                  {m.timestamp.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>
          ))}

          {enviandoMensaje && (
            <div className="flex gap-3 justify-start">
              <div className="h-7 w-7 rounded-full bg-blue-900 text-white flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">
                FHL
              </div>
              <div className="bg-slate-50 border border-slate-200/80 rounded-xl rounded-tl-none p-3 text-xs text-slate-500 flex items-center gap-2">
                <div className="h-3 w-3 border-2 border-blue-900 border-t-transparent rounded-full animate-spin" />
                <span>Consultando las bases de datos con GLM 5.2...</span>
              </div>
            </div>
          )}

          <div ref={chatBottomRef} />
        </div>

        {/* Sugerencias Rápidas */}
        <div className="px-4 py-2 bg-slate-50 border-t border-slate-100 flex items-center gap-2 overflow-x-auto text-xs">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider shrink-0">
            Sugerencias:
          </span>
          {sugerenciasRapidas.map((s, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => enviarMensajeChat(s)}
              disabled={enviandoMensaje}
              className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 font-bold rounded-md transition-colors shadow-2xs whitespace-nowrap cursor-pointer text-[11px] disabled:opacity-50"
            >
              {s}
            </button>
          ))}
        </div>

        {/* Input para escribir */}
        <div className="p-3 bg-white border-t border-slate-200/80 flex items-center gap-2">
          <input
            type="text"
            value={inputMensaje}
            onChange={(e) => setInputMensaje(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                enviarMensajeChat(inputMensaje);
              }
            }}
            placeholder="Preguntale al auditor sobre catálogo, deudas de clientes, pedidos o precios..."
            disabled={enviandoMensaje}
            className="flex-1 px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-900 focus:bg-white text-slate-900 placeholder:text-slate-400 font-medium"
          />

          <button
            type="button"
            onClick={() => enviarMensajeChat(inputMensaje)}
            disabled={enviandoMensaje || !inputMensaje.trim()}
            className="px-4 py-2.5 bg-blue-900 hover:bg-blue-800 text-white font-bold text-xs rounded-lg transition-colors shadow-xs disabled:opacity-50 cursor-pointer flex items-center gap-1.5 shrink-0"
          >
            <span>Enviar</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
      </div>

      {/* Modal de importación */}
      {modalImportar && (
        <ImportadorExcel
          tipo={modalImportar}
          onCerrar={() => setModalImportar(null)}
          onFinalizado={() => {
            setModalImportar(null);
            cargarYAuditar();
          }}
        />
      )}
    </div>
  );
}

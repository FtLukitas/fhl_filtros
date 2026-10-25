import type { Pedido, Pago, MovimientoSaldo, EstadoPagoPedido } from './types';

function formatearCodigoLocal(
  identificador?: string | number | null,
  fecha?: string | Date | null,
  numeroSecuencial?: number | null
): string {
  let anio = 2026;
  if (fecha) {
    try {
      const y = new Date(fecha).getFullYear();
      if (!isNaN(y)) anio = y;
    } catch {
      anio = 2026;
    }
  }
  const numVal = numeroSecuencial ?? (typeof identificador === 'number' ? identificador : null);
  if (numVal !== null && numVal !== undefined && !isNaN(Number(numVal)) && Number(numVal) > 0) {
    return `${anio}-${String(numVal).padStart(4, '0')}`;
  }
  if (typeof identificador === 'string' && identificador.trim()) {
    const str = identificador.trim();
    if (/^\d{4}-\d+$/i.test(str)) return str;
    return str.slice(0, 8);
  }
  return `${anio}-0000`;
}

export interface ItemExtractoCuenta {
  id: string;
  fecha: string;
  tipo: 'pedido' | 'pago' | 'ajuste';
  titulo: string;
  subtitulo?: string;
  debito: number; // Cargo (-)
  credito: number; // Abono (+)
  montoNeto: number; // + crédito, - débito
  saldoAcumulado: number;
  referenciaId?: string;
  estadoPago?: EstadoPagoPedido;
  deudaRestante?: number;
  badge?: string;
}

export type PedidoConEstadoFIFO = Pedido & {
  totalAbonadoFIFO: number;
  deudaRestanteFIFO: number;
  estadoPagoFIFO: EstadoPagoPedido;
};

export interface ResumenCuentaCliente {
  totalComprado: number;
  totalCargosManuales: number;
  totalPagado: number;
  saldoNeto: number;
  deudaTotal: number;
  saldoAFavor: number;
  deudaAnteriorTotal: number;
  deudaAnteriorRestante: number;
  pedidosConEstadoFIFO: PedidoConEstadoFIFO[];
  sumaDeudaPedidosFIFO: number;
  extracto: ItemExtractoCuenta[];
  saldoFinalExtracto: number;
  pedidosPendientesCount: number;
  pedidosImpagosCount: number;
}

export interface ParamsResumenCuenta {
  pedidos?: Pedido[];
  pagos?: Pago[];
  movimientosSaldo?: MovimientoSaldo[];
}

/**
 * Motor central de Cuenta Corriente e Imputación FIFO de FHL Filtros.
 * Garantiza coincidencia matemática exacta al 100% entre:
 *  - Saldo acumulado final del extracto
 *  - Saldo neto de la cuenta
 *  - Deuda total adeudada y la suma de deudas FIFO (pedidos pendientes + deuda anterior restante)
 */
export function calcularResumenCuentaCliente({
  pedidos = [],
  pagos = [],
  movimientosSaldo = [],
}: ParamsResumenCuenta): ResumenCuentaCliente {
  // 1. Filtrar pedidos activos
  const pedidosActivos = pedidos.filter((p) => !p.eliminado && p.estado !== 'cancelado');
  const pedidosCanceladosOEliminadosIds = new Set(
    pedidos.filter((p) => p.eliminado || p.estado === 'cancelado').map((p) => p.id)
  );

  // 2. Cargos manuales (Deuda anterior)
  // Movimientos con monto < 0 que no sean 'aplicado', O caso especial MARADEI: tipo === 'aplicado' pero sin referencia_pedido_id
  let totalCargosManuales = 0;
  const cargosManualesList: {
    id: string;
    fecha: string;
    monto: number;
    nota: string;
    tipo: string;
    movimiento: MovimientoSaldo;
  }[] = [];

  for (const m of movimientosSaldo) {
    if (m.referencia_pedido_id && pedidosCanceladosOEliminadosIds.has(m.referencia_pedido_id)) {
      continue;
    }
    const monto = Number(m.monto || 0);
    // Caso cargo manual: monto negativo y no es un aplicado normal a un pedido
    const esCargoManual = monto < 0 && (m.tipo !== 'aplicado' || !m.referencia_pedido_id);
    if (esCargoManual) {
      const absMonto = Math.abs(monto);
      totalCargosManuales += absMonto;
      cargosManualesList.push({
        id: m.id,
        fecha: m.fecha || '1970-01-01',
        monto: absMonto,
        nota: m.nota || 'Saldo deudor anterior',
        tipo: m.tipo,
        movimiento: m,
      });
    }
  }

  // 3. Total comprado en pedidos activos
  const totalComprado = pedidosActivos.reduce((acc, p) => acc + Number(p.total || 0), 0);

  // 4. Identificar pagos y fondos efectivamente ingresados
  let totalPagado = 0;

  // Movimientos aplicados válidos para distinguir compensaciones internas de pagos reales
  const movimientosAplicados = movimientosSaldo.filter(
    (m) =>
      m.tipo === 'aplicado' &&
      (!m.referencia_pedido_id || !pedidosCanceladosOEliminadosIds.has(m.referencia_pedido_id))
  );

  // Excedentes originados en pedidos activos que fueron consumidos en pedidos luego cancelados
  const totalAplicadoEnCancelados = movimientosSaldo
    .filter((m) => m.tipo === 'aplicado' && m.referencia_pedido_id && pedidosCanceladosOEliminadosIds.has(m.referencia_pedido_id))
    .reduce((acc, m) => acc + Math.abs(Number(m.monto || 0)), 0);

  const obtenerMontoEfectivoPago = (p: Pago): number => {
    const raw = Number(p.monto || 0);
    if (!p.pedido_id || totalAplicadoEnCancelados <= 0) return raw;
    const exc = movimientosSaldo.find((m) => m.tipo === 'excedente' && m.referencia_pedido_id === p.pedido_id);
    if (!exc) return raw;
    const descuento = Math.min(Number(exc.monto || 0), totalAplicadoEnCancelados);
    return Math.round((raw - descuento) * 100) / 100;
  };

  for (const p of pagos) {
    if (p.pedido_id && pedidosCanceladosOEliminadosIds.has(p.pedido_id)) {
      continue;
    }
    const monto = obtenerMontoEfectivoPago(p);
    if (p.metodo === 'saldo_a_favor') {
      // Si tiene movimiento 'aplicado' en movimientos_saldo, los fondos ya entraron por anticipo/pago previo
      const tieneMovAplicado = movimientosAplicados.some(
        (m) => m.referencia_pedido_id === p.pedido_id || Math.abs(Number(m.monto)) === monto
      );
      if (!tieneMovAplicado) {
        // Caso sin movimiento aplicado (ADRIAN DISTRIBUIDOR / DIEGO): fue un cobro real registrado como saldo_a_favor
        totalPagado += monto;
      }
    } else {
      totalPagado += monto;
    }
  }

  // Anticipos y créditos ingresados en movimientos_saldo
  for (const m of movimientosSaldo) {
    if (m.referencia_pedido_id && pedidosCanceladosOEliminadosIds.has(m.referencia_pedido_id)) {
      continue;
    }
    const monto = Number(m.monto || 0);
    // Omitir 'excedente' porque ya fue sumado en el pago que lo originó
    if (monto > 0 && m.tipo !== 'excedente') {
      totalPagado += monto;
    }
  }

  totalCargosManuales = Math.round(totalCargosManuales * 100) / 100;
  totalPagado = Math.round(totalPagado * 100) / 100;

  // 5. Saldo Neto Único
  const saldoNeto = Math.round((totalPagado - (totalComprado + totalCargosManuales)) * 100) / 100;
  const saldoAFavor = saldoNeto > 0 ? saldoNeto : 0;
  const deudaTotal = saldoNeto < 0 ? Math.abs(saldoNeto) : 0;

  // 6. Imputación FIFO Cronológica
  cargosManualesList.sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());

  const pedidosOrdenados = [...pedidosActivos].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  let creditoDisponible = totalPagado;

  // Imputar a cargos manuales (deuda anterior)
  let deudaAnteriorRestante = 0;
  for (const cargo of cargosManualesList) {
    const aCubrir = cargo.monto;
    const pagado = Math.min(creditoDisponible, aCubrir);
    creditoDisponible = Math.round((creditoDisponible - pagado) * 100) / 100;
    deudaAnteriorRestante += Math.round((aCubrir - pagado) * 100) / 100;
  }
  deudaAnteriorRestante = Math.round(deudaAnteriorRestante * 100) / 100;

  // Imputar a pedidos en orden FIFO
  const pedidosConEstadoFIFO: PedidoConEstadoFIFO[] = pedidosOrdenados.map((p) => {
    const totalP = Math.round(Number(p.total || 0) * 100) / 100;
    const totalAbonadoFIFO = Math.min(creditoDisponible, totalP);
    creditoDisponible = Math.round((creditoDisponible - totalAbonadoFIFO) * 100) / 100;
    const deudaRestanteFIFO = Math.round(Math.max(0, totalP - totalAbonadoFIFO) * 100) / 100;
    const estadoPagoFIFO: EstadoPagoPedido =
      deudaRestanteFIFO <= 0.01
        ? 'saldado'
        : totalAbonadoFIFO > 0
        ? 'parcial'
        : 'impago';

    return {
      ...p,
      totalAbonadoFIFO,
      deudaRestanteFIFO,
      estadoPagoFIFO,
    };
  });

  const sumaDeudaPedidosFIFO =
    Math.round(pedidosConEstadoFIFO.reduce((acc, p) => acc + p.deudaRestanteFIFO, 0) * 100) / 100;

  // 7. Extracto Cronológico
  const extracto: ItemExtractoCuenta[] = [];

  // A. Pedidos activos
  for (const p of pedidosActivos) {
    const t = Number(p.total || 0);
    const fifoInfo = pedidosConEstadoFIFO.find((x) => x.id === p.id);
    const numCod = formatearCodigoLocal(p.numero_secuencial, p.created_at);
    extracto.push({
      id: `ped-${p.id}`,
      fecha: p.created_at,
      tipo: 'pedido',
      titulo: `Pedido #${numCod}`,
      subtitulo: `Estado: ${p.estado.toUpperCase()}`,
      debito: t,
      credito: 0,
      montoNeto: -t,
      saldoAcumulado: 0,
      referenciaId: p.id,
      estadoPago: fifoInfo?.estadoPagoFIFO || 'impago',
      deudaRestante: fifoInfo?.deudaRestanteFIFO ?? t,
      badge: fifoInfo?.estadoPagoFIFO?.toUpperCase() || 'IMPAGO',
    });
  }

  // B. Pagos externos / reales
  for (const p of pagos) {
    if (p.pedido_id && pedidosCanceladosOEliminadosIds.has(p.pedido_id)) {
      continue;
    }
    const m = obtenerMontoEfectivoPago(p);
    const pedAsociado = p.pedido_id ? pedidos.find((x) => x.id === p.pedido_id) : null;
    const refPed = pedAsociado
      ? `Pedido #${formatearCodigoLocal(pedAsociado.numero_secuencial, pedAsociado.created_at)}`
      : 'cuenta';

    if (p.metodo === 'saldo_a_favor') {
      const tieneMovAplicado = movimientosAplicados.some(
        (mov) => mov.referencia_pedido_id === p.pedido_id || Math.abs(Number(mov.monto)) === m
      );
      if (tieneMovAplicado) {
        continue; // Compensación interna omitida
      }
      // Sin movimiento aplicado -> Cobro real
      extracto.push({
        id: `pago-${p.id}`,
        fecha: p.fecha || p.id,
        tipo: 'pago',
        titulo: `Pago / Cobranza (SALDO A FAVOR)`,
        subtitulo: p.nota || `Imputado a ${refPed}`,
        debito: 0,
        credito: m,
        montoNeto: m,
        saldoAcumulado: 0,
        referenciaId: p.pedido_id,
        badge: 'PAGADO',
      });
    } else {
      extracto.push({
        id: `pago-${p.id}`,
        fecha: p.fecha || p.id,
        tipo: 'pago',
        titulo: `Pago / Cobranza (${p.metodo.toUpperCase()})`,
        subtitulo: p.nota || `Imputado a ${refPed}`,
        debito: 0,
        credito: m,
        montoNeto: m,
        saldoAcumulado: 0,
        referenciaId: p.pedido_id,
        badge: 'PAGADO',
      });
    }
  }

  // C. Movimientos de saldo (deudas anteriores y anticipos/cobranzas)
  for (const m of movimientosSaldo) {
    if (m.referencia_pedido_id && pedidosCanceladosOEliminadosIds.has(m.referencia_pedido_id)) {
      continue;
    }
    if (m.tipo === 'excedente') {
      continue;
    }
    const val = Number(m.monto || 0);

    if (val < 0) {
      if (m.tipo === 'aplicado' && m.referencia_pedido_id) {
        continue; // Aplicación normal a pedido
      }
      // Cargo manual / Saldo deudor anterior
      const absVal = Math.abs(val);
      const tituloAjuste = m.nota || 'Saldo deudor anterior';
      extracto.push({
        id: `mov-${m.id}`,
        fecha: m.fecha || m.id,
        tipo: 'ajuste',
        titulo: tituloAjuste.includes('Saldo deudor') ? tituloAjuste : `${tituloAjuste} (Ajuste)`,
        subtitulo: 'Cargo en cuenta corriente',
        debito: absVal,
        credito: 0,
        montoNeto: -absVal,
        saldoAcumulado: 0,
        referenciaId: m.referencia_pedido_id || undefined,
        badge: 'SALDO ANT.',
      });
    } else if (val > 0) {
      extracto.push({
        id: `mov-${m.id}`,
        fecha: m.fecha || m.id,
        tipo: 'pago',
        titulo: `Pago / Cobranza (${m.nota || 'Pago a cuenta'})`,
        subtitulo: m.nota || 'Anticipo / Crédito a favor',
        debito: 0,
        credito: val,
        montoNeto: val,
        saldoAcumulado: 0,
        referenciaId: m.referencia_pedido_id || undefined,
        badge: 'PAGADO',
      });
    }
  }

  // Ordenar extracto cronológicamente ascendente para calcular saldo acumulado
  extracto.sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());

  let acumulado = 0;
  for (const item of extracto) {
    acumulado = Math.round((acumulado + item.montoNeto) * 100) / 100;
    item.saldoAcumulado = acumulado;
  }

  const saldoFinalExtracto = extracto.length > 0 ? extracto[extracto.length - 1].saldoAcumulado : 0;

  const pedidosPendientesCount = pedidosActivos.filter((p) => p.estado === 'pendiente').length;
  const pedidosImpagosCount = pedidosConEstadoFIFO.filter((p) => p.estadoPagoFIFO !== 'saldado').length;

  return {
    totalComprado,
    totalCargosManuales,
    totalPagado,
    saldoNeto,
    deudaTotal,
    saldoAFavor,
    deudaAnteriorTotal: totalCargosManuales,
    deudaAnteriorRestante,
    pedidosConEstadoFIFO,
    sumaDeudaPedidosFIFO,
    extracto,
    saldoFinalExtracto,
    pedidosPendientesCount,
    pedidosImpagosCount,
  };
}

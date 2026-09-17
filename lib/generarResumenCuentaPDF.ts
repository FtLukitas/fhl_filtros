import { jsPDF } from 'jspdf';

export interface ItemPedidoResumen {
  id: string;
  numeroSecuencial?: number;
  fecha: string;
  total: number;
  totalAbonado: number;
  deuda: number;
  estadoLogistico: string;
  estadoPago: 'saldado' | 'parcial' | 'impago';
  itemsCount: number;
}

export interface ItemMovimientoResumen {
  id: string;
  fecha: string;
  concepto: string;
  detalle?: string;
  tipo: string;
  debito: number; // Compras (-)
  credito: number; // Pagos (+)
  montoCompensado?: number;
  saldoAcumulado: number;
  referenciaId?: string;
  estadoPago?: 'saldado' | 'parcial' | 'impago';
}

export interface DatosResumenCuentaPDF {
  cliente: {
    id: string;
    nombre: string;
    cuit?: string | null;
    condicion_iva?: string | null;
    tipo_cliente?: string | null;
    direccion?: string | null;
    ciudad?: string | null;
    provincia?: string | null;
    telefono?: string | null;
    email?: string | null;
  };
  saldoNeto: number; // Positivo = Saldo a Favor, Negativo = Deuda
  totalComprado: number;
  totalPagado: number;
  pedidos: ItemPedidoResumen[];
  movimientos: ItemMovimientoResumen[];
  fechaEmision?: Date | string;
}

// Colores Slate / Ink-friendly
type RGB = [number, number, number];
const NEGRO: RGB = [15, 23, 42]; // Slate 900
const GRIS_OSCURO: RGB = [51, 65, 85]; // Slate 700
const GRIS_MEDIO: RGB = [100, 116, 139]; // Slate 500
const GRIS_LINEA: RGB = [226, 232, 240]; // Slate 200
const GRIS_BG: RGB = [248, 250, 252]; // Slate 50
const BORDE: RGB = [148, 163, 184]; // Slate 400

const ROJO_TEXTO: RGB = [185, 28, 28]; // Red 700
const ROJO_BG: RGB = [254, 242, 242]; // Red 50
const VERDE_TEXTO: RGB = [4, 120, 87]; // Emerald 700
const VERDE_BG: RGB = [236, 253, 245]; // Emerald 50
const AZUL_TEXTO: RGB = [30, 58, 138]; // Blue 900
const AZUL_BG: RGB = [239, 246, 255]; // Blue 50

async function cargarImagenBase64(url: string): Promise<string> {
  const response = await fetch(url);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function sanitizarTextoPDF(texto: string | null | undefined): string {
  if (!texto) return '';
  return texto
    .replace(/→/g, '->')
    .replace(/←/g, '<-')
    .replace(/✓/g, '')
    .replace(/✔/g, '')
    .replace(/•/g, '-')
    .replace(/⚠️/g, '')
    .replace(/⚠/g, '')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, ' ')
    .trim();
}

function formatearMoneda(monto: number): string {
  return `$${monto.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatearFecha(fechaStr: string): string {
  if (!fechaStr) return '—';
  try {
    const d = new Date(fechaStr);
    return d.toLocaleDateString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return fechaStr;
  }
}

export async function generarInstanciaResumenCuentaPDF(datos: DatosResumenCuentaPDF): Promise<jsPDF> {
  const doc = new jsPDF('p', 'mm', 'a4');
  const W = 210;
  const H = 297;
  const M = 14;
  const UTIL = W - M * 2; // 182mm

  const fechaCorte = datos.fechaEmision
    ? (typeof datos.fechaEmision === 'string' ? new Date(datos.fechaEmision) : datos.fechaEmision)
    : new Date();

  const fechaCorteStr = fechaCorte.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  let logoBase64: string | null = null;
  try {
    logoBase64 = await cargarImagenBase64('/FHL_logo.png');
  } catch {
    logoBase64 = null;
  }

  // Encabezado de páginas adicionales
  const imprimirHeaderCompacto = () => {
    doc.setDrawColor(...GRIS_LINEA);
    doc.setLineWidth(0.3);
    doc.line(M, 12, M + UTIL, 12);

    doc.setTextColor(...GRIS_OSCURO);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.text('FHL FILTROS - RESUMEN DE CUENTA CORRIENTE', M, 9.5);

    doc.setFont('helvetica', 'normal');
    const nomCliente = sanitizarTextoPDF(datos.cliente.nombre);
    doc.text(`Cliente: ${nomCliente} - Emision: ${fechaCorteStr}`, M + UTIL, 9.5, { align: 'right' });
  };

  // ==========================================
  // PÁGINA 1: ENCABEZADO INSTITUCIONAL
  // ==========================================

  // Recuadro exterior institucional
  doc.setDrawColor(...BORDE);
  doc.setLineWidth(0.4);
  doc.rect(M, 14, UTIL, 46);

  // Logo FHL
  if (logoBase64) {
    try {
      doc.addImage(logoBase64, 'PNG', M + 3.5, 16.5, 36, 17.3);
    } catch {
      doc.setTextColor(...AZUL_TEXTO);
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('FHL FILTROS', M + 4, 25);
    }
  } else {
    doc.setTextColor(...AZUL_TEXTO);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('FHL FILTROS', M + 4, 25);
  }

  // Título Principal
  doc.setTextColor(...NEGRO);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text('ESTADO DE CUENTA CORRIENTE', M + UTIL - 4, 21, { align: 'right' });

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...GRIS_MEDIO);
  doc.text(`Fecha de emision: ${fechaCorteStr}`, M + UTIL - 4, 26, { align: 'right' });
  doc.text('Resumen detallado de compras, pagos y saldo actual', M + UTIL - 4, 30, { align: 'right' });

  // Línea divisoria horizontal
  doc.setDrawColor(...GRIS_LINEA);
  doc.setLineWidth(0.3);
  doc.line(M, 35, M + UTIL, 35);

  // Línea divisoria vertical Emisor / Cliente
  doc.line(M + 80, 35, M + 80, 60);

  // Emisor (FHL Filtros)
  doc.setTextColor(...NEGRO);
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.text('FHL Filtros S.R.L.', M + 4, 40);

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...GRIS_OSCURO);
  doc.text('Buenos Aires, Argentina', M + 4, 44.5);
  doc.text('WhatsApp: +54 9 11 5953-4330 / 11 3167-9782', M + 4, 49);
  doc.text('Email: ventas@fhlfiltros.com.ar', M + 4, 53.5);
  doc.text('Web: www.fhlfiltros.com.ar', M + 4, 57.5);

  // Receptor (Cliente)
  doc.setTextColor(...NEGRO);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(sanitizarTextoPDF(datos.cliente.nombre), M + 84, 40);

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...GRIS_OSCURO);
  const cuitTexto = datos.cliente.cuit ? `CUIT: ${datos.cliente.cuit}` : 'CUIT: —';
  const ivaTexto = datos.cliente.condicion_iva ? `IVA: ${sanitizarTextoPDF(datos.cliente.condicion_iva)}` : 'IVA: Responsable Inscripto';
  doc.text(`${cuitTexto}  -  ${ivaTexto}`, M + 84, 44.5);

  const ubicacion = [datos.cliente.direccion, datos.cliente.ciudad, datos.cliente.provincia].filter(Boolean).join(', ');
  doc.text(`Domicilio: ${sanitizarTextoPDF(ubicacion) || 'Sin direccion registrada'}`, M + 84, 49);

  const contactoArr: string[] = [];
  if (datos.cliente.telefono) contactoArr.push(`Tel: ${sanitizarTextoPDF(datos.cliente.telefono)}`);
  if (datos.cliente.email) contactoArr.push(`Mail: ${sanitizarTextoPDF(datos.cliente.email)}`);
  doc.text(contactoArr.join('  -  ') || 'Sin telefono/email adicional', M + 84, 53.5);

  // ==========================================
  // TARJETAS DE RESUMEN FINANCIERO (KPIs)
  // ==========================================
  const yKPI = 63;
  const hKPI = 18;
  const wCard1 = 70;
  const wCard2 = 56;
  const wCard3 = UTIL - wCard1 - wCard2; // 56mm

  const esDeudor = datos.saldoNeto < 0;
  const esAFavor = datos.saldoNeto > 0;
  const bgColorCard1 = esDeudor ? ROJO_BG : esAFavor ? VERDE_BG : AZUL_BG;
  const borderColorCard1 = esDeudor ? [252, 165, 165] as RGB : esAFavor ? [167, 243, 208] as RGB : [191, 219, 254] as RGB;
  const textColorCard1 = esDeudor ? ROJO_TEXTO : esAFavor ? VERDE_TEXTO : AZUL_TEXTO;

  // Card 1: Saldo de la cuenta
  doc.setFillColor(...bgColorCard1);
  doc.setDrawColor(...borderColorCard1);
  doc.setLineWidth(0.3);
  doc.roundedRect(M, yKPI, wCard1, hKPI, 1.5, 1.5, 'FD');

  doc.setTextColor(...textColorCard1);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  const lblSaldo = esDeudor ? 'SALDO A PAGAR (DEUDA ACTUAL)' : esAFavor ? 'SALDO A FAVOR (CREDITO DISPONIBLE)' : 'ESTADO DE CUENTA: AL DIA';
  doc.text(lblSaldo, M + 3.5, yKPI + 5);

  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  const textoMontoSaldo = esDeudor
    ? `-${formatearMoneda(Math.abs(datos.saldoNeto))}`
    : esAFavor
    ? `+${formatearMoneda(datos.saldoNeto)}`
    : '$0,00';
  doc.text(textoMontoSaldo, M + 3.5, yKPI + 12);

  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'normal');
  doc.text(esDeudor ? 'Total a abonar para regularizar la cuenta' : esAFavor ? 'Disponible a favor para proximas compras' : 'Sin saldos pendientes a la fecha', M + 3.5, yKPI + 15.5);

  // Card 2: Total Compras
  doc.setFillColor(...GRIS_BG);
  doc.setDrawColor(...GRIS_LINEA);
  doc.roundedRect(M + wCard1 + 2, yKPI, wCard2 - 2, hKPI, 1.5, 1.5, 'FD');

  doc.setTextColor(...GRIS_MEDIO);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.text('TOTAL COMPRADO', M + wCard1 + 5, yKPI + 5);

  doc.setTextColor(...NEGRO);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(formatearMoneda(datos.totalComprado), M + wCard1 + 5, yKPI + 11.5);

  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...GRIS_MEDIO);
  doc.text(`${datos.pedidos.length} pedido(s) realizados`, M + wCard1 + 5, yKPI + 15.5);

  // Card 3: Total Pagado
  doc.setFillColor(...GRIS_BG);
  doc.setDrawColor(...GRIS_LINEA);
  doc.roundedRect(M + wCard1 + wCard2 + 2, yKPI, wCard3 - 2, hKPI, 1.5, 1.5, 'FD');

  doc.setTextColor(...GRIS_MEDIO);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.text('TOTAL PAGADO', M + wCard1 + wCard2 + 5, yKPI + 5);

  doc.setTextColor(...VERDE_TEXTO);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(formatearMoneda(datos.totalPagado), M + wCard1 + wCard2 + 5, yKPI + 11.5);

  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...GRIS_MEDIO);
  doc.text('Total abonado por el cliente', M + wCard1 + wCard2 + 5, yKPI + 15.5);

  let curY = yKPI + hKPI + 5;

  // =========================================================================
  // BANNER INFORMATIVO DE SITUACIÓN
  // =========================================================================
  const pedidosPendientes = datos.pedidos.filter((p) => p.deuda > 0);

  if (pedidosPendientes.length > 0) {
    // Banner de advertencia si tiene pedidos pendientes
    doc.setFillColor(...ROJO_BG);
    doc.setDrawColor(252, 165, 165);
    doc.setLineWidth(0.3);
    doc.roundedRect(M, curY, UTIL, 8.5, 1, 1, 'FD');

    doc.setTextColor(...ROJO_TEXTO);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.text(`ATENCION: Registra ${pedidosPendientes.length} pedido(s) con saldo pendiente de pago.`, M + 4, curY + 4);

    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'normal');
    const detallePend = pedidosPendientes
      .map((p) => `Pedido #${p.numeroSecuencial || p.id.slice(0, 4)}: resta ${formatearMoneda(p.deuda)}`)
      .join('  -  ');
    doc.text(sanitizarTextoPDF(detallePend), M + 4, curY + 7);
    curY += 12;
  } else if (esAFavor) {
    // Banner verde si tiene saldo a favor
    doc.setFillColor(...VERDE_BG);
    doc.setDrawColor(167, 243, 208);
    doc.setLineWidth(0.3);
    doc.roundedRect(M, curY, UTIL, 7, 1, 1, 'FD');

    doc.setTextColor(...VERDE_TEXTO);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.text('CUENTA AL DIA: Todos los pedidos se encuentran 100% saldados.', M + 4, curY + 4.5);

    doc.setFont('helvetica', 'normal');
    doc.text(`Saldo a favor disponible: ${formatearMoneda(datos.saldoNeto)}`, M + UTIL - 4, curY + 4.5, { align: 'right' });
    curY += 10.5;
  } else {
    // Cuenta normal al día
    doc.setFillColor(...AZUL_BG);
    doc.setDrawColor(191, 219, 254);
    doc.setLineWidth(0.3);
    doc.roundedRect(M, curY, UTIL, 6.5, 1, 1, 'FD');

    doc.setTextColor(...AZUL_TEXTO);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.text('CUENTA AL DIA: No registra deudas ni saldos pendientes.', M + 4, curY + 4.2);
    curY += 10;
  }

  // =========================================================================
  // TABLA UNIFICADA: MOVIMIENTOS Y ESTADO DE LA CUENTA
  // =========================================================================
  // Columnas:
  // [14..32] FECHA: 18mm
  // [32..108] COMPROBANTE / DETALLE: 76mm
  // [108..130] ESTADO: 22mm (Pill badge centrado)
  // [130..152] COMPRAS (-): 22mm (derecha en 150)
  // [152..174] PAGOS (+): 22mm (derecha en 172)
  // [174..196] SALDO: 22mm (derecha en 194)
  const xColFecha = M + 2;         // 16
  const xColConcepto = M + 20;     // 34
  const xColEstado = M + 94;       // 108
  const xColCompras = M + 136;     // 150 (align right)
  const xColPagos = M + 158;       // 172 (align right)
  const xColSaldo = M + UTIL - 2;  // 194 (align right)

  const imprimirEncabezadoTabla = (yPos: number) => {
    // Barra de título de la tabla
    doc.setFillColor(...AZUL_TEXTO);
    doc.rect(M, yPos, UTIL, 5.5, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.text('DETALLE DE MOVIMIENTOS DE LA CUENTA (COMPRAS Y PAGOS)', M + 3, yPos + 3.8);

    // Fila de encabezado de columnas
    const yCol = yPos + 5.5;
    doc.setFillColor(...GRIS_BG);
    doc.rect(M, yCol, UTIL, 5.5, 'F');
    doc.setDrawColor(...GRIS_LINEA);
    doc.setLineWidth(0.2);
    doc.rect(M, yCol, UTIL, 5.5, 'S');

    doc.setTextColor(...GRIS_OSCURO);
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'bold');

    doc.text('FECHA', xColFecha, yCol + 3.8);
    doc.text('COMPROBANTE / DETALLE', xColConcepto, yCol + 3.8);
    doc.text('ESTADO', xColEstado + 11, yCol + 3.8, { align: 'center' });
    doc.text('COMPRAS (-)', xColCompras, yCol + 3.8, { align: 'right' });
    doc.text('PAGOS (+)', xColPagos, yCol + 3.8, { align: 'right' });
    doc.text('SALDO', xColSaldo, yCol + 3.8, { align: 'right' });

    return yCol + 5.5;
  };

  curY = imprimirEncabezadoTabla(curY);

  if (datos.movimientos.length === 0) {
    doc.setTextColor(...GRIS_MEDIO);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'italic');
    doc.text('No se registran movimientos en la cuenta.', M + 4, curY + 6);
    curY += 12;
  } else {
    // Crear mapas de estado de pedidos (por ID y por Número Secuencial) para mostrar el badge en la columna ESTADO
    const mapaPedidosPorId = new Map<string, ItemPedidoResumen>();
    const mapaPedidosPorSecuencial = new Map<number, ItemPedidoResumen>();

    datos.pedidos.forEach((p) => {
      if (p.id) {
        mapaPedidosPorId.set(p.id, p);
      }
      if (p.numeroSecuencial !== undefined && p.numeroSecuencial !== null) {
        mapaPedidosPorSecuencial.set(p.numeroSecuencial, p);
      }
    });

    datos.movimientos.forEach((m, idx) => {
      // Salto de página si nos acercamos al fondo
      if (curY + 7 > H - 24) {
        doc.addPage();
        imprimirHeaderCompacto();
        curY = imprimirEncabezadoTabla(16);
      }

      const esPar = idx % 2 === 0;
      if (esPar) {
        doc.setFillColor(252, 252, 253);
        doc.rect(M, curY, UTIL, 6.5, 'F');
      }

      doc.setDrawColor(...GRIS_LINEA);
      doc.setLineWidth(0.15);
      doc.line(M, curY + 6.5, M + UTIL, curY + 6.5);

      // 1. Fecha
      doc.setTextColor(...GRIS_OSCURO);
      doc.setFontSize(6.5);
      doc.setFont('helvetica', 'normal');
      doc.text(formatearFecha(m.fecha), xColFecha, curY + 4.2);

      // 2. Comprobante / Detalle
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...NEGRO);
      const conceptoLimpio = sanitizarTextoPDF(m.concepto);
      const conceptoCortado = conceptoLimpio.length > 48 ? `${conceptoLimpio.substring(0, 45)}...` : conceptoLimpio;
      doc.text(conceptoCortado, xColConcepto, curY + 4.2);

      // 3. Pastilla gráfica de Estado
      const wBadge = 20;
      const xBadge = xColEstado + 1;
      const yBadge = curY + 1.2;
      const hBadge = 4;

      let badgeBg: RGB = [241, 245, 249];
      let badgeBorder: RGB = [203, 213, 225];
      let badgeTextCol: RGB = [71, 85, 105];
      let badgeStr = 'AJUSTE';

      const tipoLower = m.tipo.toLowerCase();
      if (tipoLower === 'pedido') {
        // 1. Prioridad: estadoPago provisto directamente en el item
        let estadoPedido: 'saldado' | 'parcial' | 'impago' | undefined = m.estadoPago;

        // 2. Si no viene directo, buscar por referenciaId (UUID del pedido)
        if (!estadoPedido && m.referenciaId && mapaPedidosPorId.has(m.referenciaId)) {
          estadoPedido = mapaPedidosPorId.get(m.referenciaId)!.estadoPago;
        }

        // 3. Si no viene, extraer número secuencial del concepto (#2026-0025 o #25)
        if (!estadoPedido) {
          const matchSec = m.concepto.match(/(?:#\d{4}-|#)0*(\d+)/) || m.concepto.match(/(?:-|\b)0*(\d+)\b/);
          if (matchSec) {
            const numSec = parseInt(matchSec[1], 10);
            const ped = mapaPedidosPorSecuencial.get(numSec);
            if (ped) {
              estadoPedido = ped.estadoPago;
            }
          }
        }

        // 4. Fallback contextual: si el concepto o detalle contienen la palabra "saldado"
        if (!estadoPedido) {
          const textoCompleto = `${m.concepto} ${m.detalle || ''}`.toLowerCase();
          if (textoCompleto.includes('saldado')) {
            estadoPedido = 'saldado';
          }
        }

        if (estadoPedido === 'saldado') {
          badgeBg = [220, 252, 231];
          badgeBorder = [187, 247, 208];
          badgeTextCol = [21, 128, 61];
          badgeStr = 'SALDADO';
        } else if (estadoPedido === 'parcial') {
          badgeBg = [254, 243, 199];
          badgeBorder = [253, 230, 138];
          badgeTextCol = [180, 83, 9];
          badgeStr = 'PARCIAL';
        } else {
          badgeBg = [254, 226, 226];
          badgeBorder = [254, 202, 202];
          badgeTextCol = [185, 28, 28];
          badgeStr = 'IMPAGO';
        }
      } else if (tipoLower === 'pago' || tipoLower.includes('cobranza')) {
        badgeBg = [220, 252, 231];
        badgeBorder = [187, 247, 208];
        badgeTextCol = [21, 128, 61];
        badgeStr = 'PAGADO';
      } else if (tipoLower.includes('anticipo') || m.concepto.toLowerCase().includes('anticipo')) {
        badgeBg = [239, 246, 255];
        badgeBorder = [191, 219, 254];
        badgeTextCol = [30, 58, 138];
        badgeStr = 'ANTICIPO';
      }

      doc.setFillColor(...badgeBg);
      doc.setDrawColor(...badgeBorder);
      doc.setLineWidth(0.2);
      doc.roundedRect(xBadge, yBadge, wBadge, hBadge, 1, 1, 'FD');

      doc.setTextColor(...badgeTextCol);
      doc.setFontSize(5.5);
      doc.setFont('helvetica', 'bold');
      doc.text(badgeStr, xBadge + wBadge / 2, yBadge + 2.8, { align: 'center' });

      // 4. Compras (-)
      if (m.debito > 0) {
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...ROJO_TEXTO);
        doc.text(`-${formatearMoneda(m.debito)}`, xColCompras, curY + 4.2, { align: 'right' });
      } else {
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...GRIS_MEDIO);
        doc.text('—', xColCompras, curY + 4.2, { align: 'right' });
      }

      // 5. Pagos (+)
      if (m.credito > 0) {
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...VERDE_TEXTO);
        doc.text(`+${formatearMoneda(m.credito)}`, xColPagos, curY + 4.2, { align: 'right' });
      } else {
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...GRIS_MEDIO);
        doc.text('—', xColPagos, curY + 4.2, { align: 'right' });
      }

      // 6. Saldo Acumulado
      doc.setFont('helvetica', 'bold');
      if (m.saldoAcumulado < 0) {
        doc.setTextColor(...ROJO_TEXTO);
        doc.text(`-${formatearMoneda(Math.abs(m.saldoAcumulado))}`, xColSaldo, curY + 4.2, { align: 'right' });
      } else if (m.saldoAcumulado > 0) {
        doc.setTextColor(...VERDE_TEXTO);
        doc.text(`+${formatearMoneda(m.saldoAcumulado)}`, xColSaldo, curY + 4.2, { align: 'right' });
      } else {
        doc.setTextColor(...GRIS_OSCURO);
        doc.text('$0,00', xColSaldo, curY + 4.2, { align: 'right' });
      }

      curY += 6.5;
    });
  }

  // ==========================================
  // BLOQUE DE CONTACTO / PAGOS AL PIE
  // ==========================================
  if (curY + 26 <= H - 16) {
    const yBoxContacto = Math.max(curY + 8, H - 36);
    doc.setFillColor(...GRIS_BG);
    doc.setDrawColor(...GRIS_LINEA);
    doc.setLineWidth(0.3);
    doc.roundedRect(M, yBoxContacto, UTIL, 18, 1.5, 1.5, 'FD');

    doc.setTextColor(...AZUL_TEXTO);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.text('MEDIOS DE PAGO Y CONSULTAS DE CUENTA CORRIENTE', M + 4, yBoxContacto + 5);

    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...GRIS_OSCURO);
    doc.text('Transferencias bancarias: Solicitar datos de CBU / Alias actualizado por WhatsApp de administracion.', M + 4, yBoxContacto + 9.5);
    doc.text('Para informar un pago o consultar comprobantes: WhatsApp +54 9 11 5953-4330 / Email: ventas@fhlfiltros.com.ar', M + 4, yBoxContacto + 14);
  }

  // ==========================================
  // FOOTER EN TODAS LAS PÁGINAS
  // ==========================================
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);

    doc.setDrawColor(...GRIS_LINEA);
    doc.setLineWidth(0.2);
    doc.line(M, H - 12, M + UTIL, H - 12);

    doc.setTextColor(...GRIS_MEDIO);
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'normal');
    doc.text(
      'Documento no valido como factura. Resumen de cuenta corriente emitido por FHL Filtros para control de saldos y operaciones.',
      M,
      H - 7.5
    );

    doc.setFont('helvetica', 'bold');
    doc.text(`Pagina ${i} de ${totalPages}`, M + UTIL, H - 7.5, { align: 'right' });
  }

  return doc;
}

export async function generarResumenCuentaPDF(datos: DatosResumenCuentaPDF): Promise<void> {
  const doc = await generarInstanciaResumenCuentaPDF(datos);
  const fecha = new Date().toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const fechaStr = fecha.replace(/\//g, '-');
  const nombreLimpio = datos.cliente.nombre.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
  const nombreArchivo = `resumen_cuenta_${nombreLimpio}_${fechaStr}.pdf`;
  doc.save(nombreArchivo);
}

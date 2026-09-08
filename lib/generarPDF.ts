import jsPDF from 'jspdf';
import type { ItemFactura } from '../app/admin/facturador/components/TablaItems';
import type { Cliente } from './types';
import { supabase } from './supabase';

export interface DatosPresupuesto {
  cliente: Cliente;
  items: ItemFactura[];
  observaciones: string;
  numeroPresupuesto?: string;
  validezDias?: number;
  fechaCreacion?: string | Date | null;
  pedidoId?: string | null;
  saldoPrevio?: number; // Saldo neto previo explícito (positivo = a favor, negativo = deuda)
  deudaCliente?: number; // compatibilidad
  saldoCliente?: number; // compatibilidad
  etiquetaSaldo?: string; // compatibilidad
  tipoDocumento?: 'presupuesto' | 'pedido';
}

// Convertir imagen a base64 para embeder en el PDF
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

export interface EstadoCuentaCliente {
  saldoNeto: number;
  tipo: 'deuda' | 'saldo_a_favor' | 'al_dia';
  etiqueta: string;
  monto: number;
}

// Obtener estado de cuenta unificado anterior al comprobante (deuda o saldo a favor)
export async function obtenerEstadoCuentaCliente(
  clienteId: string,
  fechaReferencia?: string | Date | null,
  pedidoExcluidoId?: string | null
): Promise<EstadoCuentaCliente> {
  if (!clienteId) {
    return { saldoNeto: 0, tipo: 'al_dia', etiqueta: 'AL DÍA', monto: 0 };
  }
  try {
    let queryPed = supabase
      .from('pedidos')
      .select('id, total, eliminado, created_at')
      .eq('cliente_id', clienteId)
      .neq('estado', 'cancelado');

    let queryPag = supabase
      .from('pagos')
      .select('pedido_id, monto, fecha')
      .eq('cliente_id', clienteId);

    let queryMov = supabase
      .from('movimientos_saldo')
      .select('monto, fecha')
      .eq('cliente_id', clienteId);

    if (fechaReferencia) {
      const fechaIso = typeof fechaReferencia === 'string' ? fechaReferencia : fechaReferencia.toISOString();
      queryPed = queryPed.lt('created_at', fechaIso);
      queryPag = queryPag.lte('fecha', fechaIso);
      queryMov = queryMov.lte('fecha', fechaIso);
    }

    if (pedidoExcluidoId) {
      queryPed = queryPed.neq('id', pedidoExcluidoId);
    }

    const [resPed, resPag, resMov] = await Promise.all([queryPed, queryPag, queryMov]);

    const pagosPorPedido = new Map<string, number>();
    (resPag.data || []).forEach((p: any) => {
      pagosPorPedido.set(p.pedido_id, (pagosPorPedido.get(p.pedido_id) || 0) + Number(p.monto || 0));
    });

    const deudaPed = (resPed.data || []).reduce((sum: number, p: any) => {
      if (p.eliminado) return sum;
      const pagado = pagosPorPedido.get(p.id) || 0;
      return sum + Math.max(0, Number(p.total || 0) - pagado);
    }, 0);

    const balMov = (resMov.data || []).reduce((sum: number, m: any) => sum + Number(m.monto || 0), 0);
    // Saldo neto unificado previo: créditos acumulados menos deuda de pedidos pendientes
    const saldoNeto = balMov - deudaPed;

    if (saldoNeto < 0) {
      return {
        saldoNeto,
        tipo: 'deuda',
        etiqueta: 'DEUDA',
        monto: Math.abs(saldoNeto),
      };
    } else if (saldoNeto > 0) {
      return {
        saldoNeto,
        tipo: 'saldo_a_favor',
        etiqueta: 'SALDO A FAVOR',
        monto: saldoNeto,
      };
    } else {
      return {
        saldoNeto: 0,
        tipo: 'al_dia',
        etiqueta: 'AL DÍA',
        monto: 0,
      };
    }
  } catch (err) {
    console.error('Error al calcular saldo previo del cliente para PDF:', err);
    return { saldoNeto: 0, tipo: 'al_dia', etiqueta: 'AL DÍA', monto: 0 };
  }
}

// Calcular deuda neta del cliente en tiempo real (mantenido por compatibilidad)
export async function calcularDeudaCliente(clienteId: string): Promise<number> {
  const estado = await obtenerEstadoCuentaCliente(clienteId);
  return estado.tipo === 'deuda' ? estado.monto : 0;
}

// Paleta sobria para impresión (ahorro de tinta - todo blanco con trazos nítidos)
type RGB = [number, number, number];
const NEGRO: RGB = [15, 23, 42]; // Slate 900
const GRIS_OSCURO: RGB = [51, 65, 85]; // Slate 700
const GRIS_MEDIO: RGB = [100, 116, 139]; // Slate 500
const GRIS_LINEA: RGB = [203, 213, 225]; // Slate 300
const BORDE_TABLA: RGB = [70, 70, 70]; // Gris oscuro para líneas de corte y tablas

async function generarInstanciaPDF(datos: DatosPresupuesto): Promise<jsPDF> {
  const { cliente, items, observaciones, numeroPresupuesto, validezDias = 30 } = datos;

  // 1. Total del Pedido Actual
  const totalGeneral = items.reduce((sum, item) => sum + item.cantidad * item.precioUnitario, 0);

  // 2. Obtener Saldo Anterior / Previo del Cliente
  let saldoNetoPrevio = 0;
  if (datos.saldoPrevio !== undefined) {
    saldoNetoPrevio = datos.saldoPrevio;
  } else if (datos.saldoCliente !== undefined) {
    saldoNetoPrevio = datos.saldoCliente;
  } else if (datos.deudaCliente !== undefined) {
    saldoNetoPrevio = -Math.abs(datos.deudaCliente);
  } else if (cliente?.id) {
    const estado = await obtenerEstadoCuentaCliente(cliente.id, datos.fechaCreacion, datos.pedidoId);
    saldoNetoPrevio = estado.saldoNeto;
  }

  const doc = new jsPDF('p', 'mm', 'a4');
  const W = 210;
  const H = 297;
  const M = 15;
  const UTIL = W - M * 2;

  const rowHeight = 7;
  const maxRowsPerPage = 21;
  const totalPages = Math.ceil(items.length / maxRowsPerPage) || 1;

  const fecha = new Date().toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
    if (pageIdx > 0) {
      doc.addPage();
    }

    // ===== RECUADRO 1: ENCABEZADO Y CONTACTO (FONDO BLANCO / INK-FRIENDLY) =====
    // 1. Contorno exterior de todo el bloque
    doc.setDrawColor(...BORDE_TABLA);
    doc.setLineWidth(0.4);
    doc.rect(M, 15, UTIL, 58);

    // 2. Logo a color sobre fondo blanco (FHL_logo.png: 1080x520 -> 42 x 20.2 mm)
    try {
      const logoBase64 = await cargarImagenBase64('/FHL_logo.png');
      doc.addImage(logoBase64, 'PNG', M + 4, 18, 42, 20.2);
    } catch {
      doc.setTextColor(...NEGRO);
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text('FHL FILTROS', M + 4, 28);
    }

    // 3. Título Presupuesto (en texto oscuro nítido)
    doc.setTextColor(...NEGRO);
    doc.setFontSize(15);
    doc.setFont('helvetica', 'bold');
    const tituloText = numeroPresupuesto ? `Presupuesto Nº ${numeroPresupuesto}` : 'Presupuesto';
    doc.text(tituloText, M + UTIL - 5, 27, { align: 'right' });

    // 4. Línea divisoria horizontal entre cabecera superior y datos de contacto
    doc.setDrawColor(...GRIS_LINEA);
    doc.setLineWidth(0.3);
    doc.line(M, 41, M + UTIL, 41);

    // 5. Línea divisoria vertical entre Emisor (izquierda) y Cliente (derecha)
    doc.line(M + UTIL / 2, 41, M + UTIL / 2, 73);

    // 6. Detalles Emisor (FHL Filtros)
    doc.setTextColor(...NEGRO);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('FHL Filtros', M + 4, 47.5);

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...GRIS_OSCURO);
    doc.text('Buenos Aires, Argentina', M + 4, 52.5);
    doc.text('Tel: +54 9 11 5953-4330 / 11 3167-9782', M + 4, 57.5);
    doc.text('Mail: ventas@fhlfiltros.com.ar', M + 4, 62.5);

    // 7. Detalles Receptor (Cliente)
    doc.setTextColor(...NEGRO);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text(cliente.nombre, M + UTIL / 2 + 4, 47.5);

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...GRIS_OSCURO);
    const dirTexto = cliente.direccion ? `Dirección: ${cliente.direccion}` : 'Dirección: —';
    const cuitTexto = cliente.cuit ? `CUIT: ${cliente.cuit}` : 'CUIT: —';
    doc.text(dirTexto, M + UTIL / 2 + 4, 52.5);
    doc.text(cuitTexto, M + UTIL / 2 + 4, 57.5);
    if (cliente.telefono) {
      doc.text(`Tel: ${cliente.telefono}`, M + UTIL / 2 + 4, 62.5);
    }

    // ===== RECUADRO 2: FECHA Y VALIDEZ =====
    const yBox2 = 76;
    doc.setDrawColor(...BORDE_TABLA);
    doc.setLineWidth(0.35);
    doc.rect(M, yBox2, UTIL, 8);

    doc.setTextColor(...NEGRO);
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    doc.text(`Fecha del presupuesto: ${fecha}`, M + 4, yBox2 + 5.5);
    doc.text(`Validez: ${validezDias} días`, M + UTIL - 4, yBox2 + 5.5, { align: 'right' });

    // ===== RECUADRO 3: TABLA DE ITEMS =====
    const yTable = 87;
    const tableHeight = 158;
    
    // Contorno de la tabla
    doc.setDrawColor(...BORDE_TABLA);
    doc.setLineWidth(0.35);
    doc.rect(M, yTable, UTIL, tableHeight);

    // Línea divisoria del header
    doc.setDrawColor(...BORDE_TABLA);
    doc.setLineWidth(0.35);
    doc.line(M, yTable + 8, M + UTIL, yTable + 8);

    // Textos de cabecera
    doc.setTextColor(...NEGRO);
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    doc.text('DESCRIPCIÓN', M + 4, yTable + 5.5);
    doc.text('UNIDADES', M + 115, yTable + 5.5, { align: 'center' });
    doc.text('PRECIO', M + 152, yTable + 5.5, { align: 'right' });
    doc.text('TOTAL', M + UTIL - 4, yTable + 5.5, { align: 'right' });

    // Líneas divisorias verticales (columnas)
    doc.setDrawColor(...GRIS_LINEA);
    doc.setLineWidth(0.25);
    doc.line(M + 100, yTable, M + 100, yTable + tableHeight);
    doc.line(M + 130, yTable, M + 130, yTable + tableHeight);
    doc.line(M + 155, yTable, M + 155, yTable + tableHeight);

    // Renderizar ítems para esta página
    const startIdx = pageIdx * maxRowsPerPage;
    const endIdx = Math.min(startIdx + maxRowsPerPage, items.length);

    for (let i = 0; i < maxRowsPerPage; i++) {
      const itemIdx = startIdx + i;
      const yRow = yTable + 8 + rowHeight * i;
      const nextYRow = yRow + rowHeight;

      if (itemIdx < endIdx) {
        const item = items[itemIdx];
        const subtotal = item.cantidad * item.precioUnitario;

        // Código / Descripción
        doc.setTextColor(...NEGRO);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.text(item.codigo_fhl, M + 4, yRow + 5);

        // Cantidad (Unidades)
        doc.text(item.cantidad.toString(), M + 115, yRow + 5, { align: 'center' });

        // Precio
        doc.text(
          `$${item.precioUnitario.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`,
          M + 152,
          yRow + 5,
          { align: 'right' }
        );

        // Subtotal (Total)
        doc.setFont('helvetica', 'bold');
        doc.text(
          `$${subtotal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`,
          M + UTIL - 4,
          yRow + 5,
          { align: 'right' }
        );
      }

      // Dibujar línea punteada horizontal
      if (i < maxRowsPerPage - 1) {
        doc.setDrawColor(...GRIS_LINEA);
        doc.setLineWidth(0.2);
        doc.setLineDashPattern([1, 1.5], 0);
        doc.line(M, nextYRow, M + UTIL, nextYRow);
        doc.setLineDashPattern([], 0); // Restaurar línea sólida
      }
    }
  }

  // ===== RECUADRO 4: OBSERVACIONES, TOTAL PEDIDO, SALDO PREVIO Y TOTAL A PAGAR (ÚLTIMA PÁGINA) =====
  const yBox4 = 246;
  const hBox4 = 23;

  const tieneBalancePrevio = Math.abs(saldoNetoPrevio) >= 0.01;

  if (tieneBalancePrevio) {
    // --- MODO CON ESTADO DE CUENTA PREVIO (4 COLUMNAS) ---
    // Fondo sutil para la columna final de Total a Cancelar / Pagar
    doc.setFillColor(248, 250, 252);
    doc.rect(154, yBox4, 41, hBox4, 'F');

    // Contorno exterior
    doc.setDrawColor(...BORDE_TABLA);
    doc.setLineWidth(0.4);
    doc.rect(M, yBox4, UTIL, hBox4, 'S');

    // Separadores verticales:
    // Col 1: Observaciones (15 - 74, ancho 59mm)
    // Col 2: Total Pedido (74 - 114, ancho 40mm)
    // Col 3: Saldo Previo (114 - 154, ancho 40mm)
    // Col 4: Total a Cancelar / Pagar (154 - 195, ancho 41mm)
    doc.setDrawColor(...GRIS_LINEA);
    doc.setLineWidth(0.3);
    doc.line(74, yBox4, 74, yBox4 + hBox4);
    doc.line(114, yBox4, 114, yBox4 + hBox4);
    doc.line(154, yBox4, 154, yBox4 + hBox4);

    // 1. Observaciones en el lado izquierdo
    doc.setTextColor(...GRIS_MEDIO);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.text('OBSERVACIONES:', M + 4, yBox4 + 5.5);

    doc.setTextColor(...GRIS_OSCURO);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    const textoObs = observaciones.trim() || 'Sin observaciones adicionales.';
    const lineasObs = doc.splitTextToSize(textoObs, 52);
    doc.text(lineasObs.slice(0, 2), M + 4, yBox4 + 10.5);

    // 2. Columna 2: Total del Pedido Actual
    doc.setTextColor(...GRIS_MEDIO);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.text('TOTAL PEDIDO', 78, yBox4 + 6);

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...NEGRO);
    doc.text(
      `$${totalGeneral.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`,
      110,
      yBox4 + 14,
      { align: 'right' }
    );

    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...GRIS_MEDIO);
    doc.text(
      `${items.length} ${items.length === 1 ? 'ítem' : 'ítems'}`,
      110,
      yBox4 + 19,
      { align: 'right' }
    );

    // 3. Columna 3: Saldo Anterior / Previo
    doc.setTextColor(...GRIS_MEDIO);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.text('SALDO PREVIO', 118, yBox4 + 6);

    doc.setFontSize(10.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...NEGRO);

    let textoSaldoPrevio = '$0,00';
    let subtextoSaldoPrevio = 'Cuenta al día';
    if (saldoNetoPrevio < 0) {
      textoSaldoPrevio = `-$${Math.abs(saldoNetoPrevio).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;
      subtextoSaldoPrevio = 'Deuda anterior';
    } else if (saldoNetoPrevio > 0) {
      textoSaldoPrevio = `+$${saldoNetoPrevio.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;
      subtextoSaldoPrevio = 'Saldo a favor previo';
    }

    doc.text(textoSaldoPrevio, 150, yBox4 + 14, { align: 'right' });

    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'bold');
    if (saldoNetoPrevio < 0) {
      doc.setTextColor(185, 28, 28); // Rojo oscuro sutil
    } else if (saldoNetoPrevio > 0) {
      doc.setTextColor(21, 128, 61); // Verde oscuro sutil
    } else {
      doc.setTextColor(...GRIS_MEDIO);
    }
    doc.text(subtextoSaldoPrevio, 150, yBox4 + 19, { align: 'right' });

    // 4. Columna 4: Total a Cancelar / Pagar resultante
    let tituloFinal = 'TOTAL A PAGAR';
    let montoFinal = totalGeneral;
    let subtextoFinal = 'Sin saldo pendiente previo';

    if (saldoNetoPrevio < 0) {
      tituloFinal = 'TOTAL A CANCELAR';
      montoFinal = totalGeneral + Math.abs(saldoNetoPrevio);
      subtextoFinal = 'Para cuenta al día';
    } else if (saldoNetoPrevio > 0) {
      if (saldoNetoPrevio < totalGeneral) {
        tituloFinal = 'RESTO A PAGAR';
        montoFinal = totalGeneral - saldoNetoPrevio;
        subtextoFinal = 'Saldo a favor aplicado';
      } else {
        tituloFinal = 'TOTAL A PAGAR';
        montoFinal = 0;
        const remanente = saldoNetoPrevio - totalGeneral;
        subtextoFinal = remanente > 0 ? `Resta a favor: $${remanente.toLocaleString('es-AR', { minimumFractionDigits: 2 })}` : 'Cubierto con saldo a favor';
      }
    }

    doc.setTextColor(...NEGRO);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.text(tituloFinal, 158, yBox4 + 6);

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...NEGRO);
    doc.text(
      `$${montoFinal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`,
      191,
      yBox4 + 14,
      { align: 'right' }
    );

    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...GRIS_OSCURO);
    doc.text(subtextoFinal, 191, yBox4 + 19, { align: 'right' });
  } else {
    // --- MODO NORMAL (CLIENTE AL DÍA): OBSERVACIONES Y TOTAL LIMPIO ---
    // Fondo sutil para el Total
    doc.setFillColor(248, 250, 252);
    doc.rect(145, yBox4, 50, hBox4, 'F');

    // Contorno exterior
    doc.setDrawColor(...BORDE_TABLA);
    doc.setLineWidth(0.4);
    doc.rect(M, yBox4, UTIL, hBox4, 'S');

    // Separador vertical entre Observaciones (15-145) y Total (145-195)
    doc.setDrawColor(...GRIS_LINEA);
    doc.setLineWidth(0.3);
    doc.line(145, yBox4, 145, yBox4 + hBox4);

    // 1. Observaciones en el lado izquierdo (amplio)
    doc.setTextColor(...GRIS_MEDIO);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.text('OBSERVACIONES:', M + 4, yBox4 + 5.5);

    doc.setTextColor(...GRIS_OSCURO);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    const textoObs = observaciones.trim() || 'Sin observaciones adicionales.';
    const lineasObs = doc.splitTextToSize(textoObs, 122);
    doc.text(lineasObs.slice(0, 2), M + 4, yBox4 + 11);

    // 2. Total del Pedido a la derecha
    doc.setTextColor(...GRIS_MEDIO);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.text('TOTAL', 149, yBox4 + 6);

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...NEGRO);
    doc.text(
      `$${totalGeneral.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`,
      M + UTIL - 4,
      yBox4 + 14,
      { align: 'right' }
    );

    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...GRIS_MEDIO);
    doc.text(
      `${items.length} ${items.length === 1 ? 'ítem' : 'ítems'}`,
      M + UTIL - 4,
      yBox4 + 19,
      { align: 'right' }
    );
  }

  // ===== FOOTER GENERAL =====
  doc.setDrawColor(...GRIS_LINEA);
  doc.setLineWidth(0.2);
  doc.line(M, H - 15, M + UTIL, H - 15);

  doc.setTextColor(...GRIS_MEDIO);
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'normal');
  doc.text(
    'Este presupuesto no tiene validez fiscal. Los precios pueden sufrir modificaciones sin previo aviso.',
    W / 2,
    H - 10,
    { align: 'center' }
  );

  return doc;
}

export async function generarPDF(datos: DatosPresupuesto): Promise<void> {
  const doc = await generarInstanciaPDF(datos);
  const fecha = new Date().toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const fechaStr = fecha.replace(/\//g, '-');
  const codigoDoc = datos.numeroPresupuesto ? `_${datos.numeroPresupuesto.replace(/[^a-zA-Z0-9_-]/g, '_')}` : '';
  const nombreArchivo = `presupuesto_${datos.cliente.nombre.replace(/\s+/g, '_').toLowerCase()}${codigoDoc}_${fechaStr}.pdf`;
  doc.save(nombreArchivo);
}

export async function obtenerPDFBlobUrl(datos: DatosPresupuesto): Promise<string> {
  const doc = await generarInstanciaPDF(datos);
  const blob = doc.output('blob');
  return URL.createObjectURL(blob);
}


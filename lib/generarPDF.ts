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
  deudaCliente?: number;
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

// Calcular deuda neta del cliente en tiempo real
export async function calcularDeudaCliente(clienteId: string): Promise<number> {
  if (!clienteId) return 0;
  try {
    const [resPed, resPag, resMov] = await Promise.all([
      supabase
        .from('pedidos')
        .select('id, total, eliminado')
        .eq('cliente_id', clienteId)
        .neq('estado', 'cancelado'),
      supabase
        .from('pagos')
        .select('pedido_id, monto')
        .eq('cliente_id', clienteId),
      supabase
        .from('movimientos_saldo')
        .select('monto')
        .eq('cliente_id', clienteId),
    ]);

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
    const saldoNeto = balMov - deudaPed;
    return saldoNeto < 0 ? Math.abs(saldoNeto) : 0;
  } catch (err) {
    console.error('Error al calcular deuda del cliente para PDF:', err);
    return 0;
  }
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

  // Obtener deuda actual del cliente si no fue provista
  let deudaCliente = datos.deudaCliente;
  if (deudaCliente === undefined && cliente?.id) {
    deudaCliente = await calcularDeudaCliente(cliente.id);
  }
  if (deudaCliente === undefined) {
    deudaCliente = 0;
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

  // ===== RECUADRO 4: DEUDA, TOTAL Y OBSERVACIONES (ÚLTIMA PÁGINA) =====
  const totalGeneral = items.reduce((sum, item) => sum + item.cantidad * item.precioUnitario, 0);

  const yBox4 = 248;
  const hBox4 = 21;

  // Contorno exterior
  doc.setDrawColor(...BORDE_TABLA);
  doc.setLineWidth(0.4);
  doc.rect(M, yBox4, UTIL, hBox4);

  // Separadores verticales: Observaciones (15-98) | Deuda Cliente (98-145) | Total (145-195)
  doc.setDrawColor(...GRIS_LINEA);
  doc.setLineWidth(0.3);
  doc.line(98, yBox4, 98, yBox4 + hBox4);
  doc.line(145, yBox4, 145, yBox4 + hBox4);

  // 1. Observaciones en el lado izquierdo
  if (observaciones.trim()) {
    doc.setTextColor(...GRIS_MEDIO);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.text('OBSERVACIONES:', M + 4, yBox4 + 5.5);

    doc.setTextColor(...GRIS_OSCURO);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    const lineasObs = doc.splitTextToSize(observaciones, 76);
    doc.text(lineasObs.slice(0, 2), M + 4, yBox4 + 10.5);
  }

  // 2. Deuda actual del cliente (Inmediatamente a la izquierda del Total)
  doc.setTextColor(...GRIS_OSCURO);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('DEUDA ACTUAL', 102, yBox4 + 7);

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...NEGRO);
  doc.text(
    `$${deudaCliente.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`,
    141,
    yBox4 + 15,
    { align: 'right' }
  );

  // 3. Total General (Lado derecho)
  doc.setTextColor(...GRIS_OSCURO);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('TOTAL', 149, yBox4 + 7);

  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...NEGRO);
  doc.text(
    `$${totalGeneral.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`,
    M + UTIL - 4,
    yBox4 + 15,
    { align: 'right' }
  );

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
  const nombreArchivo = `presupuesto_${datos.cliente.nombre.replace(/\s+/g, '_').toLowerCase()}_${fechaStr}.pdf`;
  doc.save(nombreArchivo);
}

export async function obtenerPDFBlobUrl(datos: DatosPresupuesto): Promise<string> {
  const doc = await generarInstanciaPDF(datos);
  const blob = doc.output('blob');
  return URL.createObjectURL(blob);
}


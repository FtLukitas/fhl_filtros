import jsPDF from 'jspdf';
import type { ItemFactura } from '../app/admin/facturador/components/TablaItems';
import type { Cliente } from './types';

interface DatosPresupuesto {
  cliente: Cliente;
  items: ItemFactura[];
  observaciones: string;
  numeroPresupuesto?: string;
  validezDias?: number;
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

// Colores de marca
type RGB = [number, number, number];
const AZUL_900: RGB = [30, 58, 138];
const ROJO_600: RGB = [220, 38, 38];
const SLATE_100: RGB = [241, 245, 249];
const SLATE_300: RGB = [203, 213, 225];
const SLATE_500: RGB = [100, 116, 139];
const SLATE_700: RGB = [51, 65, 85];
const SLATE_900: RGB = [15, 23, 42];
const BLANCO: RGB = [255, 255, 255];

async function generarInstanciaPDF(datos: DatosPresupuesto): Promise<jsPDF> {
  const { cliente, items, observaciones, numeroPresupuesto, validezDias = 30 } = datos;
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

    // ===== RECUADRO 1: ENCABEZADO Y CONTACTO =====
    // 1. Cabecera azul oscuro
    doc.setFillColor(...AZUL_900);
    doc.rect(M, 15, UTIL, 30, 'F');

    // 2. Franja roja de acento
    doc.setFillColor(...ROJO_600);
    doc.rect(M, 45, UTIL, 3, 'F');

    // 3. Logo (dentro de la cabecera azul) - Estirado un poco horizontalmente (39x24 en lugar de 34x25)
    try {
      const logoBase64 = await cargarImagenBase64('/logo.png');
      doc.addImage(logoBase64, 'PNG', M + 4, 17, 39, 24);
    } catch {
      doc.setTextColor(...BLANCO);
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text('FHL FILTROS', M + 6, 32);
    }

    // 4. Título Presupuesto (dentro de la cabecera azul) - Primera letra mayúscula
    doc.setTextColor(...BLANCO);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    const tituloText = numeroPresupuesto ? `Presupuesto Nº ${numeroPresupuesto}` : 'Presupuesto';
    doc.text(tituloText, 120, 32, { align: 'center' });

    // 5. Detalles Emisor y Cliente (área blanca inferior)
    // Emisor (FHL Filtros)
    doc.setTextColor(...SLATE_900);
    doc.setFontSize(9.5);
    doc.setFont('helvetica', 'bold');
    doc.text('FHL Filtros', M + 5, 55);

    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...SLATE_700);
    doc.text('Buenos Aires, Argentina', M + 5, 60);
    doc.text('Tel: +54 9 11 5953-4330 / 11 3167-9782', M + 5, 65);
    doc.text('Mail: ventas@fhlfiltros.com.ar', M + 5, 70);

    // Receptor (Cliente)
    doc.setTextColor(...SLATE_900);
    doc.setFontSize(9.5);
    doc.setFont('helvetica', 'bold');
    doc.text(cliente.nombre, M + UTIL / 2 + 5, 55);

    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...SLATE_700);
    const dirTexto = cliente.direccion ? cliente.direccion : 'Dirección: —';
    const cuitTexto = cliente.cuit ? `CUIT: ${cliente.cuit}` : 'CUIT: —';
    doc.text(dirTexto, M + UTIL / 2 + 5, 60);
    doc.text(cuitTexto, M + UTIL / 2 + 5, 65);

    // 6. Contorno exterior de todo el bloque
    doc.setDrawColor(...AZUL_900);
    doc.setLineWidth(0.5);
    doc.rect(M, 15, UTIL, 62); // 15 + 62 = 77

    // ===== RECUADRO 2: FECHA Y VALIDEZ =====
    const yBox2 = 80;
    doc.setDrawColor(...AZUL_900);
    doc.setLineWidth(0.5);
    doc.rect(M, yBox2, UTIL, 8);

    doc.setTextColor(...SLATE_900);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text(`Fecha del presupuesto: ${fecha}`, M + 4, yBox2 + 5.5);

    doc.text(`Validez: ${validezDias} días`, M + UTIL - 4, yBox2 + 5.5, { align: 'right' });

    // ===== RECUADRO 3: TABLA DE ITEMS =====
    const yTable = 91;
    const tableHeight = 155; // 91 + 155 = 246
    
    // Contorno de la tabla
    doc.rect(M, yTable, UTIL, tableHeight);

    // Línea divisoria del header
    doc.line(M, yTable + 8, M + UTIL, yTable + 8);

    // Textos de cabecera
    doc.setTextColor(...AZUL_900);
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    doc.text('DESCRIPCIÓN', M + 3, yTable + 5.5);
    doc.text('UNIDADES', M + 115, yTable + 5.5, { align: 'center' });
    doc.text('PRECIO', M + 152, yTable + 5.5, { align: 'right' });
    doc.text('TOTAL', M + UTIL - 3, yTable + 5.5, { align: 'right' });

    // Líneas divisorias verticales (columnas)
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
        doc.setTextColor(...SLATE_900);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.text(item.codigo_fhl, M + 3, yRow + 5);

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
          M + UTIL - 3,
          yRow + 5,
          { align: 'right' }
        );
      }

      // Dibujar línea punteada horizontal
      if (i < maxRowsPerPage - 1) {
        doc.setDrawColor(...SLATE_300);
        doc.setLineWidth(0.2);
        doc.setLineDashPattern([1, 1.5], 0);
        doc.line(M, nextYRow, M + UTIL, nextYRow);
        doc.setLineDashPattern([], 0); // Restaurar línea sólida
      }
    }
  }

  // ===== RECUADRO 4 Y 5: SOLO EN LA ÚLTIMA PÁGINA =====
  const totalGeneral = items.reduce((sum, item) => sum + item.cantidad * item.precioUnitario, 0);

  // Recuadro 4: Subtotales y Observaciones
  const yBox4 = 249;
  doc.setDrawColor(...AZUL_900);
  doc.setLineWidth(0.5);
  doc.rect(M, yBox4, UTIL, 20);

  // Observaciones en el lado izquierdo del cuadro de subtotales
  if (observaciones.trim()) {
    doc.setTextColor(...SLATE_500);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.text('OBSERVACIONES:', M + 4, yBox4 + 5);

    doc.setTextColor(...SLATE_700);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    // Ajustar texto a un ancho máximo de 105mm
    const lineasObs = doc.splitTextToSize(observaciones, 105);
    // Mostrar un máximo de 2 líneas para no desbordar el cuadro
    doc.text(lineasObs.slice(0, 2), M + 4, yBox4 + 9);
  }

  // Totales en el lado derecho del cuadro (solo TOTAL)
  doc.setTextColor(...AZUL_900);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('TOTAL', M + UTIL - 65, yBox4 + 11.5);
  doc.text(
    `$${totalGeneral.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`,
    M + UTIL - 4,
    yBox4 + 11.5,
    { align: 'right' }
  );



  // ===== FOOTER GENERAL =====
  doc.setDrawColor(...SLATE_300);
  doc.setLineWidth(0.2);
  doc.line(M, H - 15, M + UTIL, H - 15);

  doc.setTextColor(...SLATE_500);
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'normal');
  doc.text(
    'Este presupuesto no tiene validez fiscal. Los precios pueden sufrir modificaciones sin previo aviso.',
    W / 2,
    H - 10,
    { align: 'center' }
  );

  // Sin franja roja decorativa al pie
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

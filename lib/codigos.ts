/**
 * Utilidades de formateo y estandarización de códigos secuenciales para Pedidos y Presupuestos
 * Notación Secuencial por Año / Fecha:
 * - Formato: YYYY-XXXX (ej: 2026-0001, 2026-0018)
 * - Pedidos y presupuestos comparten la misma numeración secuencial unificada
 */

function extraerAnio(fecha?: string | Date | null): number {
  if (!fecha) return new Date().getFullYear();
  try {
    const d = new Date(fecha);
    const y = d.getFullYear();
    return isNaN(y) ? new Date().getFullYear() : y;
  } catch {
    return new Date().getFullYear();
  }
}

/**
 * Formatea un número secuencial o identificador al formato estándar secuencial: YYYY-0001
 * Si recibe un número (ej: 18), retorna: 2026-0018
 * Si ya viene en formato "2026-0018", lo conserva.
 */
export function formatearCodigo(
  identificador?: string | number | null,
  fecha?: string | Date | null,
  numeroSecuencial?: number | null
): string {
  const anio = extraerAnio(fecha);

  // 1. Prioridad: número secuencial explícito
  const numVal = numeroSecuencial ?? (typeof identificador === 'number' ? identificador : null);
  if (numVal !== null && numVal !== undefined && !isNaN(Number(numVal)) && Number(numVal) > 0) {
    return `${anio}-${String(numVal).padStart(4, '0')}`;
  }

  // 2. Si identificador es un string
  if (typeof identificador === 'string' && identificador.trim()) {
    const str = identificador.trim();

    // Si ya viene con formato YYYY-XXXX (ej: 2026-0018)
    if (/^\d{4}-\d+$/i.test(str)) {
      return str;
    }

    // Si viene con prefijo como "PED-2026-0018" o "PRE-2026-0018"
    const matchPrefijo = str.match(/^(?:PED|PRE)-(\d{4}-\d+)$/i);
    if (matchPrefijo) {
      return matchPrefijo[1];
    }

    // Si viene como "PED-18", "PRE-18", "#18" o "18"
    const matchNum = str.match(/^(?:PED|PRE|#)?\s*(\d+)$/i);
    if (matchNum) {
      const parsed = parseInt(matchNum[1], 10);
      if (!isNaN(parsed) && parsed > 0) {
        return `${anio}-${String(parsed).padStart(4, '0')}`;
      }
    }
  }

  return `${anio}-0001`;
}

// Aliases para compatibilidad homogénea
export function formatearCodigoPedido(
  idOSecuencial?: string | number | null,
  fecha?: string | Date | null,
  numeroSecuencial?: number | null
): string {
  return formatearCodigo(idOSecuencial, fecha, numeroSecuencial);
}

export function formatearCodigoPresupuesto(
  idOSecuencial?: string | number | null,
  numero?: string | null,
  fecha?: string | Date | null,
  numeroSecuencial?: number | null
): string {
  return formatearCodigo(numero ?? idOSecuencial, fecha, numeroSecuencial);
}

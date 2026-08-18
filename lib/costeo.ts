import type { ParametroCosteo, CosteoFiltro, MultiplicadorPrecio } from './types';

// Mapa de parámetros globales para acceso rápido por clave
export type ParamsMap = Record<string, ParametroCosteo>;

export function buildParamsMap(params: ParametroCosteo[]): ParamsMap {
  const map: ParamsMap = {};
  params.forEach((p) => {
    map[p.clave] = p;
  });
  return map;
}

// Valor unitario de un parámetro = valor / divisor
export function valorUnitario(p: ParametroCosteo | undefined): number {
  if (!p) return 0;
  const d = Number(p.divisor) || 1;
  return Number(p.valor) / d;
}

// Resultado del cálculo de costeo de un filtro individual
export interface ResultadoCosteo {
  laterales_x_hoja: number;
  costo_x_hoja: number;
  costo_x_lateral: number;
  costo_corte_total: number;
  costo_plixado: number;
  costo_pegamento: number;
  costo_bolsita: number;
  costo_etiqueta: number;
  costo_armado: number;
  costo_laterales_carton: number;
  costo_goma_eva: number;
  costo_espuma: number;
  costo_caja: number;
  costo_embolsado: number;
  ganancia: number;
  costo_mayorista: number;
  // Precios derivados con multiplicadores
  precios_derivados: Record<string, number>;
}

/**
 * Calcula todos los costos de un filtro individual usando las fórmulas del Excel.
 *
 * Cadena de cálculo:
 * 1. laterales_x_hoja = (cantidad_x_ancho * cantidad_x_largo) + cantidad_x_sobrante
 * 2. costo_x_hoja = costo_x_kilo / hojas_x_kilo
 * 3. costo_x_lateral = costo_x_hoja / laterales_x_hoja
 * 4. costo_corte_total = mano_obra_x_corte + costo_x_lateral
 * 5. costo_pegamento = pegamento_unitario_global / divisor_pegamento_filtro
 * 6. costo_laterales_carton = costo_corte_total * factor_laterales_carton
 * 7. costo_mayorista = SUMA de todos los componentes
 * 8. Precios derivados = costo_mayorista * factor de cada multiplicador
 */
export function calcularCosteoFiltro(
  params: ParamsMap,
  filtro: CosteoFiltro,
  multiplicadores: MultiplicadorPrecio[]
): ResultadoCosteo {
  // Parámetros globales
  const costoXKilo = valorUnitario(params['costo_x_kilo']);
  const hojasXKilo = Number(params['hojas_x_kilo']?.valor) || 4.2;
  const pegamentoUnitario = valorUnitario(params['costo_pegamento_base']);
  const bolsitaUnitaria = valorUnitario(params['costo_bolsita_base']);
  const etiquetaUnitaria = valorUnitario(params['costo_etiqueta_base']);
  const factorEtiqueta = Number(params['factor_etiqueta']?.valor) || 1.5;
  const costoArmado = valorUnitario(params['costo_armado']);
  const factorLateralesCarton = Number(params['factor_laterales_carton']?.valor) || 2.1;
  const costoCaja = valorUnitario(params['costo_caja_base']);
  const costoEmbolsado = valorUnitario(params['costo_embolsado']);
  const ganancia = valorUnitario(params['ganancia']);

  // 1. Aprovechamiento de material
  const laterales_x_hoja =
    Number(filtro.cantidad_x_ancho) * Number(filtro.cantidad_x_largo) +
    Number(filtro.cantidad_x_sobrante);

  // 2. Costo material
  const costo_x_hoja = hojasXKilo > 0 ? costoXKilo / hojasXKilo : 0;
  const costo_x_lateral = laterales_x_hoja > 0 ? costo_x_hoja / laterales_x_hoja : 0;
  const costo_corte_total = costo_x_lateral;

  // 3. Costos adicionales
  const costo_plixado = Number(filtro.costo_plixado);
  const divisorPeg = Number(filtro.divisor_pegamento) || 1;
  const costo_pegamento = pegamentoUnitario / divisorPeg;
  const costo_bolsita = bolsitaUnitaria;
  const costo_etiqueta =
    filtro.costo_etiqueta !== undefined && Number(filtro.costo_etiqueta) > 0
      ? Number(filtro.costo_etiqueta)
      : etiquetaUnitaria * factorEtiqueta;
  const costo_armado = 0;
  const factorCarton =
    filtro.factor_carton !== undefined && Number(filtro.factor_carton) > 0
      ? Number(filtro.factor_carton)
      : factorLateralesCarton;
  const costo_laterales_carton = costo_corte_total * factorCarton;
  const costo_goma_eva = filtro.usa_goma_eva ? Number(filtro.costo_goma_eva) : 0;
  const costo_espuma = filtro.usa_espuma ? Number(filtro.costo_espuma) : 0;
  const costo_caja =
    filtro.costo_caja !== undefined && Number(filtro.costo_caja) > 0
      ? Number(filtro.costo_caja)
      : costoCaja;
  const costo_caja_especial = Number(filtro.costo_caja_especial) || 0;
  const costo_embolsado = costoEmbolsado;
  const gananciaFiltro =
    filtro.ganancia !== undefined && Number(filtro.ganancia) > 0
      ? Number(filtro.ganancia)
      : ganancia;

  // 4. Costo mayorista base = suma de componentes de materiales, plixado, adicionales y empaque
  const costo_mayorista =
    costo_plixado +
    costo_pegamento +
    costo_bolsita +
    costo_etiqueta +
    costo_laterales_carton +
    costo_goma_eva +
    costo_espuma +
    costo_caja +
    costo_caja_especial +
    costo_embolsado +
    gananciaFiltro;

  // 5. Precios derivados con multiplicadores editables
  const precios_derivados: Record<string, number> = {};
  multiplicadores
    .filter((m) => m.activo)
    .sort((a, b) => a.orden - b.orden)
    .forEach((m) => {
      if (m.clave === 'mdp_con_bolsa') {
        // MDP con bolsa = costo_mayorista / 1.05 (factor=0.9524 ≈ 1/1.05)
        precios_derivados[m.clave] = costo_mayorista * Number(m.factor);
      } else {
        precios_derivados[m.clave] = costo_mayorista * Number(m.factor);
      }
    });

  return {
    laterales_x_hoja,
    costo_x_hoja,
    costo_x_lateral,
    costo_corte_total,
    costo_plixado,
    costo_pegamento,
    costo_bolsita,
    costo_etiqueta,
    costo_armado,
    costo_laterales_carton,
    costo_goma_eva,
    costo_espuma,
    costo_caja,
    costo_embolsado,
    ganancia: gananciaFiltro,
    costo_mayorista,
    precios_derivados,
  };
}

/**
 * Aplica reglas de redondeo comercial sobre un precio calculado.
 */
export function aplicarRedondeo(
  precio: number,
  tipo: 'ninguno' | 'entero' | 'decena' | 'centena' = 'ninguno'
): number {
  if (!precio || isNaN(precio)) return 0;

  switch (tipo) {
    case 'centena':
      return Math.round(precio / 100) * 100;
    case 'decena':
      return Math.round(precio / 10) * 10;
    case 'entero':
      return Math.round(precio);
    case 'ninguno':
    default:
      return Math.round(precio * 100) / 100;
  }
}

/**
 * Obtiene el precio final para un canal de costeo específico con ajustes y redondeo.
 */
export function resolverPrecioCanalCosteo(
  resultado: ResultadoCosteo,
  canal: string,
  descuentoAdicional: number = 0,
  redondeo: 'ninguno' | 'entero' | 'decena' | 'centena' = 'ninguno'
): number {
  let precioBase = 0;

  if (canal === 'costo_mayorista') {
    precioBase = resultado.costo_mayorista;
  } else if (resultado.precios_derivados[canal] !== undefined) {
    precioBase = resultado.precios_derivados[canal];
  } else {
    // Si el canal no coincide exactamente, buscar en precios derivados o usar costo mayorista
    precioBase = resultado.costo_mayorista;
  }

  if (descuentoAdicional !== 0) {
    precioBase = precioBase * (1 + descuentoAdicional / 100);
  }

  return aplicarRedondeo(precioBase, redondeo);
}

/**
 * Genera un mapa rápido Map<codigo_fhl, ResultadoCosteo> para resolución O(1) de precios en facturador.
 */
export function calcularMapaPreciosCosteo(
  paramsMap: ParamsMap,
  filtrosCosteo: CosteoFiltro[],
  multiplicadores: MultiplicadorPrecio[]
): Map<string, ResultadoCosteo> {
  const map = new Map<string, ResultadoCosteo>();
  filtrosCosteo.forEach((f) => {
    map.set(f.codigo_fhl.toUpperCase(), calcularCosteoFiltro(paramsMap, f, multiplicadores));
  });
  return map;
}

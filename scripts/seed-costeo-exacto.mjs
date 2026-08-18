import XLSX from 'xlsx';

const PROJECT_REF = 'egcydrmevdadqbuaqndr';
const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN || '';

async function seedExacto() {
  console.log('Parseando "Lista base Oct25.xlsx" con 100% de exactitud en todos los componentes...');
  const wb = XLSX.readFile('Lista base Oct25.xlsx', { cellFormula: true });
  const ws = wb.Sheets['Hoja1'];
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');

  const items = [];

  for (let r = 3; r <= range.e.r; r++) {
    const cellB = ws[XLSX.utils.encode_cell({ r, c: 1 })];
    if (!cellB || !cellB.v || !String(cellB.v).startsWith('FHL')) continue;

    const getVal = (col) => {
      const c = ws[XLSX.utils.encode_cell({ r, c: col })];
      return c && c.v !== undefined && !isNaN(Number(c.v)) ? Number(c.v) : 0;
    };
    const getFormula = (col) => {
      const c = ws[XLSX.utils.encode_cell({ r, c: col })];
      return c && c.f ? String(c.f) : '';
    };

    const cod = String(cellB.v).trim().toUpperCase();
    const cantAncho = getVal(13); // N
    const cantLargo = getVal(14); // O
    const sobrante = getVal(15);  // P
    const manoObra = getVal(19) || 4; // T
    const plixado = getVal(21);   // V

    // Pegamento (X)
    let divPeg = 5;
    const fPeg = getFormula(23);
    if (fPeg) {
      const m = fPeg.match(/\/(\d+(\.\d+)?)/);
      if (m) divPeg = parseFloat(m[1]);
    } else if (getVal(23) > 0) {
      divPeg = Math.round((427.2727 / getVal(23)) * 10) / 10;
    }

    // Armado (AA)
    const armado = getVal(26) || 150;

    // Cartón (AB)
    let factorCarton = 2.1;
    const fCarton = getFormula(27);
    if (fCarton) {
      const m = fCarton.match(/\*(\d+(\.\d+)?)/);
      if (m) factorCarton = parseFloat(m[1]);
    }

    // Caja Especial (W)
    const cajaEspecial = getVal(22); // Col W (22)

    // Caja (AE)
    const caja = getVal(30) || 40; // Col AE (30)

    // Etiqueta (Z)
    const etiqueta = getVal(25) || 5.625; // Col Z (25)

    // Goma Eva (AC)
    const gomaEva = getVal(28); // Col AC (28)

    // Espuma (AD)
    const espuma = getVal(29); // Col AD (29)

    // Ganancia (AG)
    const ganancia = getVal(32) || 430; // Col AG (32)

    // Costo Mayorista Excel (AH)
    const mayoristaExcel = getVal(33); // Col AH (33)

    items.push({
      codigo_fhl: cod,
      cantidad_x_ancho: cantAncho,
      cantidad_x_largo: cantLargo,
      cantidad_x_sobrante: sobrante,
      mano_obra_x_corte: manoObra,
      costo_plixado: plixado,
      costo_armado: armado,
      divisor_pegamento: divPeg,
      factor_carton: factorCarton,
      costo_caja_especial: cajaEspecial,
      costo_caja: caja,
      costo_etiqueta: etiqueta,
      usa_goma_eva: gomaEva > 0,
      costo_goma_eva: gomaEva,
      usa_espuma: espuma > 0,
      costo_espuma: espuma,
      ganancia: ganancia,
      costo_mayorista_excel: mayoristaExcel,
    });
  }

  console.log(`Procesados ${items.length} filtros con sus componentes individuales.`);

  const valuesSql = items
    .map(
      (it) =>
        `('${it.codigo_fhl}', ${it.cantidad_x_ancho}, ${it.cantidad_x_largo}, ${it.cantidad_x_sobrante}, ${it.mano_obra_x_corte}, ${it.costo_plixado}, ${it.costo_armado}, ${it.divisor_pegamento}, ${it.factor_carton}, ${it.costo_caja_especial}, ${it.costo_caja}, ${it.costo_etiqueta}, ${it.usa_goma_eva}, ${it.costo_goma_eva}, ${it.usa_espuma}, ${it.costo_espuma}, ${it.ganancia}, ${it.costo_mayorista_excel})`
    )
    .join(',\n');

  const sql = `
    INSERT INTO costeo_filtros (
      codigo_fhl, cantidad_x_ancho, cantidad_x_largo, cantidad_x_sobrante,
      mano_obra_x_corte, costo_plixado, costo_armado, divisor_pegamento,
      factor_carton, costo_caja_especial, costo_caja, costo_etiqueta,
      usa_goma_eva, costo_goma_eva, usa_espuma, costo_espuma,
      ganancia, costo_mayorista_excel
    ) VALUES
    ${valuesSql}
    ON CONFLICT (codigo_fhl) DO UPDATE SET
      cantidad_x_ancho = EXCLUDED.cantidad_x_ancho,
      cantidad_x_largo = EXCLUDED.cantidad_x_largo,
      cantidad_x_sobrante = EXCLUDED.cantidad_x_sobrante,
      mano_obra_x_corte = EXCLUDED.mano_obra_x_corte,
      costo_plixado = EXCLUDED.costo_plixado,
      costo_armado = EXCLUDED.costo_armado,
      divisor_pegamento = EXCLUDED.divisor_pegamento,
      factor_carton = EXCLUDED.factor_carton,
      costo_caja_especial = EXCLUDED.costo_caja_especial,
      costo_caja = EXCLUDED.costo_caja,
      costo_etiqueta = EXCLUDED.costo_etiqueta,
      usa_goma_eva = EXCLUDED.usa_goma_eva,
      costo_goma_eva = EXCLUDED.costo_goma_eva,
      usa_espuma = EXCLUDED.usa_espuma,
      costo_espuma = EXCLUDED.costo_espuma,
      ganancia = EXCLUDED.ganancia,
      costo_mayorista_excel = EXCLUDED.costo_mayorista_excel,
      updated_at = now();
  `;

  const url = `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ACCESS_TOKEN}`,
    },
    body: JSON.stringify({ query: sql }),
  });

  if (!response.ok) {
    console.error('Error:', response.status, await response.text());
  } else {
    console.log(`¡Éxito total! ${items.length} filtros actualizados con todas sus variaciones.`);
  }
}

seedExacto().catch(console.error);

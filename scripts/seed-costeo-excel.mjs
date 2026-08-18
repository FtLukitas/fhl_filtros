import XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://egcydrmevdadqbuaqndr.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'sbp_705c67d3e4a81d232d2c3406d5e0d63568d10747'; // Access token or we can use REST with Management API query

const PROJECT_REF = 'egcydrmevdadqbuaqndr';
const ACCESS_TOKEN = 'sbp_705c67d3e4a81d232d2c3406d5e0d63568d10747';

async function seedCosteoFromExcel() {
  console.log('Leyendo "Lista base Oct25.xlsx"...');
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

    // Detectar divisor de pegamento de la fórmula en col X (23) ej: "X3/5"
    let divPeg = 5;
    const cellX = ws[XLSX.utils.encode_cell({ r, c: 23 })];
    if (cellX && cellX.f) {
      const match = String(cellX.f).match(/\/(\d+(\.\d+)?)/);
      if (match) divPeg = parseFloat(match[1]);
    }

    const cod = String(cellB.v).trim().toUpperCase();
    const cantAncho = getVal(13); // N
    const cantLargo = getVal(14); // O
    const sobrante = getVal(15);  // P
    const manoObra = getVal(19) || 4; // T
    const plixado = getVal(21);   // V
    const gomaEva = getVal(28);   // AC
    const espuma = getVal(29);    // AD

    items.push({
      codigo_fhl: cod,
      cantidad_x_ancho: cantAncho,
      cantidad_x_largo: cantLargo,
      cantidad_x_sobrante: sobrante,
      mano_obra_x_corte: manoObra,
      costo_plixado: plixado,
      divisor_pegamento: divPeg,
      usa_goma_eva: gomaEva > 0,
      costo_goma_eva: gomaEva,
      usa_espuma: espuma > 0,
      costo_espuma: espuma,
    });
  }

  console.log(`Detectados ${items.length} productos FHL en el Excel.`);

  // Insertar vía Supabase Management API query
  if (items.length > 0) {
    const valuesSql = items
      .map(
        (it) =>
          `('${it.codigo_fhl}', ${it.cantidad_x_ancho}, ${it.cantidad_x_largo}, ${it.cantidad_x_sobrante}, ${it.mano_obra_x_corte}, ${it.costo_plixado}, ${it.divisor_pegamento}, ${it.usa_goma_eva}, ${it.costo_goma_eva}, ${it.usa_espuma}, ${it.costo_espuma})`
      )
      .join(',\n');

    const sql = `
      INSERT INTO costeo_filtros (
        codigo_fhl, cantidad_x_ancho, cantidad_x_largo, cantidad_x_sobrante,
        mano_obra_x_corte, costo_plixado, divisor_pegamento,
        usa_goma_eva, costo_goma_eva, usa_espuma, costo_espuma
      ) VALUES
      ${valuesSql}
      ON CONFLICT (codigo_fhl) DO UPDATE SET
        cantidad_x_ancho = EXCLUDED.cantidad_x_ancho,
        cantidad_x_largo = EXCLUDED.cantidad_x_largo,
        cantidad_x_sobrante = EXCLUDED.cantidad_x_sobrante,
        mano_obra_x_corte = EXCLUDED.mano_obra_x_corte,
        costo_plixado = EXCLUDED.costo_plixado,
        divisor_pegamento = EXCLUDED.divisor_pegamento,
        usa_goma_eva = EXCLUDED.usa_goma_eva,
        costo_goma_eva = EXCLUDED.costo_goma_eva,
        usa_espuma = EXCLUDED.usa_espuma,
        costo_espuma = EXCLUDED.costo_espuma,
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
      const errText = await response.text();
      console.error('Error insertando en Supabase:', response.status, errText);
    } else {
      console.log(`¡Éxito! ${items.length} productos insertados en costeo_filtros.`);
    }
  }
}

seedCosteoFromExcel().catch(console.error);

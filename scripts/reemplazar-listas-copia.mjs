import XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://egcydrmevdadqbuaqndr.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Kp2zEiS5YA93lRW3kPb5_g_4fp_fwPn';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const wb = XLSX.readFile('c:\\fhl_filtros\\Lista base Oct25 - copia.xlsx');
const ws = wb.Sheets[wb.SheetNames[0]];
const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

const listDefs = [
  { key: 'mayorista_1', name: 'Mayorista 1', desc: 'Tarifa Mayorista 1 estándar de fábrica.', col: 36, predeterminada: true },
  { key: 'mayorista_2', name: 'Mayorista 2', desc: 'Tarifa Mayorista 2.', col: 37, predeterminada: false },
  { key: 'mayorista_3', name: 'Mayorista 3', desc: 'Tarifa Mayorista 3.', col: 38, predeterminada: false },
  { key: 'mayorista_base', name: 'Mayorista Base', desc: 'Tarifa Mayorista Base.', col: 33, predeterminada: false },
  { key: 'mdp_bolsa', name: 'MDP con Bolsa', desc: 'Tarifa MDP con bolsa de fábrica.', col: 34, predeterminada: false },
  { key: 'mdp_starfilt', name: 'MDP c/Bolsa Starfilt', desc: 'Tarifa MDP con bolsa Starfilt.', col: 35, predeterminada: false },
  { key: 'comercio', name: 'Comercio', desc: 'Tarifa para comercios y mostrador.', col: 39, predeterminada: false },
];

async function run() {
  console.log('--- 1. Extrayendo datos de "Lista base Oct25 - copia.xlsx" ---');
  const itemsPorLista = {};
  for (const ld of listDefs) {
    itemsPorLista[ld.key] = [];
  }

  const basePricesCatalog = [];

  for (let r = 3; r < data.length; r++) {
    const row = data[r];
    const rawCode = String(row[1] || '').trim().toUpperCase();
    if (!rawCode || !rawCode.startsWith('FHL')) continue;

    for (const ld of listDefs) {
      const val = Number(row[ld.col]);
      if (!isNaN(val) && val > 0) {
        itemsPorLista[ld.key].push({
          codigo_fhl: rawCode,
          precio: Math.round(val),
        });
      }
    }

    const pMayorista1 = Number(row[36]);
    if (!isNaN(pMayorista1) && pMayorista1 > 0) {
      basePricesCatalog.push({
        codigo_fhl: rawCode,
        precio: Math.round(pMayorista1),
      });
    }
  }

  console.log(`Filtros extraídos: ${basePricesCatalog.length}`);

  console.log('\n--- 2. Limpiando listas de precios anteriores ---');
  // Marcar todas las listas previas como eliminadas
  const { error: errDelListas } = await supabase
    .from('listas_precios')
    .update({ eliminado: true, activa: false, es_predeterminada: false })
    .neq('id', '00000000-0000-0000-0000-000000000000');

  if (errDelListas) {
    console.error('Error al desactivar listas previas:', errDelListas);
  }

  console.log('\n--- 3. Creando las 7 nuevas listas limpias ---');
  for (const ld of listDefs) {
    const { data: newList, error: errCreate } = await supabase
      .from('listas_precios')
      .insert({
        nombre: ld.name,
        descripcion: ld.desc,
        tipo_ajuste: 'excel',
        porcentaje: 0,
        activa: true,
        es_predeterminada: ld.predeterminada,
        eliminado: false,
      })
      .select()
      .single();

    if (errCreate) {
      console.error(`Error al crear lista ${ld.name}:`, errCreate);
      continue;
    }

    console.log(`✓ Lista creada: "${newList.nombre}" (ID: ${newList.id})`);

    // Insertar ítems
    const items = itemsPorLista[ld.key].map((it) => ({
      lista_id: newList.id,
      codigo_fhl: it.codigo_fhl,
      precio: it.precio,
    }));

    if (items.length > 0) {
      const { error: errItems } = await supabase
        .from('items_lista_precio')
        .insert(items);

      if (errItems) {
        console.error(`Error al insertar items en "${ld.name}":`, errItems);
      } else {
        console.log(`  -> Insertados ${items.length} ítems con precio.`);
      }
    }
  }

  console.log('\n--- 4. Actualizando precios base en Tabla A ---');
  let actualizadosTablaA = 0;
  for (const bp of basePricesCatalog) {
    const { error: errTablaA } = await supabase
      .from('Tabla A')
      .update({ precio: bp.precio })
      .eq('codigo_fhl', bp.codigo_fhl);

    if (!errTablaA) actualizadosTablaA++;
  }
  console.log(`✓ Precios base de ${actualizadosTablaA} filtros actualizados en Tabla A.`);

  console.log('\n--- PROCESO COMPLETADO CON ÉXITO ---');
}

run();

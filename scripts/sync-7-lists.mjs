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

async function sync7Lists() {
  console.log('--- Extrayendo datos de las 7 listas ---');
  const itemsPorLista = {};
  for (const ld of listDefs) {
    itemsPorLista[ld.key] = [];
  }

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
  }

  // Verificar listas existentes en DB
  const { data: dbListas } = await supabase.from('listas_precios').select('*');

  for (const ld of listDefs) {
    let listId = null;
    const existing = dbListas?.find(l => l.nombre.toLowerCase() === ld.name.toLowerCase());

    if (existing) {
      listId = existing.id;
      await supabase.from('listas_precios').update({
        descripcion: ld.desc,
        activa: true,
        eliminado: false,
        es_predeterminada: ld.predeterminada,
        tipo_ajuste: 'excel',
      }).eq('id', listId);
      console.log(`✓ Lista existente actualizada: "${ld.name}" (${listId})`);
    } else {
      const { data: created, error } = await supabase.from('listas_precios').insert({
        nombre: ld.name,
        descripcion: ld.desc,
        tipo_ajuste: 'excel',
        porcentaje: 0,
        activa: true,
        es_predeterminada: ld.predeterminada,
        eliminado: false,
      }).select().single();

      if (error) {
        console.error(`Error al crear lista ${ld.name}:`, error);
        continue;
      }
      listId = created.id;
      console.log(`✓ Nueva lista creada: "${ld.name}" (${listId})`);
    }

    // Upsert items para esta lista
    const items = itemsPorLista[ld.key].map(it => ({
      lista_id: listId,
      codigo_fhl: it.codigo_fhl,
      precio: it.precio,
    }));

    if (items.length > 0) {
      // Limpiar items previos de esta lista
      await supabase.from('items_lista_precio').delete().eq('lista_id', listId);
      const { error: errIns } = await supabase.from('items_lista_precio').insert(items);
      if (errIns) {
        console.error(`Error al insertar items en ${ld.name}:`, errIns);
      } else {
        console.log(`  -> Insertados ${items.length} items en "${ld.name}".`);
      }
    }
  }

  console.log('--- Sincronización completada ---');
}

sync7Lists();

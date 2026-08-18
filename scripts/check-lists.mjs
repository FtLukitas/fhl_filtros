import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://egcydrmevdadqbuaqndr.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Kp2zEiS5YA93lRW3kPb5_g_4fp_fwPn';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function checkLists() {
  const { data: listas, error } = await supabase
    .from('listas_precios')
    .select('*');

  console.log('Listas actuales:', listas);

  for (const l of (listas || [])) {
    const { count } = await supabase
      .from('items_lista_precio')
      .select('*', { count: 'exact', head: true })
      .eq('lista_id', l.id);
    console.log(`Lista "${l.nombre}" (ID: ${l.id}, Tipo: ${l.tipo_ajuste}, %: ${l.porcentaje}, Predet: ${l.es_predeterminada}): ${count} items`);
  }
}

checkLists();

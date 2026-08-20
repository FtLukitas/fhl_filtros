import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://egcydrmevdadqbuaqndr.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Kp2zEiS5YA93lRW3kPb5_g_4fp_fwPn';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function checkAllLists() {
  const { data: listas } = await supabase.from('listas_precios').select('*');
  console.log('TODAS LAS LISTAS EN DB:');
  console.log(listas);
}

checkAllLists();

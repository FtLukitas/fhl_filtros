import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://egcydrmevdadqbuaqndr.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Kp2zEiS5YA93lRW3kPb5_g_4fp_fwPn';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function inspectMovSaldo() {
  const { data: movs } = await supabase.from('movimientos_saldo').select('*, cliente:clientes(nombre)');
  console.log('MOVIMIENTOS DE SALDO DETALLE:');
  console.log(JSON.stringify(movs, null, 2));

  const { data: pagos } = await supabase.from('pagos').select('*');
  console.log('PAGOS:');
  console.log(JSON.stringify(pagos, null, 2));
}

inspectMovSaldo();

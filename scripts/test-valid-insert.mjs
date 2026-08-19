import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://egcydrmevdadqbuaqndr.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Kp2zEiS5YA93lRW3kPb5_g_4fp_fwPn';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function testValidColumns() {
  const payload = {
    nombre: 'CLIENTE TEST ' + Date.now(),
    cuit: '20-99999999-9',
    direccion: 'Av Libertador 1234',
    ciudad: 'Rosario',
    provincia: 'Santa Fe',
    condicion_iva: 'Responsable Inscripto',
    tipo_cliente: 'Distribuidor',
    descuento_predeterminado: 10,
    plazo_pago: '30 días',
    eliminado: false,
  };

  const { data, error } = await supabase
    .from('clientes')
    .insert(payload)
    .select()
    .single();

  if (error) {
    console.error('ERROR:', error);
  } else {
    console.log('SUCCESS: Cliente insertado con éxito!', data);
    await supabase.from('clientes').delete().eq('id', data.id);
    console.log('Cliente de prueba eliminado.');
  }
}

testValidColumns();

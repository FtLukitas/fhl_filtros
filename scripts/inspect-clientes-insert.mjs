import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://egcydrmevdadqbuaqndr.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Kp2zEiS5YA93lRW3kPb5_g_4fp_fwPn';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function inspectClientesTable() {
  console.log('--- 1. Intentando seleccionar de la tabla clientes ---');
  const { data, error } = await supabase.from('clientes').select('*').limit(1);
  if (error) {
    console.error('Error al consultar clientes:', error);
  } else {
    console.log('Columnas encontradas en primer registro:', data[0] ? Object.keys(data[0]) : 'Tabla vacía');
  }

  console.log('--- 2. Intentando un INSERT de prueba ---');
  const testPayload = {
    nombre: 'TEST CLIENTE ' + Date.now(),
    cuit: '20-12345678-9',
    email: 'test@test.com',
    telefono: '1122334455',
    direccion: 'Calle Falsa 123',
    ciudad: 'CABA',
    provincia: 'Buenos Aires',
    condicion_iva: 'Responsable Inscripto',
    tipo_cliente: 'Mayorista',
    descuento_predeterminado: 0,
    plazo_pago: 'Contado',
    notas: 'Nota test',
    eliminado: false,
  };

  const { data: insData, error: insError } = await supabase
    .from('clientes')
    .insert(testPayload)
    .select()
    .single();

  if (insError) {
    console.error('ERROR AL INSERTAR:', insError);
  } else {
    console.log('INSERT EXITOSO:', insData);
    // Borrar registro de prueba
    await supabase.from('clientes').delete().eq('id', insData.id);
  }
}

inspectClientesTable();

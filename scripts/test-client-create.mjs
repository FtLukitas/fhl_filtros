import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://egcydrmevdadqbuaqndr.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Kp2zEiS5YA93lRW3kPb5_g_4fp_fwPn';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function testCreateClient() {
  const payload = {
    nombre: 'Distribuidora Automotriz Norte',
    cuit: '30-71234567-8',
    direccion: 'Av. Libertador 4500 (Tel: 11-4567-8900)',
    ciudad: 'San Isidro',
    provincia: 'Buenos Aires',
    condicion_iva: 'Responsable Inscripto',
    tipo_cliente: 'Distribuidor',
    descuento_predeterminado: 15,
    plazo_pago: '30 días',
    lista_precio_id: null,
    eliminado: false,
  };

  console.log('Insertando cliente con payload idéntico al panel...');
  const { data, error } = await supabase
    .from('clientes')
    .insert(payload)
    .select()
    .single();

  if (error) {
    console.error('ERROR AL INSERTAR:', error);
  } else {
    console.log('✓ CLIENTE CREADO CON ÉXITO:', data);

    console.log('Probando actualización (UPDATE)...');
    const { data: updated, error: errUp } = await supabase
      .from('clientes')
      .update({
        nombre: 'Distribuidora Automotriz Norte S.A.',
        descuento_predeterminado: 20,
      })
      .eq('id', data.id)
      .select()
      .single();

    if (errUp) {
      console.error('ERROR AL ACTUALIZAR:', errUp);
    } else {
      console.log('✓ CLIENTE ACTUALIZADO CON ÉXITO:', updated);
    }

    // Limpiar
    await supabase.from('clientes').delete().eq('id', data.id);
    console.log('✓ Cliente de prueba eliminado limpiamente.');
  }
}

testCreateClient();

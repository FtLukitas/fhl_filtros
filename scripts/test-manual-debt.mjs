import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://egcydrmevdadqbuaqndr.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Kp2zEiS5YA93lRW3kPb5_g_4fp_fwPn';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function testManualDebt() {
  console.log('='.repeat(70));
  console.log('TEST: AGREGAR DEUDA DIRECTA A UN CLIENTE');
  console.log('='.repeat(70));

  // 1. Crear cliente
  const { data: cliente } = await supabase
    .from('clientes')
    .insert({
      nombre: 'TEST DEBT CLIENT ' + Date.now(),
      cuit: '30-11223344-5',
      eliminado: false,
    })
    .select()
    .single();

  console.log(`✓ Cliente creado: "${cliente.nombre}" (${cliente.id})`);

  // 2. Agregar deuda manual de $75.000 (monto: -75000)
  const montoDeuda = 75000;
  await supabase.from('movimientos_saldo').insert({
    cliente_id: cliente.id,
    monto: -montoDeuda,
    tipo: 'ajuste_manual',
    nota: 'Saldo deudor inicial convenido',
    fecha: new Date().toISOString(),
  });

  // 3. Simular cálculo de clientes/page.tsx y clientes/[id]/page.tsx
  const { data: dbPedidos } = await supabase
    .from('pedidos')
    .select('id, cliente_id, total, estado')
    .eq('cliente_id', cliente.id)
    .neq('estado', 'cancelado');

  const { data: dbMovs } = await supabase
    .from('movimientos_saldo')
    .select('*')
    .eq('cliente_id', cliente.id);

  const deudaPedidos = (dbPedidos || []).reduce((s, p) => s + Number(p.total), 0);
  const balanceMovs = (dbMovs || []).reduce((s, m) => s + Number(m.monto), 0);

  const saldoAFavor = Math.max(0, balanceMovs);
  const deudaAjustes = Math.max(0, -balanceMovs);
  const deudaTotal = deudaPedidos + deudaAjustes;

  console.log(`✓ Balance movimientos: $${balanceMovs}`);
  console.log(`✓ Deuda por ajustes / manual: $${deudaAjustes} (Esperado: $75.000)`);
  console.log(`✓ Deuda total calculada: $${deudaTotal} (Esperado: $75.000)`);
  console.log(`✓ Saldo a favor: $${saldoAFavor} (Esperado: $0)`);

  if (deudaTotal === 75000 && saldoAFavor === 0) {
    console.log('\n>>> RESULTADO: PERFECTO. La deuda manual se agrega y computa correctamente como DEUDA TOTAL del cliente.');
  } else {
    console.error('\n>>> ERROR en el cálculo.');
  }

  // 4. Limpiar
  await supabase.from('movimientos_saldo').delete().eq('cliente_id', cliente.id);
  await supabase.from('clientes').delete().eq('id', cliente.id);
  console.log('✓ Datos de prueba eliminados.');
  console.log('='.repeat(70));
}

testManualDebt();

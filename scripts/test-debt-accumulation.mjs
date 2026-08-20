import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://egcydrmevdadqbuaqndr.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Kp2zEiS5YA93lRW3kPb5_g_4fp_fwPn';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function testDebtAccumulation() {
  console.log('='.repeat(70));
  console.log('TEST: ACUMULACIÓN DE DEUDA (PEDIDOS + DÉBITOS MANUALES)');
  console.log('='.repeat(70));

  // 1. Crear cliente
  const { data: cliente } = await supabase
    .from('clientes')
    .insert({
      nombre: 'TEST ACCUM CLIENT ' + Date.now(),
      cuit: '30-44556677-8',
      eliminado: false,
    })
    .select()
    .single();

  // 2. Crear Pedido por $100.000 (deuda inicial de pedidos)
  const { data: ped } = await supabase
    .from('pedidos')
    .insert({
      cliente_id: cliente.id,
      estado: 'confirmado',
      total: 100000,
    })
    .select()
    .single();

  console.log(`✓ Cliente creado con pedido #${ped.id.slice(0,8)} de $100.000`);

  // 3. Sumar deuda manual de $50.000 (monto: -50000)
  await supabase.from('movimientos_saldo').insert({
    cliente_id: cliente.id,
    monto: -50000,
    tipo: 'ajuste_manual',
    nota: 'Cargo extra administrativo',
    fecha: new Date().toISOString(),
  });

  // 4. Calcular deuda total
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

  console.log(`✓ Deuda de Pedidos: $${deudaPedidos}`);
  console.log(`✓ Deuda por Ajustes Manuales: $${deudaAjustes}`);
  console.log(`✓ Deuda TOTAL Consolidada: $${deudaTotal} (Esperado: $150.000)`);
  console.log(`✓ Saldo a Favor: $${saldoAFavor} (Esperado: $0)`);

  if (deudaTotal === 150000 && saldoAFavor === 0) {
    console.log('\n>>> RESULTADO: PERFECTO. La deuda manual se suma directamente a la deuda existente del cliente.');
  } else {
    console.error('\n>>> ERROR en el cálculo.');
  }

  // 5. Limpieza
  await supabase.from('movimientos_saldo').delete().eq('cliente_id', cliente.id);
  await supabase.from('pedidos').delete().eq('cliente_id', cliente.id);
  await supabase.from('clientes').delete().eq('id', cliente.id);
  console.log('✓ Datos de prueba limpiados.');
  console.log('='.repeat(70));
}

testDebtAccumulation();

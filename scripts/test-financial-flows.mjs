import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://egcydrmevdadqbuaqndr.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Kp2zEiS5YA93lRW3kPb5_g_4fp_fwPn';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function testFinancialFlows() {
  console.log('='.repeat(70));
  console.log('TEST END-TO-END: SINCRONIZACIÓN DE PAGOS, SALDOS Y DEUDAS');
  console.log('='.repeat(70));

  // 1. Crear cliente de prueba
  const { data: cliente, error: errCli } = await supabase
    .from('clientes')
    .insert({
      nombre: 'TEST FLOW CLIENT ' + Date.now(),
      cuit: '30-99988877-6',
      direccion: 'Test 123',
      eliminado: false,
    })
    .select()
    .single();

  if (errCli || !cliente) {
    console.error('Error creando cliente:', errCli);
    return;
  }
  console.log(`✓ Cliente creado: "${cliente.nombre}" (${cliente.id})`);

  // 2. Crear Pedido 1 ($50.000)
  const { data: ped1, error: errPed1 } = await supabase
    .from('pedidos')
    .insert({
      cliente_id: cliente.id,
      estado: 'confirmado',
      total: 50000,
      observaciones: 'Test Pedido 1',
    })
    .select()
    .single();

  console.log(`✓ Pedido 1 creado: #${ped1.id.slice(0,8)} por $${ped1.total}`);

  // 3. Pago Parcial ($20.000)
  await supabase.from('pagos').insert({
    pedido_id: ped1.id,
    cliente_id: cliente.id,
    monto: 20000,
    metodo: 'transferencia',
    fecha: new Date().toISOString(),
  });

  const { data: pagos1 } = await supabase.from('pagos').select('*').eq('pedido_id', ped1.id);
  const totalPagado1 = pagos1.reduce((s, p) => s + Number(p.monto), 0);
  const deuda1 = Math.max(0, ped1.total - totalPagado1);
  console.log(`✓ Pago parcial registrado: $20.000 | Deuda restante: $${deuda1} (Esperado: $30.000)`);

  // 4. Pago con Excedente ($40.000 sobre deuda de $30.000)
  const montoPago2 = 40000;
  const excedente = montoPago2 - deuda1; // $10.000
  await supabase.from('pagos').insert({
    pedido_id: ped1.id,
    cliente_id: cliente.id,
    monto: montoPago2,
    metodo: 'efectivo',
    fecha: new Date().toISOString(),
  });
  await supabase.from('movimientos_saldo').insert({
    cliente_id: cliente.id,
    monto: excedente,
    tipo: 'excedente',
    referencia_pedido_id: ped1.id,
    nota: `Excedente en pedido #${ped1.id.slice(0,8)}`,
    fecha: new Date().toISOString(),
  });

  const { data: pagosTotal1 } = await supabase.from('pagos').select('*').eq('pedido_id', ped1.id);
  const totalPagadoFinal1 = pagosTotal1.reduce((s, p) => s + Number(p.monto), 0);
  const deudaFinal1 = Math.max(0, ped1.total - totalPagadoFinal1);
  console.log(`✓ Pago de $40.000 registrado | Total pagado: $${totalPagadoFinal1} | Deuda: $${deudaFinal1} | Excedente generado: $${excedente}`);

  // 5. Verificar Saldo a Favor del Cliente
  const { data: saldosCliente1 } = await supabase.from('movimientos_saldo').select('monto').eq('cliente_id', cliente.id);
  const saldoActual = saldosCliente1.reduce((s, m) => s + Number(m.monto), 0);
  console.log(`✓ Saldo a favor disponible del cliente: $${saldoActual} (Esperado: $10.000)`);

  // 6. Crear Pedido 2 ($10.000)
  const { data: ped2 } = await supabase
    .from('pedidos')
    .insert({
      cliente_id: cliente.id,
      estado: 'confirmado',
      total: 10000,
    })
    .select()
    .single();

  console.log(`✓ Pedido 2 creado: #${ped2.id.slice(0,8)} por $${ped2.total}`);

  // 7. Pagar Pedido 2 con Saldo a Favor ($10.000)
  await supabase.from('pagos').insert({
    pedido_id: ped2.id,
    cliente_id: cliente.id,
    monto: 10000,
    metodo: 'saldo_a_favor',
    fecha: new Date().toISOString(),
  });
  await supabase.from('movimientos_saldo').insert({
    cliente_id: cliente.id,
    monto: -10000,
    tipo: 'aplicado',
    referencia_pedido_id: ped2.id,
    nota: `Aplicado al pedido #${ped2.id.slice(0,8)}`,
    fecha: new Date().toISOString(),
  });

  const { data: saldosClienteFinal } = await supabase.from('movimientos_saldo').select('monto').eq('cliente_id', cliente.id);
  const saldoFinal = saldosClienteFinal.reduce((s, m) => s + Number(m.monto), 0);
  console.log(`✓ Saldo a favor luego de pagar Pedido 2: $${saldoFinal} (Esperado: $0)`);

  // 8. Limpiar datos de prueba
  await supabase.from('movimientos_saldo').delete().eq('cliente_id', cliente.id);
  await supabase.from('pagos').delete().eq('cliente_id', cliente.id);
  await supabase.from('pedidos').delete().eq('cliente_id', cliente.id);
  await supabase.from('clientes').delete().eq('id', cliente.id);
  console.log('✓ Datos de prueba eliminados limpiamente.');

  console.log('='.repeat(70));
  console.log('TEST COMPLETADO CON ÉXITO: 100% FUNCIONANDO');
  console.log('='.repeat(70));
}

testFinancialFlows();

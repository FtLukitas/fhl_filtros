import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://egcydrmevdadqbuaqndr.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Kp2zEiS5YA93lRW3kPb5_g_4fp_fwPn';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function inspectAllClientDebts() {
  console.log('='.repeat(70));
  console.log('ESTADO ACTUAL DE TODOS LOS CLIENTES EN BASE DE DATOS');
  console.log('='.repeat(70));

  const { data: clientes } = await supabase
    .from('clientes')
    .select('id, nombre, cuit, eliminado, created_at')
    .eq('eliminado', false)
    .order('nombre');

  const { data: pedidos } = await supabase
    .from('pedidos')
    .select('id, cliente_id, total, estado, created_at')
    .neq('estado', 'cancelado')
    .eq('eliminado', false);

  const { data: pagos } = await supabase.from('pagos').select('id, pedido_id, cliente_id, monto');
  const { data: movs } = await supabase.from('movimientos_saldo').select('*');

  const pagosPorPedido = new Map();
  (pagos || []).forEach(p => {
    pagosPorPedido.set(p.pedido_id, (pagosPorPedido.get(p.pedido_id) || 0) + Number(p.monto || 0));
  });

  const movsPorCliente = new Map();
  (movs || []).forEach(m => {
    movsPorCliente.set(m.cliente_id, (movsPorCliente.get(m.cliente_id) || 0) + Number(m.monto || 0));
  });

  for (const c of (clientes || [])) {
    const pedidosCli = (pedidos || []).filter(p => p.cliente_id === c.id);
    let deudaPedidos = 0;
    pedidosCli.forEach(p => {
      const pag = pagosPorPedido.get(p.id) || 0;
      deudaPedidos += Math.max(0, Number(p.total || 0) - pag);
    });

    const balanceMovs = movsPorCliente.get(c.id) || 0;
    const saldoAFavor = Math.max(0, balanceMovs);
    const deudaAjustes = Math.max(0, -balanceMovs);
    const deudaTotal = deudaPedidos + deudaAjustes;

    const tieneAlgo = deudaTotal > 0 || saldoAFavor > 0 || pedidosCli.length > 0;
    if (tieneAlgo) {
      console.log(`\nCliente: "${c.nombre}" (ID: ${c.id.slice(0,8)})`);
      console.log(`  -> Pedidos activos: ${pedidosCli.length} (Deuda pedidos: $${deudaPedidos})`);
      console.log(`  -> Movimientos saldo: balance $${balanceMovs} (Deuda ajustes: $${deudaAjustes}, Saldo a favor: $${saldoAFavor})`);
      console.log(`  -> DEUDA TOTAL: $${deudaTotal}`);
      
      const movsCli = (movs || []).filter(m => m.cliente_id === c.id);
      if (movsCli.length > 0) {
        console.log(`  -> Detalle de movimientos_saldo:`, movsCli.map(m => `[${m.fecha?.slice(0,10)}] ${m.tipo} $${m.monto}: "${m.nota}"`));
      }
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log('TODOS LOS REGISTROS EN movimientos_saldo:');
  console.log('='.repeat(70));
  console.log(JSON.stringify(movs, null, 2));
}

inspectAllClientDebts();

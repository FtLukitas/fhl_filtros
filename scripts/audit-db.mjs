import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://egcydrmevdadqbuaqndr.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Kp2zEiS5YA93lRW3kPb5_g_4fp_fwPn';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function auditDatabase() {
  console.log('='.repeat(70));
  console.log('AUDITORÍA COMPLETA DE LA BASE DE DATOS FHL FILTROS');
  console.log('='.repeat(70));

  // 1. Columnas reales de cada tabla
  const tablas = [
    'clientes', 'pedidos', 'items_pedido', 'pagos', 'movimientos_saldo',
    'presupuestos', 'items_presupuesto', 'listas_precios', 'items_lista_precio',
    'precios_cliente', 'parametros_costeo', 'costeo_filtro', 'multiplicadores_precio'
  ];

  for (const tabla of tablas) {
    const { data, error } = await supabase.from(tabla).select('*').limit(1);
    if (error) {
      console.log(`\n[${tabla}] ERROR: ${error.message}`);
    } else {
      const cols = data && data.length > 0 ? Object.keys(data[0]) : [];
      const { count } = await supabase.from(tabla).select('*', { count: 'exact', head: true });
      console.log(`\n[${tabla}] ${count || 0} registros | Columnas: ${cols.join(', ') || '(vacía)'}`);
    }
  }

  // 2. Estado de pedidos
  console.log('\n' + '='.repeat(70));
  console.log('ESTADO DE PEDIDOS');
  console.log('='.repeat(70));

  const { data: pedidos } = await supabase.from('pedidos').select('id, cliente_id, estado, total, eliminado, created_at').order('created_at', { ascending: false });
  if (pedidos && pedidos.length > 0) {
    const estados = {};
    pedidos.forEach(p => {
      const key = `${p.estado}${p.eliminado ? ' (eliminado)' : ''}`;
      estados[key] = (estados[key] || 0) + 1;
    });
    console.log('Distribución:', estados);
    console.log(`Total pedidos: ${pedidos.length}`);
    
    for (const p of pedidos.slice(0, 10)) {
      const { data: items } = await supabase.from('items_pedido').select('*').eq('pedido_id', p.id);
      const { data: pagos } = await supabase.from('pagos').select('*').eq('pedido_id', p.id);
      const totalItems = (items || []).reduce((s, i) => s + (i.cantidad * i.precio_unitario), 0);
      const totalPagado = (pagos || []).reduce((s, pg) => s + Number(pg.monto), 0);
      const deuda = Math.max(0, Number(p.total) - totalPagado);
      console.log(`  PED ${p.id.slice(0,8)} | Estado: ${p.estado} | Total: $${p.total} | Items: $${totalItems} | Pagado: $${totalPagado} | Deuda: $${deuda} | #Items: ${(items||[]).length} | #Pagos: ${(pagos||[]).length}`);
    }
  } else {
    console.log('No hay pedidos.');
  }

  // 3. Movimientos de Saldo
  console.log('\n' + '='.repeat(70));
  console.log('MOVIMIENTOS DE SALDO');
  console.log('='.repeat(70));

  const { data: movSaldo } = await supabase.from('movimientos_saldo').select('*').order('fecha', { ascending: false });
  if (movSaldo && movSaldo.length > 0) {
    const tipos = {};
    movSaldo.forEach(m => { tipos[m.tipo] = (tipos[m.tipo] || 0) + 1; });
    console.log('Distribución por tipo:', tipos);

    const saldoPorCliente = {};
    movSaldo.forEach(m => {
      saldoPorCliente[m.cliente_id] = (saldoPorCliente[m.cliente_id] || 0) + Number(m.monto);
    });
    console.log('Saldo neto por cliente:');
    for (const [cid, saldo] of Object.entries(saldoPorCliente)) {
      const { data: cl } = await supabase.from('clientes').select('nombre').eq('id', cid).single();
      console.log(`  ${cl?.nombre || cid.slice(0,8)}: $${saldo}`);
    }
  } else {
    console.log('No hay movimientos de saldo.');
  }

  // 4. Listas de Precios
  console.log('\n' + '='.repeat(70));
  console.log('LISTAS DE PRECIOS');
  console.log('='.repeat(70));

  const { data: listas } = await supabase.from('listas_precios').select('*').order('nombre');
  if (listas) {
    for (const l of listas) {
      const { count: itemCount } = await supabase.from('items_lista_precio').select('*', { count: 'exact', head: true }).eq('lista_id', l.id);
      console.log(`  ${l.nombre} | Tipo: ${l.tipo_ajuste} | %: ${l.porcentaje} | Activa: ${l.activa} | Predet: ${l.es_predeterminada} | Elim: ${l.eliminado} | Items: ${itemCount || 0} | ID: ${l.id.slice(0,8)}`);
    }
  }

  // 5. Tablas de Costeo
  console.log('\n' + '='.repeat(70));
  console.log('TABLAS DE COSTEO');
  console.log('='.repeat(70));

  for (const t of ['parametros_costeo', 'costeo_filtro', 'multiplicadores_precio']) {
    const { data, error } = await supabase.from(t).select('*', { count: 'exact', head: true });
    if (error) {
      console.log(`  ${t}: ERROR - ${error.message}`);
    } else {
      const { count } = await supabase.from(t).select('*', { count: 'exact', head: true });
      console.log(`  ${t}: ${count || 0} registros`);
    }
  }

  // 6. Presupuestos
  console.log('\n' + '='.repeat(70));
  console.log('PRESUPUESTOS');
  console.log('='.repeat(70));

  const { count: presCount } = await supabase.from('presupuestos').select('*', { count: 'exact', head: true });
  console.log(`  Total presupuestos: ${presCount || 0}`);

  // 7. Clientes
  console.log('\n' + '='.repeat(70));
  console.log('CLIENTES');
  console.log('='.repeat(70));

  const { data: clientes } = await supabase.from('clientes').select('id, nombre, lista_precio_id, eliminado');
  if (clientes) {
    const conLista = clientes.filter(c => c.lista_precio_id);
    console.log(`  Total: ${clientes.length} | Con lista asignada: ${conLista.length} | Sin lista: ${clientes.length - conLista.length}`);
    
    for (const c of conLista) {
      const listaExiste = listas?.find(l => l.id === c.lista_precio_id);
      if (!listaExiste) {
        console.log(`  WARN: "${c.nombre}" -> lista_precio_id="${c.lista_precio_id}" NO EXISTE`);
      }
    }
  }

  // 8. Precios personalizados
  const { count: precCount } = await supabase.from('precios_cliente').select('*', { count: 'exact', head: true });
  console.log(`\n  precios_cliente: ${precCount || 0} registros`);

  console.log('\n' + '='.repeat(70));
  console.log('FIN DE AUDITORÍA');
  console.log('='.repeat(70));
}

auditDatabase().catch(console.error);

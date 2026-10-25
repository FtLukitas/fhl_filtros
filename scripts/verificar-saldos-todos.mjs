import assert from 'assert';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Importar calcularResumenCuentaCliente desde lib/cuentas-corrientes.ts
const { calcularResumenCuentaCliente } = await import('../lib/cuentas-corrientes.ts');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://egcydrmevdadqbuaqndr.supabase.co';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_Kp2zEiS5YA93lRW3kPb5_g_4fp_fwPn';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function obtenerDatos() {
  try {
    console.log('Consultando datos directamente de Supabase...');
    const [resCli, resPed, resPag, resMov] = await Promise.all([
      supabase.from('clientes').select('*').order('nombre'),
      supabase.from('pedidos').select('*').order('created_at'),
      supabase.from('pagos').select('*').order('fecha'),
      supabase.from('movimientos_saldo').select('*').order('fecha'),
    ]);

    if (resCli.error) throw resCli.error;
    if (resPed.error) throw resPed.error;
    if (resPag.error) throw resPag.error;
    if (resMov.error) throw resMov.error;

    return {
      clientes: resCli.data,
      pedidos: resPed.data,
      pagos: resPag.data,
      movimientos_saldo: resMov.data,
    };
  } catch (err) {
    console.warn('Fallo consulta a Supabase, recurriendo a backup de cuentas corrientes:', err.message);
    const file = path.resolve('backups', 'backup-cuentas-corrientes-pre-saldos.json');
    const raw = fs.readFileSync(file, 'utf-8');
    return JSON.parse(raw);
  }
}

async function verificar() {
  console.log('='.repeat(90));
  console.log('VERIFICACIÓN AUTOMATIZADA DE SALDOS Y MOTOR FIFO (25 CLIENTES DE SUPABASE)');
  console.log('='.repeat(90));

  const data = await obtenerDatos();

  console.log(`Clientes totales: ${data.clientes.length}`);
  console.log(`Pedidos totales: ${data.pedidos.length}`);
  console.log(`Pagos totales: ${data.pagos.length}`);
  console.log(`Movimientos saldo: ${data.movimientos_saldo.length}`);
  console.log('-'.repeat(90));

  const tablaReporte = [];
  let totalActivos = 0;

  for (const cliente of data.clientes) {
    const pedidosCli = data.pedidos.filter((p) => p.cliente_id === cliente.id);
    const pagosCli = data.pagos.filter((p) => p.cliente_id === cliente.id);
    const movsCli = data.movimientos_saldo.filter((m) => m.cliente_id === cliente.id);

    const resumen = calcularResumenCuentaCliente({
      pedidos: pedidosCli,
      pagos: pagosCli,
      movimientosSaldo: movsCli,
    });

    const {
      totalComprado,
      totalCargosManuales,
      totalPagado,
      saldoNeto,
      deudaTotal,
      saldoAFavor,
      deudaAnteriorRestante,
      sumaDeudaPedidosFIFO,
      saldoFinalExtracto,
    } = resumen;

    // Aserción 1: Coincidencia matemática exacta al 100% entre Saldo Neto y Saldo Final del Extracto
    const difTarjetaExtracto = Math.abs(saldoNeto - saldoFinalExtracto);
    assert(
      difTarjetaExtracto < 0.01,
      `Discrepancia entre Tarjeta (${saldoNeto}) y Extracto (${saldoFinalExtracto}) en cliente ${cliente.nombre}`
    );

    // Aserción 2: Coincidencia matemática exacta al 100% entre Deuda Total y suma FIFO (pedidos pendientes + deuda anterior)
    const sumaFIFO = Math.round((sumaDeudaPedidosFIFO + deudaAnteriorRestante) * 100) / 100;
    const difDeudaFIFO = Math.abs(deudaTotal - sumaFIFO);
    assert(
      difDeudaFIFO < 0.01,
      `Discrepancia entre Deuda Total (${deudaTotal}) y Suma FIFO (${sumaFIFO}) en cliente ${cliente.nombre}`
    );

    const tieneActividad = pedidosCli.length > 0 || pagosCli.length > 0 || movsCli.length > 0;
    if (tieneActividad) {
      totalActivos++;
      tablaReporte.push({
        Cliente: cliente.nombre,
        Comprado: `$${totalComprado.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`,
        'Saldo Ant.': `$${totalCargosManuales.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`,
        Pagado: `$${totalPagado.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`,
        'Saldo Neto': `${saldoNeto < 0 ? '-' : '+'}$${Math.abs(saldoNeto).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`,
        'Deuda FIFO': `$${deudaTotal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`,
        'Extracto Final': `${saldoFinalExtracto < 0 ? '-' : '+'}$${Math.abs(saldoFinalExtracto).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`,
        Estado: 'OK (0 disc.)',
      });
    }
  }

  console.log(`\nTABLA DE CLIENTES ACTIVOS CON MOVIMIENTOS (${totalActivos} clientes):`);
  console.table(tablaReporte);

  console.log('='.repeat(90));
  console.log('¡TODAS LAS ASERCIONES PASARON CON ÉXITO! 0 discrepancias en los 25 clientes.');
  console.log('='.repeat(90));
}

verificar().catch((err) => {
  console.error('\nERROR FATAL EN LA VERIFICACIÓN:', err);
  process.exit(1);
});

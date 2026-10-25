import assert from 'node:assert/strict';

// Importar directamente el motor contable en memoria sin tocar base de datos
const { calcularResumenCuentaCliente } = await import('../lib/cuentas-corrientes.ts');

console.log('='.repeat(80));
console.log('SUITE DE PRUEBAS AUTOMATIZADAS 100% AISLADAS EN MEMORIA (CLIENTE TEST AISLADO)');
console.log('='.repeat(80));

// ---------------------------------------------------------------------------
// TEST 1 — Cuenta Vacía (Cliente recién creado)
// ---------------------------------------------------------------------------
console.log('\n[TEST 1] Cuenta Vacía (Cliente recién creado)...');
{
  const res = calcularResumenCuentaCliente({
    pedidos: [],
    pagos: [],
    movimientosSaldo: [],
  });

  assert.strictEqual(res.totalComprado, 0, 'totalComprado debe ser 0');
  assert.strictEqual(res.totalPagado, 0, 'totalPagado debe ser 0');
  assert.strictEqual(res.saldoNeto, 0, 'saldoNeto debe ser 0');
  assert.strictEqual(res.deudaTotal, 0, 'deudaTotal debe ser 0');
  assert.strictEqual(res.saldoAFavor, 0, 'saldoAFavor debe ser 0');
  assert.strictEqual(res.extracto.length, 0, 'extracto debe estar vacío');
  assert.strictEqual(res.saldoFinalExtracto, 0, 'saldoFinalExtracto debe ser 0');
  console.log('  ✓ Test 1 superado con éxito.');
}

// ---------------------------------------------------------------------------
// TEST 2 — Deuda Anterior + Pedidos Impagos
// ---------------------------------------------------------------------------
console.log('\n[TEST 2] Deuda Anterior + Pedidos Impagos...');
{
  const pedidos = [
    {
      id: 'ped-1',
      numero_secuencial: 1,
      total: 188838,
      estado: 'completado',
      created_at: '2026-08-27T10:00:00.000Z',
    },
    {
      id: 'ped-2',
      numero_secuencial: 2,
      total: 127366,
      estado: 'completado',
      created_at: '2026-09-13T10:00:00.000Z',
    },
  ];

  const movimientosSaldo = [
    {
      id: 'mov-deuda-ant',
      monto: -462142,
      tipo: 'ajuste_manual',
      nota: 'Saldo deudor anterior',
      fecha: '2026-09-08T10:00:00.000Z',
    },
  ];

  const res = calcularResumenCuentaCliente({
    pedidos,
    pagos: [],
    movimientosSaldo,
  });

  assert.strictEqual(res.totalComprado, 316204, 'totalComprado debe ser 316.204');
  assert.strictEqual(res.totalCargosManuales, 462142, 'totalCargosManuales debe ser 462.142');
  assert.strictEqual(res.deudaAnteriorRestante, 462142, 'deudaAnteriorRestante debe ser 462.142');
  assert.strictEqual(res.saldoNeto, -778346, 'saldoNeto debe ser -778.346');
  assert.strictEqual(res.deudaTotal, 778346, 'deudaTotal debe ser 778.346');
  assert.strictEqual(res.saldoFinalExtracto, -778346, 'saldoFinalExtracto debe ser -778.346');
  console.log('  ✓ Test 2 superado con éxito.');
}

// ---------------------------------------------------------------------------
// TEST 3 — Pago Parcial que absorbe parcialmente la Deuda Anterior + Etiqueta 'PAGO'
// ---------------------------------------------------------------------------
console.log('\n[TEST 3] Pago Parcial absorbiendo Deuda Anterior + Etiqueta PAGO...');
{
  const pedidos = [
    {
      id: 'ped-1',
      numero_secuencial: 1,
      total: 188838,
      estado: 'completado',
      created_at: '2026-08-27T10:00:00.000Z',
    },
    {
      id: 'ped-2',
      numero_secuencial: 2,
      total: 127366,
      estado: 'completado',
      created_at: '2026-09-13T10:00:00.000Z',
    },
  ];

  const pagos = [
    {
      id: 'pago-1',
      pedido_id: 'ped-1',
      monto: 302152,
      metodo: 'transferencia',
      fecha: '2026-09-10T15:00:00.000Z',
    },
  ];

  const movimientosSaldo = [
    {
      id: 'mov-deuda-ant',
      monto: -462142,
      tipo: 'ajuste_manual',
      nota: 'Saldo deudor anterior',
      fecha: '2026-09-08T10:00:00.000Z',
    },
  ];

  const res = calcularResumenCuentaCliente({
    pedidos,
    pagos,
    movimientosSaldo,
  });

  assert.strictEqual(res.deudaAnteriorRestante, 159990, 'deudaAnteriorRestante debe ser 159.990');
  assert.strictEqual(res.saldoNeto, -476194, 'saldoNeto debe ser -476.194');
  assert.strictEqual(
    res.deudaAnteriorRestante + res.sumaDeudaPedidosFIFO,
    476194,
    'deudaAnteriorRestante + sumaDeudaPedidosFIFO debe ser 476.194'
  );
  assert.strictEqual(res.saldoFinalExtracto, -476194, 'saldoFinalExtracto debe ser -476.194');

  const itemPago = res.extracto.find((item) => item.id === 'pago-pago-1');
  assert.ok(itemPago, 'El ítem de pago debe existir en el extracto');
  assert.strictEqual(itemPago.badge, 'PAGO', 'El badge del ítem de pago debe ser exactamente PAGO');
  console.log('  ✓ Test 3 superado con éxito.');
}

// ---------------------------------------------------------------------------
// TEST 4 — Imputación FIFO en Cascada con Pago Grande (Caso BIG DISTRIBUIDORA)
// ---------------------------------------------------------------------------
console.log('\n[TEST 4] Imputación FIFO en Cascada con Pago Grande (Caso BIG DISTRIBUIDORA)...');
{
  const pedidos = [
    {
      id: 'ped-1',
      numero_secuencial: 1,
      total: 188838,
      estado: 'completado',
      created_at: '2026-08-27T10:00:00.000Z',
    },
    {
      id: 'ped-2',
      numero_secuencial: 2,
      total: 127366,
      estado: 'completado',
      created_at: '2026-09-13T10:00:00.000Z',
    },
    {
      id: 'ped-3',
      numero_secuencial: 3,
      total: 717234,
      estado: 'completado',
      created_at: '2026-09-24T10:00:00.000Z',
    },
    {
      id: 'ped-4',
      numero_secuencial: 4,
      total: 294042,
      estado: 'completado',
      created_at: '2026-10-10T10:00:00.000Z',
    },
  ];

  const pagos = [
    {
      id: 'pago-1',
      pedido_id: 'ped-1',
      monto: 302152,
      metodo: 'transferencia',
      fecha: '2026-09-10T15:00:00.000Z',
    },
    {
      id: 'pago-2',
      pedido_id: 'ped-2',
      monto: 600000,
      metodo: 'transferencia',
      fecha: '2026-10-10T15:00:00.000Z',
    },
  ];

  const movimientosSaldo = [
    {
      id: 'mov-deuda-ant',
      monto: -462142,
      tipo: 'ajuste_manual',
      nota: 'Saldo deudor anterior',
      fecha: '2026-09-08T10:00:00.000Z',
    },
  ];

  const res = calcularResumenCuentaCliente({
    pedidos,
    pagos,
    movimientosSaldo,
  });

  assert.strictEqual(res.totalComprado, 1327480, 'totalComprado debe ser 1.327.480');
  assert.strictEqual(res.totalCargosManuales, 462142, 'totalCargosManuales debe ser 462.142');
  assert.strictEqual(res.totalPagado, 902152, 'totalPagado debe ser 902.152');
  assert.strictEqual(res.deudaAnteriorRestante, 0, 'deudaAnteriorRestante debe ser 0');

  const p1 = res.pedidosConEstadoFIFO.find((p) => p.id === 'ped-1');
  assert.strictEqual(p1.estadoPagoFIFO, 'saldado');
  assert.strictEqual(p1.totalAbonadoFIFO, 188838);
  assert.strictEqual(p1.deudaRestanteFIFO, 0);

  const p2 = res.pedidosConEstadoFIFO.find((p) => p.id === 'ped-2');
  assert.strictEqual(p2.estadoPagoFIFO, 'saldado');
  assert.strictEqual(p2.totalAbonadoFIFO, 127366);
  assert.strictEqual(p2.deudaRestanteFIFO, 0);

  const p3 = res.pedidosConEstadoFIFO.find((p) => p.id === 'ped-3');
  assert.strictEqual(p3.estadoPagoFIFO, 'parcial');
  assert.strictEqual(p3.totalAbonadoFIFO, 123806);
  assert.strictEqual(p3.deudaRestanteFIFO, 593428);

  const p4 = res.pedidosConEstadoFIFO.find((p) => p.id === 'ped-4');
  assert.strictEqual(p4.estadoPagoFIFO, 'impago');
  assert.strictEqual(p4.totalAbonadoFIFO, 0);
  assert.strictEqual(p4.deudaRestanteFIFO, 294042);

  assert.strictEqual(res.sumaDeudaPedidosFIFO, 887470);
  assert.strictEqual(res.deudaTotal, 887470);
  assert.strictEqual(res.saldoNeto, -887470);
  assert.strictEqual(res.saldoFinalExtracto, -887470);

  const itemExtractoP3 = res.extracto.find((item) => item.id === 'ped-ped-3');
  assert.ok(itemExtractoP3, 'Pedido 3 debe estar en el extracto');
  assert.strictEqual(itemExtractoP3.estadoPago, 'parcial');
  assert.ok(
    itemExtractoP3.subtitulo.includes('Abonado: $123.806,00'),
    `Subtítulo debe incluir "Abonado: $123.806,00", valor: "${itemExtractoP3.subtitulo}"`
  );
  assert.ok(
    itemExtractoP3.subtitulo.includes('Resta: $593.428,00'),
    `Subtítulo debe incluir "Resta: $593.428,00", valor: "${itemExtractoP3.subtitulo}"`
  );

  console.log('  ✓ Test 4 superado con éxito.');
}

// ---------------------------------------------------------------------------
// TEST 5 — Deuda Anterior catalogada como 'aplicado' sin pedido + Pagos con centavos (Caso MARADEI)
// ---------------------------------------------------------------------------
console.log('\n[TEST 5] Deuda Anterior como "aplicado" sin pedido + Pagos con centavos (Caso MARADEI)...');
{
  // Pedido #1 ($108.885) se crea antes para que resulte saldado
  // Pedido #2 ($346.388) se crea después para que absorba parcialmente los fondos y quede con $136.352,01 de deuda
  // Pedido #3 ($158.095) se crea al final y queda impago
  const pedidos = [
    {
      id: 'ped-1',
      numero_secuencial: 1,
      total: 108885,
      estado: 'completado',
      created_at: '2026-08-18T10:00:00.000Z',
    },
    {
      id: 'ped-2',
      numero_secuencial: 2,
      total: 346388,
      estado: 'completado',
      created_at: '2026-09-08T10:00:00.000Z',
    },
    {
      id: 'ped-3',
      numero_secuencial: 3,
      total: 158095,
      estado: 'completado',
      created_at: '2026-09-18T10:00:00.000Z',
    },
  ];

  const movimientosSaldo = [
    {
      id: 'mov-maradei-deuda',
      tipo: 'aplicado',
      monto: -281079,
      referencia_pedido_id: null,
      nota: 'Devolución de saldo',
      fecha: '2026-08-19T12:00:00.000Z',
    },
    {
      id: 'mov-maradei-anticipo',
      tipo: 'anticipo',
      monto: 281079,
      referencia_pedido_id: null,
      nota: 'Anticipo',
      fecha: '2026-09-12T12:00:00.000Z',
    },
  ];

  const pagos = [
    {
      id: 'pago-1',
      pedido_id: 'ped-2',
      monto: 118921,
      metodo: 'transferencia',
      fecha: '2026-09-12T20:00:00.000Z',
    },
    {
      id: 'pago-2',
      pedido_id: 'ped-3',
      monto: 199999.99,
      metodo: 'transferencia',
      fecha: '2026-10-25T03:00:00.000Z',
    },
  ];

  const res = calcularResumenCuentaCliente({
    pedidos,
    pagos,
    movimientosSaldo,
  });

  assert.strictEqual(res.totalComprado, 613368, 'totalComprado debe ser 613.368');
  assert.strictEqual(res.totalCargosManuales, 281079, 'totalCargosManuales debe ser 281.079');
  assert.strictEqual(res.totalPagado, 599999.99, 'totalPagado debe ser 599.999,99');
  assert.strictEqual(res.saldoNeto, -294447.01, 'saldoNeto debe ser -294.447,01');
  assert.strictEqual(res.deudaTotal, 294447.01, 'deudaTotal debe ser 294.447,01');
  assert.strictEqual(res.sumaDeudaPedidosFIFO, 294447.01, 'sumaDeudaPedidosFIFO debe ser 294.447,01');
  assert.strictEqual(res.saldoFinalExtracto, -294447.01, 'saldoFinalExtracto debe ser -294.447,01');

  const p1 = res.pedidosConEstadoFIFO.find((p) => p.id === 'ped-1');
  assert.strictEqual(p1.estadoPagoFIFO, 'saldado');
  assert.strictEqual(p1.deudaRestanteFIFO, 0);

  const p2 = res.pedidosConEstadoFIFO.find((p) => p.id === 'ped-2');
  assert.strictEqual(p2.estadoPagoFIFO, 'parcial');
  assert.strictEqual(p2.deudaRestanteFIFO, 136352.01);

  const p3 = res.pedidosConEstadoFIFO.find((p) => p.id === 'ped-3');
  assert.strictEqual(p3.estadoPagoFIFO, 'impago');
  assert.strictEqual(p3.deudaRestanteFIFO, 158095);

  console.log('  ✓ Test 5 superado con éxito.');
}

// ---------------------------------------------------------------------------
// TEST 6 — Prevención de Doble Contabilidad en saldo_a_favor vs Cobro Directo
// ---------------------------------------------------------------------------
console.log('\n[TEST 6] Prevención de Doble Contabilidad en saldo_a_favor vs Cobro Directo...');
{
  // Subcaso 6A: Pedido $150.000 + pago saldo_a_favor $150.000 SIN movimientos_saldo
  const res6A = calcularResumenCuentaCliente({
    pedidos: [
      {
        id: 'ped-6a',
        numero_secuencial: 1,
        total: 150000,
        estado: 'completado',
        created_at: '2026-09-01T10:00:00.000Z',
      },
    ],
    pagos: [
      {
        id: 'pago-6a',
        pedido_id: 'ped-6a',
        monto: 150000,
        metodo: 'saldo_a_favor',
        fecha: '2026-09-01T11:00:00.000Z',
      },
    ],
    movimientosSaldo: [],
  });

  assert.strictEqual(res6A.totalPagado, 150000, 'Subcaso 6A: totalPagado debe ser 150.000');
  assert.strictEqual(res6A.saldoNeto, 0, 'Subcaso 6A: saldoNeto debe ser 0');
  assert.strictEqual(res6A.saldoFinalExtracto, 0, 'Subcaso 6A: saldoFinalExtracto debe ser 0');

  // Subcaso 6B: Pedido $150.000 + anticipo +$150.000 + aplicado -$150.000 + pago saldo_a_favor + excedente +$10.000
  const res6B = calcularResumenCuentaCliente({
    pedidos: [
      {
        id: 'ped-6b',
        numero_secuencial: 1,
        total: 150000,
        estado: 'completado',
        created_at: '2026-09-01T10:00:00.000Z',
      },
    ],
    pagos: [
      {
        id: 'pago-6b',
        pedido_id: 'ped-6b',
        monto: 150000,
        metodo: 'saldo_a_favor',
        fecha: '2026-09-01T11:00:00.000Z',
      },
    ],
    movimientosSaldo: [
      {
        id: 'mov-ant-6b',
        tipo: 'anticipo',
        monto: 150000,
        fecha: '2026-08-30T10:00:00.000Z',
      },
      {
        id: 'mov-apli-6b',
        tipo: 'aplicado',
        monto: -150000,
        referencia_pedido_id: 'ped-6b',
        fecha: '2026-09-01T11:00:00.000Z',
      },
      {
        id: 'mov-exc-6b',
        tipo: 'excedente',
        monto: 10000,
        referencia_pedido_id: 'ped-otro',
        fecha: '2026-08-20T10:00:00.000Z',
      },
    ],
  });

  assert.strictEqual(res6B.totalPagado, 150000, 'Subcaso 6B: totalPagado debe ser 150.000');
  assert.strictEqual(res6B.saldoNeto, 0, 'Subcaso 6B: saldoNeto debe ser 0');
  assert.strictEqual(res6B.saldoFinalExtracto, 0, 'Subcaso 6B: saldoFinalExtracto debe ser 0');

  console.log('  ✓ Test 6 (Subcasos 6A y 6B) superado con éxito.');
}

// ---------------------------------------------------------------------------
// TEST 7 — Pedidos Cancelados y Eliminados con Excedente Consumido (Caso PABLO SALABERRY)
// ---------------------------------------------------------------------------
console.log('\n[TEST 7] Pedidos Cancelados y Eliminados con Excedente Consumido (Caso PABLO SALABERRY)...');
{
  const pedidos = [
    {
      id: 'ped-1',
      numero_secuencial: 1,
      total: 40500,
      estado: 'completado',
      eliminado: false,
      created_at: '2026-08-20T10:00:00.000Z',
    },
    {
      id: 'ped-2',
      numero_secuencial: 2,
      total: 202100,
      estado: 'cancelado',
      eliminado: false,
      created_at: '2026-09-05T10:00:00.000Z',
    },
    {
      id: 'ped-3',
      numero_secuencial: 3,
      total: 99000,
      estado: 'completado',
      eliminado: true,
      created_at: '2026-09-10T10:00:00.000Z',
    },
  ];

  const pagos = [
    {
      id: 'pago-1',
      pedido_id: 'ped-1',
      monto: 43898,
      metodo: 'transferencia',
      fecha: '2026-08-20T11:00:00.000Z',
    },
    {
      id: 'pago-2a',
      pedido_id: 'ped-2',
      monto: 198702,
      metodo: 'transferencia',
      fecha: '2026-09-05T11:00:00.000Z',
    },
    {
      id: 'pago-2b',
      pedido_id: 'ped-2',
      monto: 3398,
      metodo: 'saldo_a_favor',
      fecha: '2026-09-05T11:00:00.000Z',
    },
    {
      id: 'pago-3',
      pedido_id: 'ped-3',
      monto: 99000,
      metodo: 'transferencia',
      fecha: '2026-09-10T11:00:00.000Z',
    },
  ];

  const movimientosSaldo = [
    {
      id: 'mov-exc-1',
      tipo: 'excedente',
      monto: 3398,
      referencia_pedido_id: 'ped-1',
      fecha: '2026-08-20T11:00:00.000Z',
    },
    {
      id: 'mov-apli-2',
      tipo: 'aplicado',
      monto: -3398,
      referencia_pedido_id: 'ped-2',
      fecha: '2026-09-05T11:00:00.000Z',
    },
  ];

  const res = calcularResumenCuentaCliente({
    pedidos,
    pagos,
    movimientosSaldo,
  });

  assert.strictEqual(res.totalComprado, 40500, 'totalComprado debe ser 40.500');
  assert.strictEqual(res.totalPagado, 40500, 'totalPagado debe ser 40.500');
  assert.strictEqual(res.saldoNeto, 0, 'saldoNeto debe ser 0');
  assert.strictEqual(res.deudaTotal, 0, 'deudaTotal debe ser 0');
  assert.strictEqual(res.saldoAFavor, 0, 'saldoAFavor debe ser 0');
  assert.strictEqual(res.saldoFinalExtracto, 0, 'saldoFinalExtracto debe ser 0');

  console.log('  ✓ Test 7 superado con éxito.');
}

// ---------------------------------------------------------------------------
// TEST 8 — Cliente con Saldo a Favor Disponible
// ---------------------------------------------------------------------------
console.log('\n[TEST 8] Cliente con Saldo a Favor Disponible...');
{
  const pedidos = [
    {
      id: 'ped-1',
      numero_secuencial: 1,
      total: 25990,
      estado: 'completado',
      created_at: '2026-08-10T10:00:00.000Z',
    },
  ];

  const pagos = [
    {
      id: 'pago-1',
      pedido_id: 'ped-1',
      monto: 781888,
      metodo: 'transferencia',
      fecha: '2026-08-10T11:00:00.000Z',
    },
  ];

  const res = calcularResumenCuentaCliente({
    pedidos,
    pagos,
    movimientosSaldo: [],
  });

  assert.strictEqual(res.saldoNeto, 755898, 'saldoNeto debe ser 755.898');
  assert.strictEqual(res.saldoAFavor, 755898, 'saldoAFavor debe ser 755.898');
  assert.strictEqual(res.deudaTotal, 0, 'deudaTotal debe ser 0');
  assert.strictEqual(res.sumaDeudaPedidosFIFO, 0, 'sumaDeudaPedidosFIFO debe ser 0');
  assert.strictEqual(res.saldoFinalExtracto, 755898, 'saldoFinalExtracto debe ser 755.898');

  const p1 = res.pedidosConEstadoFIFO.find((p) => p.id === 'ped-1');
  assert.strictEqual(p1.estadoPagoFIFO, 'saldado', 'Pedido 1 debe quedar saldado');

  console.log('  ✓ Test 8 superado con éxito.');
}

console.log('\n' + '='.repeat(80));
console.log('¡TODOS LOS 8 TESTS UNITARIOS AISLADOS PASARON AL 100% CON ÉXITO!');
console.log('='.repeat(80));

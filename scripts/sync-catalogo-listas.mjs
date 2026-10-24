import fs from 'fs';
import path from 'path';
import assert from 'assert';
import { createClient } from '@supabase/supabase-js';

// Cargar .env.local
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf-8');
  for (const line of content.split('\n')) {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      const key = match[1];
      let val = match[2] || '';
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      process.env[key] = val.trim();
    }
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://egcydrmevdadqbuaqndr.supabase.co';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_Kp2zEiS5YA93lRW3kPb5_g_4fp_fwPn';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Helper para paginar y traer todos los registros de una tabla
async function fetchAll(tableName, selectQuery = '*', filterFn = null) {
  const pageSize = 1000;
  let from = 0;
  let allRows = [];
  while (true) {
    let query = supabase.from(tableName).select(selectQuery).range(from, from + pageSize - 1);
    if (filterFn) {
      query = filterFn(query);
    }
    const { data, error } = await query;
    if (error) {
      throw new Error(`Error en fetchAll(${tableName}): ${error.message}`);
    }
    allRows = allRows.concat(data || []);
    if (!data || data.length < pageSize) {
      break;
    }
    from += pageSize;
  }
  return allRows;
}

async function runSync() {
  console.log('='.repeat(70));
  console.log('INICIANDO SANEAMIENTO Y SINCRONIZACIÓN 1:1 (SUPABASE)');
  console.log('='.repeat(70));

  // 1. RELEVAMIENTO INICIAL
  console.log('\n[1] Relevamiento inicial...');
  const filtrosA = await fetchAll('Tabla A', '*', (q) => q.or('eliminado.is.null,eliminado.eq.false'));
  const vehiculosB = await fetchAll('Tabla B', '*', (q) => q.or('eliminado.is.null,eliminado.eq.false'));
  const { data: listasActivas, error: errListas } = await supabase
    .from('listas_precios')
    .select('*')
    .eq('eliminado', false)
    .order('created_at', { ascending: true });

  if (errListas) throw errListas;

  const itemsListas = await fetchAll('items_lista_precio', '*');

  console.log(`- Filtros en Tabla A (eliminado = false): ${filtrosA.length}`);
  console.log(`- Vehículos en Tabla B (eliminado = false): ${vehiculosB.length}`);
  console.log(`- Listas activas encontradas: ${listasActivas.length} (${listasActivas.map(l => l.nombre).join(', ')})`);
  console.log(`- Total items en items_lista_precio: ${itemsListas.length}`);

  const setCodigosA = new Set(filtrosA.map(f => f.codigo_fhl.trim().toUpperCase()));

  // 2. DETECCIÓN Y ALTA DE FILTROS HUÉRFANOS EN TABLA A
  console.log('\n[2] Detección de filtros huérfanos...');
  const huerfanosEnListas = new Set();
  for (const it of itemsListas) {
    const cod = (it.codigo_fhl || '').trim().toUpperCase();
    if (cod && !setCodigosA.has(cod)) {
      huerfanosEnListas.add(cod);
    }
  }

  const huerfanosEnVehiculos = new Set();
  for (const v of vehiculosB) {
    const cod = (v.filtro_asociado || '').trim().toUpperCase();
    if (cod && !setCodigosA.has(cod)) {
      huerfanosEnVehiculos.add(cod);
    }
  }

  const todosHuerfanos = new Set([...huerfanosEnListas, ...huerfanosEnVehiculos]);
  console.log(`- Huérfanos detectados en items_lista_precio (${huerfanosEnListas.size}): ${Array.from(huerfanosEnListas).sort().join(', ')}`);
  console.log(`- Huérfanos detectados en Tabla B (${huerfanosEnVehiculos.size}): ${Array.from(huerfanosEnVehiculos).sort().join(', ')}`);
  console.log(`- Total filtros faltantes en Tabla A: ${todosHuerfanos.size}`);

  const listaMayoristaBase = listasActivas.find(l => l.nombre.toLowerCase().trim() === 'mayorista base');
  const listaMayorista1 = listasActivas.find(l => l.nombre.toLowerCase().trim() === 'mayorista 1');

  // Insertar cada filtro faltante en Tabla A
  for (const codigo of Array.from(todosHuerfanos).sort()) {
    // 1. Buscar vehículos asociados en Tabla B
    const vehiculosAsoc = vehiculosB.filter(v => (v.filtro_asociado || '').trim().toUpperCase() === codigo);
    let descripcionAplicacion = null;
    if (vehiculosAsoc.length > 0) {
      const aplicaciones = [
        ...new Set(
          vehiculosAsoc.map(v => `${v.marca} ${v.modelo}${v.version ? ' ' + v.version : ''}`.trim())
        )
      ];
      descripcionAplicacion = aplicaciones.join(', ');
    }

    // 2. Determinar precio de referencia
    let precio = 0;
    if (listaMayoristaBase) {
      const itBase = itemsListas.find(i => i.lista_id === listaMayoristaBase.id && i.codigo_fhl.trim().toUpperCase() === codigo);
      if (itBase && Number(itBase.precio) > 0) {
        precio = Number(itBase.precio);
      }
    }
    if (precio === 0 && listaMayorista1) {
      const itM1 = itemsListas.find(i => i.lista_id === listaMayorista1.id && i.codigo_fhl.trim().toUpperCase() === codigo);
      if (itM1 && Number(itM1.precio) > 0) {
        precio = Number(itM1.precio);
      }
    }

    console.log(`-> Dando de alta en Tabla A: ${codigo} | Precio: $${precio} | App: ${descripcionAplicacion || '(sin vehículos)'}`);

    const { error: errInsert } = await supabase.from('Tabla A').insert({
      codigo_fhl: codigo,
      descripcion_aplicacion: descripcionAplicacion,
      precio: precio,
      activo: false, // oculto en web pública hasta completar fotos/medidas
      eliminado: false,
    });

    if (errInsert) {
      throw new Error(`Error al insertar ${codigo} en Tabla A: ${errInsert.message}`);
    }
  }

  // 3. SINCRONIZACIÓN COMPLETA DE items_lista_precio Y Tabla A.precio
  console.log('\n[3] Sincronización de items_lista_precio y Tabla A.precio...');
  // Refrescar todos los filtros en Tabla A
  const filtrosActualizados = await fetchAll('Tabla A', '*', (q) => q.or('eliminado.is.null,eliminado.eq.false'));
  console.log(`- Filtros en Tabla A post-alta: ${filtrosActualizados.length}`);

  // Asegurar que cada uno de los filtros exista en las 5 listas activas
  // Mapeamos items actuales por lista_id + codigo_fhl normalizado
  const itemsMap = new Map();
  for (const it of await fetchAll('items_lista_precio', '*')) {
    itemsMap.set(`${it.lista_id}:${it.codigo_fhl.trim().toUpperCase()}`, it);
  }

  for (const lista of listasActivas) {
    const itemsAUpsert = [];
    for (const f of filtrosActualizados) {
      const key = `${lista.id}:${f.codigo_fhl.trim().toUpperCase()}`;
      if (!itemsMap.has(key)) {
        // Falta en esta lista
        itemsAUpsert.push({
          lista_id: lista.id,
          codigo_fhl: f.codigo_fhl.trim().toUpperCase(),
          precio: Number(f.precio || 0)
        });
      }
    }

    if (itemsAUpsert.length > 0) {
      console.log(`-> Lista "${lista.nombre}": insertando ${itemsAUpsert.length} filtros faltantes (ej: ${itemsAUpsert.map(i => i.codigo_fhl).slice(0, 5).join(', ')})...`);
      const { error: errUpsert } = await supabase
        .from('items_lista_precio')
        .upsert(itemsAUpsert, { onConflict: 'lista_id,codigo_fhl' });
      if (errUpsert) throw errUpsert;
    } else {
      console.log(`-> Lista "${lista.nombre}": al día (no faltaban ítems).`);
    }
  }

  // Sincronizar Tabla A.precio con Mayorista Base
  if (listaMayoristaBase) {
    console.log(`\n-> Sincronizando Tabla A.precio con la lista "${listaMayoristaBase.nombre}"...`);
    const itemsMayoristaBase = await fetchAll('items_lista_precio', '*', (q) => q.eq('lista_id', listaMayoristaBase.id));
    const baseMap = new Map(itemsMayoristaBase.map(i => [i.codigo_fhl.trim().toUpperCase(), Number(i.precio)]));

    let actualizados = 0;
    for (const f of filtrosActualizados) {
      const cod = f.codigo_fhl.trim().toUpperCase();
      const precioBase = baseMap.get(cod);
      if (precioBase !== undefined && precioBase > 0 && f.precio !== precioBase) {
        const { error: errU } = await supabase
          .from('Tabla A')
          .update({ precio: precioBase })
          .eq('id', f.id);
        if (errU) throw errU;
        actualizados++;
      }
    }
    console.log(`-> ${actualizados} filtros actualizados en Tabla A con el precio de Mayorista Base.`);
  }

  // 4. VERIFICACIÓN POST-MIGRACIÓN Y ASERCIONES
  console.log('\n[4] VERIFICACIÓN POST-MIGRACIÓN');
  const filtrosFinales = await fetchAll('Tabla A', '*', (q) => q.or('eliminado.is.null,eliminado.eq.false'));
  const vehiculosFinales = await fetchAll('Tabla B', '*', (q) => q.or('eliminado.is.null,eliminado.eq.false'));
  const itemsFinales = await fetchAll('items_lista_precio', '*');

  const finalSetA = new Set(filtrosFinales.map(f => f.codigo_fhl.trim().toUpperCase()));

  console.log(`- Cantidad de filtros en Tabla A (eliminado = false): ${filtrosFinales.length}`);
  assert.strictEqual(filtrosFinales.length, 119, `Se esperaban 119 filtros en Tabla A, se encontraron ${filtrosFinales.length}`);

  for (const lista of listasActivas) {
    const itemsEnLista = itemsFinales.filter(i => i.lista_id === lista.id);
    console.log(`- Items en lista "${lista.nombre}": ${itemsEnLista.length}`);
    assert.strictEqual(itemsEnLista.length, 119, `Se esperaban 119 items en la lista "${lista.nombre}", se encontraron ${itemsEnLista.length}`);
  }

  const huerfanosItemsFinal = itemsFinales.filter(i => !finalSetA.has(i.codigo_fhl.trim().toUpperCase()));
  console.log(`- Huérfanos en items_lista_precio que no están en Tabla A: ${huerfanosItemsFinal.length}`);
  assert.strictEqual(huerfanosItemsFinal.length, 0, `Hay ${huerfanosItemsFinal.length} huérfanos en items_lista_precio`);

  const huerfanosVehiculosFinal = vehiculosFinales.filter(v => !finalSetA.has(v.filtro_asociado.trim().toUpperCase()));
  console.log(`- Huérfanos en Tabla B que no están en Tabla A: ${huerfanosVehiculosFinal.length}`);
  assert.strictEqual(huerfanosVehiculosFinal.length, 0, `Hay ${huerfanosVehiculosFinal.length} huérfanos en Tabla B`);

  console.log('\n' + '='.repeat(70));
  console.log('✅ TODAS LAS VERIFICACIONES Y ASERCIONES PASARON CON 100% DE ÉXITO');
  console.log('='.repeat(70));
}

runSync().catch(err => {
  console.error('\n❌ ERROR DURANTE LA SINCRONIZACIÓN:', err);
  process.exit(1);
});

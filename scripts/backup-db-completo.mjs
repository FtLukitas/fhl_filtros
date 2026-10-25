import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://egcydrmevdadqbuaqndr.supabase.co';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_Kp2zEiS5YA93lRW3kPb5_g_4fp_fwPn';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const TABLES = [
  'clientes',
  'pedidos',
  'items_pedido',
  'pagos',
  'movimientos_saldo',
  'presupuestos',
  'items_presupuesto',
  'Tabla A',
  'Tabla B',
  'listas_precios',
  'items_lista_precio',
  'precios_cliente'
];

async function fetchAllRows(tableName) {
  const PAGE_SIZE = 1000;
  let allRows = [];
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from(tableName)
      .select('*')
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      throw new Error(`Error descargando tabla "${tableName}": ${error.message}`);
    }

    if (data && data.length > 0) {
      allRows = allRows.concat(data);
      from += PAGE_SIZE;
      if (data.length < PAGE_SIZE) {
        hasMore = false;
      }
    } else {
      hasMore = false;
    }
  }

  return allRows;
}

async function runBackup() {
  console.log('Iniciando Backup Integral de Base de Datos Supabase...');
  const backupsDir = path.resolve('backups');
  if (!fs.existsSync(backupsDir)) {
    fs.mkdirSync(backupsDir, { recursive: true });
    console.log(`Directorio creado: ${backupsDir}`);
  }

  const backupCompleto = {
    timestamp: new Date().toISOString(),
    tablas: {}
  };

  for (const table of TABLES) {
    console.log(`Descargando tabla: ${table}...`);
    const rows = await fetchAllRows(table);
    backupCompleto.tablas[table] = rows;
    console.log(` -> ${table}: ${rows.length} registros`);
  }

  const fileCompleto = path.join(backupsDir, 'backup-completo-pre-saldos.json');
  fs.writeFileSync(fileCompleto, JSON.stringify(backupCompleto, null, 2), 'utf-8');
  console.log(`Backup completo guardado en: ${fileCompleto} (${(fs.statSync(fileCompleto).size / 1024).toFixed(1)} KB)`);

  const backupCC = {
    timestamp: backupCompleto.timestamp,
    clientes: backupCompleto.tablas['clientes'] || [],
    pedidos: backupCompleto.tablas['pedidos'] || [],
    pagos: backupCompleto.tablas['pagos'] || [],
    movimientos_saldo: backupCompleto.tablas['movimientos_saldo'] || []
  };

  const fileCC = path.join(backupsDir, 'backup-cuentas-corrientes-pre-saldos.json');
  fs.writeFileSync(fileCC, JSON.stringify(backupCC, null, 2), 'utf-8');
  console.log(`Backup cuentas corrientes guardado en: ${fileCC} (${(fs.statSync(fileCC).size / 1024).toFixed(1)} KB)`);

  console.log('Backup finalizado con éxito.');
}

runBackup().catch((err) => {
  console.error('Error fatal durante el backup:', err);
  process.exit(1);
});

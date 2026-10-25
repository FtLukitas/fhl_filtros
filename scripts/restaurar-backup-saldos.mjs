import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://egcydrmevdadqbuaqndr.supabase.co';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_Kp2zEiS5YA93lRW3kPb5_g_4fp_fwPn';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function restaurar() {
  const fileCC = path.resolve('backups', 'backup-cuentas-corrientes-pre-saldos.json');
  if (!fs.existsSync(fileCC)) {
    throw new Error(`No se encontró el archivo de backup en: ${fileCC}`);
  }

  const raw = fs.readFileSync(fileCC, 'utf-8');
  const backup = JSON.parse(raw);

  console.log(`Iniciando restauración desde ${fileCC} (timestamp: ${backup.timestamp})...`);

  // 1. Restaurar pedidos
  if (Array.isArray(backup.pedidos) && backup.pedidos.length > 0) {
    console.log(`Restaurando ${backup.pedidos.length} pedidos...`);
    for (const p of backup.pedidos) {
      const { error } = await supabase.from('pedidos').upsert(p, { onConflict: 'id' });
      if (error) console.error(`Error restaurando pedido ${p.id}:`, error.message);
    }
  }

  // 2. Restaurar pagos
  if (Array.isArray(backup.pagos) && backup.pagos.length > 0) {
    console.log(`Restaurando ${backup.pagos.length} pagos...`);
    for (const p of backup.pagos) {
      const { error } = await supabase.from('pagos').upsert(p, { onConflict: 'id' });
      if (error) console.error(`Error restaurando pago ${p.id}:`, error.message);
    }
  }

  // 3. Restaurar movimientos_saldo
  if (Array.isArray(backup.movimientos_saldo) && backup.movimientos_saldo.length > 0) {
    console.log(`Restaurando ${backup.movimientos_saldo.length} movimientos de saldo...`);
    for (const m of backup.movimientos_saldo) {
      const { error } = await supabase.from('movimientos_saldo').upsert(m, { onConflict: 'id' });
      if (error) console.error(`Error restaurando movimiento ${m.id}:`, error.message);
    }
  }

  console.log('Restauración de saldos finalizada.');
}

restaurar().catch(err => {
  console.error('Error durante la restauración:', err);
  process.exit(1);
});

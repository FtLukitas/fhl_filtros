const PROJECT_REF = 'egcydrmevdadqbuaqndr';
const ACCESS_TOKEN = 'sbp_705c67d3e4a81d232d2c3406d5e0d63568d10747';

const sql = `
-- Agregar columnas adicionales de configuración a la tabla clientes
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS "condicion_iva" VARCHAR(50) DEFAULT 'Consumidor Final';
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS "tipo_cliente" VARCHAR(50) DEFAULT 'Mayorista';
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS "descuento_predeterminado" NUMERIC(5,2) DEFAULT 0;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS "plazo_pago" VARCHAR(50) DEFAULT 'Contado';
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS "ciudad" TEXT;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS "provincia" TEXT;
`;

async function main() {
  console.log('Expandiendo configuración de clientes en Supabase...');
  try {
    const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: sql }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('Error al ejecutar migración:', res.status, err);
      process.exit(1);
    }

    const data = await res.json();
    console.log('Columnas de clientes agregadas con éxito:', data);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();

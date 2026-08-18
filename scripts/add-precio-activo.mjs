const PROJECT_REF = 'egcydrmevdadqbuaqndr';
const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN || '';

const sql = `
-- 1. Agregar columnas precio y activo a Tabla A
ALTER TABLE "Tabla A" ADD COLUMN IF NOT EXISTS "precio" NUMERIC(12,2) DEFAULT 0;
ALTER TABLE "Tabla A" ADD COLUMN IF NOT EXISTS "activo" BOOLEAN DEFAULT true;

-- Asegurar que todos los productos existentes tengan activo = true por defecto
UPDATE "Tabla A" SET "activo" = true WHERE "activo" IS NULL;
`;

async function main() {
  console.log('Agregando columnas precio y activo a Tabla A en Supabase...');
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
    console.log('Columnas agregadas con éxito:', data);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();

const PROJECT_REF = 'egcydrmevdadqbuaqndr';
const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN || '';

const sql = `
-- Expandir columnas de costeo_filtros para contemplar todas las variaciones del Excel
ALTER TABLE costeo_filtros ADD COLUMN IF NOT EXISTS factor_carton NUMERIC(10,2) DEFAULT 2.1;
ALTER TABLE costeo_filtros ADD COLUMN IF NOT EXISTS costo_caja_especial NUMERIC(12,2) DEFAULT 0;
ALTER TABLE costeo_filtros ADD COLUMN IF NOT EXISTS costo_caja NUMERIC(12,2) DEFAULT 40;
ALTER TABLE costeo_filtros ADD COLUMN IF NOT EXISTS costo_etiqueta NUMERIC(12,2) DEFAULT 5.625;
ALTER TABLE costeo_filtros ADD COLUMN IF NOT EXISTS ganancia NUMERIC(12,2) DEFAULT 430;
ALTER TABLE costeo_filtros ADD COLUMN IF NOT EXISTS costo_embolsado NUMERIC(12,2) DEFAULT 32;
ALTER TABLE costeo_filtros ADD COLUMN IF NOT EXISTS costo_bolsita NUMERIC(12,2) DEFAULT 41.857;
ALTER TABLE costeo_filtros ADD COLUMN IF NOT EXISTS costo_mayorista_excel NUMERIC(14,2) DEFAULT 0;
`;

async function migrar() {
  const url = `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ACCESS_TOKEN}`,
    },
    body: JSON.stringify({ query: sql }),
  });

  if (!res.ok) {
    console.error('Error:', res.status, await res.text());
  } else {
    console.log('Migración de columnas extendidas de costeo completada.');
  }
}

migrar().catch(console.error);

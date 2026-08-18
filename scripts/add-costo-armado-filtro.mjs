const PROJECT_REF = 'egcydrmevdadqbuaqndr';
const ACCESS_TOKEN = 'sbp_705c67d3e4a81d232d2c3406d5e0d63568d10747';

const sql = `
-- Añadir columna costo_armado específica por filtro
ALTER TABLE costeo_filtros ADD COLUMN IF NOT EXISTS costo_armado NUMERIC(12,2) DEFAULT 150;

-- Actualizar filas existentes para que tengan 150 por defecto si estuvieran null
UPDATE costeo_filtros SET costo_armado = 150 WHERE costo_armado IS NULL;
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
    console.log('Migración de costo_armado completada.');
  }
}

migrar().catch(console.error);

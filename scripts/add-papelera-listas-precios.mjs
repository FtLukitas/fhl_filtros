const PROJECT_REF = 'egcydrmevdadqbuaqndr';
const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN || '';

const sql = `
-- Añadir soporte de papelera (soft delete) a listas_precios
ALTER TABLE listas_precios ADD COLUMN IF NOT EXISTS eliminado BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE listas_precios ADD COLUMN IF NOT EXISTS eliminado_at TIMESTAMPTZ;
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
    console.log('Migración de papelera en listas_precios completada.');
  }
}

migrar().catch(console.error);

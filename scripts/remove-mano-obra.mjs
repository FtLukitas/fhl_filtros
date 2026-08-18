const PROJECT_REF = 'egcydrmevdadqbuaqndr';
const ACCESS_TOKEN = 'sbp_705c67d3e4a81d232d2c3406d5e0d63568d10747';

const sql = `
-- Eliminar parámetros de mano de obra de parametros_costeo
DELETE FROM parametros_costeo WHERE grupo = 'mano_obra' OR clave = 'costo_armado';

-- Opcional: resetear mano_obra_x_corte a 0 si estuviera presente
UPDATE costeo_filtros SET mano_obra_x_corte = 0, costo_armado = 0 WHERE mano_obra_x_corte IS NOT NULL OR costo_armado IS NOT NULL;
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
    console.log('Parámetros de mano de obra eliminados de la base de datos.');
  }
}

migrar().catch(console.error);

const PROJECT_REF = 'egcydrmevdadqbuaqndr';
const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN || '';

const sql = `
-- Añadir soporte para listas vinculadas a costeo
ALTER TABLE listas_precios ADD COLUMN IF NOT EXISTS canal_costeo VARCHAR(50);
ALTER TABLE listas_precios ADD COLUMN IF NOT EXISTS redondeo VARCHAR(20) DEFAULT 'ninguno';
ALTER TABLE listas_precios ADD COLUMN IF NOT EXISTS descuento_adicional NUMERIC(5,2) DEFAULT 0.00;

-- Crear o actualizar listas de precios vinculadas a los canales de costeo
INSERT INTO listas_precios (nombre, descripcion, tipo_ajuste, canal_costeo, porcentaje, activa, es_predeterminada)
VALUES
  ('Mayorista 1 (Costeo)', 'Tarifa vinculada en tiempo real a Mayorista 1 (+5% sobre costo base de fábrica).', 'costeo', 'mayorista_1', 0, true, false),
  ('Mayorista 2 (Costeo)', 'Tarifa vinculada en tiempo real a Mayorista 2 (+10% sobre costo base de fábrica).', 'costeo', 'mayorista_2', 0, true, false),
  ('Mayorista 3 (Costeo)', 'Tarifa vinculada en tiempo real a Mayorista 3 (+15% sobre costo base de fábrica).', 'costeo', 'mayorista_3', 0, true, false),
  ('Comercio (Costeo)', 'Tarifa de venta a comercios minoristas (+25% sobre costo de fábrica).', 'costeo', 'comercio', 0, true, false),
  ('MDP con Bolsa (Costeo)', 'Tarifa especial MDP con bolsa de fábrica.', 'costeo', 'mdp_con_bolsa', 0, true, false)
ON CONFLICT DO NOTHING;
`;

async function migrar() {
  console.log('Ejecutando migración para vincular listas de precios con costeo...');
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
    console.log('Migración completada exitosamente.');
  }
}

migrar().catch(console.error);

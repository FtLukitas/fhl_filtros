const PROJECT_REF = 'egcydrmevdadqbuaqndr';
const ACCESS_TOKEN = 'sbp_705c67d3e4a81d232d2c3406d5e0d63568d10747';

const sql = `
-- 1. Tabla de Parámetros Globales de Costeo
CREATE TABLE IF NOT EXISTS parametros_costeo (
  id SERIAL PRIMARY KEY,
  clave VARCHAR(80) UNIQUE NOT NULL,
  nombre VARCHAR(150) NOT NULL,
  valor NUMERIC(14,4) NOT NULL DEFAULT 0,
  divisor NUMERIC(14,4) NOT NULL DEFAULT 1,
  unidad VARCHAR(20) DEFAULT '$',
  grupo VARCHAR(40) NOT NULL DEFAULT 'general',
  orden INT DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Tabla de Datos de Costeo por Filtro
CREATE TABLE IF NOT EXISTS costeo_filtros (
  id SERIAL PRIMARY KEY,
  codigo_fhl VARCHAR(50) UNIQUE NOT NULL,
  cantidad_x_ancho NUMERIC(10,2) DEFAULT 0,
  cantidad_x_largo NUMERIC(10,2) DEFAULT 0,
  cantidad_x_sobrante NUMERIC(10,2) DEFAULT 0,
  mano_obra_x_corte NUMERIC(10,2) DEFAULT 4,
  costo_plixado NUMERIC(12,2) DEFAULT 0,
  divisor_pegamento NUMERIC(10,2) DEFAULT 5,
  usa_goma_eva BOOLEAN DEFAULT false,
  costo_goma_eva NUMERIC(12,2) DEFAULT 0,
  usa_espuma BOOLEAN DEFAULT false,
  costo_espuma NUMERIC(12,2) DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Tabla de multiplicadores de precios finales (editables)
CREATE TABLE IF NOT EXISTS multiplicadores_precio (
  id SERIAL PRIMARY KEY,
  clave VARCHAR(50) UNIQUE NOT NULL,
  nombre VARCHAR(100) NOT NULL,
  factor NUMERIC(6,4) NOT NULL DEFAULT 1.0000,
  orden INT DEFAULT 0,
  activo BOOLEAN DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4. RLS para parametros_costeo
ALTER TABLE parametros_costeo ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Permitir todo parametros_costeo') THEN
    CREATE POLICY "Permitir todo parametros_costeo" ON parametros_costeo FOR ALL USING (true) WITH CHECK (true);
  END IF;
END
$$;

-- 5. RLS para costeo_filtros
ALTER TABLE costeo_filtros ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Permitir todo costeo_filtros') THEN
    CREATE POLICY "Permitir todo costeo_filtros" ON costeo_filtros FOR ALL USING (true) WITH CHECK (true);
  END IF;
END
$$;

-- 6. RLS para multiplicadores_precio
ALTER TABLE multiplicadores_precio ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Permitir todo multiplicadores_precio') THEN
    CREATE POLICY "Permitir todo multiplicadores_precio" ON multiplicadores_precio FOR ALL USING (true) WITH CHECK (true);
  END IF;
END
$$;

-- 7. Seed: Parámetros globales iniciales (del Excel Oct25)
INSERT INTO parametros_costeo (clave, nombre, valor, divisor, unidad, grupo, orden) VALUES
  ('largo_hoja', 'Largo de hoja', 1000, 1, 'cm', 'materia_prima', 1),
  ('ancho_hoja', 'Ancho de hoja', 660, 1, 'cm', 'materia_prima', 2),
  ('gramaje', 'Gramaje del papel', 325, 1, 'g', 'materia_prima', 3),
  ('gramos_x_hoja', 'Gramos por hoja', 236, 1, 'g', 'materia_prima', 4),
  ('hojas_x_kilo', 'Hojas por kilo', 4.2, 1, 'unidades', 'materia_prima', 5),
  ('costo_x_kilo', 'Costo por kilo de papel', 2895, 1, '$', 'materia_prima', 6),
  ('costo_pegamento_base', 'Costo pegamento (lote)', 14100, 33, '$', 'insumos', 10),
  ('costo_bolsita_base', 'Costo bolsita (lote)', 5860, 140, '$', 'insumos', 11),
  ('costo_etiqueta_base', 'Costo etiqueta (lote)', 75000, 20000, '$', 'insumos', 12),
  ('costo_armado', 'Costo de armado', 150, 1, '$', 'mano_obra', 20),
  ('costo_laterales_carton_base', 'Costo laterales cartón (lote)', 5800, 3.5, '$', 'insumos', 13),
  ('costo_espuma_base', 'Costo espuma (cuando aplica)', 1000, 1, '$', 'insumos', 14),
  ('costo_caja_base', 'Costo caja (lote)', 1800, 45, '$', 'empaque', 30),
  ('costo_embolsado', 'Costo embolsado', 32, 1, '$', 'empaque', 31),
  ('ganancia', 'Margen de ganancia por unidad', 430, 1, '$', 'margen', 40),
  ('factor_laterales_carton', 'Multiplicador laterales cartón', 2.1, 1, 'x', 'produccion', 25),
  ('factor_etiqueta', 'Multiplicador etiqueta', 1.5, 1, 'x', 'produccion', 26)
ON CONFLICT (clave) DO NOTHING;

-- 8. Seed: Multiplicadores de precios finales (del Excel)
INSERT INTO multiplicadores_precio (clave, nombre, factor, orden) VALUES
  ('mdp_con_bolsa', 'MDP con bolsa', 0.9524, 1),
  ('mayorista_1', 'Mayorista 1', 1.05, 3),
  ('mayorista_2', 'Mayorista 2', 1.10, 4),
  ('mayorista_3', 'Mayorista 3', 1.15, 5),
  ('comercio', 'Comercio', 1.25, 6)
ON CONFLICT (clave) DO NOTHING;
`;

async function ejecutarSQL() {
  console.log('Ejecutando migración de tablas de costeo...');

  const url = 'https://api.supabase.com/v1/projects/' + PROJECT_REF + '/database/query';
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + ACCESS_TOKEN,
    },
    body: JSON.stringify({ query: sql }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Error HTTP:', response.status, errorText);
    process.exit(1);
  }

  const result = await response.json();
  console.log('Resultado:', JSON.stringify(result, null, 2));
  console.log('\nMigración completada exitosamente.');
}

ejecutarSQL().catch(console.error);


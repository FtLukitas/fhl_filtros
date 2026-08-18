const PROJECT_REF = 'egcydrmevdadqbuaqndr';
const ACCESS_TOKEN = 'sbp_705c67d3e4a81d232d2c3406d5e0d63568d10747';

const sql = `
-- 1. Tabla de Listas de Precios
CREATE TABLE IF NOT EXISTS listas_precios (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  descripcion TEXT,
  tipo_ajuste VARCHAR(20) NOT NULL DEFAULT 'porcentaje',
  porcentaje NUMERIC(5,2) DEFAULT 0.00,
  activa BOOLEAN NOT NULL DEFAULT true,
  es_predeterminada BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Tabla de Precios Específicos por Ítem en Lista
CREATE TABLE IF NOT EXISTS items_lista_precio (
  id BIGSERIAL PRIMARY KEY,
  lista_id UUID REFERENCES listas_precios(id) ON DELETE CASCADE,
  codigo_fhl VARCHAR(50) NOT NULL,
  precio NUMERIC(12,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(lista_id, codigo_fhl)
);

-- 3. Añadir columna lista_precio_id en clientes si no existe
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS lista_precio_id UUID REFERENCES listas_precios(id) ON DELETE SET NULL;

-- 4. Habilitar RLS y políticas permisivas
ALTER TABLE listas_precios ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Permitir todo listas_precios') THEN
    CREATE POLICY "Permitir todo listas_precios" ON listas_precios FOR ALL USING (true) WITH CHECK (true);
  END IF;
END
$$;

ALTER TABLE items_lista_precio ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Permitir todo items_lista_precio') THEN
    CREATE POLICY "Permitir todo items_lista_precio" ON items_lista_precio FOR ALL USING (true) WITH CHECK (true);
  END IF;
END
$$;

-- 5. Insertar listas iniciales si no existen
INSERT INTO listas_precios (nombre, descripcion, tipo_ajuste, porcentaje, activa, es_predeterminada)
SELECT 'Lista Base / Mostrador', 'Precio estándar de catálogo al público y mostrador (0% de ajuste).', 'porcentaje', 0.00, true, true
WHERE NOT EXISTS (SELECT 1 FROM listas_precios WHERE nombre = 'Lista Base / Mostrador');

INSERT INTO listas_precios (nombre, descripcion, tipo_ajuste, porcentaje, activa, es_predeterminada)
SELECT 'Lista Taller / Lubricentro', 'Tarifa preferencial para talleres mecánicos y lubricentros (10% de descuento).', 'porcentaje', -10.00, true, false
WHERE NOT EXISTS (SELECT 1 FROM listas_precios WHERE nombre = 'Lista Taller / Lubricentro');

INSERT INTO listas_precios (nombre, descripcion, tipo_ajuste, porcentaje, activa, es_predeterminada)
SELECT 'Lista Mayorista', 'Tarifa para casas de repuestos y compras mayoristas recurrentes (15% de descuento).', 'porcentaje', -15.00, true, false
WHERE NOT EXISTS (SELECT 1 FROM listas_precios WHERE nombre = 'Lista Mayorista');

INSERT INTO listas_precios (nombre, descripcion, tipo_ajuste, porcentaje, activa, es_predeterminada)
SELECT 'Lista Distribuidor', 'Máximo descuento comercial para distribuidores regionales de gran volumen (25% de descuento).', 'porcentaje', -25.00, true, false
WHERE NOT EXISTS (SELECT 1 FROM listas_precios WHERE nombre = 'Lista Distribuidor');
`;

async function main() {
  console.log('Ejecutando migración SQL de Listas de Precios en Supabase...');
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
    console.log('Migración de Listas de Precios completada con éxito:', data);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();

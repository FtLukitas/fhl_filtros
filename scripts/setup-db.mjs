const PROJECT_REF = 'egcydrmevdadqbuaqndr';
const ACCESS_TOKEN = 'sbp_705c67d3e4a81d232d2c3406d5e0d63568d10747';

const sql = `
-- 1. Modificar tablas existentes para soporte de soft-delete
ALTER TABLE "Tabla A" ADD COLUMN IF NOT EXISTS "eliminado" BOOLEAN DEFAULT false;
ALTER TABLE "Tabla B" ADD COLUMN IF NOT EXISTS "eliminado" BOOLEAN DEFAULT false;

-- 2. Tabla presupuestos
CREATE TABLE IF NOT EXISTS presupuestos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  numero VARCHAR(50),
  cliente_id UUID REFERENCES clientes(id) ON DELETE SET NULL,
  fecha TIMESTAMPTZ DEFAULT now(),
  validez_dias INTEGER DEFAULT 30,
  observaciones TEXT,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  estado VARCHAR(20) DEFAULT 'emitido',
  pedido_id UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Ítems de presupuestos
CREATE TABLE IF NOT EXISTS items_presupuesto (
  id SERIAL PRIMARY KEY,
  presupuesto_id UUID REFERENCES presupuestos(id) ON DELETE CASCADE,
  codigo_fhl VARCHAR(50) NOT NULL,
  cantidad INTEGER NOT NULL DEFAULT 1,
  precio_unitario NUMERIC(12,2) NOT NULL DEFAULT 0
);

-- 4. Tabla pedidos
CREATE TABLE IF NOT EXISTS pedidos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id UUID REFERENCES clientes(id) ON DELETE RESTRICT,
  presupuesto_id UUID REFERENCES presupuestos(id) ON DELETE SET NULL,
  estado VARCHAR(20) DEFAULT 'pendiente',
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  observaciones TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Ítems de pedidos
CREATE TABLE IF NOT EXISTS items_pedido (
  id SERIAL PRIMARY KEY,
  pedido_id UUID REFERENCES pedidos(id) ON DELETE CASCADE,
  codigo_fhl VARCHAR(50) NOT NULL,
  cantidad INTEGER NOT NULL DEFAULT 1,
  precio_unitario NUMERIC(12,2) NOT NULL DEFAULT 0
);

-- 6. Tabla pagos
CREATE TABLE IF NOT EXISTS pagos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  pedido_id UUID REFERENCES pedidos(id) ON DELETE CASCADE,
  cliente_id UUID REFERENCES clientes(id) ON DELETE RESTRICT,
  monto NUMERIC(12,2) NOT NULL DEFAULT 0,
  metodo VARCHAR(30) NOT NULL,
  nota TEXT,
  fecha TIMESTAMPTZ DEFAULT now()
);

-- 7. Movimientos de saldo (crédito a favor)
CREATE TABLE IF NOT EXISTS movimientos_saldo (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id UUID REFERENCES clientes(id) ON DELETE RESTRICT,
  monto NUMERIC(12,2) NOT NULL DEFAULT 0,
  tipo VARCHAR(30) NOT NULL,
  referencia_pedido_id UUID REFERENCES pedidos(id) ON DELETE SET NULL,
  nota TEXT,
  fecha TIMESTAMPTZ DEFAULT now()
);

-- Habilitar RLS o políticas abiertas para anon si RLS está habilitado
ALTER TABLE presupuestos ENABLE ROW LEVEL SECURITY;
ALTER TABLE items_presupuesto ENABLE ROW LEVEL SECURITY;
ALTER TABLE pedidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE items_pedido ENABLE ROW LEVEL SECURITY;
ALTER TABLE pagos ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimientos_saldo ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Permitir todo presupuestos') THEN
    CREATE POLICY "Permitir todo presupuestos" ON presupuestos FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Permitir todo items_presupuesto') THEN
    CREATE POLICY "Permitir todo items_presupuesto" ON items_presupuesto FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Permitir todo pedidos') THEN
    CREATE POLICY "Permitir todo pedidos" ON pedidos FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Permitir todo items_pedido') THEN
    CREATE POLICY "Permitir todo items_pedido" ON items_pedido FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Permitir todo pagos') THEN
    CREATE POLICY "Permitir todo pagos" ON pagos FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Permitir todo movimientos_saldo') THEN
    CREATE POLICY "Permitir todo movimientos_saldo" ON movimientos_saldo FOR ALL USING (true) WITH CHECK (true);
  END IF;
END
$$;

-- Crear bucket de storage para productos si no existe
INSERT INTO storage.buckets (id, name, public)
VALUES ('productos', 'productos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Permitir todo storage productos') THEN
    CREATE POLICY "Permitir todo storage productos" ON storage.objects
    FOR ALL USING (bucket_id = 'productos') WITH CHECK (bucket_id = 'productos');
  END IF;
END
$$;
`;

async function main() {
  console.log('Ejecutando migración SQL en Supabase...');
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
    console.log('Migración completada con éxito:', data);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();

# FHL Filtros — Catálogo Digital & Panel de Administración

Plataforma integral para **FHL Filtros** que combina un catálogo digital de consulta pública para clientes y un panel de administración completo para la gestión de productos, clientes, cuenta corriente, pedidos, pagos y presupuestos.

---

## Módulos Principales

1. **Catálogo Público (`/`)**:
   - Búsqueda instantánea de filtros por código (FHL, OEM, referencias cruzadas) y por vehículo (marca, modelo, versión, año).
   - Fichas técnicas detalladas con dimensiones y galería de fotos.
   - Navegación profunda controlada mediante URL State (`?filtro=ID`).
   - Los precios y productos inactivos están estrictamente protegidos y ocultos al público.

2. **Panel de Administración (`/admin`)**:
   - **Productos & Catálogo (`/admin/productos`)**: Edición rápida inline de filtros y vehículos, gestión de fotos con compresión WebP, definición de precios base de facturación y control de visibilidad en el catálogo web.
   - **Importador Masivo Excel / CSV**: Importación inteligente de planillas `.xlsx`, `.xls` y `.csv` con previsualización de altas y modificaciones antes del guardado en base de datos.
   - **Clientes & Cuenta Corriente (`/admin/clientes` y `/admin/clientes/[id]`)**: Ficha 360° con balance de deuda, créditos a favor por sobrepagos, historial de pedidos, pagos y lista de precios personalizada (`precios_cliente`).
   - **Gestión de Pedidos (`/admin/pedidos` y `/admin/pedidos/[id]`)**: Control del ciclo de vida (`pendiente` → `confirmado` → `entregado`), registro de pagos, auto-acreditación de excedentes a favor y aplicación de saldo.
   - **Facturador & Presupuestos (`/admin/facturador` y `/admin/presupuestos`)**: Creación de cotizaciones con autocompletado de precios, generación de PDF membretado y conversión a pedido con 1 click.

---

## Documentación Detallada

Para consultar el modelo de datos completo, esquemas de tablas en PostgreSQL, diagramas de entidad-relación y flujos de lógica de negocio, revisá el archivo:

👉 **[`DOCUMENTACION_SISTEMA.md`](DOCUMENTACION_SISTEMA.md)**

---

## Configuración Local

1. Instalar dependencias:
   ```bash
   npm install
   ```

2. Configurar variables de entorno en `.env.local`:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://egcydrmevdadqbuaqndr.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=tu_anon_key

   ADMIN_USER=admin
   ADMIN_PASSWORD=admin
   ADMIN_SECRET=fhl_secret_session_key_2026_secure
   ```

3. Iniciar el entorno de desarrollo:
   ```bash
   npm run dev
   ```

4. Compilar y verificar el build de producción:
   ```bash
   npm run build
   ```

# FHL Filtros — Catálogo Digital & Panel de Administración

Plataforma integral para **FHL Filtros** que combina un catálogo digital de consulta pública para clientes y un panel de administración cerrado para la gestión comercial, pedidos, cobranzas, listas de precios y auditoría con IA.

---

## Módulos Principales

1. **Catálogo Público (`/`)**:
   - Búsqueda instantánea de filtros de habitáculo por código (FHL, OEM, referencias cruzadas) y por vehículo (marca, modelo, versión, año).
   - Fichas técnicas detalladas con dimensiones milimétricas y galería de fotos.
   - Navegación profunda controlada mediante URL State (`?filtro=ID`).
   - Los precios y productos inactivos están estrictamente protegidos y ocultos al público.

2. **Panel de Administración (`/admin`)**:
   - 🛒 **Facturador Rápido & Editor de Pedidos (`/admin/facturador`)**:
     - Carga interactiva con resolución de precios por cliente o lista.
     - **Autoguardado en tiempo real**: Protege el borrador en `localStorage` ante cortes de conexión o cierres de pestaña con restauración en 1 click.
     - **Modo Edición (`?pedidoId=XYZ`)**: Permite modificar cualquier pedido existente y sincronizar los ítems sin duplicar registros.
     - Generación y descarga inmediata de comprobantes en PDF con previsualización interactiva.
   - 📦 **Gestión de Pedidos & Remitos (`/admin/pedidos` y `/admin/pedidos/[id]`)**:
     - Control del ciclo de vida (`pendiente` → `confirmado` → `entregado` / `cancelado`).
     - Botón de edición rápida ✏️ y gestión de cobranzas con auto-acreditación de saldo a favor.
   - 👥 **Clientes & Cuenta Corriente (`/admin/clientes` y `/admin/clientes/[id]`)**:
     - Ficha 360° con balance de deuda, créditos acumulados, historial de operaciones y tarifas acordadas por cliente (`precios_cliente`).
   - 🏷️ **Catálogo & Aplicaciones (`/admin/productos`)**:
     - Gestión de filtros (`Tabla A`) y compatibilidad vehicular (`Tabla B`).
     - Importador masivo de Excel con previsualización diferencial y optimización de fotos a formato WebP.
   - 💵 **Listas de Precios Directas (`/admin/listas-precios`)**:
     - 7 listas pre-cargadas (`Mayorista 1`, `Mayorista 2`, `Mayorista 3`, `Mayorista Base`, `MDP con Bolsa`, `MDP c/Bolsa Starfilt`, `Comercio`).
     - Importador/Exportador Excel de 2 columnas (`[Filtro, Precio]`), edición inline por filtro y ajuste masivo por porcentaje.
   - 🤖 **Auditoría de Catálogo con IA (`/admin/auditoria`)**:
     - Asistente técnico inteligente con ingesta del 100% del catálogo para cruces de códigos, detección de equivalencias y auditoría de planillas externas con modelos `nvidia/nemotron-3-nano`.

---

## Documentación Detallada

Para consultar el modelo de datos completo, esquemas relacionales, diagramas de arquitectura y especificación de endpoints, consultá:

- 👉 **[`DOCUMENTACION_SISTEMA.md`](DOCUMENTACION_SISTEMA.md)**: Manual de referencia técnica integral.
- 👉 **[`ARCHITECTURE.md`](ARCHITECTURE.md)**: Diagramas de flujo y arquitectura de software.

---

## Configuración y Ejecución Local

1. Instalar dependencias:
   ```bash
   npm install
   ```

2. Configurar variables de entorno en `.env.local`:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=tu_anon_key

   ADMIN_USER=admin
   ADMIN_PASSWORD=tu_contraseña_segura
   ADMIN_SECRET=tu_clave_secreta_de_sesion_segura

   OPENROUTER_API_KEY=tu_clave_de_openrouter_aqui
   ```

3. Iniciar el entorno de desarrollo:
   ```bash
   npm run dev
   ```

4. Compilar y verificar el build de producción (21 rutas):
   ```bash
   npm run build
   ```

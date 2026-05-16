# FHL Filtros - Catálogo Digital

Plataforma rápida de consulta B2B/B2C para FHL Filtros. Actualmente funciona como un catálogo digital de solo lectura, permitiendo a los usuarios buscar filtros por vehículo o código (OEM/Cruzadas) y ver fichas técnicas detalladas.

## Stack Tecnológico Actual
* **Frontend:** Next.js (App Router), React, TailwindCSS.
* **Backend/DB:** Supabase (PostgreSQL).
* **Navegación:** Control de vistas mediante Query Parameters (URL State) para Deep Linking.

## Configuración Local

1. Instalar dependencias:
   \`\`\`bash
   npm install
   \`\`\`

2. Variables de Entorno (`.env.local`):
   \`\`\`env
   NEXT_PUBLIC_SUPABASE_URL=tu_url_aca
   NEXT_PUBLIC_SUPABASE_ANON_KEY=tu_key_aca
   \`\`\`

3. Correr entorno de desarrollo:
   \`\`\`bash
   npm run dev
   \`\`\`

# Arquitectura del Sistema

## Estado Actual: Catálogo de Solo Lectura
El sistema se nutre de Supabase. Para optimizar el rendimiento, se utilizan Vistas Materializadas o Tablas de cruce para evitar consultas pesadas.

* **Búsqueda por Vehículo:** Consulta `Tabla B` (marcas/modelos) cruzado con el filtro asociado.
* **Búsqueda por Código:** Consulta `Tabla A` (filtros) mediante coincidencias (ilike) normalizando guiones y espacios.
* **Ficha Técnica (Modal):** NO utiliza un estado local booleano aislado. La apertura del modal se controla mediante la URL (`?filtro=CODIGO`). Esto permite compartir enlaces directos a filtros específicos y respeta el historial del navegador.

## Roadmap / Backlog (A futuro)
* **Fase 2 - E-commerce Asincrónico:** Implementación de un carrito de compras (Zustand) donde el cliente envía una "Solicitud de Pedido". El stock y el precio no se mostrarán en vivo; un administrador los confirmará manualmente contra su Excel físico antes de emitir un link de pago (Mercado Pago).

### Mapa de Arquitectura Actual

```mermaid
graph TD
    Cliente((Usuario)) -->|Interactúa| UI[Frontend Next.js]
    
    subgraph App [Next.js App Router]
        UI -->|URL State ?filtro=...| Modal[Modal Ficha Técnica]
        UI -->|Input| Buscador[Buscador Texto/Vehículo]
        Modal -.->|Suspense / Router| UI
    end
    
    subgraph DB [Backend Supabase]
        Buscador -->|Fetch de Datos| API[API REST / PostgREST]
        Modal -->|Single Fetch| API
        
        API -->|Consultas Optimizadas| PostgreSQL[(Base de Datos)]
        
        PostgreSQL -->|Solo Lectura| Vistas[Vistas: Marcas y Modelos]
        PostgreSQL -->|Cruce relacional| TablaB[Tabla B: Vehículos]
        PostgreSQL -->|ilike / exacto| TablaA[Tabla A: Filtros FHL]
    end
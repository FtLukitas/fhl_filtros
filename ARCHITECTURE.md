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
    %% Estilos Generales del Diagrama
    classDef datos fill:#f1f5f9,stroke:#64748b,stroke-width:2px;
    classDef red fill:#eff6ff,stroke:#2563eb,stroke-width:2px;
    classDef app fill:#fff7ed,stroke:#ea580c,stroke-width:2px;
    classDef ui fill:#f0fdf4,stroke:#16a34a,stroke-width:2px;

    %% Capa de Datos (Base de Datos)
    subgraph Capa_Datos [Capa de Datos: Supabase / PostgreSQL]
        T1[(Tabla A: Filtros FHL)]:::datos
        T2[(Tabla B: Vehículos)]:::datos
        V1[(Vistas: Marcas y Modelos Únicos)]:::datos
    end

    %% Capa de Red (Cliente de API)
    subgraph Capa_Red [Capa de Red: PostgREST Client]
        API[Cliente de Supabase]:::red
    end

    %% Capa de Aplicación (Next.js Lógica)
    subgraph Capa_App [Capa de Aplicación: Next.js App Router]
        Buscador[Lógica de Búsqueda: Texto / Vehículo]:::app
        URL{Barra de Navegación: ?filtro=CODIGO}:::app
        Effect[useEffect: Sincronizador de URL State]:::app
        Modal[Componente Modal: Ficha Técnica]:::app
    end

    %% Capa de Usuario (Interfaz)
    Usuario((Cliente / Usuario)):::ui

    %% --- FLUJO DE INFORMACIÓN ---

    %% 1. Carga de datos base hacia la API
    T1 -->|Select / ilike| API
    T2 -->|Select por Marca/Modelo| API
    V1 -->|Order por nombre| API

    %% 2. Consumo de la API desde los buscadores
    API -->|Popula filtrosTexto y listaResultados| Buscador

    %% 3. Interacción del Usuario
    Usuario -->|1. Digita código o Selecciona vehículo| Buscador
    Buscador -->|2. Clic en Ver Detalle actualiza parámetro| URL
    
    %% 4. El ciclo de la URL como Fuente de Verdad
    URL -->|3. Detecta cambio en filtroUrl| Effect
    Effect -->|4. Pide Ficha Única .single| API
    API -->|5. Retorna fila técnica completa| Effect
    Effect -->|6. Modifica estado filtroDetalle| Modal
    
    %% 5. Renderizado final y Cierre
    Modal -->|7. Muestra Ficha Técnica| Usuario
    Usuario -->|Clic Cerrar o Botón Atrás limpia parámetro| URL
# Arquitectura del Sistema

## Estado Actual: Catálogo de Solo Lectura
El sistema se nutre de Supabase. Para optimizar el rendimiento, se utilizan Vistas Materializadas o Tablas de cruce para evitar consultas pesadas.

### Funcionalidades

* **Búsqueda por Vehículo** (`BuscadorVehiculo`): Consulta `Tabla B` (marcas/modelos) cruzado con el filtro asociado. Cascada de selects: Marca → Modelo → Buscar.
* **Búsqueda por Código** (`BuscadorCodigo`): Consulta `Tabla A` (filtros) mediante coincidencias (ilike) normalizando guiones y espacios. Implementa debounce de 350ms para evitar requests excesivos.
* **Ficha Técnica** (`ModalDetalle`): NO utiliza un estado local booleano aislado. La apertura del modal se controla mediante la URL (`?filtro=CODIGO`). Esto permite compartir enlaces directos a filtros específicos y respeta el historial del navegador.
  * **Scroll Locking:** Al abrir el modal se bloquea el scroll del `body` (`overflow: hidden`). Al activar el zoom de imagen, se bloquea además el scroll interno del modal. Ambos se restauran al cerrar.
  * **Rendimiento:** Se evita `backdrop-filter: blur()` en el overlay por su alto costo de GPU en cada frame de scroll. Se usa `will-change: transform` en el contenedor scrolleable para promoverlo a su propia capa de composición.
  * **Accesibilidad:** El modal incluye `role="dialog"`, `aria-modal="true"` y `aria-label` descriptivo.

### Estructura de Componentes

```
app/
├── page.tsx                  ← Orquestador (~95 líneas). Gestiona URL state y conecta componentes.
├── layout.tsx                ← Layout raíz: Navbar + children + Footer + WhatsAppButton
├── components/
│   ├── Navbar.tsx            ← Navegación responsive. Usa <Link> con limpieza de ?filtro.
│   ├── Footer.tsx            ← Footer (Server Component)
│   ├── WhatsAppButton.tsx    ← Botón flotante global (Server Component)
│   ├── BuscadorVehiculo.tsx  ← Búsqueda por vehículo (Client Component, estado propio)
│   ├── BuscadorCodigo.tsx    ← Búsqueda por código con debounce (Client Component, estado propio)
│   └── ModalDetalle.tsx      ← Ficha técnica con galería/zoom (Client Component, estado propio)
├── contacto/page.tsx         ← Página de contacto (Server Component)
└── quienes-somos/page.tsx    ← Página institucional (Server Component)

lib/
├── supabase.ts               ← Cliente Supabase (singleton)
└── types.ts                  ← Interfaces TypeScript: Filtro, ResultadoVehiculo
```

### Patrón de comunicación entre componentes

`page.tsx` es el orquestador central. No contiene lógica de búsqueda ni UI de modal. Su rol:
1. Lee `useSearchParams` para saber si hay un `?filtro=CODIGO` en la URL.
2. Expone `abrirFiltro(codigo)` como callback `onVerDetalle` a los buscadores.
3. Pasa `filtroDetalle` y `cerrarModal` al `ModalDetalle`.

Cada buscador es autónomo: gestiona su propio estado, queries a Supabase y errores.

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
    subgraph Capa_Datos ["Capa de Datos: Supabase / PostgreSQL"]
        T1[("Tabla A: Filtros FHL")]:::datos
        T2[("Tabla B: Vehículos")]:::datos
        V1[("Vistas: Marcas y Modelos Únicos")]:::datos
    end

    %% Capa de Red (Cliente de API)
    subgraph Capa_Red ["Capa de Red: PostgREST Client"]
        API["Cliente de Supabase"]:::red
    end

    %% Capa de Aplicación (Next.js Lógica)
    subgraph Capa_App ["Capa de Aplicación: Next.js App Router"]
        Page["page.tsx: Orquestador URL State"]:::app
        BV["BuscadorVehiculo"]:::app
        BC["BuscadorCodigo (debounce 350ms)"]:::app
        URL{"URL: ?filtro=CODIGO"}:::app
        Modal["ModalDetalle: Ficha Técnica"]:::app
    end

    %% Capa de Usuario (Interfaz)
    Usuario(("Cliente / Usuario")):::ui

    %% --- FLUJO DE INFORMACIÓN ---

    %% 1. Carga de datos base hacia la API
    T1 -->|"Select / ilike"| API
    T2 -->|"Select por Marca/Modelo"| API
    V1 -->|"Order por nombre"| API

    %% 2. Consumo de la API desde los buscadores
    API -->|"Popula listaResultados"| BV
    API -->|"Popula filtrosTexto"| BC

    %% 3. Interacción del Usuario
    Usuario -->|"1. Selecciona vehículo"| BV
    Usuario -->|"1. Digita código"| BC
    BV -->|"2. onVerDetalle(codigo)"| Page
    BC -->|"2. onVerDetalle(codigo)"| Page
    Page -->|"3. pushState ?filtro=X"| URL
    
    %% 4. El ciclo de la URL como Fuente de Verdad
    URL -->|"4. useEffect detecta cambio"| Page
    Page -->|"5. Pide Ficha Única .single"| API
    API -->|"6. Retorna datos"| Page
    Page -->|"7. Pasa filtro como prop"| Modal
    
    %% 5. Renderizado final y Cierre
    Modal -->|"8. Muestra Ficha Técnica"| Usuario
    Usuario -->|"Cerrar: limpia parámetro"| URL
```
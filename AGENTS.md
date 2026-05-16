# Instrucciones para Asistentes de IA

Estás trabajando en el repositorio de **FHL Filtros**. Debes respetar estrictamente las siguientes directivas antes de generar código:

* **Alcance Actual:** El sistema es UN CATÁLOGO. No intentes implementar carritos de compra, pasarelas de pago, ni tablas de pedidos. Eso está en el backlog.
* **Componentes Next.js:** Usa el paradigma de App Router. Usa Server Components por defecto. Reserva `'use client'` estrictamente para los árboles de componentes que necesiten interactividad (ej. inputs de búsqueda).
* **Manejo del Modal:** El modal de detalles NO debe usar un `useState` booleano para abrirse/cerrarse. Debe leer la URL utilizando `useSearchParams` (`?filtro=ID`). Para cerrar el modal, se debe hacer push a la ruta original sin parámetros usando el `useRouter`. Necesario usar `<Suspense>`.
* **Estilos:** Utiliza TailwindCSS. No crees archivos CSS externos ni Modules a menos que sea estrictamente indispensable.
// Tipos centrales del catálogo FHL Filtros
// Representan las estructuras de datos que vienen de Supabase

export interface Filtro {
  id: number;
  codigo_fhl: string;
  equivalencias: string | null;
  dimensiones: string | null;
  descripcion_aplicacion: string | null;
  imagen_url: string | string[] | null;
  buscador_unificado: string | null;
}

export interface ResultadoVehiculo {
  version: string | null;
  año: string | null;
  filtro_asociado: string;
}

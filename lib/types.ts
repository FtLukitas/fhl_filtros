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

// --- Facturador ---

export interface Cliente {
  id: string;
  nombre: string;
  cuit: string | null;
  direccion: string | null;
  eliminado: boolean;
  created_at: string;
}

export interface PrecioCliente {
  id: number;
  cliente_id: string;
  codigo_fhl: string;
  precio: number;
  updated_at: string;
}

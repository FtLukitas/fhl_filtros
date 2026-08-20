// Tipos centrales del catálogo y panel de administración FHL Filtros
// Representan las estructuras de datos sincronizadas con Supabase

export interface Filtro {
  id: number;
  codigo_fhl: string;
  equivalencias: string | null;
  dimensiones: string | null;
  descripcion_aplicacion: string | null;
  imagen_url: string | string[] | null;
  buscador_unificado: string | null;
  precio?: number | null;
  activo?: boolean;
  eliminado?: boolean;
}

export interface Vehiculo {
  id?: number;
  marca: string;
  modelo: string;
  version: string | null;
  año: string | null;
  filtro_asociado: string;
  eliminado?: boolean;
}

export interface ResultadoVehiculo {
  version: string | null;
  año: string | null;
  filtro_asociado: string;
}

// --- Listas de Precios Directas ---

export type TipoAjusteLista = 'excel' | 'porcentaje' | 'fijo';

export interface ListaPrecio {
  id: string;
  nombre: string;
  descripcion?: string | null;
  tipo_ajuste: TipoAjusteLista;
  porcentaje: number;
  activa: boolean;
  es_predeterminada: boolean;
  eliminado?: boolean;
  eliminado_at?: string | null;
  total_items?: number;
  total_clientes?: number;
  created_at: string;
}

export interface ItemListaPrecio {
  id: number;
  lista_id: string;
  codigo_fhl: string;
  precio: number;
  created_at: string;
}

// --- Clientes & Cuentas Corrientes ---

export interface Cliente {
  id: string;
  nombre: string;
  cuit: string | null;
  email?: string | null;
  telefono?: string | null;
  direccion: string | null;
  ciudad?: string | null;
  provincia?: string | null;
  condicion_iva?: string | null;
  tipo_cliente?: string | null;
  descuento_predeterminado?: number | null;
  plazo_pago?: string | null;
  notas?: string | null;
  lista_precio_id?: string | null;
  lista_precio?: ListaPrecio;
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

export interface ResumenFinancieroCliente {
  totalComprado: number;
  totalPagado: number;
  totalDeuda: number;
  totalSaldoAFavor: number;
  pedidosPendientes: number;
  pedidosImpagos: number;
}

// --- Facturación, Pedidos, Pagos y Saldo a Favor ---

export type EstadoPedido = 'pendiente' | 'confirmado' | 'entregado' | 'cancelado';
export type EstadoPagoPedido = 'impago' | 'parcial' | 'saldado';
export type EstadoPresupuesto = 'emitido' | 'convertido' | 'vencido';
export type MetodoPago = 'efectivo' | 'transferencia' | 'cheque' | 'mercadopago' | 'saldo_a_favor';
export type TipoMovimientoSaldo = 'excedente' | 'aplicado' | 'ajuste_manual' | 'anticipo' | 'deduccion';

export interface Presupuesto {
  id: string;
  numero: string | null;
  cliente_id: string;
  fecha: string;
  validez_dias: number;
  observaciones: string | null;
  total: number;
  estado: EstadoPresupuesto;
  pedido_id: string | null;
  created_at: string;
  cliente?: Cliente;
  items?: ItemPresupuesto[];
}

export interface ItemPresupuesto {
  id: number;
  presupuesto_id: string;
  codigo_fhl: string;
  cantidad: number;
  precio_unitario: number;
}

export interface Pedido {
  id: string;
  cliente_id: string;
  presupuesto_id: string | null;
  estado: EstadoPedido;
  total: number;
  observaciones: string | null;
  eliminado?: boolean;
  created_at: string;
  updated_at: string;
  cliente?: Cliente;
  items?: ItemPedido[];
  pagos?: Pago[];
  presupuesto?: Presupuesto;
}

export interface ItemPedido {
  id: number;
  pedido_id: string;
  codigo_fhl: string;
  cantidad: number;
  precio_unitario: number;
}

export interface Pago {
  id: string;
  pedido_id: string;
  cliente_id: string;
  monto: number;
  metodo: MetodoPago;
  nota: string | null;
  fecha: string;
}

export interface MovimientoSaldo {
  id: string;
  cliente_id: string;
  monto: number;
  tipo: TipoMovimientoSaldo;
  referencia_pedido_id?: string | null;
  pedido_id?: string | null;
  nota?: string | null;
  descripcion?: string | null;
  fecha: string;
}

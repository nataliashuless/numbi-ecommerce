import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let _client: SupabaseClient | null = null
export function getSupabase(): SupabaseClient {
  if (!_client) {
    _client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  }
  return _client
}

// Types for database tables
export interface VentaWhatsApp {
  id: string
  fecha: string
  cliente_nombre: string | null
  cliente_telefono: string | null
  producto_nombre: string
  producto_variante: string | null
  producto_sku: string | null
  cantidad: number
  precio_unitario: number
  total: number
  notas: string | null
  created_at: string
  updated_at: string
}

export interface TiendaTercero {
  id: string
  nombre: string
  contacto_nombre: string | null
  contacto_telefono: string | null
  contacto_email: string | null
  direccion: string | null
  comision_tipo: 'porcentaje' | 'fijo' | 'mixto'
  comision_porcentaje: number | null
  comision_fijo: number | null
  notas: string | null
  activa: boolean
  created_at: string
  updated_at: string
}

export interface Consignacion {
  id: string
  tienda_id: string
  fecha: string
  tipo: 'envio' | 'devolucion'
  producto_nombre: string
  producto_sku: string | null
  cantidad: number
  precio_unitario: number
  notas: string | null
  created_at: string
}

export interface VentaTercero {
  id: string
  tienda_id: string
  fecha: string
  producto_nombre: string
  producto_sku: string | null
  cantidad: number
  precio_venta: number
  comision: number
  neto: number
  liquidacion_id: string | null
  created_at: string
}

export interface Liquidacion {
  id: string
  tienda_id: string
  fecha: string
  periodo_inicio: string
  periodo_fin: string
  total_ventas: number
  total_comisiones: number
  total_neto: number
  estado: 'pendiente' | 'pagada'
  notas: string | null
  created_at: string
}

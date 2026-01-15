import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const startDate = searchParams.get('start_date')
  const endDate = searchParams.get('end_date')
  const groupBy = searchParams.get('group_by') || 'day'

  // Build query
  let query = supabase
    .from('ventas_terceros')
    .select('fecha, precio_venta, neto, comision, cantidad, tienda_id')
    .order('fecha')

  if (startDate) {
    query = query.gte('fecha', startDate)
  }
  if (endDate) {
    query = query.lte('fecha', endDate)
  }

  const { data: ventas, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Get store names
  const { data: tiendas } = await supabase
    .from('tiendas_terceros')
    .select('id, nombre')

  const tiendaNames: { [id: string]: string } = {}
  tiendas?.forEach(t => {
    tiendaNames[t.id] = t.nombre
  })

  // Helper to get group key
  const getGroupKey = (dateStr: string): string => {
    const date = new Date(dateStr + 'T12:00:00')
    if (groupBy === 'month') {
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    } else if (groupBy === 'week') {
      const tempDate = new Date(date.getTime())
      tempDate.setHours(0, 0, 0, 0)
      tempDate.setDate(tempDate.getDate() + 3 - (tempDate.getDay() + 6) % 7)
      const week1 = new Date(tempDate.getFullYear(), 0, 4)
      const weekNum = 1 + Math.round(((tempDate.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7)
      return `${tempDate.getFullYear()}-W${String(weekNum).padStart(2, '0')}`
    }
    return dateStr
  }

  // Aggregate data
  const aggregatedData: { [key: string]: { ventas: number; neto: number; comision: number; unidades: number } } = {}
  const ventasPorTienda: { [tiendaId: string]: { [key: string]: number } } = {}

  for (const venta of ventas || []) {
    const key = getGroupKey(venta.fecha)

    if (!aggregatedData[key]) {
      aggregatedData[key] = { ventas: 0, neto: 0, comision: 0, unidades: 0 }
    }
    aggregatedData[key].ventas += Number(venta.precio_venta)
    aggregatedData[key].neto += Number(venta.neto)
    aggregatedData[key].comision += Number(venta.comision)
    aggregatedData[key].unidades += venta.cantidad

    // Track by store
    if (!ventasPorTienda[venta.tienda_id]) {
      ventasPorTienda[venta.tienda_id] = {}
    }
    if (!ventasPorTienda[venta.tienda_id][key]) {
      ventasPorTienda[venta.tienda_id][key] = 0
    }
    ventasPorTienda[venta.tienda_id][key] += Number(venta.neto)
  }

  // Convert to sorted arrays
  const chartData = Object.entries(aggregatedData)
    .map(([date, data]) => ({
      date,
      ...data,
    }))
    .sort((a, b) => a.date.localeCompare(b.date))

  // Chart data by store
  const chartDataByStore = Object.entries(ventasPorTienda).map(([tiendaId, data]) => ({
    tiendaId,
    tiendaNombre: tiendaNames[tiendaId] || 'Desconocida',
    data: Object.entries(data)
      .map(([date, ventas]) => ({ date, ventas }))
      .sort((a, b) => a.date.localeCompare(b.date)),
  }))

  // Calculate totals
  const totalVentas = (ventas || []).reduce((sum, v) => sum + Number(v.precio_venta), 0)
  const totalNeto = (ventas || []).reduce((sum, v) => sum + Number(v.neto), 0)
  const totalComision = (ventas || []).reduce((sum, v) => sum + Number(v.comision), 0)
  const totalUnidades = (ventas || []).reduce((sum, v) => sum + v.cantidad, 0)

  return NextResponse.json({
    chartData,
    chartDataByStore,
    stats: {
      totalVentas,
      totalNeto,
      totalComision,
      totalUnidades,
      totalTransacciones: ventas?.length || 0,
    },
  })
}

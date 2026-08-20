'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Loader2, LogOut, ArrowLeft, ShoppingCart, Package, Boxes, BarChart3,
  MessageCircle, Settings, FileText, Store, TrendingUp, Tent, Megaphone,
  Plus, Trash2, Truck, Check,
} from 'lucide-react'

interface OrderItem { diseno: string; talla: string | null; cantidad: number }
interface Order {
  id: string
  numero: string | null
  proveedor: string | null
  fecha_creacion: string | null
  fecha_entrega: string | null
  estado: string
  notas: string | null
  items: OrderItem[]
  totalPares: number
}

function estadoBadge(e: string): string {
  if (e === 'pendiente') return 'bg-amber-100 text-amber-700'
  if (e === 'recibida') return 'bg-green-100 text-green-700'
  return 'bg-gray-200 text-gray-600'
}

// Parse a pasted block of lines like "Oso 23 1", "Oso,23,1", "Oso\t23\t1"
function parsePaste(text: string): OrderItem[] {
  const out: OrderItem[] = []
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    const parts = line.split(/[\t,;]+|\s{2,}|\s+/).filter(Boolean)
    if (parts.length < 2) continue
    // last token = cantidad, second-last = talla (if numeric), rest = diseño
    const cantidad = Number(parts[parts.length - 1])
    if (!Number.isFinite(cantidad) || cantidad <= 0) continue
    let talla: string | null = null
    let disenoParts = parts.slice(0, parts.length - 1)
    const maybeTalla = parts[parts.length - 2]
    if (/^\d{1,2}([.,]\d+)?$/.test(maybeTalla)) {
      talla = maybeTalla
      disenoParts = parts.slice(0, parts.length - 2)
    }
    const diseno = disenoParts.join(' ').trim()
    if (!diseno) continue
    out.push({ diseno, talla, cantidad: Math.round(cantidad) })
  }
  return out
}

export default function OrdenesProduccionPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)

  const [numero, setNumero] = useState('')
  const [proveedor, setProveedor] = useState('')
  const [fechaEntrega, setFechaEntrega] = useState('')
  const [pasteText, setPasteText] = useState('')
  const parsedItems = parsePaste(pasteText)

  const fetchOrders = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/produccion/ordenes')
      if (res.ok) {
        const d = await res.json()
        setOrders(d.ordenes || [])
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchOrders() }, [fetchOrders])

  async function createOrder(e: React.FormEvent) {
    e.preventDefault()
    if (parsedItems.length === 0) { alert('Agregá al menos un item (diseño talla cantidad)'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/produccion/ordenes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          numero: numero || null,
          proveedor: proveedor || null,
          fecha_entrega: fechaEntrega || null,
          estado: 'pendiente',
          items: parsedItems,
        }),
      })
      if (res.ok) {
        setNumero(''); setProveedor(''); setFechaEntrega(''); setPasteText('')
        setShowForm(false)
        await fetchOrders()
      } else {
        const d = await res.json()
        alert(d.error || 'Error al crear')
      }
    } finally {
      setSaving(false)
    }
  }

  async function setEstado(id: string, estado: string) {
    await fetch('/api/produccion/ordenes', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, estado }),
    })
    await fetchOrders()
  }

  async function deleteOrder(id: string) {
    if (!confirm('¿Eliminar esta orden?')) return
    await fetch(`/api/produccion/ordenes?id=${id}`, { method: 'DELETE' })
    await fetchOrders()
  }

  return (
    <div className="min-h-screen bg-white">
      <header className="bg-[#1A2238] border-b border-[#2A3550]">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold tracking-tight text-[#1DA9EF]">shuless</span>
            <span className="text-[10px] text-white font-bold bg-[#1DA9EF] px-2 py-0.5 rounded-full uppercase tracking-wider">Admin</span>
          </div>
          <Link href="/">
            <Button variant="ghost" className="text-[#9CA3AF] hover:text-white hover:bg-[#2A3550]">
              <LogOut className="h-4 w-4 mr-2" />Cerrar sesión
            </Button>
          </Link>
        </div>
      </header>

      <div className="bg-white border-b">
        <div className="container mx-auto px-4">
          <nav className="flex gap-4 overflow-x-auto">
            <Link href="/dashboard"><Button variant="ghost" className="rounded-none border-b-2 border-transparent hover:border-[#1DA9EF] py-4"><BarChart3 className="h-4 w-4 mr-2" />Ventas</Button></Link>
            <Link href="/dashboard/shopify"><Button variant="ghost" className="rounded-none border-b-2 border-transparent hover:border-[#1DA9EF] py-4"><ShoppingCart className="h-4 w-4 mr-2" />Shopify</Button></Link>
            <Link href="/dashboard/whatsapp"><Button variant="ghost" className="rounded-none border-b-2 border-transparent hover:border-[#1DA9EF] py-4"><MessageCircle className="h-4 w-4 mr-2" />WhatsApp</Button></Link>
            <Link href="/dashboard/tiendas"><Button variant="ghost" className="rounded-none border-b-2 border-transparent hover:border-[#1DA9EF] py-4"><Store className="h-4 w-4 mr-2" />Tiendas</Button></Link>
            <Link href="/dashboard/ferias"><Button variant="ghost" className="rounded-none border-b-2 border-transparent hover:border-[#1DA9EF] py-4"><Tent className="h-4 w-4 mr-2" />Ferias</Button></Link>
            <Link href="/dashboard/ppismercadeo"><Button variant="ghost" className="rounded-none border-b-2 border-transparent hover:border-[#1DA9EF] py-4"><Megaphone className="h-4 w-4 mr-2" />Marketing</Button></Link>
            <Link href="/dashboard/conciliacion"><Button variant="ghost" className="rounded-none border-b-2 border-transparent hover:border-[#1DA9EF] py-4"><FileText className="h-4 w-4 mr-2" />Conciliación</Button></Link>
            <Link href="/dashboard/analitica"><Button variant="ghost" className="rounded-none border-b-2 border-transparent hover:border-[#1DA9EF] py-4"><TrendingUp className="h-4 w-4 mr-2" />Analítica</Button></Link>
            <Link href="/dashboard/productos"><Button variant="ghost" className="rounded-none border-b-2 border-transparent hover:border-[#1DA9EF] py-4"><Package className="h-4 w-4 mr-2" />Productos</Button></Link>
            <Button variant="ghost" className="rounded-none border-b-2 border-[#1DA9EF] text-[#1A2238] py-4"><Boxes className="h-4 w-4 mr-2" />Inventario</Button>
            <Link href="/dashboard/configuracion"><Button variant="ghost" className="rounded-none border-b-2 border-transparent hover:border-[#1DA9EF] py-4"><Settings className="h-4 w-4 mr-2" />Configuración</Button></Link>
          </nav>
        </div>
      </div>

      <main className="container mx-auto px-4 py-8">
        <Link href="/dashboard/inventario" className="inline-flex items-center text-sm text-[#545454] hover:text-[#1A2238] mb-4">
          <ArrowLeft className="h-4 w-4 mr-1" />Volver a Inventario
        </Link>

        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6 gap-4">
          <div>
            <h1 className="text-3xl font-bold text-[#1A2238] mb-2 flex items-center gap-2">
              <Truck className="h-7 w-7 text-[#F59E0B]" />Órdenes de producción
            </h1>
            <p className="text-[#545454] max-w-2xl">
              Zapatos en camino. El forecast de demanda descuenta lo que ya está pedido (órdenes pendientes) para no sobre-pedir.
            </p>
          </div>
          <Button onClick={() => setShowForm(v => !v)} className="bg-[#1DA9EF] hover:bg-[#0073D1] text-white">
            <Plus className="h-4 w-4 mr-2" />Nueva orden
          </Button>
        </div>

        {showForm && (
          <Card className="mb-8">
            <CardHeader><CardTitle className="text-lg">Nueva orden de producción</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={createOrder} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <Label>Número de orden</Label>
                    <Input value={numero} onChange={e => setNumero(e.target.value)} placeholder="Ej: 030" />
                  </div>
                  <div>
                    <Label>Proveedor</Label>
                    <Input value={proveedor} onChange={e => setProveedor(e.target.value)} placeholder="Ej: Críos Shoes SAS" />
                  </div>
                  <div>
                    <Label>Fecha de entrega</Label>
                    <Input type="date" value={fechaEntrega} onChange={e => setFechaEntrega(e.target.value)} />
                  </div>
                </div>
                <div>
                  <Label>Items — pegá una línea por variante: <span className="font-mono text-xs">Diseño Talla Cantidad</span></Label>
                  <textarea
                    value={pasteText}
                    onChange={e => setPasteText(e.target.value)}
                    rows={8}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
                    placeholder={`Oso 23 1\nOso 25 2\nOso 27 3\nRacer 23 12\nGalaxy 23 3\nGalaxy 24 5\n...`}
                  />
                  <p className="text-xs text-[#545454] mt-1">
                    Acepta espacios, comas o tabs. Podés copiar directo de Excel (columna diseño, talla, cantidad).
                    {parsedItems.length > 0 && (
                      <span className="ml-2 text-[#1A2238] font-medium">
                        {parsedItems.length} items · {parsedItems.reduce((s, i) => s + i.cantidad, 0)} pares detectados
                      </span>
                    )}
                  </p>
                </div>
                {parsedItems.length > 0 && (
                  <div className="max-h-40 overflow-y-auto border rounded-md p-2 text-xs">
                    <div className="flex flex-wrap gap-1">
                      {parsedItems.map((it, i) => (
                        <span key={i} className="inline-flex items-center gap-1 bg-gray-100 rounded px-2 py-0.5">
                          {it.diseno}{it.talla ? ` ${it.talla}` : ''} · <b>{it.cantidad}</b>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex gap-2">
                  <Button type="submit" disabled={saving} className="bg-[#1DA9EF] hover:bg-[#0073D1] text-white">
                    {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}Guardar orden
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-[#1A2238]" />
          </div>
        ) : orders.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center text-[#545454]">
              <Truck className="h-12 w-12 mx-auto mb-3 text-[#D1D5DB]" />
              <p className="mb-4">No hay órdenes de producción registradas</p>
              <Button onClick={() => setShowForm(true)} className="bg-[#1DA9EF] hover:bg-[#0073D1] text-white">
                <Plus className="h-4 w-4 mr-2" />Registrar la primera
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {orders.map(o => (
              <Card key={o.id}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <CardTitle className="text-lg flex items-center gap-2">
                        Orden {o.numero || '—'}
                        <Badge className={`${estadoBadge(o.estado)} font-medium`}>{o.estado}</Badge>
                      </CardTitle>
                      <p className="text-sm text-[#545454] mt-1">
                        {o.proveedor || 'Sin proveedor'}
                        {o.fecha_entrega && <> · llega {format(new Date(o.fecha_entrega + 'T12:00:00'), 'dd MMM yyyy', { locale: es })}</>}
                        {' · '}<b className="text-[#1A2238]">{o.totalPares} pares</b>
                      </p>
                    </div>
                    <div className="flex gap-2">
                      {o.estado === 'pendiente' && (
                        <Button size="sm" variant="outline" onClick={() => setEstado(o.id, 'recibida')} className="text-green-700 border-green-300 hover:bg-green-50">
                          <Check className="h-3 w-3 mr-1" />Marcar recibida
                        </Button>
                      )}
                      {o.estado === 'recibida' && (
                        <Button size="sm" variant="outline" onClick={() => setEstado(o.id, 'pendiente')}>
                          Reabrir
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => deleteOrder(o.id)} className="text-red-600 hover:bg-red-50">
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Diseño</TableHead>
                          <TableHead>Talla</TableHead>
                          <TableHead className="text-right">Cantidad</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {o.items.map((it, i) => (
                          <TableRow key={i}>
                            <TableCell className="font-medium">{it.diseno}</TableCell>
                            <TableCell>{it.talla || '—'}</TableCell>
                            <TableCell className="text-right tabular-nums">{it.cantidad}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  {o.estado === 'recibida' && (
                    <p className="text-xs text-[#9CA3AF] mt-3">
                      Recibida — ya no descuenta del forecast (el stock ya debería estar en Siigo).
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

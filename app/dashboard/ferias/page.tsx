'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  ShoppingCart,
  Package,
  Loader2,
  LogOut,
  Plus,
  Boxes,
  BarChart3,
  MessageCircle,
  Settings,
  FileText,
  Store,
  TrendingUp,
  Tent,
  Calendar,
  MapPin,
  Pencil,
} from 'lucide-react'

interface Feria {
  id: string
  nombre: string
  ubicacion: string | null
  fecha_inicio: string
  fecha_fin: string
  notas: string | null
  activa: boolean
  created_at: string
}

function feriaStatus(f: Feria): { label: string; color: string } {
  const today = new Date().toISOString().slice(0, 10)
  if (!f.activa) return { label: 'Inactiva', color: 'bg-gray-300 text-gray-700' }
  if (f.fecha_fin < today) return { label: 'Finalizada', color: 'bg-gray-200 text-[#545454]' }
  if (f.fecha_inicio > today) return { label: 'Próxima', color: 'bg-[#1DA9EF]/15 text-[#0073D1]' }
  return { label: 'En curso', color: 'bg-green-100 text-green-700' }
}

export default function FeriasPage() {
  const [ferias, setFerias] = useState<Feria[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState({
    id: '' as string | undefined,
    nombre: '',
    ubicacion: '',
    fecha_inicio: '',
    fecha_fin: '',
    notas: '',
    activa: true,
  })

  async function fetchData() {
    setLoading(true)
    try {
      const feriasRes = await fetch('/api/ferias')
      if (feriasRes.ok) {
        const d = await feriasRes.json()
        setFerias(d.ferias || [])
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error cargando')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // On first mount, fire-and-forget the historical auto-match (idempotent —
    // only touches invoices that have assigned_feria_id IS NULL). Then refresh
    // the list once it completes so any new counts show up.
    let cancelled = false
    ;(async () => {
      await fetchData()
      try {
        const res = await fetch('/api/ferias/auto-match-excel', { method: 'POST' })
        if (!cancelled && res.ok) {
          const data = await res.json()
          if (data?.stats?.matched > 0) {
            await fetchData()
          }
        }
      } catch {}
    })()
    return () => { cancelled = true }
  }, [])

  function openNew() {
    setForm({
      id: undefined,
      nombre: '',
      ubicacion: '',
      fecha_inicio: '',
      fecha_fin: '',
      notas: '',
      activa: true,
    })
    setError(null)
    setDialogOpen(true)
  }

  function openEdit(f: Feria) {
    setForm({
      id: f.id,
      nombre: f.nombre,
      ubicacion: f.ubicacion || '',
      fecha_inicio: f.fecha_inicio,
      fecha_fin: f.fecha_fin,
      notas: f.notas || '',
      activa: f.activa,
    })
    setError(null)
    setDialogOpen(true)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/ferias', {
        method: form.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Error guardando')
      setDialogOpen(false)
      await fetchData()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setSaving(false)
    }
  }

  async function deleteFeria(id: string) {
    if (!confirm('¿Eliminar esta feria?')) return
    try {
      await fetch(`/api/ferias?id=${id}`, { method: 'DELETE' })
      await fetchData()
    } catch {}
  }


  const today = new Date().toISOString().slice(0, 10)
  const activas = ferias.filter(f => f.activa && f.fecha_fin >= today)
  const enCurso = ferias.filter(f => f.activa && f.fecha_inicio <= today && f.fecha_fin >= today)
  const proximas = ferias.filter(f => f.activa && f.fecha_inicio > today)

  return (
    <div className="min-h-screen bg-[#FFFFFF]">
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
            <Button variant="ghost" className="rounded-none border-b-2 border-[#1DA9EF] text-[#1A2238] py-4"><Tent className="h-4 w-4 mr-2" />Ferias</Button>
            <Link href="/dashboard/conciliacion"><Button variant="ghost" className="rounded-none border-b-2 border-transparent hover:border-[#1DA9EF] py-4"><FileText className="h-4 w-4 mr-2" />Conciliación</Button></Link>
            <Link href="/dashboard/analitica"><Button variant="ghost" className="rounded-none border-b-2 border-transparent hover:border-[#1DA9EF] py-4"><TrendingUp className="h-4 w-4 mr-2" />Analítica</Button></Link>
            <Link href="/dashboard/productos"><Button variant="ghost" className="rounded-none border-b-2 border-transparent hover:border-[#1DA9EF] py-4"><Package className="h-4 w-4 mr-2" />Productos</Button></Link>
            <Link href="/dashboard/inventario"><Button variant="ghost" className="rounded-none border-b-2 border-transparent hover:border-[#1DA9EF] py-4"><Boxes className="h-4 w-4 mr-2" />Inventario</Button></Link>
            <Link href="/dashboard/configuracion"><Button variant="ghost" className="rounded-none border-b-2 border-transparent hover:border-[#1DA9EF] py-4"><Settings className="h-4 w-4 mr-2" />Configuración</Button></Link>
          </nav>
        </div>
      </div>

      <main className="container mx-auto px-4 py-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-bold text-[#1A2238] mb-2">Ferias y Eventos</h1>
            <p className="text-[#545454]">Pop-ups, ferias y eventos donde llevás inventario.</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={openNew} className="bg-[#1DA9EF] hover:bg-[#0073D1] text-white font-medium">
                <Plus className="h-4 w-4 mr-2" />Nueva Feria
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{form.id ? 'Editar feria' : 'Nueva feria'}</DialogTitle>
              </DialogHeader>
              <form onSubmit={submit} className="space-y-4">
                <div>
                  <Label htmlFor="nombre">Nombre *</Label>
                  <Input
                    id="nombre"
                    value={form.nombre}
                    onChange={e => setForm({ ...form, nombre: e.target.value })}
                    placeholder="Ej: Feria Hecho en Casa"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="ubicacion">Ubicación</Label>
                  <Input
                    id="ubicacion"
                    value={form.ubicacion}
                    onChange={e => setForm({ ...form, ubicacion: e.target.value })}
                    placeholder="Ej: Corferias Bogotá"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="fecha_inicio">Fecha inicio *</Label>
                    <Input
                      id="fecha_inicio"
                      type="date"
                      value={form.fecha_inicio}
                      onChange={e => setForm({ ...form, fecha_inicio: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="fecha_fin">Fecha fin *</Label>
                    <Input
                      id="fecha_fin"
                      type="date"
                      value={form.fecha_fin}
                      onChange={e => setForm({ ...form, fecha_fin: e.target.value })}
                      required
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="notas">Notas</Label>
                  <Textarea
                    id="notas"
                    value={form.notas}
                    onChange={e => setForm({ ...form, notas: e.target.value })}
                    placeholder="Detalles adicionales..."
                    rows={3}
                  />
                </div>
                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">{error}</div>
                )}
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancelar</Button>
                  <Button type="submit" disabled={saving} className="bg-[#1DA9EF] hover:bg-[#0073D1]">
                    {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Guardando</> : (form.id ? 'Guardar' : 'Crear')}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid gap-4 md:grid-cols-3 mb-6">
          <Card className="border-t-4 border-t-[#1DA9EF]">
            <CardHeader className="pb-2"><CardTitle className="text-sm text-[#545454]">Total ferias</CardTitle></CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-[#1A2238]">{ferias.length}</div>
              <p className="text-xs text-[#545454]">{activas.length} próximas o en curso</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-[#545454]">En curso</CardTitle></CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-700">{enCurso.length}</div>
              <p className="text-xs text-[#545454]">activas hoy</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-[#545454]">Próximas</CardTitle></CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-[#0073D1]">{proximas.length}</div>
              <p className="text-xs text-[#545454]">aún por empezar</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Listado</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-[#1DA9EF]" />
              </div>
            ) : ferias.length === 0 ? (
              <div className="text-center py-12 text-[#545454]">
                <Tent className="h-12 w-12 mx-auto mb-3 text-[#D1D5DB]" />
                <p className="mb-4">Aún no hay ferias registradas</p>
                <Button onClick={openNew} className="bg-[#1DA9EF] hover:bg-[#0073D1] text-white">
                  <Plus className="h-4 w-4 mr-2" />Crear la primera feria
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Estado</TableHead>
                      <TableHead>Nombre</TableHead>
                      <TableHead>Ubicación</TableHead>
                      <TableHead>Fechas</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ferias.map(f => {
                      const st = feriaStatus(f)
                      return (
                        <TableRow key={f.id}>
                          <TableCell>
                            <Badge className={`${st.color} font-medium`}>{st.label}</Badge>
                          </TableCell>
                          <TableCell>
                            <div className="font-medium text-[#1A2238]">{f.nombre}</div>
                            {f.notas && <div className="text-xs text-[#545454] mt-0.5">{f.notas}</div>}
                          </TableCell>
                          <TableCell className="text-sm text-[#545454]">
                            {f.ubicacion ? (
                              <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{f.ubicacion}</span>
                            ) : '—'}
                          </TableCell>
                          <TableCell className="text-sm">
                            <div className="inline-flex items-center gap-1">
                              <Calendar className="h-3 w-3 text-[#545454]" />
                              <span>{format(new Date(f.fecha_inicio + 'T12:00:00'), 'dd MMM yyyy')}</span>
                              <span className="text-[#545454]">→</span>
                              <span>{format(new Date(f.fecha_fin + 'T12:00:00'), 'dd MMM yyyy')}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <Link href={`/dashboard/ferias/${f.id}`}>
                              <Button size="sm" className="bg-[#F59E0B] hover:bg-[#D97706] text-white mr-1">
                                Ver facturas
                              </Button>
                            </Link>
                            <Button size="sm" variant="outline" onClick={() => openEdit(f)}>
                              <Pencil className="h-3 w-3 mr-1" />Editar
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => deleteFeria(f.id)} className="ml-1 text-red-600 hover:text-red-700 hover:bg-red-50">
                              Eliminar
                            </Button>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  )
}

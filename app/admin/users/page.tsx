'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Plus, Loader2, UserPlus, Trash2, Edit } from 'lucide-react'

interface User {
  id: string
  email: string
  full_name: string | null
  company_name: string | null
  role: string
  onboarding_completed: boolean
  created_at: string
}

interface Integration {
  user_id: string
  shopify_shop: string | null
  envioclick_api_key: string | null
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [integrations, setIntegrations] = useState<Record<string, Integration>>({})
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [creating, setCreating] = useState(false)

  // Form state
  const [formEmail, setFormEmail] = useState('')
  const [formPassword, setFormPassword] = useState('')
  const [formFullName, setFormFullName] = useState('')
  const [formCompany, setFormCompany] = useState('')
  const [formRole, setFormRole] = useState('user')

  const supabase = createClient()

  async function fetchUsers() {
    setLoading(true)

    // Use API to fetch profiles (bypasses RLS)
    const profilesRes = await fetch('/api/admin/profiles')
    if (profilesRes.ok) {
      const users = await profilesRes.json()
      setUsers(users)
    }

    // Use API to fetch integrations
    const integrationsRes = await fetch('/api/admin/integrations')
    if (integrationsRes.ok) {
      const integrationsData = await integrationsRes.json()
      const integrationsMap: Record<string, Integration> = {}
      integrationsData.forEach((i: Integration) => {
        integrationsMap[i.user_id] = i
      })
      setIntegrations(integrationsMap)
    }

    setLoading(false)
  }

  useEffect(() => {
    fetchUsers()
  }, [])

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault()
    setCreating(true)

    try {
      // Create user via Supabase Auth Admin API
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: formEmail,
          password: formPassword,
          full_name: formFullName,
          company_name: formCompany,
          role: formRole,
        }),
      })

      if (res.ok) {
        setDialogOpen(false)
        setFormEmail('')
        setFormPassword('')
        setFormFullName('')
        setFormCompany('')
        setFormRole('user')
        fetchUsers()
      } else {
        const data = await res.json()
        alert(data.error || 'Error al crear usuario')
      }
    } catch (error) {
      console.error('Error creating user:', error)
      alert('Error al crear usuario')
    }

    setCreating(false)
  }

  async function handleDeleteUser(userId: string, email: string) {
    if (!confirm(`¿Eliminar usuario ${email}? Esta acción no se puede deshacer.`)) {
      return
    }

    const res = await fetch(`/api/admin/users?id=${userId}`, {
      method: 'DELETE',
    })

    if (res.ok) {
      fetchUsers()
    } else {
      const data = await res.json()
      alert(data.error || 'Error al eliminar usuario')
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-[#233037]">Usuarios</h1>
          <p className="text-[#71828A]">Gestión de usuarios de la plataforma</p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-[#00D47F] hover:bg-[#00D47F]/90 text-[#233037]">
              <UserPlus className="h-4 w-4 mr-2" />
              Crear Usuario
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Crear Nuevo Usuario</DialogTitle>
              <DialogDescription>
                Crea una cuenta para un nuevo usuario de la plataforma
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreateUser} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email *</Label>
                <Input
                  id="email"
                  type="email"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Contraseña *</Label>
                <Input
                  id="password"
                  type="password"
                  value={formPassword}
                  onChange={(e) => setFormPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fullName">Nombre Completo</Label>
                <Input
                  id="fullName"
                  value={formFullName}
                  onChange={(e) => setFormFullName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="company">Empresa</Label>
                <Input
                  id="company"
                  value={formCompany}
                  onChange={(e) => setFormCompany(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="role">Rol</Label>
                <Select value={formRole} onValueChange={setFormRole}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">Usuario</SelectItem>
                    <SelectItem value="admin">Administrador</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  className="bg-[#00D47F] hover:bg-[#00D47F]/90 text-[#233037]"
                  disabled={creating}
                >
                  {creating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Crear
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Lista de Usuarios</CardTitle>
          <CardDescription>Todos los usuarios registrados en la plataforma</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-[#00D47F]" />
            </div>
          ) : users.length === 0 ? (
            <p className="text-[#71828A] text-center py-8">No hay usuarios registrados</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usuario</TableHead>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Rol</TableHead>
                  <TableHead>Shopify</TableHead>
                  <TableHead>Onboarding</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{user.full_name || '-'}</p>
                        <p className="text-sm text-[#71828A]">{user.email}</p>
                      </div>
                    </TableCell>
                    <TableCell>{user.company_name || '-'}</TableCell>
                    <TableCell>
                      <span className={`text-xs px-2 py-1 rounded ${
                        user.role === 'admin' ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'
                      }`}>
                        {user.role}
                      </span>
                    </TableCell>
                    <TableCell>
                      {integrations[user.id]?.shopify_shop ? (
                        <span className="text-xs bg-green-100 text-green-600 px-2 py-1 rounded">
                          {integrations[user.id].shopify_shop}
                        </span>
                      ) : (
                        <span className="text-xs text-[#71828A]">No conectado</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {user.onboarding_completed ? (
                        <span className="text-xs bg-green-100 text-green-600 px-2 py-1 rounded">Completo</span>
                      ) : (
                        <span className="text-xs bg-yellow-100 text-yellow-600 px-2 py-1 rounded">Pendiente</span>
                      )}
                    </TableCell>
                    <TableCell className="text-[#71828A]">
                      {new Date(user.created_at).toLocaleDateString('es-CO')}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-red-500 hover:text-red-700"
                        onClick={() => handleDeleteUser(user.id, user.email)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

import { createClient as createServiceClient } from '@supabase/supabase-js'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Users, Store, ShoppingCart, DollarSign } from 'lucide-react'

// Service client to bypass RLS
function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export default async function AdminDashboard() {
  const supabase = getServiceClient()

  // Get stats
  const { count: usersCount } = await supabase
    .from('profiles')
    .select('*', { count: 'exact', head: true })

  const { count: integrationsCount } = await supabase
    .from('user_integrations')
    .select('*', { count: 'exact', head: true })
    .not('shopify_shop', 'is', null)

  const { data: recentUsers } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(5)

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-[#233037]">Admin Dashboard</h1>
        <p className="text-[#71828A]">Vista general de la plataforma</p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-[#71828A]">Total Usuarios</CardTitle>
            <Users className="h-4 w-4 text-[#71828A]" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-[#233037]">{usersCount || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-[#71828A]">Tiendas Conectadas</CardTitle>
            <Store className="h-4 w-4 text-[#71828A]" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-[#233037]">{integrationsCount || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-[#71828A]">Órdenes Hoy</CardTitle>
            <ShoppingCart className="h-4 w-4 text-[#71828A]" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-[#233037]">-</div>
            <p className="text-xs text-[#71828A]">Próximamente</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-[#71828A]">Ventas Totales</CardTitle>
            <DollarSign className="h-4 w-4 text-[#71828A]" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-[#233037]">-</div>
            <p className="text-xs text-[#71828A]">Próximamente</p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Users */}
      <Card>
        <CardHeader>
          <CardTitle>Usuarios Recientes</CardTitle>
          <CardDescription>Últimos usuarios registrados</CardDescription>
        </CardHeader>
        <CardContent>
          {recentUsers && recentUsers.length > 0 ? (
            <div className="space-y-4">
              {recentUsers.map((user) => (
                <div key={user.id} className="flex items-center justify-between border-b pb-4 last:border-0">
                  <div>
                    <p className="font-medium">{user.full_name || user.email}</p>
                    <p className="text-sm text-[#71828A]">{user.email}</p>
                  </div>
                  <div className="text-right">
                    <span className={`text-xs px-2 py-1 rounded ${
                      user.role === 'admin' ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'
                    }`}>
                      {user.role}
                    </span>
                    <p className="text-xs text-[#71828A] mt-1">
                      {new Date(user.created_at).toLocaleDateString('es-CO')}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[#71828A] text-center py-8">No hay usuarios registrados aún</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

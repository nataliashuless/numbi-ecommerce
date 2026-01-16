'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Loader2, Store, Truck, Check, X } from 'lucide-react'

interface Integration {
  id: string
  user_id: string
  shopify_shop: string | null
  shopify_connected_at: string | null
  envioclick_api_key: string | null
  created_at: string
  profiles: {
    email: string
    full_name: string | null
    company_name: string | null
  }
}

export default function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<Integration[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    async function fetchIntegrations() {
      // Fetch integrations via API (bypasses RLS)
      const integrationsRes = await fetch('/api/admin/integrations')
      const profilesRes = await fetch('/api/admin/profiles')

      if (integrationsRes.ok && profilesRes.ok) {
        const integrationsData = await integrationsRes.json()
        const profilesData = await profilesRes.json()

        // Map profiles by user_id
        const profilesMap: Record<string, any> = {}
        profilesData.forEach((p: any) => {
          profilesMap[p.id] = p
        })

        // Join integrations with profiles
        const integrationsWithProfiles = integrationsData.map((i: any) => ({
          ...i,
          profiles: profilesMap[i.user_id] || null
        }))

        setIntegrations(integrationsWithProfiles as Integration[])
      }
      setLoading(false)
    }

    fetchIntegrations()
  }, [])

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-[#233037]">Integraciones</h1>
        <p className="text-[#71828A]">Estado de las integraciones de todos los usuarios</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-[#71828A]">Tiendas Shopify</CardTitle>
            <Store className="h-4 w-4 text-[#71828A]" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-[#233037]">
              {integrations.filter(i => i.shopify_shop).length}
            </div>
            <p className="text-xs text-[#71828A]">conectadas</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-[#71828A]">EnvioClick</CardTitle>
            <Truck className="h-4 w-4 text-[#71828A]" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-[#233037]">
              {integrations.filter(i => i.envioclick_api_key).length}
            </div>
            <p className="text-xs text-[#71828A]">configurados</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Todas las Integraciones</CardTitle>
          <CardDescription>Vista de integraciones por usuario</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-[#00D47F]" />
            </div>
          ) : integrations.length === 0 ? (
            <p className="text-[#71828A] text-center py-8">No hay integraciones configuradas</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usuario</TableHead>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Shopify</TableHead>
                  <TableHead>EnvioClick</TableHead>
                  <TableHead>Fecha</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {integrations.map((integration) => (
                  <TableRow key={integration.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{integration.profiles?.full_name || '-'}</p>
                        <p className="text-sm text-[#71828A]">{integration.profiles?.email}</p>
                      </div>
                    </TableCell>
                    <TableCell>{integration.profiles?.company_name || '-'}</TableCell>
                    <TableCell>
                      {integration.shopify_shop ? (
                        <div className="flex items-center gap-2">
                          <Check className="h-4 w-4 text-green-500" />
                          <span className="text-xs">{integration.shopify_shop}</span>
                        </div>
                      ) : (
                        <X className="h-4 w-4 text-red-400" />
                      )}
                    </TableCell>
                    <TableCell>
                      {integration.envioclick_api_key ? (
                        <Check className="h-4 w-4 text-green-500" />
                      ) : (
                        <X className="h-4 w-4 text-red-400" />
                      )}
                    </TableCell>
                    <TableCell className="text-[#71828A]">
                      {new Date(integration.created_at).toLocaleDateString('es-CO')}
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

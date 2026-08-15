# AGENTS.md — Shuless Admin (numbi-ecommerce)

Guía para agentes de código (Codex, Claude Code, etc.) que trabajen en este repo.

## Qué es
Panel interno (admin) de **Shuless** — marca de calzado infantil. Consolida ventas,
inventario y forecast cruzando **Shopify + Siigo (contabilidad) + WhatsApp + tiendas de
terceros (consignación) + ferias**. Single-tenant: el dueño/admin es `natalia@shuless.co`.

## Stack
- **Next.js 16** (App Router) + React 19 + TypeScript, build con **Turbopack**
- **Supabase** (Postgres + Auth + RLS) — cliente admin con service role
- **Tailwind** + shadcn/ui + lucide-react + Recharts + date-fns + xlsx
- Deploy: **Vercel** (push a `main` → deploy automático a shuless.vercel.app)

## Cómo correr local
```bash
npm install
npm run dev          # http://localhost:3000
npm run build        # SIEMPRE correr antes de pushear — el deploy es automático
```
Necesitás un `.env.local` con las llaves (pedilas por 1Password / Vercel `vercel env pull`).
Mínimo: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `SHOPIFY_API_KEY/SECRET/SCOPES/HOST`, `OPENAI_API_KEY`,
`ENVIOCLICKPRO_API_KEY`.

## Reglas de oro (aprendidas a los golpes)
1. **`main` deploya solo.** Un push que no compila rompe el sitio en vivo.
   Trabajá en rama + PR, o mínimo corré `npm run build` antes de pushear.
2. **Las migraciones NO se aplican solas.** Los archivos en `supabase/migrations/*.sql`
   son historial; hay que correr el SQL **a mano en el SQL Editor de Supabase**.
   Después de crear una migración, pega el SQL y avisale al humano que la corra.
3. **Credenciales de Siigo/Shopify viven en la BD** (`user_integrations`), NO en env.
   Se cargan desde `/dashboard/configuracion`. El código las lee con los helpers de
   `lib/auth-helpers.ts` (`getShopifyCredentials`, `getSiigoCredentials`, etc.).
4. **PostgREST corta en 1000 filas** por defecto. Para tablas grandes (siigo_invoices,
   siigo_product_stock) hay que **paginar con `.range()`** en loop (ver patrones existentes).
5. **Hidratación:** inicializá valores dinámicos de fecha en `useEffect`, no en `useState`,
   para no romper con mismatch de SSR.

## Modelo de datos clave
- `siigo_invoices` — facturas (cache). `assigned_feria_id` marca ventas de feria.
  `credited_amount` >= total = anulada (excluir).
- `siigo_product_stock` — stock por (producto, bodega). `account_group_id=339` = producto
  terminado (filtrar materias primas). **Bodega propia** = principal (id 27) + cualquier
  bodega cuyo nombre matchee `/ekho|eko\b/i` (ej. "Bodega Bogota EKHO"). El resto con stock
  = consignado en tiendas.
- `shopify_orders` — órdenes (cache). Se usan para clasificar canal por `#orderNumber`.
- `tiendas_terceros` — tiendas de consignación; `siigo_customer_identification` (NIT) y
  `siigo_warehouse_id` las ligan a Siigo.
- `ferias` / `production_orders` (+ `_items`) — eventos y órdenes de producción en camino.

## Clasificación de canal (una factura Siigo → canal)
Prioridad: `assigned_feria_id` → **feria** · NIT de tienda → **tienda** · `#orden` que
matchea Shopify → **shopify** · fecha dentro de ventana de feria → **feria** · resto →
**whatsapp**. En la UI Shopify+WhatsApp se muestran juntos como **Online**.

## Sincronización de caches
Los caches (siigo_invoices, shopify_orders, siigo_product_stock) se auto-refrescan al abrir
las páginas: `POST /api/{siigo/sync-invoices | shopify/sync-orders}` con `{auto:true}` (salta
si <1h, si no trae últimos 45 días). El sync histórico completo está en Conciliación.

## Estructura
- `app/dashboard/*` — páginas (ventas, shopify, whatsapp, tiendas, ferias, marketing,
  conciliación, analítica, productos, inventario, configuración)
- `app/api/*` — endpoints (siigo/, shopify/, ferias/, tiendas/, analitica/, produccion/, meta/, ga4/)
- `lib/auth-helpers.ts` — auth + clientes Supabase + credenciales de integraciones
- `supabase/migrations/` — SQL de esquema (aplicar a mano)

## Antes de dar por terminado
- `npm run build` pasa sin errores.
- Si tocaste esquema: dejá el SQL de la migración listo y avisá que hay que correrlo en Supabase.
- Commit claro; push a `main` (o PR) — recordá que main va a producción.

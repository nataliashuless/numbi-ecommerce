import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import * as demandModel from '../lib/forecast/demand-model.ts'
import * as calendar from '../lib/forecast/calendar.ts'

// Exercise the actual endpoint with isolated database records. Excluded store
// invoices must never become direct demand when their NIT is still recognized.
const date = '2026-10-05'
class AuditDate extends Date {
  constructor(...args) { super(...(args.length ? args : ['2026-10-05T12:00:00Z'])) }
}
const stores = [
  { id: 'a', nombre: 'A', siigo_customer_identification: '111', siigo_warehouse_id: 30 },
  { id: 'b', nombre: 'B', siigo_customer_identification: '222', siigo_warehouse_id: 31 },
]
const invoice = (id, nit, quantity) => ({ id, date, customer_identification: nit, observations: '', items: [{ code: 'P20', quantity }], total: 100, credited_amount: 0, assigned_feria_id: null })
const tables = {
  ferias: [],
  shopify_orders: [],
  tiendas_terceros: stores,
  siigo_product_stock: [{ product_code: 'P20', product_name: 'Prueba Talla 20', warehouse_id: 27, warehouse_name: 'Principal', quantity: 0 }],
  siigo_invoices: [invoice('direct', '333', 4), invoice('a', '111', 100), invoice('b', '222', 200)],
  ventas_terceros: [{ tienda_id: 'a', producto_sku: 'P20', fecha: date, cantidad: 7 }],
}
const queryErrors = new Map()
const db = { from(table) {
  // Explicit fixture defaults keep real equality filters meaningful.
  let rows = (tables[table] || []).map(row => ({
    ...(table === 'siigo_product_stock' ? { account_group_id: 339 } : {}),
    ...(table === 'tiendas_terceros' ? { activa: true } : {}),
    ...row,
  }))
  const query = new Proxy({}, { get(_, key) {
    if (key === 'then') return resolve => resolve({ data: queryErrors.has(table) ? null : rows, error: queryErrors.get(table) || null })
    return (...args) => {
      if (key === 'eq') rows = rows.filter(row => row[args[0]] === args[1])
      if (key === 'in') rows = rows.filter(row => args[1].includes(row[args[0]]))
      if (key === 'range') rows = rows.slice(args[0], Math.min(args[1] + 1, args[0] + 1000))
      if (key === 'gte') rows = rows.filter(row => row[args[0]] >= args[1])
      if (key === 'lte') rows = rows.filter(row => row[args[0]] <= args[1])
      return query
    }
  } })
  return query
} }
tables.siigo_product_stock.push({ product_code: 'EX20', product_name: 'Exclusivo Talla 20', warehouse_id: 27, warehouse_name: 'Principal', quantity: 1 })
tables.siigo_invoices[1].items.push({ code: 'EX20', quantity: 100 })
const responseStatus = new WeakMap()
const exports = {}
const source = fs.readFileSync(new URL('../app/api/forecast/route.ts', import.meta.url), 'utf8')
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
  exports, URL, console, Date: AuditDate, require(name) {
    if (name === 'next/server') return { NextResponse: { json: (value, options) => { responseStatus.set(value, options?.status || 200); return value } } }
    if (name === '@/lib/auth-helpers') return { requireAuth: async () => ({}), getAdminClient: () => db }
    if (name === '@/lib/forecast/demand-model') return demandModel
    if (name === '@/lib/forecast/calendar') return calendar
    throw new Error(name)
  },
})
const calculate = (excluded = '', extra = '') => exports.GET({ url: `https://example.test/api/forecast?dias=90&excluir_tiendas=${excluded}${extra}` })

test('store selection excludes invoices and sell-through without reclassifying direct sales', async () => {
  const all = await calculate('')
  const onlyB = await calculate('a')
  const none = await calculate('a,b')
  assert.equal(all.forecast.find(row => row.sku === 'P20').ventasTiendas, 300)
  assert.equal(onlyB.forecast.find(row => row.sku === 'P20').ventasTiendas, 200)
  assert.equal(none.forecast.find(row => row.sku === 'P20').ventasTiendas, 0)
  for (const result of [all, onlyB, none]) {
    assert.equal(result.forecast.find(row => row.sku === 'P20').ventasWhatsApp, 4)
    assert.equal(result.forecast.find(row => row.sku === 'P20').ventasShopify, 0)
    assert.equal(result.tiendasForecast.length, 2)
  }
  assert.equal(none.forecast.find(row => row.sku === 'P20').enviarTiendas, 0)
  assert.equal(none.forecast.find(row => row.sku === 'P20').enviosTiendas.length, 0)
  assert.equal(none.forecast.find(row => row.sku === 'EX20').velocidadDiaria, 0)
  assert.equal(none.tiendasForecast.every(store => !store.incluida), true)
  assert.equal(onlyB.forecast.find(row => row.sku === 'P20').enviosTiendas.every(store => store.tiendaId === 'b'), true)
})


test('open month subtracts actual sales once and does not depress future completed-month forecasts', async () => {
  const original = { ...tables }
  try {
    tables.tiendas_terceros = []
    tables.ventas_terceros = []
    tables.siigo_product_stock = [{ product_code: 'P20', product_name: 'Prueba Talla 20', warehouse_id: 27, warehouse_name: 'Principal', quantity: 80 }]
    tables.siigo_invoices = Array.from({ length: 24 }, (_, i) => ({
      ...invoice(`history-${i}`, '333', 100),
      date: new Date(Date.UTC(2024, 9 + i, 15)).toISOString().slice(0, 10),
    }))
    tables.siigo_invoices.push(invoice('current', '333', 20))
    const result = await calculate('')
    const variant = result.forecast[0]
    // October 100 - 20, plus November/December/January 100 each.
    assert.equal(Math.round(variant.velocidadDiaria * result.metodologia.protectionDays), 380)
    assert.equal(variant.stockBodega, 80)
    tables.siigo_invoices.at(-1).items[0].quantity = 120
    const overTarget = await calculate('')
    assert.equal(Math.round(overTarget.forecast[0].velocidadDiaria * overTarget.metodologia.protectionDays), 300)
    assert.equal(overTarget.forecast[0].stockBodega, 80)
  } finally { Object.assign(tables, original) }
})

test('Shopify history survives coincident fair dates, pagination, and explicit fair priority', async () => {
  const original = { ...tables }
  try {
    tables.tiendas_terceros = []
    tables.ventas_terceros = []
    tables.siigo_product_stock = [original.siigo_product_stock[0]]
    tables.shopify_orders = Array.from({ length: 1001 }, (_, i) => ({ id: i, order_number: i + 1 }))
    tables.siigo_invoices = Array.from({ length: 24 }, (_, i) => ({
      ...invoice(`history-${i}`, '333', 100), observations: '#1001',
      date: new Date(Date.UTC(2024, 9 + i, 15)).toISOString().slice(0, 10),
    }))
    tables.siigo_invoices.push({ ...invoice('current', '333', 20), observations: '#1001' })
    const baseline = await calculate('')
    tables.ferias = [{ fecha_inicio: '2024-10-01', fecha_fin: date }]
    const coincident = await calculate('')
    assert.equal(coincident.forecast[0].velocidadDiaria, baseline.forecast[0].velocidadDiaria)
    assert.equal(coincident.forecast[0].ventasShopify, baseline.forecast[0].ventasShopify)
    assert.ok(coincident.forecast[0].ventasShopify > 0)
    tables.siigo_invoices.at(-1).assigned_feria_id = 'explicit'
    const explicit = await calculate('')
    assert.equal(explicit.forecast[0].ventasShopify, baseline.forecast[0].ventasShopify - 20)
    assert.equal(explicit.forecast[0].ventasFerias, 20)
  } finally { Object.assign(tables, original) }
})


const stock = (sku, size, quantity, warehouse = 27) => ({
  product_code: sku, product_name: `Prueba Talla ${size}`, warehouse_id: warehouse,
  warehouse_name: warehouse === 27 ? 'Principal' : 'Tienda A', quantity,
})
const steadyHistory = (nit, sku, quantity) => Array.from({ length: 24 }, (_, i) => ({
  ...invoice(`${nit}-${sku}-${i}`, nit, quantity),
  date: new Date(Date.UTC(2024, 9 + i, 15)).toISOString().slice(0, 10),
  items: [{ code: sku, quantity }],
}))
function isolatedSupplyFixture() {
  tables.ferias = []
  tables.shopify_orders = []
  tables.tiendas_terceros = []
  tables.ventas_terceros = []
  tables.siigo_product_stock = [stock('P20', '20', 0)]
  tables.siigo_invoices = steadyHistory('333', 'P20', 31)
  tables.production_orders = []
  tables.production_order_items = []
}

test('direct demand keeps its own size curve when stores sell a different size', async () => {
  const original = { ...tables }
  try {
    isolatedSupplyFixture()
    tables.tiendas_terceros = [stores[0]]
    tables.siigo_product_stock = [stock('P20', '20', 500), stock('P21', '21', 0), stock('P20', '20', 10000, 30), stock('P21', '21', 10000, 30)]
    tables.siigo_invoices = [...steadyHistory('333', 'P20', 100), ...steadyHistory('111', 'P21', 900)]
    const result = await calculate('', '&stock_seguridad=0')
    assert.equal(result.forecast.find(row => row.sku === 'P21').sugerenciaProduccion, 0,
      'store size mix must not create online demand for talla21')
    assert.equal(result.resumen.totalProducirSugerido, 0)
  } finally { Object.keys(tables).forEach(key => delete tables[key]); Object.assign(tables, original) }
})

test('failed production order or item reads do not return an apparently valid forecast', async () => {
  const original = { ...tables }
  try {
    isolatedSupplyFixture()
    tables.production_orders = [{ id: 'pending', numero: '032', estado: 'pendiente', fecha_entrega: '2026-11-01' }]
    for (const table of ['production_orders', 'production_order_items']) {
      queryErrors.set(table, { message: `unavailable ${table}` })
      const result = await calculate()
      assert.equal(result.forecast, undefined, `${table} failure must stop recommendations`)
      assert.match(result.error, new RegExp(table))
      assert.equal(responseStatus.get(result), 500)
      queryErrors.delete(table)
    }
  } finally { queryErrors.clear(); Object.keys(tables).forEach(key => delete tables[key]); Object.assign(tables, original) }
})

test('received order already in Siigo is not counted as additional inbound supply', async () => {
  const original = { ...tables }
  try {
    isolatedSupplyFixture()
    tables.siigo_product_stock = [stock('P20', '20', 10)]
    const baseline = await calculate('', '&stock_seguridad=0')
    tables.production_orders = [
      { id: 'received', numero: '031', estado: 'recibida', fecha_entrega: '2026-09-26' },
      { id: 'cancelled', numero: '099', estado: 'cancelada', fecha_entrega: '2026-10-05' },
    ]
    tables.production_order_items = [
      { id: 'received-item', order_id: 'received', diseno: 'Prueba', talla: '20', cantidad: 174 },
      { id: 'cancelled-item', order_id: 'cancelled', diseno: 'Prueba', talla: '20', cantidad: 1000 },
    ]
    const result = await calculate('', '&stock_seguridad=0')
    assert.equal(result.forecast[0].stockBodega, 10)
    assert.equal(result.forecast[0].enCamino, 0)
    assert.equal(result.forecast[0].sugerenciaProduccion, baseline.forecast[0].sugerenciaProduccion)
  } finally { Object.keys(tables).forEach(key => delete tables[key]); Object.assign(tables, original) }
})

test('dated inbound only offsets its matching size and demand that occurs after arrival', async () => {
  const original = { ...tables }
  try {
    isolatedSupplyFixture()
    const baseline = await calculate('', '&stock_seguridad=0')
    tables.production_orders = [{ id: 'pending', numero: '032', estado: 'pendiente', fecha_entrega: '2026-10-05' }]
    tables.production_order_items = [
      { id: 'matching', order_id: 'pending', diseno: 'Prueba', talla: '20', cantidad: 1000 },
      { id: 'unrelated-order', order_id: 'not-requested', diseno: 'Prueba', talla: '20', cantidad: 1000 },
    ]
    const timely = await calculate('', '&stock_seguridad=0')
    assert.equal(timely.forecast[0].enCamino, 1000, 'items outside queried order IDs must not leak in')
    assert.equal(timely.forecast[0].sugerenciaProduccion, 0)
    assert.equal(timely.forecast[0].faltanteAntesLlegada, 0)
    tables.production_orders[0].fecha_entrega = '2027-01-15'
    const midJanuary = await calculate('', '&stock_seguridad=0')
    assert.ok(midJanuary.forecast[0].sugerenciaProduccion > 0, 'supply on January15 cannot serve earlier demand')
    assert.ok(midJanuary.forecast[0].sugerenciaProduccion < baseline.forecast[0].sugerenciaProduccion, 'January15 supply covers remaining January demand')
    assert.equal(midJanuary.forecast[0].faltanteAntesLlegada, baseline.forecast[0].faltanteAntesLlegada)
    tables.production_orders[0].fecha_entrega = '2027-02-01'
    const late = await calculate('', '&stock_seguridad=0')
    assert.equal(late.forecast[0].sugerenciaProduccion, baseline.forecast[0].sugerenciaProduccion)
    assert.equal(late.forecast[0].faltanteAntesLlegada, baseline.forecast[0].faltanteAntesLlegada)
    tables.production_orders[0].fecha_entrega = '2026-10-05'
    tables.production_order_items[0].talla = '21'
    const wrongSize = await calculate('', '&stock_seguridad=0')
    assert.equal(wrongSize.forecast[0].enCamino, 0)
    assert.equal(wrongSize.forecast[0].sugerenciaProduccion, baseline.forecast[0].sugerenciaProduccion)
    assert.ok(baseline.forecast[0].sugerenciaProduccion > 0)
  } finally { Object.keys(tables).forEach(key => delete tables[key]); Object.assign(tables, original) }
})


test('inactive store history remains excluded instead of becoming online demand', async () => {
  const original = { ...tables }
  try {
    isolatedSupplyFixture()
    tables.tiendas_terceros = [{ ...stores[0], activa: false }]
    tables.siigo_invoices = [...steadyHistory('111', 'P20', 100), invoice('current-inactive', '111', 20)]
    const result = await calculate('', '&stock_seguridad=0')
    const row = result.forecast.find(variant => variant.sku === 'P20')
    assert.equal(row.ventasWhatsApp, 0)
    assert.equal(row.ventasTiendas, 0)
    assert.equal(row.velocidadDiaria, 0)
    assert.equal(row.sugerenciaProduccion, 0)
    assert.equal(result.tiendasForecast.length, 0)
  } finally { Object.keys(tables).forEach(key => delete tables[key]); Object.assign(tables, original) }
})

test('all pending order items are read beyond the Supabase 1000-row cap', async () => {
  const original = { ...tables }
  try {
    isolatedSupplyFixture()
    tables.production_orders = [{ id: 'pending', numero: '032', estado: 'pendiente', fecha_entrega: '2026-11-01' }]
    tables.production_order_items = Array.from({ length: 1001 }, (_, index) => ({
      id: `item-${index}`, order_id: 'pending', diseno: 'Prueba', talla: '20', cantidad: 1,
    }))
    const result = await calculate('', '&stock_seguridad=0')
    assert.equal(result.forecast[0].enCamino, 1001)
    assert.equal(result.enCamino.totalUnidades, 1001)
    assert.equal(result.enCamino.matchUnidades, 1001)
  } finally { Object.keys(tables).forEach(key => delete tables[key]); Object.assign(tables, original) }
})

test('endpoint uses previous November December and January and subtracts current-month actual once', async () => {
  const original = { ...tables }
  try {
    tables.tiendas_terceros = []
    tables.ventas_terceros = []
    tables.siigo_product_stock = [original.siigo_product_stock[0]]
    tables.siigo_invoices = Array.from({ length: 24 }, (_, i) => ({
      ...invoice(`annual-${i}`, '333', i === 13 ? 36 : i === 14 ? 26 : i === 15 ? 12 : 8),
      date: new Date(Date.UTC(2024, 9 + i, 15)).toISOString().slice(0, 10),
    }))
    tables.siigo_invoices.push(invoice('current', '333', 3))
    const result = await calculate('')
    const row = result.auditoria.find(row => row.canal === 'WhatsApp')
    assert.deepEqual(Array.from(row.demanda), [5,36,26,12])
    assert.deepEqual(Array.from(row.fuentes), Array(4).fill('año anterior × crecimiento observado'))
    assert.equal(row.modelo, 'año anterior × crecimiento observado')
  } finally { Object.assign(tables, original) }
})


test('Siigo store invoices reduce current demand once; manual duplicates cannot replace invoices', async () => {
  const original = { ...tables }
  try {
    isolatedSupplyFixture()
    tables.tiendas_terceros = [stores[0]]
    tables.siigo_product_stock = [stock('P20', '20', 80), stock('P20', '20', 10, 30)]
    tables.siigo_invoices = [...steadyHistory('111', 'P20', 100), invoice('current', '111', 20)]
    tables.ventas_terceros = [{ tienda_id: 'a', producto_sku: 'P20', fecha: date, cantidad: 7 }]
    const result = await calculate()
    const audit = result.auditoria.find(row => row.canal === 'A')
    assert.deepEqual(Array.from(audit.demanda), [80, 100, 100, 100])
    assert.equal(result.forecast[0].stockBodega, 80)
    assert.equal(result.forecast[0].ventasTiendas, 320)
    assert.equal(result.resumen.totalProducirSugerido,
      result.resumen.totalProduccionSinReserva + result.resumen.totalProduccionPorReserva)
    assert.ok(result.forecast.every(row => row.produccionPorReserva >= 0))
    tables.siigo_invoices.at(-1).items[0].quantity = 120
    const over = await calculate()
    assert.equal(over.auditoria.find(row => row.canal === 'A').demanda[0], 0)
    assert.equal(over.forecast[0].stockBodega, 80)
    tables.siigo_invoices.pop()
    const manualFallback = await calculate()
    assert.equal(manualFallback.auditoria.find(row => row.canal === 'A').demanda[0], 93)
  } finally { Object.keys(tables).forEach(key => delete tables[key]); Object.assign(tables, original) }
})


test('production breakdown isolates safety with the same sales and dated supply', async () => {
  const original = { ...tables }
  try {
    isolatedSupplyFixture()
    const noReserve = await calculate('', '&stock_seguridad=0')
    const reserve = await calculate('', '&stock_seguridad=30')
    assert.equal(noReserve.resumen.totalProduccionPorReserva, 0)
    assert.equal(reserve.resumen.totalProduccionSinReserva, noReserve.resumen.totalProducirSugerido)
    assert.ok(reserve.resumen.totalProduccionPorReserva > 0)
    assert.equal(reserve.resumen.totalProducirSugerido, reserve.resumen.totalProduccionSinReserva + reserve.resumen.totalProduccionPorReserva)
  } finally { Object.keys(tables).forEach(key => delete tables[key]); Object.assign(tables, original) }
})


test('configured seven days cap every channel reserve even with large annual errors; zero disables all reserves', async () => {
  const original = { ...tables }
  try {
    isolatedSupplyFixture()
    tables.tiendas_terceros = [stores[0]]
    tables.siigo_product_stock = [stock('P20', '20', 0), stock('P20', '20', 0, 30)]
    tables.siigo_invoices = [...steadyHistory('333', 'P20', 100), ...steadyHistory('111', 'P20', 100)]
    for (const inv of tables.siigo_invoices) if (inv.date >= '2025-10-01') inv.items = [{ code: 'P20', quantity: 500 }]
    const capped = await calculate('', '&stock_seguridad=7')
    for (const row of capped.auditoria) {
      const maxPairs = Math.floor(row.demanda.reduce((sum, q) => sum + q, 0) / capped.metodologia.protectionDays * 7)
      assert.ok(row.reserva <= maxPairs, `${row.canal} exceeds seven days`)
    }
    assert.ok(capped.auditoria.some(row => row.canal === 'A' && row.reserva > 0))
    const zero = await calculate('', '&stock_seguridad=0')
    assert.ok(zero.auditoria.every(row => row.reserva === 0))
    assert.equal(zero.resumen.totalProduccionPorReserva, 0)
    assert.equal(capped.resumen.totalProduccionSinReserva, zero.resumen.totalProducirSugerido)
  } finally { Object.keys(tables).forEach(key => delete tables[key]); Object.assign(tables, original) }
})

test('inclusive horizon covers October 5 through January 31 and reference audit preserves missing evidence', async () => {
  const original = { ...tables }
  try {
    isolatedSupplyFixture()
    const result = await calculate('', '&stock_seguridad=7')
    assert.equal(result.metodologia.protectionDays, 119)
    const review = result.validacion.revisionReferencias.find(row => row.referencia === 'Prueba')
    assert.equal(review.produccion, result.resumen.totalProducirSugerido)
    assert.equal(review.error, result.validacion.errorModelo)
    assert.equal(review.errorBase, result.validacion.errorBase)
    assert.equal(review.canalesEvaluados, 1)
    tables.siigo_invoices = [invoice('new', '333', 2)]
    const sparse = await calculate()
    const missing = sparse.validacion.revisionReferencias.find(row => row.referencia === 'Prueba')
    assert.equal(missing.error, null, 'no evidence must not look like zero forecast error')
    assert.equal(missing.canalesEvaluados, 0)
    assert.ok(missing.canalesSinEvaluar > 0)
  } finally { Object.keys(tables).forEach(key => delete tables[key]); Object.assign(tables, original) }
})


test('Shopify WhatsApp and individual stores use separate observed growth excluding the open month', async () => {
  const original = { ...tables }
  try {
    isolatedSupplyFixture()
    tables.tiendas_terceros = stores
    tables.siigo_product_stock.push(stock('P20', '20', 0, 30), stock('P20', '20', 0, 31))
    tables.shopify_orders = [{ id: 1, order_number: 1234 }]
    const histories = [['333', 200, '#1234'], ['444', 50, ''], ['111', 150, ''], ['222', 100, '']]
    tables.siigo_invoices = histories.flatMap(([nit, recent, observations]) => steadyHistory(nit, 'P20', 100).map((inv, i) => ({ ...inv, observations, items: [{ code: 'P20', quantity: i >= 21 ? recent : 100 }] })))
    tables.siigo_invoices.push({ ...invoice('current', '333', 1000), observations: '#1234' })
    const result = await calculate()
    assert.equal(result.crecimientoObservado.find(row => row.canal === 'Shopify').factor, 2)
    assert.equal(result.crecimientoObservado.find(row => row.canal === 'WhatsApp').factor, .5)
    assert.equal(result.crecimientoObservado.find(row => row.canal === 'A').factor, 1.5)
    assert.equal(result.crecimientoObservado.find(row => row.canal === 'B').factor, 1)
    assert.deepEqual(Array.from(result.auditoria.find(row => row.canal === 'Shopify').demanda), [0, 200, 200, 200])
    assert.deepEqual(Array.from(result.auditoria.find(row => row.canal === 'WhatsApp').demanda), [50, 50, 50, 50])
    assert.deepEqual(Array.from(result.crecimientoObservado[0].mesesActuales), ['2026-07', '2026-08', '2026-09'])
    assert.deepEqual(Array.from(result.crecimientoObservado[0].mesesComparables), ['2025-07', '2025-08', '2025-09'])
  } finally { Object.keys(tables).forEach(key => delete tables[key]); Object.assign(tables, original) }
})

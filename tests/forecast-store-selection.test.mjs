import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import * as demandModel from '../lib/forecast/demand-model.ts'

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
  tiendas_terceros: stores,
  siigo_product_stock: [{ product_code: 'P20', product_name: 'Prueba Talla 20', warehouse_id: 27, warehouse_name: 'Principal', quantity: 0 }],
  siigo_invoices: [invoice('direct', '333', 4), invoice('a', '111', 100), invoice('b', '222', 200)],
  ventas_terceros: [{ tienda_id: 'a', producto_sku: 'P20', fecha: date, cantidad: 7 }],
}
const db = { from(table) {
  let rows = tables[table] || []
  const query = new Proxy({}, { get(_, key) {
    if (key === 'then') return resolve => resolve({ data: rows, error: null })
    return (...args) => {
      if (key === 'range') rows = rows.slice(args[0], args[1] + 1)
      if (key === 'gte') rows = rows.filter(row => row[args[0]] >= args[1])
      if (key === 'lte') rows = rows.filter(row => row[args[0]] <= args[1])
      return query
    }
  } })
  return query
} }
tables.siigo_product_stock.push({ product_code: 'EX20', product_name: 'Exclusivo Talla 20', warehouse_id: 27, warehouse_name: 'Principal', quantity: 1 })
tables.siigo_invoices[1].items.push({ code: 'EX20', quantity: 100 })
const exports = {}
const source = fs.readFileSync(new URL('../app/api/forecast/route.ts', import.meta.url), 'utf8')
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
  exports, URL, console, Date: AuditDate, require(name) {
    if (name === 'next/server') return { NextResponse: { json: value => value } }
    if (name === '@/lib/auth-helpers') return { requireAuth: async () => ({}), getAdminClient: () => db }
    if (name === '@/lib/forecast/demand-model') return demandModel
    throw new Error(name)
  },
})
const calculate = excluded => exports.GET({ url: `https://example.test/api/forecast?dias=90&excluir_tiendas=${excluded}` })

test('store selection excludes invoices and sell-through without reclassifying direct sales', async () => {
  const all = await calculate('')
  const onlyB = await calculate('a')
  const none = await calculate('a,b')
  assert.equal(all.forecast.find(row => row.sku === 'P20').ventasTiendas, 207)
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

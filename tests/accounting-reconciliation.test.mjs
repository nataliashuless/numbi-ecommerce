import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
const moduleExports = {}
vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../lib/sales/accounting-reconciliation.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports: moduleExports, require(name) {
  if (name === './source') return { reportingInvoices: source => source.published }
  if (name.endsWith('/channel-reconciliation')) return { classifyMarketingInvoice: invoice => ({ channel: invoice.channel || 'pending' }) }
  if (name.endsWith('/siigo-sales')) return { marketingProductItems: invoice => invoice.items || [] }
  throw new Error(name)
} })
const invoice = (id, name, observations = '') => ({ id, name, date: '2026-08-10', total: 119, credited_amount: 0, observations, items: [{ quantity: 1 }] })
const published = (id, name, date = '2026-08-10') => ({ id, name, date, total: 100, salesChannel: 'shopify', items: [{ quantity: 1 }] })
test('accounting audit deduplicates linked Shopify records and keeps credits, pending channels and date mismatches explicit', () => {
  const source = {
    invoices: [invoice('a','FV-A','#100 PRIVATE CUSTOMER NOTE'),invoice('b','FV-B','#100'),invoice('c','FV-C','#200'),{ ...invoice('credit','FV-CREDIT'), credited_amount: 119 }, invoice('pending','FV-PENDING','PRIVATE NOTE')],
    orders: [{ id: 1, raw: { order_number: 100 } }, { id: 2, raw: { order_number: 200 } }],
    published: [published('shopify:1','Shopify #100'),published('shopify:2','Shopify #200','2026-09-01'),{ ...published('other','Unlinked'), salesChannel: 'whatsapp' }],
    context: { reconciledShopifyInvoiceNumbers: new Map() }, nonRetail: new Set(),
  }
  const names = ['FV-A','FV-B','FV-C','FV-CREDIT','FV-PENDING','NC-1']
  const book = { months: [{ month: '2026-08', modelUnits: 2.5, modelSales: 200, accountingSales: 400, containsBudget: true }], detailPeriod: { start: '2026-08-01', end: '2026-08-31' }, detail: names.map((document,row) => ({ document,row,date:'2026-08-10',channel:'Web',units:document.startsWith('NC')?-1:1,sales:document.startsWith('NC')?-100:100 })) }
  const result = moduleExports.reconcileAccounting(source, book)
  assert.equal(result.totals.publishedUnits, 2)
  assert.equal(result.totals.matchedUnits, 1)
  assert.equal(result.totals.additionalUnits, 1)
  assert.equal(result.totals.matchedSales + result.totals.additionalSales, result.totals.publishedSales)
  assert.match(result.documents.find(row => row.document === 'FV-C').status, /fuera de agosto/)
  assert.match(result.documents.find(row => row.document === 'FV-CREDIT').status, /crédito total/)
  assert.match(result.documents.find(row => row.document === 'FV-PENDING').status, /sin confirmar/)
  assert.match(result.documents.find(row => row.document === 'NC-1').status, /vínculo con factura pendiente/)
  assert.equal(result.monthly[0].containsBudget, true)
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE/)
})

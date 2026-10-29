import { createHash } from 'node:crypto'
import type { CachedShopifyOrder } from './metrics'
import { isoDateInTimeZone, isValidSalesOrder } from './metrics'
import type { CachedSiigoInvoice } from './siigo-sales'
import { marketingProductItems, marketingSaleDate } from './siigo-sales'
import type { ExcelHistory, ExcelSaleRow } from './excel-history'
import { marketingItem } from './sales-ledger'

interface Target { row: number; invoiceCandidates: string[]; buyerHash: string | null; nameHash: string | null; emailHash: string | null; shipping: number; explicitRefund: boolean; explicitFair: boolean; duplicateOf?: number; productAmount?: number | null; totalPaid?: number | null; orderNumber?: number; ownerDecision?: string; ownerReviewedOn?: string }
interface Inputs { targets: Target[]; fairInvoiceNames: string[]; fairInvoiceRows?: Array<{ row: number; invoice: string }> }
export interface HistoryDecision { row: number; decision: 'online' | 'shopify' | 'excluded' | 'pending'; reason: string; invoice?: string; order?: number; credited?: boolean; replacement?: string; documentUnits?: number; variantMatch?: boolean }
const normalize = (value: unknown) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')
const hash = (value: unknown) => createHash('sha256').update(normalize(value)).digest('hex')
const design = (value: string) => { const key = normalize(value).replace(/felipe$/, ''); return ({ nina: 'basiconina', nino: 'basiconino' } as Record<string, string>)[key] || key }
const sameProduct = (description: string, row: ExcelSaleRow) => { const parsed = marketingItem(description); return design(parsed.design) === design(row.design) && Number(parsed.size) === Number(row.size) }
const validInvoice = (invoice: CachedSiigoInvoice) => invoice.total > 0 && (invoice.credited_amount || 0) < invoice.total
const dayDistance = (a: string, b: string) => Math.abs(Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / 86400000

/** Resolve only sales in the owner's fixed 2025 workbook; expose decisions, never buyer data. */
export function reconcileHistory(history: ExcelHistory, inputs: Inputs, invoices: CachedSiigoInvoice[], orders: CachedShopifyOrder[], storeNames: Set<string>) {
  const byName = new Map(invoices.map(invoice => [invoice.name, invoice]))
  const byOrder = new Map(orders.map(order => [Number(order.raw?.order_number), order]))
  const dates = new Map(orders.map(order => [Number(order.raw?.order_number), isoDateInTimeZone(order.created_at)]))
  const saleDates = new Map(orders.map(order => [order.id, isoDateInTimeZone(order.raw?.processed_at || order.created_at)]))
  const decisions: HistoryDecision[] = []
  for (const target of inputs.targets) {
    const row = history.rows.find(row => row.row === target.row)
    if (!row) continue
    const refs = target.invoiceCandidates.map(name => byName.get(name)).filter((invoice): invoice is CachedSiigoInvoice => Boolean(invoice))
    const original = refs[0]
    const base = { row: row.row, invoice: original?.name, order: target.orderNumber || Number((original?.observations || '').match(/(?:#|pedido\s+)(\d+)/i)?.[1]) || undefined, credited: original ? !validInvoice(original) : undefined }
    if (target.ownerDecision === 'pending') { decisions.push({ ...base, decision: 'pending', reason: `Pendiente por indicación de la dueña (${target.ownerReviewedOn || 'revisión actual'}): falta confirmar entrega y pago frente a la nota crédito` }); continue }
    if (target.duplicateOf) { decisions.push({ ...base, decision: 'excluded', reason: `Repetición exacta de la fila ${target.duplicateOf}; Shopify cuenta el pedido una sola vez` }); continue }
    if (row.flags.includes('gift') || target.explicitRefund || target.explicitFair) {
      decisions.push({ ...base, decision: 'excluded', reason: target.explicitRefund ? 'Devolución de dinero explícita en Excel' : target.explicitFair ? 'Venta de feria explícita en Excel' : 'Regalo comercial o de marketing' }); continue
    }
    const candidates = orders.filter(order => {
      const raw = order.raw as (NonNullable<CachedShopifyOrder['raw']> & { customer?: { first_name?: string; last_name?: string; email?: string }; shipping_address?: { first_name?: string; last_name?: string } }) | null
      if (!raw || dayDistance(row.date, saleDates.get(order.id)!) > 10) return false
      const buyerMatch = Boolean(target.emailHash && hash(raw.customer?.email || raw.email) === target.emailHash || target.nameHash && [hash(`${raw.customer?.first_name || ''} ${raw.customer?.last_name || ''}`), hash(`${raw.shipping_address?.first_name || ''} ${raw.shipping_address?.last_name || ''}`)].includes(target.nameHash))
      return buyerMatch && (raw.line_items || []).some(item => sameProduct(`${item.title || ''} - ${marketingItem(`${item.title || ''} - ${item.variant_title || ''}`).size}`, row))
    }).sort((a, b) => dayDistance(row.date, saleDates.get(a.id)!) - dayDistance(row.date, saleDates.get(b.id)!))
    const explicitOrderNumber = Number((original?.observations || '').match(/(?:#|pedido\s+)(\d+)/i)?.[1])
    const linkedOrder = byOrder.get(explicitOrderNumber)
    const order = candidates.length && (candidates.length === 1 || dayDistance(row.date, saleDates.get(candidates[0].id)!) < dayDistance(row.date, saleDates.get(candidates[1].id)!)) ? candidates[0] : linkedOrder
    if (order) {
      const active = isValidSalesOrder(order) && (order.raw?.line_items || []).some(item => Number(item.current_quantity ?? item.quantity) > 0)
      decisions.push({ ...base, order: Number(order.raw?.order_number), decision: active ? 'shopify' : 'excluded', reason: active ? 'Pedido contrastado con Shopify; se cuenta solo desde Shopify, nunca se suma otra vez desde Excel' : 'Pedido Shopify cancelado, de prueba, devuelto o sin unidades actuales' }); continue
    }
    if (/shopify/i.test(row.payment)) {
      decisions.push({ ...base, decision: 'shopify', reason: 'Fila identificada como Shopify: se excluye del Excel; solo cuentan los pedidos pagados válidos de la fuente directa' }); continue
    }
    if (row.flags.includes('unpaid')) { decisions.push({ ...base, decision: 'excluded', reason: 'Pago pendiente explícito sin pedido pagado confirmado' }); continue }
    let linked = refs.find(validInvoice)
    let proof = 'Factura vigente y registro online del Excel conciliados'
    if (!linked) {
      const related = invoices.filter(invoice => validInvoice(invoice) && (Boolean(target.buyerHash && hash(invoice.customer_identification) === target.buyerHash) || Boolean(original?.customer_identification && !/^(\d)\1{5,}$/.test(original.customer_identification) && invoice.customer_identification === original.customer_identification)))
      const replacements = invoices.filter(validInvoice).filter(invoice => target.invoiceCandidates.some(name => new RegExp(`(?:reemplaza|corrige|factura)[\\s\\S]{0,45}\\b${name.split('-').at(-1)}\\b`, 'i').test(invoice.observations || '')))
      const saleMatches = related.filter(invoice => (invoice.items || []).some(item => sameProduct(item.description || '', row)) && marketingSaleDate(invoice, dates) === row.date)
      const variantMatches = related.filter(invoice => (invoice.items || []).some(item => design(marketingItem(item.description || '').design) === design(row.design)) && marketingSaleDate(invoice, dates) === row.date)
      const priceMatches = related.filter(invoice => dayDistance(row.date, invoice.date.slice(0, 10)) <= 90 && (invoice.items || []).some(item => sameProduct(item.description || '', row) && (Math.abs(Number(item.total || 0) - Number(target.productAmount || row.amount || 0)) < 1 && Number(target.productAmount || row.amount || 0) > 0 || Boolean(target.totalPaid && Math.abs(invoice.total - target.totalPaid) < 1))))
      if (replacements.length === 1) { linked = replacements[0]; proof = 'Factura vigente de reemplazo identificada por referencia explícita' }
      else if (saleMatches.length === 1) { linked = saleMatches[0]; proof = 'Factura vigente localizada por comprador, producto y fecha de venta' }
      else if (priceMatches.length === 1) { linked = priceMatches[0]; proof = 'Coincidencia única de comprador, producto e importe; se conserva la fecha del Excel' }
      else if (variantMatches.length === 1) { linked = variantMatches[0]; proof = 'Comprador, diseño y fecha coinciden; la talla difiere, sin alterar la cantidad vendida' }
    }
    if (linked) {
      if (linked.name && storeNames.has(linked.name)) { decisions.push({ ...base, invoice: linked.name, decision: 'excluded', reason: 'Tienda o Paraíso confirmado por la dueña; no es venta online' }); continue }
      decisions.push({ ...base, invoice: linked.name, replacement: linked.name !== original?.name ? linked.name : undefined, decision: 'online', reason: proof }); continue
    }
    if (original && !validInvoice(original) && /^pend/i.test(row.payment)) { decisions.push({ ...base, decision: 'excluded', reason: 'Factura con nota crédito total y pago pendiente en Excel, sin reemplazo pagado' }); continue }
    if (original && !validInvoice(original)) { decisions.push({ ...base, decision: 'pending', reason: 'Factura con nota crédito total; no hay reemplazo ni pedido pagado verificable para esta fila' }); continue }
    if (/enviado/i.test(row.status) && (row.amount || 0) > 0) { decisions.push({ ...base, decision: 'online', reason: 'Venta pagada y enviada del Excel autorizado; sin factura vigente localizada en Siigo' }); continue }
    decisions.push({ ...base, decision: 'pending', reason: 'No se encontró factura vigente ni evidencia suficiente de pago/entrega para cerrar esta fila' })
  }
  // A credited sale reissued with another size is one sale, not two Excel rows.
  for (const decision of decisions.filter(decision => decision.decision === 'online' && decision.replacement && decision.credited)) {
    const invoice = byName.get(decision.invoice)
    const row = history.rows.find(row => row.row === decision.row)
    if (!invoice || !row || (invoice.items || []).some(item => sameProduct(item.description || '', row))) continue
    const represented = decisions.some(other => other.row !== decision.row && other.decision === 'online' && other.invoice === decision.invoice && history.rows.some(source => source.row === other.row && source.date === row.date && (invoice.items || []).some(item => sameProduct(item.description || '', source))))
    if (represented) { decision.decision = 'excluded'; decision.reason = 'Factura anulada y cambio de talla: la venta vigente ya está representada por otra fila del mismo día' }
  }
  const correctedGroups = new Map<string, HistoryDecision[]>()
  for (const decision of decisions.filter(decision => decision.decision === 'online' && decision.credited && decision.replacement)) {
    const target = inputs.targets.find(target => target.row === decision.row)
    const row = history.rows.find(row => row.row === decision.row)
    if (!target?.buyerHash || !row) continue
    const key = `${decision.invoice}:${target.buyerHash}:${row.date}:${design(row.design)}:${row.size}:${row.amount}`
    const group = correctedGroups.get(key) || []; group.push(decision); correctedGroups.set(key, group)
  }
  for (const group of correctedGroups.values()) {
    if (group.length < 2) continue
    const firstRow = history.rows.find(row => row.row === group[0].row)!
    const invoice = byName.get(group[0].invoice)
    if (!invoice) continue
    let remaining = (invoice.items || []).filter(item => sameProduct(item.description || '', firstRow)).reduce((sum, item) => sum + Number(item.quantity || 0), 0)
    for (const decision of group.sort((a, b) => a.row - b.row)) {
      const row = history.rows.find(row => row.row === decision.row)!
      if (remaining >= row.units) remaining -= row.units
      else { decision.decision = 'excluded'; decision.reason = 'Facturas anuladas reemitidas: misma venta, comprador, día, variante e importe; ya incluida una vez en la factura vigente' }
    }
  }
  for (const decision of decisions) {
    const invoice = byName.get(decision.invoice)
    const row = history.rows.find(row => row.row === decision.row)
    if (invoice && row) { decision.documentUnits = marketingProductItems(invoice, new Set()).reduce((sum, item) => sum + Number(item.quantity || 0), 0); decision.variantMatch = (invoice.items || []).some(item => sameProduct(item.description || '', row)) }
  }
  const fair = inputs.fairInvoiceNames.map(name => {
    const invoice = byName.get(name)
    const sourceRows = new Set((inputs.fairInvoiceRows || []).filter(link => link.invoice === name).map(link => link.row))
    const rows = history.rows.filter(row => sourceRows.size ? sourceRows.has(row.row) : row.invoice === name)
    return { invoice: name, units: rows.reduce((sum, row) => sum + row.units, 0), online: Boolean(invoice && validInvoice(invoice) && !/\bferia\b|\bplaytime\b|\bvassar\b/i.test(invoice.observations || '') && rows.length), reason: 'Registro online aportado por la dueña; la etiqueta de feria no tiene observación explícita de venta en feria' }
  })
  return { decisions, fair }
}

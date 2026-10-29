import type { CachedSiigoInvoice, OnlineSalesClassificationContext } from './siigo-sales'
export type ReconciledChannel = 'woocommerce' | 'shopify' | 'whatsapp' | 'tienda' | 'feria' | 'pending'
export interface ReconciliationContext extends OnlineSalesClassificationContext { whatsappInvoiceIds?: Set<string>; firstShopifyOrderDate?: string | null; mercadoPagoWooCommerceOnly?: boolean; historicalStoreEvidence?: Map<string, string>; directPaymentsWhatsAppOnly?: boolean; confirmedStoreInvoiceNames?: Set<string>; confirmedParaisoInvoiceNames?: Set<string>; confirmedWhatsappInvoiceNames?: Set<string> }
export function normalizeCustomerId(value: string) { return value.toUpperCase().replace(/[^A-Z0-9]/g, '') }
export function historicalStoreEvidence(invoices: CachedSiigoInvoice[]) {
  const evidence = new Map<string, string>()
  for (const invoice of invoices) {
    const text = (invoice.observations || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    const customer = normalizeCustomerId(invoice.customer_identification || '')
    // Never propagate evidence through generic final-consumer identifiers.
    if (!customer || /^(\d)\1{5,}$/.test(customer)) continue
    if (/descuento\s+(?:de\s+)?distribuidor|\b(?:venta|compra)\s+en\s+firme\b/.test(text)) evidence.set(customer, `Cliente histórico de tienda demostrado en ${invoice.name || invoice.id}`)
  }
  return evidence
}
export function classifyMarketingInvoice(invoice: CachedSiigoInvoice, context: ReconciliationContext): { channel: ReconciledChannel; reason: string } {
  const text = (invoice.observations || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  if (invoice.name && context.confirmedStoreInvoiceNames?.has(invoice.name)) return { channel: 'tienda', reason: 'Corrección confirmada por la dueña el 2026-10-29: factura Activetress asignada erróneamente a feria' }
  if (invoice.name && context.confirmedParaisoInvoiceNames?.has(invoice.name)) return { channel: 'tienda', reason: 'Venta del punto Paraíso confirmada por la dueña el 2026-10-29; excluida de online' }
  if (invoice.name && context.confirmedWhatsappInvoiceNames?.has(invoice.name)) return { channel: 'whatsapp', reason: 'Venta WhatsApp confirmada individualmente por la dueña el 2026-10-29' }
  const historicStore = context.historicalStoreEvidence?.get(normalizeCustomerId(invoice.customer_identification || ''))
  if (historicStore && invoice.assigned_feria_id) return { channel: 'tienda', reason: `${historicStore}; la evidencia de venta a distribuidor corrige la etiqueta de feria solo en esta conciliación` }
  if (invoice.assigned_feria_id) return { channel: 'feria', reason: 'Factura asignada a una feria' }
  if (invoice.customer_identification && Array.from(context.tiendaNits).some(nit => normalizeCustomerId(nit) === normalizeCustomerId(invoice.customer_identification!))) return { channel: 'tienda', reason: 'NIT registrado como tienda, incluida tienda inactiva' }
  if (historicStore) return { channel: 'tienda', reason: historicStore }
  const references = [...text.matchAll(/#\s*(\d+)/g)].map(match => Number(match[1]))
  const shopify = references.some(number => context.shopifyOrderNumbers.has(number)) || (references.length === 1 && /registro\s+automatico\s+moship\s+api\s+para\s+el\s+pedido/.test(text))
  const whatsapp = context.whatsappInvoiceIds?.has(invoice.id) || /\bwhats\s*app\b|\bwhatsapp\b|\bventa\s+wa\b/.test(text)
  const mercadoPago = (invoice.raw?.payments || []).some(payment => Number(payment.id) === 8362 || /mercado\s*pago/i.test(payment.name || '')) || /mercado\s*pago/.test(text)
  const confirmedPaymentWoo = Boolean(context.mercadoPagoWooCommerceOnly && mercadoPago)
  const explicitWoo = /\bwoo\s*commerce\b|\bwoocommerce\b/.test(text)
  const historicalWeb = Boolean(context.firstShopifyOrderDate && invoice.date.slice(0, 10) < context.firstShopifyOrderDate) && /\bpagina\s*(?:web)?\b|\btienda\s+(?:virtual|online)\b|\bpedido\s+(?:web|online)\b/.test(text)
  const fair = /\bferia\b|\bplaytime\b|\bvassar\b/.test(text)
  const explicitStore = /\btienda\s+(?!virtual\b|online\b|web\b)\S+|\bpunto\s+de\s+venta\s+paraiso\b|(?:^|\n)\s*paraiso\s*(?:\n|$)/.test(text)
  const signals = [shopify, Boolean(whatsapp), explicitWoo || historicalWeb, fair, explicitStore].filter(Boolean).length
  if (signals > 1) return { channel: 'pending', reason: 'Señales de canal en conflicto; requiere revisar la factura' }
  if (explicitStore) return { channel: 'tienda', reason: 'Observación explícita de tienda o punto de venta Paraíso; no es venta online' }
  if (fair) return { channel: 'feria', reason: 'Observación explícita de feria, incluso fuera de sus fechas' }
  if (shopify) return { channel: 'shopify', reason: references.some(number => context.shopifyOrderNumbers.has(number)) ? 'Pedido cruzado con Shopify' : 'Registro automático Moship con número de pedido' }
  if (whatsapp) return { channel: 'whatsapp', reason: context.whatsappInvoiceIds?.has(invoice.id) ? 'Venta WhatsApp vinculada explícitamente a esta factura' : 'Observación explícita de venta WhatsApp' }
  if (explicitWoo || historicalWeb || confirmedPaymentWoo) return { channel: 'woocommerce', reason: explicitWoo ? 'Observación explícita WooCommerce' : confirmedPaymentWoo ? 'Mercado Pago exclusivo de WooCommerce, confirmado por la dueña el 2026-10-29' : 'Venta web explícita anterior a Shopify; WooCommerce según el histórico de la marca' }
  const directPayment = /\bnequi\b|\bbold\b|\bbancolombia\b|\bdaviplata\b/.test(text) || (invoice.raw?.payments || []).some(payment => /\bnequi\b|\bbold\b|\bbancolombia\b|\bdaviplata\b/i.test(payment.name || ''))
  if (context.directPaymentsWhatsAppOnly && directPayment) return { channel: 'whatsapp', reason: 'Pago directo Nequi/Bold/Bancolombia/Daviplata tras excluir web, tienda y feria; WhatsApp confirmado por la dueña el 2026-10-29' }
  if (context.feriaWindows.some(window => invoice.date.slice(0, 10) >= window.start && invoice.date.slice(0, 10) <= window.end)) return { channel: 'pending', reason: 'Coincide con fechas de feria, pero no demuestra el canal' }
  if (mercadoPago) return { channel: 'pending', reason: 'Mercado Pago es medio de pago, no prueba de canal' }
  if (references.length) return { channel: 'pending', reason: 'Número de pedido sin cruce confirmado con Shopify ni plataforma explícita' }
  return { channel: 'pending', reason: text.trim() ? 'Venta directa sin canal explícito; no se supone WhatsApp por descarte' : 'Factura sin observación ni canal verificable' }
}

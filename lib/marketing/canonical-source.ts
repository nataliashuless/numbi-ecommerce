import excelHistory from '@/data/marketing-online-excel-2025.json'
import historyAuditInputs from '@/data/marketing-2025-audit-inputs.json'
import { reconcileHistory } from './history-reconciliation'
import { applyExcelHistory } from './excel-history'
import { directShopifyInvoices } from './shopify-ledger'
import { classifyMarketingInvoice, type ReconciliationContext } from './channel-reconciliation'
import { marketingBusinessChannelRules } from './business-channel-rules'
import type { CachedSiigoInvoice } from './siigo-sales'
import type { CachedShopifyOrder } from './metrics'

/** Canonical online history, shared by every reporting surface. */
export function canonicalInvoices(siigoInvoices: CachedSiigoInvoice[], orders: CachedShopifyOrder[], reconciliationContext: ReconciliationContext) {
    const invoiceLinks = new Map(historyAuditInputs.invoiceLinks.map(link => [link.row, link.invoice]))
    const historicalSales = { ...excelHistory, rows: excelHistory.rows.map(row => ({ ...row, invoice: row.invoice || invoiceLinks.get(row.row) || null })) }
    const historyAudit = reconcileHistory(historicalSales, historyAuditInputs, siigoInvoices, orders, new Set([...marketingBusinessChannelRules.confirmedStoreInvoiceNames, ...marketingBusinessChannelRules.confirmedParaisoInvoiceNames, ...siigoInvoices.filter(invoice => classifyMarketingInvoice(invoice, reconciliationContext).channel === 'tienda').map(invoice => invoice.name || '')]))
    const excel = applyExcelHistory(siigoInvoices, reconciliationContext, historicalSales, historyAudit.decisions)
    const excludedPhysicalOrders = new Set(historyAudit.decisions.filter(decision => decision.decision === 'excluded' && decision.reason === 'Venta de feria explícita en Excel').map(decision => decision.order).filter((number): number is number => Boolean(number)))
    const unifiedInvoices = [...excel.invoices.filter(invoice => classifyMarketingInvoice(invoice, reconciliationContext).channel !== 'shopify'), ...directShopifyInvoices(orders, excludedPhysicalOrders)]
    return { unifiedInvoices, historyAudit }
}

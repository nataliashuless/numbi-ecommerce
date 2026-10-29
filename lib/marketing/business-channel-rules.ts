/** Rules confirmed by the owner during reconciliation on 2026-10-29.
 * Mercado Pago identifies legacy WooCommerce only when no explicit platform evidence exists.
 * Audit found the same Siigo payment name on matched Shopify/Moship invoices; a matched order takes precedence.
 * Direct Nequi/Bold/Bancolombia/Daviplata sales were WhatsApp after excluding stores, fairs and web orders.
 * The two Activetress invoices below were incorrectly assigned to fairs.
 */
export const marketingBusinessChannelRules = {
  mercadoPagoWooCommerceOnly: true,
  directPaymentsWhatsAppOnly: true,
  confirmedStoreInvoiceNames: new Set(['FV-2-2710', 'FV-2-2596']),
  // Individual exceptions confirmed as Paraíso; do not infer a cash rule for other invoices.
  confirmedParaisoInvoiceNames: new Set(['FV-2-2071', 'FV-2-2083', 'FV-2-2090', 'FV-2-2126', 'FV-2-2317', 'FV-2-2358', 'FV-2-2366', 'FV-2-2369', 'FV-2-1953']),
  confirmedWhatsappInvoiceNames: new Set(['FV-2-4347']),
}

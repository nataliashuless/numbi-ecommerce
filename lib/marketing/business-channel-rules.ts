/** Rules confirmed by the owner during reconciliation on 2026-10-29.
 * Mercado Pago was exclusive to WooCommerce.
 * Direct Nequi/Bold/Bancolombia/Daviplata sales were WhatsApp after excluding stores, fairs and web orders.
 * The two Activetress invoices below were incorrectly assigned to fairs.
 */
export const marketingBusinessChannelRules = {
  mercadoPagoWooCommerceOnly: true,
  directPaymentsWhatsAppOnly: true,
  confirmedStoreInvoiceNames: new Set(['FV-2-2710', 'FV-2-2596']),
}

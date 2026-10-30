/** Verified on 2026-10-30: Siigo credit notes are missing from the invoice cache.
 * Keep reporting provisional until document/date reconciliation and cache repair finish.
 */
export const SALES_RECONCILIATION_PENDING = true
export const SALES_RECONCILIATION_MESSAGE = 'Cifras en conciliación: se detectaron notas crédito de Siigo sin actualizar en Vercel. Los totales son provisionales y no se publica crecimiento definitivo hasta cerrar el cruce por documento y fecha.'

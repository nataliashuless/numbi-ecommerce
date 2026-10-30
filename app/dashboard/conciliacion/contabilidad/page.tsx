import { redirect } from 'next/navigation'
import { requireAuth } from '@/lib/auth-helpers'
import { loadSalesSource } from '@/lib/sales/source'
import { reconcileAccounting } from '@/lib/sales/accounting-reconciliation'
import accountingReview from '@/data/accounting/sales-review-2025-2026.json'
export const dynamic = 'force-dynamic'
export const maxDuration = 60
const money = (n: number) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 2 }).format(n)
const number = (n: number) => new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 }).format(n)
export default async function AccountingReconciliation() {
  const { error } = await requireAuth()
  if (error) redirect('/login')
  const audit = reconcileAccounting(await loadSalesSource(), accountingReview)
  return <main className="mx-auto max-w-7xl space-y-6 p-6 text-slate-900">
    <h1 className="text-2xl font-bold">Cruce contable de ventas 2025 y 2026</h1>
    <p>Enero a agosto de ambos años. Importes de producto antes de IVA. Las diferencias son hallazgos para revisar; no modifican facturas ni certifican una conciliación cerrada.</p>
    <p>Los archivos solo contienen auxiliar por documento de agosto de 2026. Para los demás meses hay comparación agregada; falta el auxiliar contable correspondiente. Las notas crédito sin vínculo demostrado se mantienen separadas.</p>
    <h2 className="text-xl font-bold">Comparación mensual</h2>
    <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>{['Mes','Unidades modelo','Presupuesto incluido','Unidades Vercel','Diferencia unidades','Ventas contables','Ventas Vercel','Diferencia pesos'].map(label => <th className="border p-2 text-left" key={label}>{label}</th>)}</tr></thead><tbody>{audit.monthly.map(row => <tr key={row.month}>{[row.month,number(row.modelUnits),row.containsBudget ? 'Sí: no equivale a ventas reales' : 'No',number(row.publishedUnits),number(row.unitDifference),money(row.accountingSales),money(row.publishedSales),money(row.salesDifference)].map((value,i) => <td className="border p-2" key={i}>{value}</td>)}</tr>)}</tbody></table></div>
    <h2 className="text-xl font-bold">Puente de agosto de 2026</h2>
    <p>Informe: {number(audit.totals.bookUnits)} unidades y {money(audit.totals.bookSales)}. Vercel: {number(audit.totals.publishedUnits)} unidades y {money(audit.totals.publishedSales)}.</p>
    <p>Registros de Vercel vinculados a documentos del informe, contados una sola vez: {number(audit.totals.matchedUnits)} unidades y {money(audit.totals.matchedSales)}. Registros sin vínculo identificado en ese auxiliar: {number(audit.totals.additionalUnits)} unidades y {money(audit.totals.additionalSales)}.</p>
    <h2 className="text-xl font-bold">Cruce por documento del informe</h2>
    <p>La columna de crédito Siigo es el importe acumulado actual, incluido IVA; no demuestra por sí sola la fecha de la nota ni cuántas unidades se devolvieron.</p>
    <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr>{['Documento','Fecha contable','Canal contable','Unidades contables netas','Ventas contables','Documento Vercel','Fecha venta','Canal Vercel','Unidades Vercel','Ventas Vercel','Crédito Siigo IVA incluido','Hallazgo'].map(label => <th className="border p-2 text-left" key={label}>{label}</th>)}</tr></thead><tbody>{audit.documents.map(row => <tr key={row.document}>{[row.document,row.date,row.channel,number(row.units),money(row.sales),row.publishedDocuments,row.publishedDate,row.publishedChannel,number(row.publishedUnits),money(row.publishedSales),money(row.creditedAmount),row.status].map((value,i) => <td className="border p-2" key={i}>{value}</td>)}</tr>)}</tbody></table></div>
    <h2 className="text-xl font-bold">Registros Vercel sin vínculo identificado en el auxiliar de agosto</h2>
    <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>{['Documento','Fecha venta','Canal','Unidades','Ventas'].map(label => <th className="border p-2 text-left" key={label}>{label}</th>)}</tr></thead><tbody>{audit.additional.map(row => <tr key={row.document}>{[row.document,row.date,row.channel,number(row.units),money(row.sales)].map((value,i) => <td className="border p-2" key={i}>{value}</td>)}</tr>)}</tbody></table></div>
  </main>
}

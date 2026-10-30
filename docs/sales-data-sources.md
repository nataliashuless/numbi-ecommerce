# Fuentes de ventas del panel

Las cifras comerciales de Ventas, Shopify, WhatsApp, Mercadeo, Analítica y la demanda del forecast se construyen con `lib/marketing/canonical-source.ts`. Los consumidores de reportes cargan el histórico mediante `lib/sales/source.ts`; Mercadeo utiliza el mismo constructor con sus consultas de stock e integraciones.

- Shopify: pedidos pagados válidos directamente del cache Shopify, fecha procesada en Colombia y cantidades actuales. Excluye cancelados, pruebas, POS y pedidos de feria demostrados en la conciliación.
- No Shopify 2025: Excel revisado, fecha real de venta, cruces auditados por factura y pedido. Sustituye la factura Siigo, incluso cuando se emitió en 2026. Mercado Pago histórico identifica WooCommerce; las otras ventas online confirmadas son WhatsApp.
- WhatsApp desde 2026: factura Siigo con evidencia de canal, luego de excluir Shopify, tiendas, Paraíso y ferias. Usa fecha de factura; no debe describirse como fecha real de venta cuando esta no está demostrada.
- Tiendas y ferias: facturas Siigo clasificadas por la misma evidencia; las correcciones confirmadas por la dueña prevalecen sobre etiquetas antiguas. El Excel online no elimina las ventas físicas del histórico de los otros canales.
- FV-2-1812: una unidad de 2025 sigue pendiente, excluida de ventas confirmadas. No se convierte en cancelada ni vendida.

Los importes comerciales son producto antes de IVA, sin envíos ni materias primas. Las notas crédito totales se excluyen; las parciales reducen importes pero no cantidades sin cruce por línea. Faltan importes en algunas filas Excel: se cuentan unidades confirmadas, pero no debe concluirse crecimiento monetario con valores incompletos.

En Ventas y en la analítica por producto, el canal web agrupa Shopify + WooCommerce y se etiqueta así; en la pestaña Shopify solo aparecen pedidos Shopify. Un total global incluye además tiendas y ferias y no debe compararse con el total exclusivamente online de Mercadeo.

## Fuentes con otro propósito

No se sustituyen movimientos de inventario, liquidaciones/sell-through de tiendas, producción o saldos contables por ventas online. Conservan sus tablas de origen. El forecast añade sell-through manual de tiendas solo en SKU/mes sin factura, según su regla ya existente; no duplica ambos. Facturas y saldos documentales de Siigo conservan sus importes contables originales. Meta y GA4 son fuentes de publicidad y tráfico, no fuentes alternativas de unidades vendidas.

## Controles

- Lectura paginada de 1.000 registros; ante errores se falla, sin devolver sumas parciales.
- Las pruebas de integración comparan unidades, ventas de producto y series diarias entre el resumen Ventas, Shopify, WhatsApp y Mercadeo con los mismos períodos.
- Ninguna conciliación modifica facturas originales ni permite transmitir observaciones privadas mediante nuevos endpoints; `/api/sales/summary` expone solo agregados autenticados.

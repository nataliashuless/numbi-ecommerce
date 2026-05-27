-- Migration 022: Feria Diciembre 2023 (Vassar + EVA)
-- Found in Excel "Ventas Consolidadas" sheet under canal=Feria, dated 2023-12-01.
-- All units aggregated by design/size (no individual customer names available).
-- Window covers all of December 2023 so Siigo invoices in that month get
-- classified as feria.

INSERT INTO ferias (nombre, ubicacion, fecha_inicio, fecha_fin, notas, activa)
VALUES (
  'Feria Diciembre 2023',
  'Bogotá',
  '2023-12-01',
  '2023-12-31',
  '218 unidades, $27.4M en Excel ("Ventas Consolidadas"): Vassar 88u/$11.1M + EVA 130u/$16.4M. Ventana ampliada al mes completo porque las fechas exactas del evento no están registradas.',
  true
)
ON CONFLICT DO NOTHING;

-- Migration 020: Seed ferias históricas reconstruidas desde el Excel manual
-- Fuentes: hoja "Ventas Ferias" + "Respuestas Diciembre eva" + "Respuestas de formulario EVA MA"
-- Las ventas reales viven en Siigo; estas filas solo marcan los rangos de fechas
-- para que las facturas Siigo dentro de cada ventana se clasifiquen como canal "feria".

INSERT INTO ferias (nombre, ubicacion, fecha_inicio, fecha_fin, notas, activa)
VALUES
  ('Feria EVA Mayo 2024',       NULL, '2024-05-01', '2024-05-05',
   '153 unidades vendidas (reconstruido del Excel manual)', true),
  ('Feria VASSAR Julio 2024',   NULL, '2024-07-09', '2024-07-14',
   '88 unidades vendidas (reconstruido del Excel manual)', true),
  ('Feria EVA Septiembre 2024', NULL, '2024-09-05', '2024-09-08',
   '102 unidades vendidas (reconstruido del Excel manual)', true),
  ('Feria EVA Diciembre 2024',  NULL, '2024-12-05', '2024-12-05',
   '75 unidades vendidas — Excel solo registra 1 fecha (reconstruido del Excel manual)', true),
  ('Feria EVA Mayo 2025',       NULL, '2025-05-01', '2025-05-04',
   '108 unidades, $16.079.240 (reconstruido del Excel manual)', true),
  ('Feria EVA Septiembre 2025', NULL, '2025-09-11', '2025-09-14',
   '98 unidades, $15.988.580 (reconstruido del Excel manual)', true),
  ('Feria EVA Diciembre 2025',  NULL, '2025-12-17', '2025-12-21',
   '111 unidades, $17.990.180 (reconstruido del formulario Diciembre)', true),
  ('Feria EVA Mayo 2026',       NULL, '2026-05-07', '2026-05-10',
   '164 unidades, $14.534.849 (reconstruido del formulario EVA MA)', true)
ON CONFLICT DO NOTHING;

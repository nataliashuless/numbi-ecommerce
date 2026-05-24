-- Migration 013: short display name for tiendas
-- 'nombre' keeps the legal name from Siigo (TITI AND VAL SAS),
-- 'nombre_corto' is the human-friendly label shown in lists/cards/badges (TITI).

ALTER TABLE tiendas_terceros
  ADD COLUMN IF NOT EXISTS nombre_corto VARCHAR;

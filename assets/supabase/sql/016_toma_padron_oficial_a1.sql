-- ============================================================================
-- CUSSHMI · Toma en padron_oficial_a1 (para agrupar la exportación A-1/A-2 por toma)
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query (pestaña limpia)
-- Idempotente.
--
-- El Excel oficial de ANA no trae toma (solo "Sub Sector Hidráulico", a
-- nivel de comisión completa) — se pidió que la exportación de los
-- Formatos A-1/A-2 agrupe a los usuarios por toma. En vez de recalcular el
-- cruce contra padron_usuarios cada vez que se exporta, se resuelve UNA
-- SOLA VEZ y se guarda acá:
-- - Filas origen='ana_a1' (import del Excel oficial): la toma se resuelve
--   cruzando por unidad catastral/nombre contra TODO el padrón operativo
--   de la comisión, al momento de sincronizar (ver importarPadronOficialA1
--   en el escritorio).
-- - Filas origen='campo' (incorporadas desde "Identificación y registro"):
--   la toma ya se conoce de entrada (es la toma que el sectorista tenía
--   seleccionada) — no hace falta cruzar nada.
-- ============================================================================

alter table padron_oficial_a1 add column if not exists toma_nombre text;
create index if not exists idx_padronA1_toma on padron_oficial_a1 (comision_id, toma_nombre);
